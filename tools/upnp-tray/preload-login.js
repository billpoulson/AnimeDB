const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loginApi', {
  send: (password) => ipcRenderer.send('login', password),
  onError: (cb) => ipcRenderer.on('login-error', (_, msg) => cb(msg)),
});
