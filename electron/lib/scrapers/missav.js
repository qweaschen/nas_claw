/**
 * MissAV 刮削器
 * 可获取中文标题和详细剧情简介
 * 使用 missav.ws 域名
 */
const BaseScraper = require('./base');

class MissAVScraper extends BaseScraper {
  constructor() {
    super('missav', 'https://missav.ws');
  }

  async scrape(avid, options = {}) {
    try {
      // MissAV 的 URL 格式：直接使用番号
      const url = `${this.baseUrl}/dm1/cn/${avid}`;

      const $ = await this.fetchHTML(url, {
        ...options,
        headers: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': this.baseUrl + '/',
        },
      });

      const info = {};
      info.source = 'missav';
      info.url = url;

      // 标题 - 从 h1 标签获取
      const rawTitle = $('h1').first().text().trim();
      if (!rawTitle || rawTitle.includes('404') || rawTitle.includes('Page Not Found')) {
        return null;
      }
      info.title = rawTitle;

      // 封面图片 - 从 video poster 或 og:image 获取
      const ogImage = $('meta[property="og:image"]').attr('content');
      const videoPoster = $('video').attr('poster') || $('video').attr('data-poster');
      info.cover = ogImage || videoPoster || '';

      // 信息面板 - MissAV 使用 div 结构展示影片信息
      // 获取发行日期
      $('div.space-y-2 div, .detail-item, .text-secondary').each((_, el) => {
        const text = $(el).text().trim();

        if (text.includes('發行日期') || text.includes('发行日期') || text.includes('Release date')) {
          const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) info.publish_date = dateMatch[1];
        }
        if (text.includes('番號') || text.includes('番号') || text.includes('Code')) {
          const parts = text.split(/[:：]/);
          if (parts.length > 1) info.dvdid = parts[1].trim();
        }
      });

      // 类别标签
      info.genre = [];
      $('a[href*="/genres/"], a[href*="/dm1/cn/genres/"]').each((_, el) => {
        const g = $(el).text().trim();
        if (g && !info.genre.includes(g)) info.genre.push(g);
      });

      // 演员
      info.actress = [];
      $('a[href*="/actresses/"], a[href*="/dm1/cn/actresses/"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name && !info.actress.includes(name)) info.actress.push(name);
      });

      // 制作商
      $('a[href*="/makers/"], a[href*="/dm1/cn/makers/"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name && !info.producer) info.producer = name;
      });

      // 剧情简介（MissAV 特有的优势）
      const description = $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content');
      if (description) {
        info.plot = description;
      }

      // 设置 dvdid
      if (!info.dvdid) {
        info.dvdid = avid;
      }

      info.preview_pics = [];
      info.actress_pics = {};

      return info;
    } catch (err) {
      // MissAV 可能因各种原因不可用，返回空即可
      if (err.response && (err.response.status === 403 || err.response.status === 404)) {
        return null;
      }
      throw new Error(`MissAV scrape failed: ${err.message}`);
    }
  }
}

module.exports = MissAVScraper;
