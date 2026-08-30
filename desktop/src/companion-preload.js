'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktopCompanion', Object.freeze({
  displayBounds: () => ipcRenderer.invoke('dsh-desktop-companion:display-bounds'),
  bounds: () => ipcRenderer.invoke('dsh-desktop-companion:bounds'),
  move: point => ipcRenderer.invoke('dsh-desktop-companion:move', point),
  startDrag: input => ipcRenderer.invoke('dsh-desktop-companion:start-drag', input),
  moveDrag: input => ipcRenderer.invoke('dsh-desktop-companion:move-drag', input),
  endDrag: input => ipcRenderer.invoke('dsh-desktop-companion:end-drag', input),
  cancelDrag: input => ipcRenderer.invoke('dsh-desktop-companion:cancel-drag', input),
  resize: input => ipcRenderer.invoke('dsh-desktop-companion:resize', input),
  setPointerInteraction: input => ipcRenderer.invoke('dsh-desktop-companion:set-pointer-interaction', input),
  show: visible => ipcRenderer.invoke('dsh-desktop-companion:show', visible),
  focusMain: () => ipcRenderer.invoke('dsh-desktop-companion:focus-main'),
}))
