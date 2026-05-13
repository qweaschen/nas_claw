/**
 * JavDB 刮削器
 * 更新镜像域名列表，添加 Cookie 绕过年龄验证
 */
const BaseScraper = require('./base');

const MIRRORS = [
  'https://javdb.com',
  'https://javdb571.com',
];

class JavDBScraper extends BaseScraper {
  constructor() {
    super('javdb', MIRRORS[0]);
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

    // 通用请求头：添加年龄验证 Cookie
    const commonHeaders = {
      'Cookie': 'over18=1; locale=zh',
      'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7',
    };

    for (let attempt = 0; attempt < this.mirrors.length; attempt++) {
      try {
        const baseUrl = this.getBaseUrl();

        // Step 1: 搜索影片
        const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(avid)}&f=all`;
        const $search = await this.fetchHTML(searchUrl, {
          ...options,
          headers: commonHeaders,
        });

        // 查找匹配的搜索结果
        // FC2 番号特殊处理：我们搜 FC2-PPV-xxx，但 JavDB 显示为 FC2-xxx
        const normalizeFC2 = (id) => id.toUpperCase().replace(/FC2-PPV-/i, 'FC2-');
        let detailUrl = null;
        $search('.movie-list .item a, .grid-item a').each((_, el) => {
          const href = $search(el).attr('href');
          const uid = $search(el).find('.uid, .video-title strong').text().trim();
          if (uid && (uid.toUpperCase() === avid.toUpperCase() || normalizeFC2(uid) === normalizeFC2(avid))) {
            detailUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          }
        });

        // 如果没有精确匹配，尝试第一个结果
        if (!detailUrl) {
          const firstLink = $search('.movie-list .item a, .grid-item a').first().attr('href');
          if (firstLink) {
            detailUrl = firstLink.startsWith('http') ? firstLink : `${baseUrl}${firstLink}`;
          }
        }

        if (!detailUrl) return null;

        // Step 2: 获取详情页
        const $ = await this.fetchHTML(detailUrl, {
          ...options,
          headers: commonHeaders,
        });

        const info = {};
        info.source = 'javdb';
        info.url = detailUrl;

        // 标题
        const h2 = $('h2.title').first();
        info.title = h2.find('strong.current-title').text().trim() ||
          h2.text().trim();

        // 封面
        const coverImg = $('div.column-video-cover img, .video-cover img, img.video-cover').first();
        info.cover = coverImg.attr('src');

        // 评分
        const scoreEl = $('span.score-stars + span, .score .value');
        if (scoreEl.length) {
          info.score = scoreEl.text().replace(/[^0-9.]/g, '');
        }

        // 信息面板 - 兼容多种页面结构
        $('div.movie-panel-info .panel-block, nav.panel .panel-block, .video-meta-panel .panel-block').each((_, el) => {
          const label = $(el).find('strong, .header').text().trim().replace(/[:：]/g, '');
          // 获取值：优先取 .value span 的文本，否则取所有 a 标签的文本
          const valueEl = $(el).find('span.value');
          const value = valueEl.length ? valueEl.text().trim() : $(el).find('a').text().trim();

          if (label.includes('番號') || label.includes('番号') || label.includes('ID')) {
            info.dvdid = value;
          } else if (label.includes('日期') || label.includes('Date')) {
            info.publish_date = value;
          } else if (label.includes('時長') || label.includes('时长') || label.includes('Duration')) {
            info.duration = value.replace(/[^0-9]/g, '');
          } else if (label.includes('導演') || label.includes('导演') || label.includes('Director')) {
            info.director = value;
          } else if (label.includes('片商') || label.includes('Maker')) {
            info.producer = value;
          } else if (label.includes('發行') || label.includes('Publisher') || label.includes('賣家')) {
            info.publisher = value;
          } else if (label.includes('系列') || label.includes('Series')) {
            info.serial = value;
          } else if (label.includes('類別') || label.includes('类别') || label.includes('Genre')) {
            info.genre = [];
            $(el).find('a').each((_, a) => {
              const g = $(a).text().trim();
              if (g) info.genre.push(g);
            });
          } else if (label.includes('演員') || label.includes('演员') || label.includes('Actor')) {
            info.actress = [];
            $(el).find('a').each((_, a) => {
              let name = $(a).text().trim();
              // 去掉性别符号
              name = name.replace(/[♀♂]/g, '').trim();
              if (name) info.actress.push(name);
            });
          }
        });

        if (!info.genre) info.genre = [];
        if (!info.actress) info.actress = [];

        // 预览图
        info.preview_pics = [];
        $('div.preview-images .tile-item img, .preview-image-container img, .preview-images img').each((_, el) => {
          const src = $(el).attr('src');
          if (src) info.preview_pics.push(src);
        });

        return info;
      } catch (err) {
        lastError = err;
        this.nextMirror();
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    throw lastError || new Error('All JavDB mirrors failed');
  }
}

module.exports = JavDBScraper;
