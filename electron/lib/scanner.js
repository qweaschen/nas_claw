/**
 * 文件扫描器 - 扫描本地或远程目录中的视频文件
 */
const fs = require('fs');
const path = require('path');
const { parseAvid } = require('./avid');
const { getWebDAVClient } = require('./webdav');

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.wmv', '.flv', '.mov',
  '.rmvb', '.rm', '.ts', '.m4v', '.webm', '.iso',
  '.m2ts', '.divx', '.mpg', '.mpeg',
]);

const MIN_FILE_SIZE = 100 * 1024 * 1024; // 100MB minimum

class ScanCanceledError extends Error {
  constructor(results = []) {
    super('扫描已取消');
    this.name = 'ScanCanceledError';
    this.canceled = true;
    this.results = results;
  }
}

function throwIfCanceled(signal, results) {
  if (signal?.canceled) {
    throw new ScanCanceledError(results);
  }
}

function createProgressReporter(onProgress, mode) {
  const state = {
    mode,
    directories: 0,
    files: 0,
    videos: 0,
    currentPath: '',
  };
  let lastEmit = 0;

  const emit = (force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmit < 120) return;
    lastEmit = now;
    onProgress({ ...state });
  };

  return {
    state,
    visitDirectory(dir) {
      state.directories += 1;
      state.currentPath = dir;
      emit();
    },
    visitFile(filePath) {
      state.files += 1;
      state.currentPath = filePath;
      emit();
    },
    hitVideo() {
      state.videos += 1;
      emit(true);
    },
    finish() {
      emit(true);
    },
  };
}

/**
 * 扫描本地目录
 * @param {string} dirPath 扫描根目录
 * @param {string[]} excludeDirs 需要排除的目录路径列表（绝对路径）
 */
async function scanDirectory(dirPath, excludeDirs = [], options = {}) {
  // 规范化排除目录路径，方便比较
  const normalizedExcludes = excludeDirs.map(d => path.resolve(d));
  const results = [];
  const signal = options.signal;
  const progress = createProgressReporter(options.onProgress, 'local');

  async function walk(dir) {
    throwIfCanceled(signal, results);
    progress.visitDirectory(dir);
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      throwIfCanceled(signal, results);
      if (entry.name.startsWith('.') || entry.name.startsWith('@')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过被排除的目录
        const normalizedFull = path.resolve(fullPath);
        if (normalizedExcludes.some(ex => normalizedFull === ex || normalizedFull.startsWith(ex + path.sep))) {
          continue;
        }
        await walk(fullPath);
      } else {
        progress.visitFile(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          const stat = await fs.promises.stat(fullPath);
          if (stat.size >= MIN_FILE_SIZE) {
            const avidInfo = parseAvid(entry.name);
            results.push({
              name: entry.name,
              path: fullPath,
              dir: dir,
              size: stat.size,
              ext,
              avid: avidInfo ? avidInfo.avid : null,
              avidType: avidInfo ? avidInfo.type : null,
            });
            progress.hitVideo();
          }
        }
      }
    }
  }

  await walk(dirPath);
  progress.finish();
  return results;
}

/**
 * 扫描远程目录 (via WebDAV)
 * @param {string} dirPath 扫描根目录
 * @param {string[]} excludeDirs 需要排除的目录路径列表
 */
async function scanRemoteDirectory(dirPath, excludeDirs = [], options = {}) {
  const client = getWebDAVClient();
  if (!client) throw new Error('WebDAV 未连接');

  // 规范化排除路径（去掉末尾斜杠）
  const normalizedExcludes = excludeDirs.map(d => d.replace(/\/+$/, ''));
  const results = [];
  const signal = options.signal;
  const progress = createProgressReporter(options.onProgress, 'remote');

  async function walk(dir) {
    throwIfCanceled(signal, results);
    progress.visitDirectory(dir);
    const list = await client.getDirectoryContents(dir);
    for (const item of list) {
      throwIfCanceled(signal, results);
      const name = item.basename;
      if (name.startsWith('.') || name.startsWith('@')) continue;
      const fullPath = item.filename;
      if (item.type === 'directory') {
        // 跳过被排除的目录
        const normalizedFull = fullPath.replace(/\/+$/, '');
        if (normalizedExcludes.some(ex => normalizedFull === ex || normalizedFull.startsWith(ex + '/'))) {
          continue;
        }
        await walk(fullPath);
      } else {
        progress.visitFile(fullPath);
        const ext = path.extname(name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext) && item.size >= MIN_FILE_SIZE) {
          const avidInfo = parseAvid(name);
          results.push({
            name: name,
            path: fullPath,
            dir: path.dirname(fullPath),
            size: item.size,
            ext,
            avid: avidInfo ? avidInfo.avid : null,
            avidType: avidInfo ? avidInfo.type : null,
          });
          progress.hitVideo();
        }
      }
    }
  }

  await walk(dirPath);
  progress.finish();
  return results;
}

module.exports = { scanDirectory, scanRemoteDirectory, ScanCanceledError };
