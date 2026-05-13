/**
 * 刮削引擎 - 协调多个刮削器，汇总数据
 */
const JavBusScraper = require('./scrapers/javbus');
const JavDBScraper = require('./scrapers/javdb');
const Jav321Scraper = require('./scrapers/jav321');
const MissAVScraper = require('./scrapers/missav');
const FC2OfficialScraper = require('./scrapers/fc2official');
const FC2Av123Scraper = require('./scrapers/fc2av123');

const SCRAPERS = {
  fc2official: new FC2OfficialScraper(),
  fc2av123: new FC2Av123Scraper(),
  jav321: new Jav321Scraper(),
  javbus: new JavBusScraper(),
  javdb: new JavDBScraper(),
  missav: new MissAVScraper(),
};

const DEFAULT_PRIORITY = ['fc2official', 'fc2av123', 'jav321', 'javdb', 'javbus', 'missav'];

function normalizePriorityForAvid(avid, priority) {
  const normalized = [...new Set(priority || DEFAULT_PRIORITY)];
  if (/^FC2(?:[-_\s]?PPV)?[-_\s]?\d+/i.test(String(avid || ''))) {
    return ['fc2official', 'fc2av123', ...normalized.filter(name => !['fc2official', 'fc2av123'].includes(name))];
  }
  return normalized;
}

/**
 * 合并多个来源的元数据，优先使用前面来源的数据
 */
function mergeResults(results) {
  const merged = {
    title: '',
    dvdid: '',
    cover: '',
    publish_date: '',
    duration: '',
    director: '',
    producer: '',
    publisher: '',
    serial: '',
    score: '',
    plot: '',
    genre: [],
    actress: [],
    actress_pics: {},
    preview_pics: [],
    url: '',
    sources: [],
  };

  for (const result of results) {
    if (!result) continue;

    merged.sources.push(result.source);

    // 简单字段: 取第一个有值的
    for (const key of ['title', 'dvdid', 'cover', 'publish_date', 'duration', 'director', 'producer', 'publisher', 'serial', 'score', 'plot', 'url']) {
      if (!merged[key] && result[key]) {
        merged[key] = result[key];
      }
    }

    // 数组字段: 合并去重
    if (result.genre && result.genre.length > 0 && merged.genre.length === 0) {
      merged.genre = [...new Set([...merged.genre, ...result.genre])];
    }

    if (result.actress && result.actress.length > 0 && merged.actress.length === 0) {
      merged.actress = [...new Set([...merged.actress, ...result.actress])];
    }

    // Preview pics 合并
    if (result.preview_pics && result.preview_pics.length > 0) {
      const existingSet = new Set(merged.preview_pics);
      for (const pic of result.preview_pics) {
        if (!existingSet.has(pic)) {
          merged.preview_pics.push(pic);
        }
      }
    }

    // Actress pics
    if (result.actress_pics) {
      Object.assign(merged.actress_pics, result.actress_pics);
    }
  }

  return merged;
}

/**
 * 刮削单个影片
 * @param {string} avid 番号
 * @param {object} options 选项 { proxy, priority, ... }
 * @param {function} onProgress 进度回调
 */
async function scrapeMovie(avid, options = {}, onProgress = () => {}) {
  const priority = normalizePriorityForAvid(avid, options.priority || DEFAULT_PRIORITY);
  const results = [];
  const errors = [];

  for (let i = 0; i < priority.length; i++) {
    const scraperName = priority[i];
    const scraper = SCRAPERS[scraperName];
    if (!scraper) continue;

    onProgress({
      step: `正在从 ${scraperName} 获取数据...`,
      progress: Math.round(((i) / priority.length) * 100),
    });

    try {
      const result = await scraper.scrape(avid, {
        proxy: options.proxy,
      });
      if (result) {
        results.push(result);
        onProgress({
          step: `${scraperName} 获取成功`,
          progress: Math.round(((i + 1) / priority.length) * 100),
        });
      } else {
        onProgress({
          step: `${scraperName} 未找到数据`,
          progress: Math.round(((i + 1) / priority.length) * 100),
        });
      }
    } catch (err) {
      errors.push({ scraper: scraperName, error: err.message });
      onProgress({
        step: `${scraperName} 获取失败: ${err.message}`,
        progress: Math.round(((i + 1) / priority.length) * 100),
      });
    }

    // Small delay between requests
    if (i < priority.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  if (results.length === 0) {
    throw new Error(`所有刮削器均未能获取到 ${avid} 的数据。${errors.map(e => `${e.scraper}: ${e.error}`).join('; ')}`);
  }

  const merged = mergeResults(results);
  merged.dvdid = merged.dvdid || avid;

  onProgress({ step: '数据合并完成', progress: 100 });

  return merged;
}

module.exports = { scrapeMovie, mergeResults };
