const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen')
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script loaded successfully');
});