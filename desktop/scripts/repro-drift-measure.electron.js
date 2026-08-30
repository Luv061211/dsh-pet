/**
 * Drift measurement: drive the production drag pipeline with REAL OS mouse
 * input (PowerShell SendInput) and compare pointer displacement vs window
 * displacement. Diagnosis only; not part of the product.
 *
 * Run: electron scripts/repro-drift-measure.electron.js
 */
'use strict'

const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const {
  advanceCompanionDrag,
  createDragState,
} = require('../src/companion.js')

const log = []
const obs = (label, value) => {
  const line = `${label}=${JSON.stringify(value)}`
  log.push(line)
  console.log(line)
}

let companionWin = null
let activeDrag = null
/** Authoritative size captured once after creation, mirroring src/main.js
 * companionSize so re-anchoring per session cannot adopt OS-reported drift. */
let intendedSize = null
/** Every setBounds request and the later read-back. */
const boundsTrace = []

const PAGE = `<!doctype html><style>html,body{margin:0}button{position:fixed;inset:0;width:100%;height:100%;border:0;background:red}</style>
<button id="grab"></button>
<script>
const api=window.dshDesktopCompanion;
let drag=null;
let moved=false;
window.__samples=[];
const grab=document.getElementById('grab');
grab.addEventListener('pointerdown',event=>{
  event.preventDefault();
  grab.setPointerCapture(event.pointerId);
  const pending={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,sequence:0};
  drag=pending;moved=false;
  window.__samples.push({phase:'down',screenX:event.screenX,screenY:event.screenY,t:performance.now()});
  if(api)void api.startDrag({pointerId:event.pointerId,screenX:event.screenX,screenY:event.screenY})
    .then(result=>{if(drag===pending)pending.dragId=result.dragId})
    .catch(err=>{if(drag===pending)drag=null;window.__samples.push({phase:'start-error',err:String(err)})});
});
grab.addEventListener('pointermove',event=>{
  if(drag===null||drag.pointerId!==event.pointerId)return;
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)moved=true;
  if(api&&drag.dragId!==undefined){
    drag.sequence+=1;
    window.__samples.push({phase:'move',seq:drag.sequence,screenX:event.screenX,screenY:event.screenY,clientX:event.clientX,clientY:event.clientY,t:performance.now()});
    void api.moveDrag({dragId:drag.dragId,pointerId:drag.pointerId,sequence:drag.sequence,screenX:event.screenX,screenY:event.screenY})
      .then(result=>{window.__samples.push({phase:'move-result',seq:drag.sequence,accepted:result.accepted})})
      .catch(err=>{window.__samples.push({phase:'move-error',seq:drag.sequence,err:String(err)})});
  }
});
grab.addEventListener('pointerup',event=>{
  const pending=drag;if(pending===null||pending.pointerId!==event.pointerId)return;
  drag=null;
  window.__samples.push({phase:'up',screenX:event.screenX,screenY:event.screenY,t:performance.now()});
  if(api&&pending.dragId!==undefined){pending.sequence+=1;void api.endDrag({dragId:pending.dragId,pointerId:pending.pointerId,sequence:pending.sequence,screenX:event.screenX,screenY:event.screenY}).catch(err=>{window.__samples.push({phase:'end-error',err:String(err)})})}
});
</script>`

function applyDragSample(drag, input) {
  const owner = drag.owner
  const display = screen.getDisplayNearestPoint({ x: input.screenX, y: input.screenY })
  const result = advanceCompanionDrag(
    drag.state,
    { pointerId: input.pointerId, sequence: input.sequence, screen: { x: input.screenX, y: input.screenY } },
    display.workArea,
  )
  drag.state = result.state
  if (result.accepted) {
    owner.setBounds(result.bounds)
    boundsTrace.push({ seq: input.sequence, reqY: result.bounds.y, at: Date.now() })
  }
  return { accepted: result.accepted, sequence: result.sequence, direction: result.direction }
}

