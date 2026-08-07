/**
 * 文件说明：为页面集成测试提供本地静态文件，不参与线上部署。
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.GFTI_TEST_PORT || 8777);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

/**
 * 把测试请求映射到仓库内的静态文件。
 *
 * @param {http.IncomingMessage} request HTTP 请求。
 * @param {http.ServerResponse} response HTTP 响应。
 * @returns {void}
 */
function serveStaticFile(request, response) {
  const requestUrl = new URL(request.url, 'http://127.0.0.1');
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = path.resolve(ROOT, '.' + decodeURIComponent(pathname));

  // 测试服务器只允许读取当前仓库，避免路径跳转到其他目录。
  if (!filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, function (error, content) {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not Found' : 'Server Error');
      return;
    }

    const contentType = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  });
}

const server = http.createServer(serveStaticFile);

server.listen(PORT, '127.0.0.1', function () {
  // 这行输出供 Playwright 的 webServer 就绪检测和人工排错使用。
  console.log('GFTI test server: http://127.0.0.1:' + PORT);
});
