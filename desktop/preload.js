/* Minimal, typed bridge between the app page and the desktop shell (no Node.js exposed). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  info: () => ipcRenderer.invoke('desk:info'),
  saveFile: (name, data, filters) => ipcRenderer.invoke('desk:saveFile', { name, data, filters }),
  printToPDF: (name) => ipcRenderer.invoke('desk:printToPDF', { name }),
  openPath: (p) => ipcRenderer.invoke('desk:openPath', p),
  showInFolder: (p) => ipcRenderer.invoke('desk:showInFolder', p),
  openDataFolder: () => ipcRenderer.invoke('desk:openDataFolder'),
  chooseBackupDir: () => ipcRenderer.invoke('desk:chooseBackupDir'),
  setBackupOptions: (o) => ipcRenderer.invoke('desk:setBackupOptions', o),
  writeBackup: (json, auto) => ipcRenderer.invoke('desk:writeBackup', { json, auto }),
  sync: {
    get: () => ipcRenderer.invoke('desk:sync:get'),
    choose: () => ipcRenderer.invoke('desk:sync:choose'),
    inspect: (dir) => ipcRenderer.invoke('desk:sync:inspect', dir),
    connect: (dir, deviceName) => ipcRenderer.invoke('desk:sync:connect', { dir, deviceName }),
    disconnect: () => ipcRenderer.invoke('desk:sync:disconnect'),
    setOptions: (o) => ipcRenderer.invoke('desk:sync:setOptions', o),
    info: () => ipcRenderer.invoke('desk:sync:info'),
    scan: () => ipcRenderer.invoke('desk:sync:scan'),
    read: (store, key) => ipcRenderer.invoke('desk:sync:read', { store, key }),
    write: (store, key, header, json) => ipcRenderer.invoke('desk:sync:write', { store, key, header, json }),
    writeDevice: (d) => ipcRenderer.invoke('desk:sync:writeDevice', d),
    devices: () => ipcRenderer.invoke('desk:sync:devices'),
    openFolder: () => ipcRenderer.invoke('desk:sync:openFolder'),
  },
});
