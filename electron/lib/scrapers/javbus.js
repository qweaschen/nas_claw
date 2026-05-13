/**
 * JavBus 刮削器
 * 添加 Cookie 绕过年龄验证
 */
const BaseScraper = require('./base');

const MIRRORS = [
  'https://www.javbus.com',
  'https://www.javbus.red',
];

class JavBusScraper extends BaseScraper {
  constructor() {
    super('javbus', MIRRORS[0]);
    this.mirrors = MIRRORS;
    this.currentMirrorIndex = 0;
  }

  getBaseUrl() {
    return this.mirrors[this.currentMirrorIndex];
  }

  nextMirror() {
    this.currentMirrorIndex = (this.currentMirrorIndex + 1) % this.mirrors.length;
  }

  async scrape(avid, options = {}) {
    let lastError = null;
    const maxRetries = this.mirrors.length;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}/${avid}`;

        // 添加年龄验证 Cookie 和 Referer, 绕过年龄验证页面
        const $ = await this.fetchHTML(url, {
          ...options,
          headers: {
            'Cookie': 'existmag=all; age=verified',
            'Referer': baseUrl + '/',
            'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7',
          },
        });

        // 检查是否被年龄验证页面拦截
        const bodyText = $.html();
        if (bodyText.includes('driver-verify') || bodyText.includes('你是否已經成年')) {
          throw new Error('被年龄验证拦截，尝试下一个镜像');
        }

        // 检查页面是否存在
        const title = $('h3').first().text().trim();
        if (!title || title.includes('404') || title.includes('找不到')) {
          return null;
        }

        const info = {};
        info.source = 'javbus';
        info.title = title;
        info.url = url;

        // 封面图片
        const bigCover = $('a.bigImage img').attr('src');
        if (bigCover) {
          info.cover = bigCover.startsWith('http') ? bigCover : `${baseUrl}${bigCover}`;
        }

        // 信息面板
        const infoBlock = $('div.col-md-3.info');
        infoBlock.find('p').each((_, el) => {
          const header = $(el).find('span.header').text().trim();
          const value = $(el).find('span').not('.header').text().trim() ||
            $(el).contents().filter(function() { return this.nodeType === 3; }).text().trim();

          if (header.includes('識別碼') || header.includes('番号')) {
            info.dvdid = value || $(el).find('span').last().text().trim();
          } else if (header.includes('發行日期') || header.includes('发行日期')) {
            info.publish_date = value;
          } else if (header.includes('長度') || header.includes('时长')) {
            info.duration = value.replace(/[^0-9]/g, '');
          } else if (header.includes('導演') || header.includes('导演')) {
            info.director = $(el).find('a').text().trim() || value;
          } else if (header.includes('製作商') || header.includes('制作商')) {
            info.producer = $(el).find('a').text().trim() || value;
          } else if (header.includes('發行商') || header.includes('发行商')) {
            info.publisher = $(el).find('a').text().trim() || value;
          } else if (header.includes('系列')) {
            info.serial = $(el).find('a').text().trim() || value;
          }
        });

        // 类别标签
        info.genre = [];
        $('span.genre a[href*="genre"]').each((_, el) => {
          const g = $(el).text().trim();
          if (g) info.genre.push(g);
        });

        // 演员
        info.actress = [];
        info.actress_pics = {};
        $('div.star-name a, .star-box .star-name a').each((_, el) => {
          const name = $(el).text().trim();
          if (name) info.actress.push(name);
        });

        // 备用方式获取演员
        if (info.actress.length === 0) {
          $('span.genre').each((_, el) => {
            const link = $(el).find('a[href*="star"]');
            if (link.length) {
              const name = link.text().trim();
              if (name) info.actress.push(name);
            }
          });
        }

        // 预览图
        info.preview_pics = [];
        $('a.sample-box').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            info.preview_pics.push(href.startsWith('http') ? href : `${baseUrl}${href}`);
          }
        });

        return info;
      } catch (err) {
        lastError = err;
        this.nextMirror();
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    throw lastError || new Error('All JavBus mirrors failed');
  }
}

module.exports = JavBusScraper;
