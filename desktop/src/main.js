/**
 * DeepSeek Harness desktop shell (local use).
 *
 * Boots the harness web server as a child process and presents its UI in a
 * BrowserWindow. The harness runs from the repository checkout with the system
 * Node; this process only finds a free port, spawns the server, waits for it to
 * answer, and manages the window lifecycle.
 *
 * Harness checkout resolution:
 * - DSH_DESKTOP_HARNESS_DIR always wins if set.
 * - In source mode (npm start), fall back to the grandparent of src/.
 * - In packaged mode (electron-builder), fall back to the directory containing
 *   the executable (works when the portable exe sits next to the checkout).
 *
 * Server output is appended to run.log under the Electron userData directory.
 */
'use strict'

const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron')
const { spawn, execFile } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { createServer } = require('node:net')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const {
  advanceCompanionDrag,
  clampCompanionBounds,
  createDragState,
  normalizePlacementDocument,
  parseCompanionDescriptor,
  placementEntryForBounds,
  resizeCompanionBounds,
  restoreCompanionPlacement,
} = require('./companion.js')

const SERVER_ARGS = ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'web', '--no-open']
const SERVER_ENTRY = 'apps/cli/src/bin.ts'
const READY_TIMEOUT_MS = 120_000
const KILL_GRACE_MS = 3_000
// The companion descriptor is registered by a feature plugin (the pet) whose
// load completes slightly after the server starts answering `/`. A discovery
// probe that lands during that window sees a transient timeout (the event loop
// is briefly blocked compiling modules) or a 204 (descriptor not yet set) and
// would otherwise give up, leaving the draggable pet window closed forever.
// Retry both outcomes within this deadline so a slow plugin load does not
// permanently hide the desktop companion.
const COMPANION_DISCOVERY_DEADLINE_MS = 15_000
const COMPANION_DISCOVERY_INTERVAL_MS = 500

/**
 * Resolve the harness checkout directory. Returns null when no plausible
 * directory can be found, so callers can show a directed error message.
 */
function resolveHarnessDir() {
  if (process.env.DSH_DESKTOP_HARNESS_DIR) {
    return path.resolve(process.env.DSH_DESKTOP_HARNESS_DIR)
  }
  if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'))
    if (hasHarnessLayout(exeDir)) return exeDir
    const parent = path.join(exeDir, '..')
    if (hasHarnessLayout(parent)) return parent
    return null
  }
  const candidate = path.resolve(path.join(__dirname, '..', '..'))
  return hasHarnessLayout(candidate) ? candidate : null
}

/** True if dir has the files the desktop shell needs to boot the server. */
function hasHarnessLayout(dir) {
  try {
    return fs.existsSync(path.join(dir, 'package.json'))
      && fs.existsSync(path.join(dir, SERVER_ENTRY))
  } catch {
    return false
  }
}

/** The spawned harness server, or null before boot or after shutdown. */
let server = null
let shuttingDown = false
let win = null
/** The canonical local URL the server prints once its web-runtime subtree
 * settles; it carries the auth token the browser-trust fence requires, so the
 * main window loads this rather than the bare root. */
let printedUrl = null
let companionWin = null
let companionDescriptor = null
/** Authoritative companion rectangle size (restore or resize request); the
 * OS-reported size never becomes an anchor because Windows fractional-scale
 * setBounds round-trips drift it. */
let companionSize = null
let activeDrag = null
let placementStore = null

/** Append a line to the run log under the app's userData directory. */
function log(line) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'run.log'), `${line}\n`)
  } catch {
    // Logging must never take the app down.
  }
}

/** Serialize one versioned placement document under Electron's userData path. */
class PlacementStore {
  constructor(filename) {
    this.filename = filename
    this.temporary = `${filename}.tmp`
    this.document = { version: 1, entries: {} }
    this.tail = Promise.resolve()
  }

