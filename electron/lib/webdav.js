const { createClient } = require('webdav');
const https = require('https');

let webdavClient = null;

/**
 * 连接远程 WebDAV 服务
 * @param {{ url: string, username: string, password?: string }} config
 */
async function connectWebDAV(config) {
  if (webdavClient) {
    webdavClient = null;
  }

  // 配置 httpsAgent 忽略自签名证书错误 (NAS 常用场景)
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false
  });

  webdavClient = createClient(
    config.url,
    {
      username: config.username,
      password: config.password,
      httpsAgent: httpsAgent
    }
  );

  // Test connection by checking root directory
  await webdavClient.getDirectoryContents('/');

  return webdavClient;
}

async function disconnectWebDAV() {
  webdavClient = null;
}

function getWebDAVClient() {
  return webdavClient;
}

module.exports = { connectWebDAV, disconnectWebDAV, getWebDAVClient };
