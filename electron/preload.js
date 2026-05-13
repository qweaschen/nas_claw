const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialog
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // File system
  listDir: (dirPath, isRemote) => ipcRenderer.invoke('fs:listDir', dirPath, isRemote),

  // Local scan
  scanLocal: (dirPath, excludeDirs) => ipcRenderer.invoke('scan:local', dirPath, excludeDirs),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),

  // WebDAV
  webdavConnect: (config) => ipcRenderer.invoke('webdav:connect', config),
  webdavDisconnect: () => ipcRenderer.invoke('webdav:disconnect'),
  scanRemote: (dirPath, excludeDirs) => ipcRenderer.invoke('scan:remote', dirPath, excludeDirs),

  // AVID
  parseAvid: (filename) => ipcRenderer.invoke('avid:parse', filename),

  // Scrape
  scrapeMovie: (avid, options) => ipcRenderer.invoke('scrape:movie', avid, options),
  scrapeBatch: (files, options) => ipcRenderer.invoke('scrape:batch', files, options),
  saveScrapeResult: (fileInfo, movieData, outputDir, isRemote) =>
    ipcRenderer.invoke('scrape:save', fileInfo, movieData, outputDir, isRemote),
  scrapePause: () => ipcRenderer.invoke('scrape:pause'),
  scrapeResume: () => ipcRenderer.invoke('scrape:resume'),
  scrapeStop: () => ipcRenderer.invoke('scrape:stop'),
  fetchImageDataUrl: (imageUrl) => ipcRenderer.invoke('image:fetchDataUrl', imageUrl),

  // Progress listeners
  onScrapeProgress: (callback) => {
    ipcRenderer.on('scrape:progress', (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('scrape:progress');
  },
  onBatchProgress: (callback) => {
    ipcRenderer.on('scrape:batchProgress', (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('scrape:batchProgress');
  },
  onItemResult: (callback) => {
    ipcRenderer.on('scrape:itemResult', (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('scrape:itemResult');
  },
  onScanProgress: (callback) => {
    ipcRenderer.on('scan:progress', (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('scan:progress');
  },

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
});