  /** Load and validate placements for the currently discovered companion id. */
  load(allowedIds) {
    try {
      if (fs.existsSync(this.temporary)) fs.rmSync(this.temporary, { force: true })
      if (!fs.existsSync(this.filename)) return this.document
      const parsed = normalizePlacementDocument(JSON.parse(fs.readFileSync(this.filename, 'utf8')), allowedIds)
      this.document = parsed
    } catch (error) {
      log(`[desktop] companion placement ignored: ${error.message}`)
      this.document = { version: 1, entries: {} }
    }
    return this.document
  }

  /** Atomically replace one companion entry and wait for the serialized write. */
  writeEntry(id, entry) {
    this.document = {
      version: 1,
      entries: { ...this.document.entries, [id]: entry },
    }
    const payload = JSON.stringify(this.document, null, 2)
    const write = this.tail.then(() => {
      fs.mkdirSync(path.dirname(this.filename), { recursive: true })
      const fd = fs.openSync(this.temporary, 'w')
      try {
        fs.writeFileSync(fd, payload, 'utf8')
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
      fs.renameSync(this.temporary, this.filename)
    })
    this.tail = write.then(() => undefined, () => undefined)
    return write
  }
}

/** Resolve an OS-assigned free port by listening on port 0 and releasing it. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port
      probe.close(() => resolve(port))
    })
  })
}

/** Poll the server root until it answers or the timeout elapses. */
function waitReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2_000 }, (res) => {
        res.resume()
        if (res.statusCode !== undefined && res.statusCode < 500) {
          resolve()
          return
        }
        retry()
      })
      req.on('timeout', () => { req.destroy() })
      req.on('error', retry)
    }
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`harness server did not become ready within ${timeoutMs / 1000}s`))
        return
      }
      setTimeout(poll, 500)
    }
    poll()
  })
}

/**
 * Resolve the canonical local URL the server prints once its web-runtime
 * subtree settles. That line carries the auth token the browser-trust fence
 * requires; resolving to null when the deadline lapses lets the caller fall
 * back to the bare root and surface the fence's own explanation.
 */
function waitForPrintedUrl(timeoutMs) {
  if (printedUrl !== null) return Promise.resolve(printedUrl)
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const poll = () => {
      if (printedUrl !== null) {
        resolve(printedUrl)
        return
      }
      if (Date.now() >= deadline) {
        resolve(null)
        return
      }
      setTimeout(poll, 100)
    }
    poll()
  })
}

/** Fetch the optional companion descriptor from the local Harness server. */
function fetchCompanionDescriptor(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/__dsh/desktop/companion', timeout: 2_000 }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 404) {
          resolve(null)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`desktop companion discovery returned HTTP ${res.statusCode}`))
          return
        }
        try {
          resolve(parseCompanionDescriptor(Buffer.concat(chunks).toString('utf8'), `http://127.0.0.1:${port}`))
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('timeout', () => { req.destroy(new Error('desktop companion discovery timed out')) })
    req.on('error', reject)
  })
}

/**
 * Retry companion discovery until a descriptor arrives or the deadline lapses.
 * A 204 (route live but no descriptor yet) and a timeout (event loop transiently
 * blocked during plugin load) both mean "try again", not "no companion"; only a
 * definitive 200 or the deadline resolves the loop.
 */
function discoverCompanion(port) {
  const deadline = Date.now() + COMPANION_DISCOVERY_DEADLINE_MS
  return new Promise((resolve) => {
    const attempt = () => {
      fetchCompanionDescriptor(port)
        .then(descriptor => {
          if (descriptor !== null) {
            resolve(descriptor)
            return
          }
          if (shuttingDown || Date.now() >= deadline) {
            resolve(null)
            return
          }
          setTimeout(attempt, COMPANION_DISCOVERY_INTERVAL_MS)
        })
        .catch(() => {
          if (shuttingDown || Date.now() >= deadline) {
            resolve(null)
            return
          }
          setTimeout(attempt, COMPANION_DISCOVERY_INTERVAL_MS)
        })
    }
    attempt()
  })
}

