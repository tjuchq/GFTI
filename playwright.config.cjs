/**
 * 文件说明：配置页面集成测试的浏览器与本地静态服务器。
 */
'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.integration.spec.cjs',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8777',
    headless: true
  },
  webServer: {
    command: 'node tests/test-server.cjs',
    url: 'http://127.0.0.1:8777/index.html',
    reuseExistingServer: true,
    timeout: 10000
  }
});
