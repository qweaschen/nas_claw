/**
 * 123AV FC2 备用刮削器
 * 用于 FC2 官方页已下架但第三方站仍有元数据的旧番号。
 */
const BaseScraper = require('./base');

class FC2Av123Scraper extends BaseScraper {
  constructor() {
    super('fc2av123', 'https://123av.com');
  }

  getFC2Id(avid) {
    const match = String(avid || '').match(/FC2(?:[-_\s]?PPV)?[-_\s]?(\d{4,10})/i);
    return match ? match[1] : null;
  }

  escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getDetailValue($, label) {
    let value = '';
    $('span').each((_, el) => {
      if (value) return;
      if ($(el).text().trim().toLowerCase() !== `${label.toLowerCase()}:`) return;
      value = $(el).next('span').text().trim().replace(/\s+/g, ' ');
    });
    return value;
  }

  async scrape(avid, options = {}) {
    const fc2Id = this.getFC2Id(avid);
    if (!fc2Id) return null;

    const dvdid = `FC2-PPV-${fc2Id}`;
    const url = `${this.baseUrl}/en/v/fc2-ppv-${fc2Id}`;
    const $ = await this.fetchHTML(url, {
      ...options,
      headers: {
        'Accept-Language': 'en,ja;q=0.8,zh-CN;q=0.7',
        'Referer': `${this.baseUrl}/`,
      },
    });

    const h1 = $('h1').first().text().trim();
    const pageTitle = $('title').first().text().trim();
    if (!h1.toUpperCase().includes(dvdid) && !pageTitle.toUpperCase().includes(dvdid)) {
      return null;
    }

    const avidPattern = this.escapeRegExp(dvdid);
    const title = (h1 || pageTitle)
      .replace(new RegExp(`^${avidPattern}\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*-\\s*${avidPattern}.*$`, 'i'), '')
      .replace(/\s+/g, ' ')
      .trim();

    const genreText = this.getDetailValue($, 'Genres');
    const tagText = this.getDetailValue($, 'Tags');
    const genre = [...genreText.split(','), ...tagText.split(',')]
      .map(item => item.trim())
      .filter(Boolean);

    return {
      source: 'fc2av123',
      url,
      dvdid,
      title: title || dvdid,
      cover: $('meta[property="og:image"]').attr('content') || '',
      plot: $('meta[name="description"]').attr('content') || '',
      publish_date: this.getDetailValue($, 'Release date'),
      duration: this.getDetailValue($, 'Runtime').replace(/^0?(\d+):(\d+):(\d+)$/, (_, h, m, s) => {
        const minutes = Number(h) * 60 + Number(m) + (Number(s) > 0 ? 1 : 0);
        return String(minutes);
      }),
      producer: this.getDetailValue($, 'Maker'),
      publisher: this.getDetailValue($, 'Maker'),
      genre: [...new Set(genre)],
      actress: [],
      actress_pics: {},
      preview_pics: [],
    };
  }
}

module.exports = FC2Av123Scraper;