/** Create the constrained companion window supplied by one local DSH plugin. */
function createCompanionWindow(descriptor) {
  if (companionWin !== null) companionWin.close()
  companionDescriptor = descriptor
  activeDrag = null
  if (placementStore === null) {
    placementStore = new PlacementStore(path.join(app.getPath('userData'), 'companion-placement.json'))
  }
  const displays = screen.getAllDisplays()
  const fallbackDisplay = displayForMainWindow(displays)
  const placement = placementStore.load(new Set([descriptor.id]))
  const saved = placement.entries[descriptor.id]
  const savedSize = saved === undefined ? { width: descriptor.width, height: descriptor.height } : saved.bounds
  const initialSize = descriptor.capabilities?.resize === undefined
    ? savedSize
    : resizeCompanionBounds(
        { x: fallbackDisplay.workArea.x, y: fallbackDisplay.workArea.y },
        savedSize,
        descriptor.capabilities.resize,
        fallbackDisplay.workArea,
      )
  const restored = restoreCompanionPlacement(saved, displays, fallbackDisplay, initialSize.width, initialSize.height)
  companionSize = { width: restored.width, height: restored.height }
  companionWin = new BrowserWindow({
    width: restored.width,
    height: restored.height,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: descriptor.capabilities?.resize !== undefined,
    movable: descriptor.capabilities?.drag === true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'companion-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  companionWin.setAlwaysOnTop(true, 'floating')
  companionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  companionWin.setBounds(restored)
  companionWin.setIgnoreMouseEvents(false)
  companionWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  companionWin.webContents.on('will-navigate', (event, target) => {
    if (target !== descriptor.entryUrl) event.preventDefault()
  })
  companionWin.on('closed', () => {
    if (companionWin !== null) clearActiveDrag(companionWin)
    companionWin = null
    companionDescriptor = null
    companionSize = null
  })
  companionWin.webContents.on('render-process-gone', () => {
    if (companionWin === null) return
    clearActiveDrag(companionWin)
    companionWin.setIgnoreMouseEvents(false)
  })
  companionWin.loadURL(descriptor.entryUrl).catch(error => log(`[desktop] companion load failed: ${error.message}`))
}

/** Install the only IPC operations available to the companion renderer. */
function installCompanionIpc() {
  ipcMain.handle('dsh-desktop-companion:display-bounds', event => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin) throw new Error('desktop companion caller is not active')
    return screen.getDisplayMatching(owner.getBounds()).workArea
  })
  ipcMain.handle('dsh-desktop-companion:bounds', event => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin) throw new Error('desktop companion caller is not active')
    return owner.getBounds()
  })
  ipcMain.handle('dsh-desktop-companion:move', (event, point) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin || point === null || typeof point !== 'object') {
      throw new Error('desktop companion move request is invalid')
    }
    const { x, y } = point
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('desktop companion move request is invalid')
    const display = screen.getDisplayNearestPoint({ x, y })
    const bounds = owner.getBounds()
    owner.setBounds(clampCompanionBounds({ x, y }, display.workArea, bounds.width, bounds.height))
  })
  ipcMain.handle('dsh-desktop-companion:start-drag', (event, input) => {
    const owner = requireCompanion(event, 'drag')
    validateDragStart(input)
    if (activeDrag !== null) throw new Error('desktop companion drag is already active')
    const dragId = randomUUID()
    const bounds = owner.getBounds()
    const size = companionSize ?? bounds
    activeDrag = {
      owner,
      state: createDragState({
        dragId,
        pointerId: input.pointerId,
        screen: { x: input.screenX, y: input.screenY },
        origin: { x: bounds.x, y: bounds.y },
        size: { width: size.width, height: size.height },
      }),
    }
    owner.setIgnoreMouseEvents(false)
    return { dragId }
  })
  ipcMain.handle('dsh-desktop-companion:move-drag', (event, input) => {
    const owner = requireCompanion(event, 'drag')
    const drag = requireActiveDrag(owner, input)
    validateDragSample(input)
    return applyDragSample(drag, input)
  })
  ipcMain.handle('dsh-desktop-companion:end-drag', async (event, input) => {
    const owner = requireCompanion(event, 'drag')
    const drag = requireActiveDrag(owner, input)
    validateDragSample(input)
    applyDragSample(drag, input)
    clearActiveDrag(owner)
    owner.setIgnoreMouseEvents(false)
    await persistCompanionPlacement(owner)
    return { committed: true }
  })
  ipcMain.handle('dsh-desktop-companion:cancel-drag', (event, input) => {
    const owner = requireCompanion(event, 'drag')
    if (input === null || typeof input !== 'object' || typeof input.dragId !== 'string'
      || !Number.isSafeInteger(input.pointerId) || input.pointerId < 0) {
      throw new Error('desktop companion drag cancellation is invalid')
    }
    const drag = requireActiveDrag(owner, input)
    if (drag.state.pointerId !== input.pointerId) throw new Error('desktop companion drag pointer does not own the active session')
    clearActiveDrag(owner)
    owner.setIgnoreMouseEvents(false)
  })
  ipcMain.handle('dsh-desktop-companion:resize', async (event, input) => {
    const owner = requireCompanion(event, 'resize')
    if (activeDrag !== null) throw new Error('desktop companion cannot resize during a drag')
    if (input === null || typeof input !== 'object' || !Number.isFinite(input.width) || !Number.isFinite(input.height)) {
      throw new Error('desktop companion resize request is invalid')
    }
    const descriptor = companionDescriptor
    const capability = descriptor?.capabilities?.resize
    if (capability === undefined) throw new Error('desktop companion resize capability is unavailable')
    const bounds = owner.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const next = resizeCompanionBounds(bounds, input, capability, display.workArea)
    owner.setBounds(next)
    companionSize = { width: next.width, height: next.height }
    await persistCompanionPlacement(owner)
  })
  ipcMain.handle('dsh-desktop-companion:set-pointer-interaction', (event, input) => {
    const owner = requireCompanion(event, 'pointerInteraction')
    if (input === null || typeof input !== 'object' || typeof input.interactive !== 'boolean') {
      throw new Error('desktop companion pointer interaction request is invalid')
    }
    if (activeDrag !== null && !input.interactive) throw new Error('desktop companion remains interactive during a drag')
    owner.setIgnoreMouseEvents(!input.interactive, { forward: true })
  })
  ipcMain.handle('dsh-desktop-companion:show', (event, visible) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin || typeof visible !== 'boolean') {
      throw new Error('desktop companion show request is invalid')
    }
    if (visible) owner.showInactive()
    else owner.hide()
  })
  ipcMain.handle('dsh-desktop-companion:focus-main', event => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin || win === null) {
      throw new Error('desktop companion focus request is invalid')
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}

