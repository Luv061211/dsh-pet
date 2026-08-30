/**
 * Electron drag repro: exercise the companion drag pipeline two ways.
 *
 * Scenario 1-2 drive the real preload → ipcRenderer → ipcMain chain with
 * synthesized pointer input. Electron's sendInputEvent does not derive screen
 * coordinates, so those samples all report screenX/screenY 0 and the window
 * must stay exactly still — any movement means fabricated drift.
 *
 * Scenario 3 drives the drag handlers directly with real screen-coordinate
 * samples and asserts the window follows the pointer delta with no drift.
 *
 * Run: electron scripts/repro-drag.electron.js (prints observations).
 */
'use strict'

const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('node:path')
const {
  advanceCompanionDrag,
  createDragState,
} = require('../src/companion.js')

const steps = []
const obs = (label, value) => { steps.push(`${label}=${JSON.stringify(value)}`) }
const fail = (message) => {
  console.log(`OBS ${steps.join(' ')}`)
  console.log(`RESULT FAIL ${message}`)
  app.exit(1)
}
const pass = () => {
  console.log(`OBS ${steps.join(' ')}`)
  console.log('RESULT PASS')
  app.exit(0)
}

let companionWin = null
let activeDrag = null
/** Authoritative size captured once after creation, mirroring src/main.js
 * companionSize so re-anchoring per session cannot adopt OS-reported drift. */
let intendedSize = null

/** Handler references kept for the direct real-coordinate scenario. */
const handlers = {}

/** Replica of the main-process drag IPC in src/main.js sharing its core
 * `advanceCompanionDrag` step, so this repro cannot drift from production. */
function installCompanionIpc() {
  handlers['start-drag'] = (event, input) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin) throw new Error('caller is not active')
    if (input === null || typeof input !== 'object' || !Number.isSafeInteger(input.pointerId) || input.pointerId < 0
      || !Number.isFinite(input.screenX) || !Number.isFinite(input.screenY)) {
      throw new Error('drag start is invalid')
    }
    if (activeDrag !== null) throw new Error('drag is already active')
    const bounds = owner.getBounds()
    const size = intendedSize ?? bounds
    activeDrag = {
      owner,
      state: createDragState({
        dragId: 'drag-' + steps.length,
        pointerId: input.pointerId,
        screen: { x: input.screenX, y: input.screenY },
        origin: { x: bounds.x, y: bounds.y },
        size: { width: size.width, height: size.height },
      }),
    }
    return { dragId: activeDrag.state.dragId }
  }
  handlers['move-drag'] = (event, input) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin || activeDrag === null || activeDrag.owner !== owner) {
      throw new Error('drag session is not active')
    }
    if (input === null || typeof input !== 'object' || typeof input.dragId !== 'string' || input.dragId.length === 0
      || !Number.isSafeInteger(input.pointerId) || input.pointerId < 0
      || !Number.isSafeInteger(input.sequence) || input.sequence <= 0
      || !Number.isFinite(input.screenX) || !Number.isFinite(input.screenY)) {
      throw new Error('drag sample is invalid')
    }
    if (activeDrag.state.dragId !== input.dragId || activeDrag.state.pointerId !== input.pointerId) {
      throw new Error('drag id or pointer mismatch')
    }
    return applySample(activeDrag, input)
  }
  handlers['end-drag'] = (event, input) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin) throw new Error('invalid caller')
    if (input === null || typeof input !== 'object' || typeof input.dragId !== 'string'
      || !Number.isSafeInteger(input.pointerId) || input.pointerId < 0) {
      throw new Error('drag end is invalid')
    }
    if (activeDrag === null || activeDrag.state.dragId !== input.dragId || activeDrag.state.pointerId !== input.pointerId) {
      throw new Error('drag session is not active')
    }
    applySample(activeDrag, input)
    activeDrag = null
    return { committed: true }
  }
  ipcMain.handle('dsh-desktop-companion:start-drag', handlers['start-drag'])
  ipcMain.handle('dsh-desktop-companion:move-drag', handlers['move-drag'])
  ipcMain.handle('dsh-desktop-companion:end-drag', handlers['end-drag'])
}

