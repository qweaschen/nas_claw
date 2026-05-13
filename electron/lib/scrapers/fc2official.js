/**
 * FC2 官方商品页刮削器
 * FC2-PPV 番号可通过数字 ID 访问: /article/{id}/
 */
const BaseScraper = require('./base');

class FC2OfficialScraper extends BaseScraper {
  constructor() {
    super('fc2official', 'https://adult.contents.fc2.com');
  }

  getFC2Id(avid) {
    const match = String(avid || '').match(/FC2(?:[-_\s]?PPV)?[-_\s]?(\d{4,10})/i);
    return match ? match[1] : null;
  }

  normalizeImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
  }

  async scrape(avid, options = {}) {
    const fc2Id = this.getFC2Id(avid);
    if (!fc2Id) return null;

    const url = `${this.baseUrl}/article/${fc2Id}/`;
    const $ = await this.fetchHTML(url, {
      ...options,
      headers: {
        'Accept-Language': 'ja,en;q=0.8,zh-CN;q=0.7',
        'Cookie': 'adc=1',
        'Referer': `${this.baseUrl}/`,
      },
    });

    const pageTitle = $('title').first().text().trim();
    if (!pageTitle || pageTitle.includes('見つかりません') || pageTitle.includes('not found')) {
      return null;
    }

    let jsonLd = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (jsonLd) return;
      try {
        const parsed = JSON.parse($(el).text());
        if (parsed && parsed['@type'] === 'Product') jsonLd = parsed;
      } catch {}
    });

    const info = {
      source: 'fc2official',
      url,
      dvdid: `FC2-PPV-${fc2Id}`,
      title: jsonLd?.name || pageTitle.replace(/\s*\|\s*FC2.*$/i, '').trim(),
      plot: jsonLd?.description || $('meta[name="description"]').attr('content') || '',
      cover: this.normalizeImageUrl(jsonLd?.image?.url || $('meta[property="og:image"]').attr('content')),
      score: jsonLd?.aggregateRating?.ratingValue ? String(jsonLd.aggregateRating.ratingValue) : '',
      producer: jsonLd?.brand?.name || jsonLd?.offers?.seller?.name || '',
      publisher: jsonLd?.brand?.name || jsonLd?.offers?.seller?.name || '',
      genre: [],
      actress: [],
      actress_pics: {},
      preview_pics: [],
    };

    const headerText = $('.items_article_headerInfo, .items_article_headerTitle').first().text();
    const dateMatch = headerText.match(/販売日\s*[:：]\s*(\d{4}\/\d{2}\/\d{2})/);
    if (dateMatch) info.publish_date = dateMatch[1].replace(/\//g, '-');

    $('.items_article_TagArea a, .items_article_TagArea .tagTag, a[href*="/tags/"]').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag && !info.genre.includes(tag) && !tag.includes('商品タグ')) {
        info.genre.push(tag);
      }
    });

    $('.items_article_SampleImagesArea img, .items_article_SampleImages img').each((_, el) => {
      const src = this.normalizeImageUrl($(el).attr('src') || $(el).attr('data-src'));
      if (src && !info.preview_pics.includes(src)) {
        info.preview_pics.push(src);
      }
    });

    if (!info.cover) {
      info.cover = this.normalizeImageUrl($('.items_article_MainitemThumb img').first().attr('src'));
    }

    return info.title ? info : null;
  }
}

module.exports = FC2OfficialScraper;