/** Return the display containing the main window center, or the primary display. */
function displayForMainWindow(displays) {
  if (win !== null) {
    const bounds = win.getBounds()
    return screen.getDisplayNearestPoint({
      x: bounds.x + Math.trunc(bounds.width / 2),
      y: bounds.y + Math.trunc(bounds.height / 2),
    })
  }
  return screen.getPrimaryDisplay() ?? displays[0]
}

/** Validate that a renderer IPC message belongs to the active companion and capability. */
function requireCompanion(event, capability) {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (owner === null || owner !== companionWin || companionDescriptor === null) {
    throw new Error('desktop companion caller is not active')
  }
  if (capability !== undefined && companionDescriptor.capabilities?.[capability] !== true
    && !(capability === 'resize' && companionDescriptor.capabilities?.resize !== undefined)) {
    throw new Error(`desktop companion ${capability} capability is unavailable`)
  }
  return owner
}

/** Validate the synchronous startDrag payload before creating ownership state. */
function validateDragStart(input) {
  if (input === null || typeof input !== 'object' || !Number.isSafeInteger(input.pointerId) || input.pointerId < 0
    || !Number.isFinite(input.screenX) || !Number.isFinite(input.screenY)) {
    throw new Error('desktop companion drag start is invalid')
  }
}

