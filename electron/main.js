const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Modules
const { scanDirectory, scanRemoteDirectory, ScanCanceledError } = require('./lib/scanner');
const { parseAvid } = require('./lib/avid');
const { scrapeMovie } = require('./lib/scrapeEngine');
const { generateNFO } = require('./lib/nfo');
const { connectWebDAV, disconnectWebDAV, getWebDAVClient } = require('./lib/webdav');

// 视频文件扩展名集合（与 scanner.js 保持一致）
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.wmv', '.flv', '.mov',
  '.rmvb', '.rm', '.ts', '.m4v', '.webm', '.iso',
  '.m2ts', '.divx', '.mpg', '.mpeg',
]);

function sanitizePathSegment(segment) {
  return String(segment || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim() || 'Unknown';
}

async function moveLocalFile(sourcePath, destinationPath) {
  try {
    await fs.promises.rename(sourcePath, destinationPath);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(sourcePath, destinationPath);
    await fs.promises.unlink(sourcePath);
  }
}

function buildImageHeaders(url) {
  const parsed = new URL(url);
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Referer': `${parsed.origin}/`,
  };
}

/**
 * 清理源文件夹中的残留文件和空目录
 * 视频被移走后，删除同目录下的非视频残留文件，然后删除空目录
 * 向上递归清理空的父目录（不超过 scanRoot）
 * @param {string} sourceDir 视频原来所在的目录
 * @param {string} scanRoot 扫描根目录，不会删除这个目录本身
 * @param {boolean} isRemote 是否为远程 WebDAV 模式
 */
async function cleanupSourceDir(sourceDir, scanRoot, isRemote) {
  try {
    if (isRemote) {
      const client = getWebDAVClient();
      if (!client) return;

      // 获取源目录内容
      const list = await client.getDirectoryContents(sourceDir);

      // 检查是否还有视频文件残留
      const hasVideo = list.some(item => {
        if (item.type === 'directory') return false;
        const ext = path.extname(item.basename).toLowerCase();
        return VIDEO_EXTENSIONS.has(ext);
      });

      // 如果还有视频文件，不清理
      if (hasVideo) return;

      // 删除所有残留文件和子目录
      for (const item of list) {
        if (item.basename.startsWith('.') || item.basename.startsWith('@')) continue;
        try {
          await client.deleteFile(item.filename);
        } catch (e) {
          console.error(`清理残留文件失败: ${item.filename}`, e.message);
        }
      }

      // 再次检查目录是否已空，然后删除目录本身
      const remaining = await client.getDirectoryContents(sourceDir);
      if (remaining.length === 0) {
        // 规范化路径用于比较
        const normalizedSource = sourceDir.replace(/\/+$/, '');
        const normalizedRoot = scanRoot.replace(/\/+$/, '');
        if (normalizedSource !== normalizedRoot && normalizedSource !== '/') {
          await client.deleteFile(sourceDir);

          // 尝试向上递归清理空的父目录
          const parentDir = path.posix.dirname(normalizedSource);
          if (parentDir && parentDir !== normalizedRoot && parentDir !== '/' && parentDir.startsWith(normalizedRoot)) {
            await cleanupEmptyParents(parentDir, normalizedRoot, true);
          }
        }
      }
    } else {
      // 本地文件系统模式
      const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

      // 检查是否还有视频文件残留
      const hasVideo = entries.some(entry => {
        if (entry.isDirectory()) return false;
        const ext = path.extname(entry.name).toLowerCase();
        return VIDEO_EXTENSIONS.has(ext);
      });

      // 如果还有视频文件，不清理
      if (hasVideo) return;

      // 删除所有残留文件和子目录
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('@')) continue;
        const fullPath = path.join(sourceDir, entry.name);
        try {
          if (entry.isDirectory()) {
            await fs.promises.rm(fullPath, { recursive: true, force: true });
          } else {
            await fs.promises.unlink(fullPath);
          }
        } catch (e) {
          console.error(`清理残留文件失败: ${fullPath}`, e.message);
        }
      }

      // 再次检查目录是否已空，然后删除目录本身
      const remaining = await fs.promises.readdir(sourceDir);
      // 过滤掉隐藏文件（.开头），如 .DS_Store
      const visibleRemaining = remaining.filter(name => !name.startsWith('.'));
      if (visibleRemaining.length === 0) {
        const normalizedSource = path.resolve(sourceDir);
        const normalizedRoot = path.resolve(scanRoot);
        if (normalizedSource !== normalizedRoot) {
          // 也清理隐藏文件再删除目录
          for (const name of remaining) {
            try { await fs.promises.unlink(path.join(sourceDir, name)); } catch {}
          }
          await fs.promises.rmdir(sourceDir);

          // 尝试向上递归清理空的父目录
          const parentDir = path.dirname(normalizedSource);
          if (parentDir && parentDir !== normalizedRoot && parentDir.startsWith(normalizedRoot)) {
            await cleanupEmptyParents(parentDir, normalizedRoot, false);
          }
        }
      }
    }
  } catch (err) {
    console.error(`清理源目录失败: ${sourceDir}`, err.message);
  }
}

