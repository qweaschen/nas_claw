/**
 * 刮削器基类 - 提供通用的 HTTP 请求和 HTML 解析能力
 */
const axios = require('axios');
const cheerio = require('cheerio');

class BaseScraper {
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.timeout = 15000;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6',
    };
  }

  async fetch(url, options = {}) {
    const config = {
      url,
      method: options.method || 'GET',
      headers: { ...this.headers, ...options.headers },
      timeout: this.timeout,
      responseType: options.responseType || 'text',
      maxRedirects: 5,
    };

    // Support POST data
    if (options.data) {
      config.data = options.data;
    }

    if (options.proxy) {
      // Support HTTP proxy
      const proxyUrl = new URL(options.proxy);
      config.proxy = {
        host: proxyUrl.hostname,
        port: parseInt(proxyUrl.port),
        protocol: proxyUrl.protocol,
      };
    }

    const response = await axios(config);
    return response;
  }

  async fetchHTML(url, options = {}) {
    const response = await this.fetch(url, options);
    return cheerio.load(response.data);
  }

  async fetchJSON(url, options = {}) {
    const response = await this.fetch(url, { ...options, headers: { ...options.headers, 'Accept': 'application/json' } });
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }

  async downloadImage(url, options = {}) {
    const response = await this.fetch(url, { ...options, responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  /**
   * 子类需要实现
   * @param {string} avid 番号
   * @returns {Promise<object|null>} 电影元数据
   */
  async scrape(avid, options = {}) {
    throw new Error('Not implemented');
  }
}

module.exports = BaseScraper;