function installCompanionIpc() {
  ipcMain.handle('dsh-desktop-companion:start-drag', (event, input) => {
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
        dragId: 'drag-measure',
        pointerId: input.pointerId,
        screen: { x: input.screenX, y: input.screenY },
        origin: { x: bounds.x, y: bounds.y },
        size: { width: size.width, height: size.height },
      }),
    }
    obs('startDrag-anchor', { x: input.screenX, y: input.screenY, size: { width: size.width, height: size.height } })
    return { dragId: 'drag-measure' }
  })
  ipcMain.handle('dsh-desktop-companion:move-drag', (event, input) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin || activeDrag === null) throw new Error('drag session is not active')
    if (input === null || typeof input !== 'object' || typeof input.dragId !== 'string'
      || !Number.isSafeInteger(input.pointerId) || !Number.isSafeInteger(input.sequence)
      || !Number.isFinite(input.screenX) || !Number.isFinite(input.screenY)) {
      throw new Error('drag sample is invalid')
    }
    return applyDragSample(activeDrag, input)
  })
  ipcMain.handle('dsh-desktop-companion:end-drag', async (event, input) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner === null || owner !== companionWin || activeDrag === null) throw new Error('drag session is not active')
    applyDragSample(activeDrag, input)
    activeDrag = null
    return { committed: true }
  })
}

/** Move the real mouse with SendInput: absolute-position steps with the button held. */
function runMouseScript(steps) {
  const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@
[M]::SetCursorPos(${steps.downX},${steps.downY})
Start-Sleep -Milliseconds 120
[M]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
${steps.moves.map(m => `[M]::SetCursorPos(${m.x},${m.y}); Start-Sleep -Milliseconds ${m.hold}`).join('\n')}
[M]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
`
  const file = path.join(os.tmpdir(), 'dsh-drift-mouse.ps1')
  fs.writeFileSync(file, ps)
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true })
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`mouse script exit ${code}`))))
    child.on('error', reject)
  })
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  try {
    installCompanionIpc()
    const primary = screen.getPrimaryDisplay()
    obs('display', { workArea: primary.workArea, scaleFactor: primary.scaleFactor })

    // Window placed mid-screen; drag moves the pointer UP by 200 DIP in 20 steps.
    const winX = primary.workArea.x + Math.trunc(primary.workArea.width / 2) - 96
    const winY = primary.workArea.y + Math.trunc(primary.workArea.height / 2) - 104
    companionWin = new BrowserWindow({
      x: winX,
      y: winY,
      width: 192,
      height: 208,
      useContentSize: true,
      frame: false,
      transparent: true,
      resizable: true,
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
    companionWin.setBounds({ x: winX, y: winY, width: 192, height: 208 })
    await delay(300)
    const initial = companionWin.getBounds()
    obs('initial-bounds', initial)

    // Pointer starts at the window center (DIP), moves up 200 DIP over ~2s.
    const cx = winX + 96
    const cy = winY + 104
    const moves = []
    for (let step = 1; step <= 20; step++) {
      moves.push({ x: cx, y: cy - step * 10, hold: 80 })
    }
    await runMouseScript({ downX: cx, downY: cy, moves })
    await delay(600)

    const final = companionWin.getBounds()
    const samples = await companionWin.webContents.executeJavaScript('window.__samples')
    const moves2 = samples.filter(s => s.phase === 'move')
    const firstMove = moves2[0]
    const lastMove = moves2[moves2.length - 1]
    const down = samples.find(s => s.phase === 'down')
    obs('final-bounds', final)
    obs('window-dy', final.y - initial.y)
    obs('window-size-drift', { dw: final.width - initial.width, dh: final.height - initial.height })
    obs('pointer-samples', {
      downY: down?.screenY,
      firstMoveY: firstMove?.screenY,
      lastMoveY: lastMove?.screenY,
      reportedDyFromDown: down !== undefined && lastMove !== undefined ? lastMove.screenY - down.screenY : null,
      moveCount: moves2.length,
    })
    obs('bounds-trace-tail', boundsTrace.slice(-6))
    // Read-back check: after settling, does getBounds equal the last request?
    const lastReq = boundsTrace[boundsTrace.length - 1]
    obs('readback-check', { lastReqY: lastReq?.reqY, finalY: final.y, match: lastReq?.reqY === final.y })

    companionWin.close()
    fs.writeFileSync(path.join(os.tmpdir(), 'dsh-drift-log.json'), JSON.stringify({ log, samples, boundsTrace }, null, 2))
    app.exit(0)
  } catch (error) {
    console.log(`RESULT FAIL ${error.stack || String(error)}`)
    app.exit(1)
  }
})