/**
 * 向上递归清理空的父目录
 */
async function cleanupEmptyParents(dirPath, scanRoot, isRemote) {
  try {
    if (isRemote) {
      const client = getWebDAVClient();
      if (!client) return;
      const list = await client.getDirectoryContents(dirPath);
      if (list.length === 0) {
        const normalized = dirPath.replace(/\/+$/, '');
        const normalizedRoot = scanRoot.replace(/\/+$/, '');
        if (normalized !== normalizedRoot && normalized !== '/') {
          await client.deleteFile(dirPath);
          const parentDir = path.posix.dirname(normalized);
          if (parentDir !== normalizedRoot && parentDir !== '/' && parentDir.startsWith(normalizedRoot)) {
            await cleanupEmptyParents(parentDir, normalizedRoot, true);
          }
        }
      }
    } else {
      const entries = await fs.promises.readdir(dirPath);
      const visibleEntries = entries.filter(name => !name.startsWith('.'));
      if (visibleEntries.length === 0) {
        const normalized = path.resolve(dirPath);
        const normalizedRoot = path.resolve(scanRoot);
        if (normalized !== normalizedRoot) {
          // 清理隐藏文件再删除
          for (const name of entries) {
            try { await fs.promises.unlink(path.join(dirPath, name)); } catch {}
          }
          await fs.promises.rmdir(dirPath);
          const parentDir = path.dirname(normalized);
          if (parentDir !== normalizedRoot && parentDir.startsWith(normalizedRoot)) {
            await cleanupEmptyParents(parentDir, normalizedRoot, false);
          }
        }
      }
    }
  } catch (err) {
    // 目录不为空或其他错误，停止递归
  }
}

let mainWindow;
const isDev = !app.isPackaged;

function writeStartupLog(message, err) {
  try {
    const logDir = app.getPath('userData');
    fs.mkdirSync(logDir, { recursive: true });
    const detail = err ? `\n${err.stack || err.message || String(err)}` : '';
    fs.appendFileSync(
      path.join(logDir, 'startup.log'),
      `[${new Date().toISOString()}] ${message}${detail}\n`,
      'utf-8'
    );
  } catch {}
}

