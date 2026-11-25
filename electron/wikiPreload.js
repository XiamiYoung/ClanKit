const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  wikiWindow: {
    settings: () => ipcRenderer.invoke('wiki-window:settings'),
    close: () => ipcRenderer.invoke('wiki-window:close'),
    minimize: () => ipcRenderer.invoke('wiki-window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('wiki-window:toggle-maximize'),
    isMaximized: () => ipcRenderer.invoke('wiki-window:is-maximized'),
    onMaximized: cb => {
      const listener = (_, value) => cb(value)
      ipcRenderer.on('wiki-window:maximized', listener)
      return () => ipcRenderer.removeListener('wiki-window:maximized', listener)
    },
    openSource: path => ipcRenderer.invoke('wiki-window:open-source', path),
  },
  openExternal: url => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return ipcRenderer.invoke('shell:open-external', url)
  },
  aidoc: {
    getWikiPages: options => ipcRenderer.invoke('aidoc:wiki-pages', options),
    getWikiPage: options => ipcRenderer.invoke('aidoc:wiki-page', options),
    getGraph: options => ipcRenderer.invoke('aidoc:graph-data', options),
    getSyncStatus: options => ipcRenderer.invoke('aidoc:sync-status', options),
  },
})
