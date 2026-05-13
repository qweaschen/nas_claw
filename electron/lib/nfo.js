/**
 * NFO 文件生成器 - 兼容 Emby / Jellyfin / Kodi
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getWebDAVClient } = require('./webdav');

function sanitizePathSegment(segment) {
  return String(segment || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim() || 'Unknown';
}

/**
 * 生成 NFO XML 内容
 */
function buildNFOContent(movieData) {
  const escapeXml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let nfo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  nfo += `<movie>\n`;
  nfo += `  <title>${escapeXml(movieData.title)}</title>\n`;
  nfo += `  <originaltitle>${escapeXml(movieData.title)}</originaltitle>\n`;
  nfo += `  <sorttitle>${escapeXml(movieData.dvdid)}</sorttitle>\n`;
  nfo += `  <customrating>JP-18+</customrating>\n`;

  if (movieData.score) {
    nfo += `  <rating>${escapeXml(movieData.score)}</rating>\n`;
  }

  nfo += `  <year>${movieData.publish_date ? movieData.publish_date.substring(0, 4) : ''}</year>\n`;
  nfo += `  <premiered>${escapeXml(movieData.publish_date)}</premiered>\n`;
  nfo += `  <releasedate>${escapeXml(movieData.publish_date)}</releasedate>\n`;
  nfo += `  <runtime>${escapeXml(movieData.duration)}</runtime>\n`;

  if (movieData.plot) {
    nfo += `  <plot>${escapeXml(movieData.plot)}</plot>\n`;
    nfo += `  <outline>${escapeXml(movieData.plot)}</outline>\n`;
  }

  nfo += `  <director>${escapeXml(movieData.director)}</director>\n`;
  nfo += `  <studio>${escapeXml(movieData.producer)}</studio>\n`;
  nfo += `  <label>${escapeXml(movieData.publisher)}</label>\n`;
  nfo += `  <set>${escapeXml(movieData.serial)}</set>\n`;
  nfo += `  <num>${escapeXml(movieData.dvdid)}</num>\n`;

  // Genres / Tags
  if (movieData.genre && movieData.genre.length > 0) {
    for (const g of movieData.genre) {
      nfo += `  <genre>${escapeXml(g)}</genre>\n`;
      nfo += `  <tag>${escapeXml(g)}</tag>\n`;
    }
  }

  // Actors
  if (movieData.actress && movieData.actress.length > 0) {
    for (const name of movieData.actress) {
      nfo += `  <actor>\n`;
      nfo += `    <name>${escapeXml(name)}</name>\n`;
      nfo += `    <type>Actor</type>\n`;
      nfo += `  </actor>\n`;
    }
  }

  // Poster and Fanart
  nfo += `  <poster>poster.jpg</poster>\n`;
  nfo += `  <thumb>poster.jpg</thumb>\n`;
  nfo += `  <fanart>fanart.jpg</fanart>\n`;

  nfo += `</movie>\n`;

  return nfo;
}

/**
 * 下载图片
 */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `${new URL(url).origin}/`,
      },
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.error(`Failed to download image: ${url}`, err.message);
    return null;
  }
}

/**
 * 保存 NFO + 封面到指定目录
 * @param {object} fileInfo 文件信息
 * @param {object} movieData 影片元数据
 * @param {string} outputDir 输出根目录
 * @param {boolean} isRemote 是否远程
 * @param {string} organizeMode 整理模式 'avid' 或 'actress'
 * @param {object} saveOptions 保存选项
 */
async function generateNFO(fileInfo, movieData, outputDir, isRemote = false, organizeMode = 'avid', saveOptions = {}) {
  const {
    createNFO = true,
    downloadCover = true,
    downloadFanart = true,
  } = saveOptions;

  // 根据整理模式构建输出目录
  const videoBaseName = sanitizePathSegment(path.basename(fileInfo.name, path.extname(fileInfo.name)));
  const targetDir = outputDir || fileInfo.dir;
  const savedFiles = {
    movieDir: '',
    posterPath: '',
    fanartPath: '',
  };

  let movieDir;
  if (organizeMode === 'actress' && movieData.actress && movieData.actress.length > 0) {
    // 按女优分类: outputDir/女优名/番号/
    const actressName = sanitizePathSegment(movieData.actress[0]);
    movieDir = isRemote
      ? path.posix.join(targetDir, actressName, videoBaseName)
      : path.join(targetDir, actressName, videoBaseName);
  } else {
    // 按番号整理（默认）: outputDir/番号/
    movieDir = isRemote
      ? path.posix.join(targetDir, videoBaseName)
      : path.join(targetDir, videoBaseName);
  }

  if (isRemote) {
    const client = getWebDAVClient();
    if (!client) throw new Error('WebDAV 未连接');

    // 创建目录（支持多级）
    try { await client.createDirectory(movieDir, { recursive: true }); } catch {}
    savedFiles.movieDir = movieDir;

    // 写入 NFO
    if (createNFO) {
      await client.putFileContents(
        path.posix.join(movieDir, `${videoBaseName}.nfo`),
        buildNFOContent(movieData),
        { format: 'text' }
      );
    }

    // 下载并上传封面
    if (movieData.cover && (downloadCover || downloadFanart)) {
      const coverData = await downloadImage(movieData.cover);
      if (coverData) {
        if (downloadCover) {
          savedFiles.posterPath = path.posix.join(movieDir, 'poster.jpg');
          await client.putFileContents(savedFiles.posterPath, coverData, { format: 'binary' });
        }
        if (downloadFanart) {
          savedFiles.fanartPath = path.posix.join(movieDir, 'fanart.jpg');
          await client.putFileContents(savedFiles.fanartPath, coverData, { format: 'binary' });
        }
      }
    }
  } else {
    // 本地文件系统
    await fs.promises.mkdir(movieDir, { recursive: true });
    savedFiles.movieDir = movieDir;

    // 写入 NFO
    if (createNFO) {
      await fs.promises.writeFile(
        path.join(movieDir, `${videoBaseName}.nfo`),
        buildNFOContent(movieData),
        'utf-8'
      );
    }

    // 下载封面
    if (movieData.cover && (downloadCover || downloadFanart)) {
      const coverData = await downloadImage(movieData.cover);
      if (coverData) {
        if (downloadCover) {
          savedFiles.posterPath = path.join(movieDir, 'poster.jpg');
          await fs.promises.writeFile(savedFiles.posterPath, coverData);
        }
        if (downloadFanart) {
          savedFiles.fanartPath = path.join(movieDir, 'fanart.jpg');
          await fs.promises.writeFile(savedFiles.fanartPath, coverData);
        }
      }
    }
  }

  return savedFiles;
}

module.exports = { generateNFO, buildNFOContent };
