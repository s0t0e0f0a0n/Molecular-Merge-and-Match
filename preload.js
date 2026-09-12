const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  openNmrPreview: () => ipcRenderer.send('open-nmr-preview')
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script loaded successfully');
});