/** Validate a monotonic drag sample's wire fields. */
function validateDragSample(input) {
  if (input === null || typeof input !== 'object' || typeof input.dragId !== 'string' || input.dragId.length === 0
    || !Number.isSafeInteger(input.pointerId) || input.pointerId < 0
    || !Number.isSafeInteger(input.sequence) || input.sequence <= 0
    || !Number.isFinite(input.screenX) || !Number.isFinite(input.screenY)) {
    throw new Error('desktop companion drag sample is invalid')
  }
}

/** Verify the drag id and pointer id before touching window bounds. */
function requireActiveDrag(owner, input) {
  if (activeDrag === null || activeDrag.owner !== owner || activeDrag.state.dragId !== input.dragId) {
    throw new Error('desktop companion drag session is not active')
  }
  if (activeDrag.state.pointerId !== input.pointerId) {
    throw new Error('desktop companion drag pointer does not own the active session')
  }
  return activeDrag
}

/** Apply one accepted sample. The drag session owns the exact (unrounded)
 * window position and adds every pointer displacement to it at full precision;
 * only the rectangle materialized for setBounds is rounded, so the sub-pixel
 * remainder carries between samples and Windows fractional-scale deltas cannot
 * ratchet the window away from the pointer. The rectangle keeps the grab-time
 * session size: Windows fractional-scale setBounds round-trips drift the
 * reported size, which the work-area clamp would turn into upward creep. */
function applyDragSample(drag, input) {
  const owner = drag.owner
  const display = screen.getDisplayNearestPoint({ x: input.screenX, y: input.screenY })
  const result = advanceCompanionDrag(
    drag.state,
    {
      pointerId: input.pointerId,
      sequence: input.sequence,
      screen: { x: input.screenX, y: input.screenY },
    },
    display.workArea,
  )
  drag.state = result.state
  if (result.accepted) owner.setBounds(result.bounds)
  return { accepted: result.accepted, sequence: result.sequence, direction: result.direction }
}

/** Clear the active session on cancel, teardown, or after a successful terminal event. */
function clearActiveDrag(owner) {
  if (activeDrag !== null && (owner === undefined || activeDrag.owner === owner)) activeDrag = null
}

/** Persist the current position, the authoritative companion size, and display
 * facts after a committed terminal mutation. The OS-reported size is never
 * persisted, so its per-call drift cannot compound across sessions. */
async function persistCompanionPlacement(owner) {
  if (placementStore === null || companionDescriptor === null) return
  const bounds = owner.getBounds()
  const size = companionSize ?? bounds
  const rectangle = { x: bounds.x, y: bounds.y, width: size.width, height: size.height }
  const display = screen.getDisplayMatching(rectangle)
  const entry = placementEntryForBounds(companionDescriptor.id, rectangle, display, rectangle.height)
  await placementStore.writeEntry(companionDescriptor.id, entry)
}

/** Terminate the server process tree; force after a short grace period. */
let killInFlight = false
function killServer() {
  if (server === null || killInFlight) return
  killInFlight = true
  const pid = server.pid
  log(`[desktop] shutting down harness server (pid ${pid})`)
  server.kill('SIGTERM')
  const force = () => {
    if (server === null) return
    log(`[desktop] server did not exit in ${KILL_GRACE_MS}ms, force-killing pid ${pid}`)
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    server = null
  }
  setTimeout(force, KILL_GRACE_MS)
  server.once('exit', () => {
    server = null
    log('[desktop] harness server exited')
  })
}

function showFatal(message) {
  log(`[desktop] fatal: ${message}`)
  dialog.showErrorBox('DeepSeek Harness', message)
}

