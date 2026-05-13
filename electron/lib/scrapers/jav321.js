/**
 * Jav321 刮削器
 * 使用 POST 搜索，无需日本 IP，无需任何 cookie
 * 数据来源: DMM (FANZA)
 */
const BaseScraper = require('./base');

class Jav321Scraper extends BaseScraper {
  constructor() {
    super('jav321', 'https://www.jav321.com');
  }

  async scrape(avid, options = {}) {
    try {
      // Step 1: POST search — auto-redirects to detail page
      const response = await this.fetch('https://www.jav321.com/search', {
        ...options,
        method: 'POST',
        data: `sn=${encodeURIComponent(avid)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);

      const info = {};
      info.source = 'jav321';

      // Title from h3
      const rawTitle = $('h3').first().text().trim();
      if (!rawTitle || rawTitle.includes('検索') || rawTitle.includes('search')) {
        return null; // Not found
      }
      info.title = rawTitle;
      info.url = response.request?.res?.responseUrl || 'https://www.jav321.com';

      // Parse info fields from <b> tags
      // Structure: <b>Label</b>: value or <b>Label</b> <a>value</a>
      const infoContainer = $('div.col-md-9').first();
      
      // Get all text content after each <b> tag
      infoContainer.find('b').each((_, el) => {
        const label = $(el).text().trim();
        
        if (label.includes('品番')) {
          // Product number - get text after the <b> tag
          const nextText = $(el)[0].nextSibling;
          if (nextText && nextText.nodeType === 3) {
            info.dvdid = nextText.data.replace(/[:：\s]/g, '').trim();
          }
        } else if (label.includes('配信開始日') || label.includes('発売日')) {
          const nextText = $(el)[0].nextSibling;
          if (nextText && nextText.nodeType === 3) {
            const dateStr = nextText.data.replace(/[:：\s]/g, '').trim();
            // Convert to YYYY-MM-DD format
            info.publish_date = dateStr;
          }
        } else if (label.includes('収録時間')) {
          const nextText = $(el)[0].nextSibling;
          if (nextText && nextText.nodeType === 3) {
            info.duration = nextText.data.replace(/[^0-9]/g, '');
          }
        }
      });

      // Actress — links with /star/
      info.actress = [];
      info.actress_pics = {};
      const actressSet = new Set();
      $('a[href*="/star/"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name && !actressSet.has(name)) {
          actressSet.add(name);
          info.actress.push(name);
        }
      });

      // Producer — links with /company/
      $('a[href*="/company/"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name && !info.producer) {
          info.producer = name;
        }
      });

      // Label — links with /label/
      $('a[href*="/label/"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name && !info.publisher) {
          info.publisher = name;
        }
      });

      // Genres — links with /genre/
      info.genre = [];
      $('a[href*="/genre/"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name) info.genre.push(name);
      });

      // Cover image — the poster image (ps.jpg)
      const firstImg = $('img[src*="pics.dmm.co.jp"]').first().attr('src');
      if (firstImg) {
        info.cover = firstImg;
      }

      // Fanart — the large image (pl.jpg)
      $('img[src*="pl.jpg"]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          info.fanart = src;
        }
      });

      // Preview images — images matching ssniXXXXXjp-N.jpg pattern
      info.preview_pics = [];
      $('img[src*="jp-"]').each((_, el) => {
        const src = $(el).attr('src');
        if (src && src.includes('pics.dmm.co.jp')) {
          info.preview_pics.push(src);
        }
      });

      // Set dvdid if not found
      if (!info.dvdid) {
        info.dvdid = avid;
      }

      return info;
    } catch (err) {
      throw new Error(`Jav321 scrape failed: ${err.message}`);
    }
  }
}

module.exports = Jav321Scraper;