/** Shared per-sample step mirroring src/main.js applyDragSample. */
function applySample(drag, input) {
  const display = screen.getDisplayNearestPoint({ x: input.screenX, y: input.screenY })
  const result = advanceCompanionDrag(
    drag.state,
    { pointerId: input.pointerId, sequence: input.sequence, screen: { x: input.screenX, y: input.screenY } },
    display.workArea,
  )
  drag.state = result.state
  if (result.accepted) drag.owner.setBounds(result.bounds)
  return { accepted: result.accepted, sequence: result.sequence, direction: result.direction }
}

const PAGE = `<!doctype html><style>html,body{margin:0}button{position:fixed;inset:0;width:100%;height:100%;border:0;background:red}</style>
<button id="grab"></button>
<script>
const api=window.dshDesktopCompanion;
let drag=null;
let sequence=0;
window.__dragState='idle';
window.__moves=[];
const grab=document.getElementById('grab');
grab.addEventListener('pointerdown',event=>{
  drag={pointerId:event.pointerId,dragId:null};
  sequence=0;
  api.startDrag({pointerId:event.pointerId,screenX:event.screenX,screenY:event.screenY}).then(result=>{
    if(drag===null)return;
    drag.dragId=result.dragId;
    window.__dragState='started:'+drag.dragId;
  });
});
grab.addEventListener('pointermove',event=>{
  if(drag===null||drag.pointerId!==event.pointerId)return;
  if(drag.dragId===null)return;
  sequence+=1;
  window.__moves.push({sequence,screenX:event.screenX,screenY:event.screenY});
  api.moveDrag({dragId:drag.dragId,pointerId:drag.pointerId,sequence,screenX:event.screenX,screenY:event.screenY});
});
grab.addEventListener('pointerup',event=>{
  if(drag===null||drag.pointerId!==event.pointerId)return;
  const d=drag;drag=null;
  if(d.dragId!==null){sequence+=1;api.endDrag({dragId:d.dragId,pointerId:d.pointerId,sequence,screenX:event.screenX,screenY:event.screenY})}
  window.__dragState='ended';
});
</script>`

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitFor(state, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await companionWin.webContents.executeJavaScript('window.__dragState')
    if (current.startsWith(state)) return current
    await delay(10)
  }
  throw new Error(`renderer did not reach ${state}`)
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  try {
    installCompanionIpc()

    // 窗口初始位置：真实显示器工作区下缘（可见，获得有效屏幕坐标；尽量不打扰用户）
    const primary = screen.getPrimaryDisplay().workArea
    const initialX = primary.x + 120
    const initialY = primary.y + primary.height - 300
    companionWin = new BrowserWindow({
      x: initialX,
      y: initialY,
      width: 192,
      height: 208,
      useContentSize: true,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'src', 'companion-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    await companionWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE))
    companionWin.webContents.setBackgroundThrottling(false)
    intendedSize = companionWin.getBounds()

    const grabX = 96
    const grabY = 104 // 用窗口中心作为抓取点
    const initialSize = companionWin.getBounds()

    // --- 场景 1：拖拽链路观察 ---
    // 合成输入的 screenX/screenY 恒为 0（Electron sendInputEvent 不派生屏幕
    // 坐标），delta 模式下窗口必须纹丝不动；任何位移都意味着漂移。
    companionWin.webContents.sendInputEvent({ type: 'mouseDown', x: grabX, y: grabY, button: 'left', clickCount: 1 })
    await waitFor('started')
    const stepsAllData = []
    for (let step = 1; step <= 8; step++) {
      await delay(16)
      const delta = -25 * step // 每步向上 25px
      companionWin.webContents.sendInputEvent({ type: 'mouseMove', x: grabX, y: grabY + delta, button: 'left', modifiers: ['leftButtonDown'] })
      await delay(20)
      const b = companionWin.getBounds()
      const pageMoves = await companionWin.webContents.executeJavaScript('window.__moves')
      obs(`step${step}`, { windowsY: b.y, pageMoves: pageMoves.slice(-2) })
      stepsAllData.push({ step, y: b.y })
    }
    companionWin.webContents.sendInputEvent({ type: 'mouseUp', x: grabX, y: grabY, button: 'left', clickCount: 1 })
    await waitFor('ended')
    await delay(50)

    // 场景 1 断言：window 位置全程不变（恒等于初始位置）
    for (const sample of stepsAllData) {
      if (Math.abs(sample.y - initialY) > 1) {
        fail(`window moved without a real screen delta at step ${sample.step}: y=${sample.y}`)
        return
      }
    }

    // 场景 2：多段拖拽（同样无有效 screen 坐标），不得有任何累积偏移
    for (let drag = 1; drag <= 5; drag++) {
      companionWin.webContents.sendInputEvent({ type: 'mouseDown', x: grabX, y: grabY, button: 'left', clickCount: 1 })
      await waitFor('started')
      companionWin.webContents.sendInputEvent({ type: 'mouseMove', x: grabX, y: grabY - 120, button: 'left', modifiers: ['leftButtonDown'] })
      await delay(30)
      companionWin.webContents.sendInputEvent({ type: 'mouseMove', x: grabX, y: grabY + 40, button: 'left', modifiers: ['leftButtonDown'] })
      await delay(30)
      companionWin.webContents.sendInputEvent({ type: 'mouseUp', x: grabX, y: grabY + 40, button: 'left', clickCount: 1 })
      await waitFor('ended')
      await delay(50)
      const b = companionWin.getBounds()
      obs(`drag${drag}`, { y: b.y })
      if (Math.abs(b.y - initialY) > 1) {
        fail(`drag ${drag} drifted: y=${b.y}, initial=${initialY}`)
        return
      }
    }

    // 场景 3：直驱 drag handler，喂真实屏幕坐标序列（合成输入给不出真实的
    // screen 坐标）。窗口必须逐步跟随指针位移，且全程与预期位置一致。
    const fakeEvent = { sender: companionWin.webContents }
    const grabScreen = { x: primary.x + 400, y: primary.y + primary.height - 200 }
    const started = handlers['start-drag'](fakeEvent, { pointerId: 9, screenX: grabScreen.x, screenY: grabScreen.y })
    const moves = [
      { dx: 30, dy: -20 },
      { dx: -10, dy: -15 },
      { dx: 5, dy: 40 },
    ]
    const total = moves.reduce((sum, move) => ({ x: sum.x + move.dx, y: sum.y + move.dy }), { x: 0, y: 0 })
    const expected = { x: initialX, y: initialY }
    let sequence = 0
    for (const move of moves) {
      sequence += 1
      const reached = moves.slice(0, sequence).reduce(
        (sum, step) => ({ x: sum.x + step.dx, y: sum.y + step.dy }), { x: 0, y: 0 })
      const result = handlers['move-drag'](fakeEvent, {
        dragId: started.dragId,
        pointerId: 9,
        sequence,
        screenX: grabScreen.x + reached.x,
        screenY: grabScreen.y + reached.y,
      })
      if (!result.accepted) {
        fail(`real-coordinate move ${sequence} was rejected`)
        return
      }
      expected.x += move.dx
      expected.y += move.dy
      const b = companionWin.getBounds()
      obs(`real${sequence}`, { expectedX: expected.x, expectedY: expected.y, actualX: b.x, actualY: b.y })
      if (Math.abs(b.x - expected.x) > 1 || Math.abs(b.y - expected.y) > 1) {
        fail(`real-coordinate move ${sequence}: expected (${expected.x},${expected.y}), got (${b.x},${b.y})`)
        return
      }
    }
    handlers['end-drag'](fakeEvent, {
      dragId: started.dragId,
      pointerId: 9,
      sequence: sequence + 1,
      screenX: grabScreen.x + total.x,
      screenY: grabScreen.y + total.y,
    })
    const finalBounds = companionWin.getBounds()
    if (Math.abs(finalBounds.x - expected.x) > 1 || Math.abs(finalBounds.y - expected.y) > 1) {
      fail(`final real-coordinate position: expected (${expected.x},${expected.y}), got (${finalBounds.x},${finalBounds.y})`)
      return
    }
    // Windows 分数缩放下的 setBounds 往返可能让报告尺寸瞬时偏 1px，但整个
    // 复现期间不得累积增长（修复前每次采样 +1px）。
    if (Math.abs(finalBounds.width - initialSize.width) > 1 || Math.abs(finalBounds.height - initialSize.height) > 1) {
      fail(`window size drifted: started ${initialSize.width}x${initialSize.height}, ended ${finalBounds.width}x${finalBounds.height}`)
      return
    }

    pass()
  } catch (error) {
    fail(error.stack || String(error))
  }
})