/** Boot the harness server and load its UI into the window. */
async function boot() {
  try {
    if (server !== null) return
    const harnessDir = resolveHarnessDir()
    if (harnessDir === null) {
      const hint = app.isPackaged
        ? 'Set the DSH_DESKTOP_HARNESS_DIR environment variable to your harness checkout path, or place this executable next to the checkout.'
        : 'Set the DSH_DESKTOP_HARNESS_DIR environment variable to your harness checkout path.'
      throw new Error(`Cannot find the harness checkout. ${hint}`)
    }
    const node = process.env.DSH_NODE || 'node'
    await new Promise((resolve, reject) => {
      execFile(node, ['--version'], { windowsHide: true }, (error, stdout) => {
        if (error) {
          reject(new Error(`cannot run Node (${node}): ${error.message}. Install Node.js or point DSH_NODE at it.`))
          return
        }
        log(`[desktop] using Node ${stdout.trim()} from ${node}`)
        resolve()
      })
    })
    const port = await findFreePort()
    log(`[desktop] booting harness at ${harnessDir} on port ${port}`)
    server = spawn(node, [...SERVER_ARGS, '--port', String(port)], {
      cwd: harnessDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    server.stdout.on('data', (chunk) => {
      const line = chunk.toString().trimEnd()
      log(`[server] ${line}`)
      // The server prints `dsh web: http://127.0.0.1:<port>/?token=...` once the
      // web-runtime plugin settles; capture that URL so the main window can
      // load it and pass the browser-trust fence (the bare root is rejected).
      // Anchor on http(s) so the follow-up banner line (`dsh web: opening the
      // default browser...`) cannot overwrite the captured URL with prose.
      const match = line.match(/dsh web:\s*(https?:\/\/\S+)/)
      if (match !== null) printedUrl = match[1]
    })
    server.stderr.on('data', (chunk) => log(`[server] ${chunk.toString().trimEnd()}`))
    server.once('exit', (code, signal) => {
      server = null
      log(`[desktop] harness server exited (code ${code}, signal ${signal})`)
      if (!shuttingDown) {
        showFatal(`The harness server stopped unexpectedly (code ${code}). See the log at ${path.join(app.getPath('userData'), 'run.log')}.`)
        app.quit()
      }
    })
    server.once('error', (error) => {
      showFatal(`Failed to start the harness server: ${error.message}`)
      app.quit()
    })

    await waitReady(port, READY_TIMEOUT_MS)
    if (shuttingDown || win === null) return
    // The server prints the canonical URL (carrying the auth token) moments
    // after it starts answering; wait briefly for that line so the window
    // loads the tokened URL the browser-trust fence accepts. Fall back to the
    // bare root only if the line never arrives (the fence then explains why).
    const tokenedUrl = await waitForPrintedUrl(5_000)
    if (shuttingDown || win === null) return
    win.loadURL(tokenedUrl ?? `http://127.0.0.1:${port}/`)
      .catch(error => log(`[desktop] main window load failed: ${error.message}`))
    discoverCompanion(port)
      .then(descriptor => {
        if (descriptor !== null && !shuttingDown) createCompanionWindow(descriptor)
      })
  } catch (error) {
    showFatal(error.message)
    app.quit()
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'DeepSeek Harness',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    backgroundColor: '#0d1117',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.loadFile(path.join(__dirname, 'loading.html'))
  win.once('ready-to-show', () => { win.show() })
  win.on('closed', () => { win = null })
  boot().catch(() => {})
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win !== null) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    log(`[desktop] starting (log: ${path.join(app.getPath('userData'), 'run.log')})`)
    installCompanionIpc()
    createWindow()
  })

  app.on('window-all-closed', () => {
    shuttingDown = true
    killServer()
    app.quit()
  })

  app.on('before-quit', () => {
    if (server !== null) {
      shuttingDown = true
      killServer()
    }
  })
}
