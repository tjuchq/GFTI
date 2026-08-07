/**
 * 文件说明：验证 GitHub Pages 发布包只暴露正式古风气韵评测页面。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Pages 发布包只包含正式评测所需文件', function () {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gfti-pages-'));

  try {
    // 通过发布脚本的命令行接口生成与 GitHub Actions 相同的站点产物。
    const result = spawnSync(
      process.execPath,
      ['scripts/build-pages.cjs', outputDirectory],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(fs.readdirSync(outputDirectory).sort(), [
      '.nojekyll',
      'app.js',
      'assessment.js',
      'data.js',
      'index.html'
    ]);

    // 发布后的首页不能留下指向未发布模拟页面的失效入口。
    const publishedIndex = fs.readFileSync(path.join(outputDirectory, 'index.html'), 'utf8');
    assert.doesNotMatch(publishedIndex, /simulation\.html/);
  } finally {
    // 临时目录只属于本测试，测试结束后立即回收。
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});