process.on('uncaughtException', (err) => {
  writeStartupLog('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
  writeStartupLog('unhandledRejection', err);
});

// Scrape control flags
let scrapeControl = { paused: false, stopped: false };
let scanControl = { canceled: false };

function createWindow() {
  const windowIcon = isDev
    ? path.join(__dirname, '..', 'build', 'icon.png')
    : path.join(process.resourcesPath, 'icon.icns');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Jav Claw',
    icon: windowIcon,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    writeStartupLog(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
}

app.whenReady().then(() => {
  writeStartupLog(`app ready packaged=${app.isPackaged} resourcesPath=${process.resourcesPath}`);
  createWindow();
}).catch((err) => {
  writeStartupLog('app.whenReady failed', err);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ==================== IPC Handlers ====================

// Choose local folder via native dialog
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Scan local directory for video files
ipcMain.handle('scan:local', async (_, dirPath, excludeDirs) => {
  scanControl = { canceled: false };
  try {
    const files = await scanDirectory(dirPath, excludeDirs || [], {
      signal: scanControl,
      onProgress: (progress) => mainWindow.webContents.send('scan:progress', progress),
    });
    return { success: true, files };
  } catch (err) {
    if (err instanceof ScanCanceledError || err.canceled) {
      return { success: false, canceled: true, files: err.results || [], error: err.message };
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('scan:cancel', async () => {
  scanControl.canceled = true;
  return { success: true };
});

// Connect WebDAV
ipcMain.handle('webdav:connect', async (_, config) => {
  try {
    await connectWebDAV(config);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Disconnect WebDAV
ipcMain.handle('webdav:disconnect', async () => {
  try {
    await disconnectWebDAV();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Scan remote directory
ipcMain.handle('scan:remote', async (_, dirPath, excludeDirs) => {
  scanControl = { canceled: false };
  try {
    const files = await scanRemoteDirectory(dirPath, excludeDirs || [], {
      signal: scanControl,
      onProgress: (progress) => mainWindow.webContents.send('scan:progress', progress),
    });
    return { success: true, files };
  } catch (err) {
    if (err instanceof ScanCanceledError || err.canceled) {
      return { success: false, canceled: true, files: err.results || [], error: err.message };
    }
    return { success: false, error: err.message };
  }
});

// List directory (for file browser, both local & remote)
ipcMain.handle('fs:listDir', async (_, dirPath, isRemote) => {
  try {
    if (isRemote) {
      const client = getWebDAVClient();
      if (!client) throw new Error('WebDAV 未连接');
      const list = await client.getDirectoryContents(dirPath);
      return {
        success: true,
        items: list.map(item => ({
          name: item.basename,
          isDirectory: item.type === 'directory',
          size: item.size || 0,
          path: item.filename,
        })).filter(i => !i.name.startsWith('.')).sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
      };
    } else {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return {
        success: true,
        items: entries.filter(e => !e.name.startsWith('.')).map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          size: 0,
          path: path.join(dirPath, e.name),
        })).sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
      };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Parse AVID from filename
ipcMain.handle('avid:parse', async (_, filename) => {
  return parseAvid(filename);
});

// Scrape metadata
ipcMain.handle('scrape:movie', async (event, avid, options) => {
  try {
    const result = await scrapeMovie(avid, options, (progress) => {
      mainWindow.webContents.send('scrape:progress', { avid, ...progress });
    });
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Batch scrape with auto-organize
ipcMain.handle('scrape:batch', async (event, files, options) => {
  scrapeControl = { paused: false, stopped: false };
  const results = [];
  const outputDir = options.outputDir || null; // 整理完成目录
  const isRemote = options.isRemote || false;
  const scanRoot = options.scanRoot || ''; // 扫描根目录，用于限制清理范围

  // Auto-create output directory if needed
  if (outputDir) {
    try {
      if (isRemote) {
        const client = getWebDAVClient();
        if (client) {
          try { await client.createDirectory(outputDir); } catch {}
        }
      } else {
        await fs.promises.mkdir(outputDir, { recursive: true });
      }
    } catch {}
  }

  for (let i = 0; i < files.length; i++) {
    if (scrapeControl.stopped) break;
    while (scrapeControl.paused && !scrapeControl.stopped) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (scrapeControl.stopped) break;

    const file = files[i];
    mainWindow.webContents.send('scrape:batchProgress', {
      current: i + 1,
      total: files.length,
      file: file.name,
    });
    try {
      const result = await scrapeMovie(file.avid, options, (progress) => {
        mainWindow.webContents.send('scrape:progress', { avid: file.avid, ...progress });
      });

      mainWindow.webContents.send('scrape:itemResult', {
        avid: file.avid,
        file,
        success: true,
        data: result,
        saved: false,
      });

      // Auto-save NFO + cover and move video if outputDir is set
      let saved = false;
      if (outputDir) {
        try {
          mainWindow.webContents.send('scrape:progress', { avid: file.avid, step: '正在保存 NFO 和封面...', progress: 90 });

          // 根据整理模式构建目标子目录
          const organizeMode = options.organizeMode || 'avid';
          const videoBaseName = sanitizePathSegment(path.basename(file.name, path.extname(file.name)));
          let movieSubDir;

          if (organizeMode === 'actress' && result.actress && result.actress.length > 0) {
            // 按女优分类: 整理完成/女优名/番号/
            const actressName = sanitizePathSegment(result.actress[0]); // 取第一个女优
            movieSubDir = isRemote
              ? path.posix.join(outputDir, actressName, videoBaseName)
              : path.join(outputDir, actressName, videoBaseName);
          } else {
            // 按番号整理（默认）: 整理完成/番号/
            movieSubDir = isRemote
              ? path.posix.join(outputDir, videoBaseName)
              : path.join(outputDir, videoBaseName);
          }

          const savedFiles = await generateNFO(file, result, outputDir, isRemote, organizeMode, {
            createNFO: options.createNFO !== false,
            downloadCover: options.downloadCover !== false,
            downloadFanart: options.downloadFanart !== false,
          });
          if (!isRemote && savedFiles.posterPath) {
            result.coverLocalPath = savedFiles.posterPath;
          }

          const destVideoPath = isRemote
            ? path.posix.join(movieSubDir, file.name)
            : path.join(movieSubDir, file.name);

          if (isRemote) {
            const client = getWebDAVClient();
            if (client) {
              mainWindow.webContents.send('scrape:progress', { avid: file.avid, step: '正在移动视频文件...', progress: 95 });
              // 确保目标目录存在
              try { await client.createDirectory(movieSubDir, { recursive: true }); } catch {}
              await client.moveFile(file.path, destVideoPath);
            }
          } else {
            mainWindow.webContents.send('scrape:progress', { avid: file.avid, step: '正在移动视频文件...', progress: 95 });
            await fs.promises.mkdir(movieSubDir, { recursive: true });
            await moveLocalFile(file.path, destVideoPath);
          }

          // 清理源文件夹残留文件和空目录
          if (scanRoot && file.dir) {
            mainWindow.webContents.send('scrape:progress', { avid: file.avid, step: '正在清理源文件夹...', progress: 97 });
            await cleanupSourceDir(file.dir, scanRoot, isRemote);
          }

          saved = true;
        } catch (saveErr) {
          console.error(`Auto-save/move failed for ${file.avid}:`, saveErr.message);
        }
      }

      results.push({ file, success: true, data: result, saved });
      mainWindow.webContents.send('scrape:itemResult', {
        avid: file.avid,
        file,
        success: true,
        data: result,
        saved,
      });
    } catch (err) {
      results.push({ file, success: false, error: err.message });
      mainWindow.webContents.send('scrape:itemResult', {
        avid: file.avid,
        file,
        success: false,
        error: err.message,
      });
    }
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  return results;
});

// Scrape control
ipcMain.handle('scrape:pause', async () => { scrapeControl.paused = true; return { success: true }; });
ipcMain.handle('scrape:resume', async () => { scrapeControl.paused = false; return { success: true }; });
ipcMain.handle('scrape:stop', async () => { scrapeControl.stopped = true; scrapeControl.paused = false; return { success: true }; });

// Save NFO + images
ipcMain.handle('scrape:save', async (_, fileInfo, movieData, outputDir, isRemote) => {
  try {
    const savedFiles = await generateNFO(fileInfo, movieData, outputDir, isRemote);
    return { success: true, savedFiles };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('image:fetchDataUrl', async (_, imageUrl) => {
  try {
    if (!imageUrl) throw new Error('图片地址为空');
    if (path.isAbsolute(imageUrl)) {
      const imageData = await fs.promises.readFile(imageUrl);
      const ext = path.extname(imageUrl).toLowerCase();
      const contentType = ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
      return { success: true, dataUrl: `data:${contentType};base64,${imageData.toString('base64')}` };
    }

    const normalizedUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
    const parsed = new URL(normalizedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('不支持的图片协议');
    }

    const response = await axios.get(normalizedUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5,
      headers: buildImageHeaders(normalizedUrl),
    });
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const base64 = Buffer.from(response.data).toString('base64');
    return { success: true, dataUrl: `data:${contentType};base64,${base64}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Load settings
ipcMain.handle('settings:load', async () => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    const data = await fs.promises.readFile(settingsPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      proxy: '',
      scraperPriority: ['fc2official', 'fc2av123', 'jav321', 'javdb', 'javbus', 'missav'],
      organizeMode: 'avid', // 'avid' 按番号, 'actress' 按女优分类
      outputPattern: '{actress}/{avid}',
      downloadCover: true,
      downloadFanart: true,
      createNFO: true,
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
    };
  }
});

// Save settings
ipcMain.handle('settings:save', async (_, settings) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  return { success: true };
});
