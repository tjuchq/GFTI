/**
 * 文件说明：通过真实浏览器验证均匀模拟评测页面、Worker 与交换格式的接线。
 */
'use strict';

const { test, expect } = require('@playwright/test');

/**
 * 把 Playwright 下载流读取成 UTF-8 文本，不依赖测试机固定下载目录。
 *
 * @param {import('@playwright/test').Download} download 浏览器下载。
 * @returns {Promise<string>} 下载内容。
 */
async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];

  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// 用户只通过页面操作；计数守恒能同时验证 1000 次运行和全部歌曲渲染。
test('用户可以运行一千次均匀模拟评测并查看完整分布', async function ({ page }) {
  await page.goto('/simulation.html');
  await expect(page.locator('h1')).toHaveText('歌曲入选分布');

  await page.locator('#seed').fill('集成测试种子');
  await page.locator('#sample-count').selectOption('1000');
  await page.locator('#run').click();

  await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#metric-samples')).toHaveText('1,000');
  await expect(page.locator('#metric-source')).toHaveText('当前生效参数');
  await expect(page.locator('#progress-text')).toHaveText('100%');
  await expect(page.locator('#top-chart .bar-row')).toHaveCount(15);
  await expect(page.locator('#song-table tbody tr')).toHaveCount(100);

  const totals = await page.locator('#song-table tbody tr').evaluateAll(function (rows) {
    return rows.reduce(function (sum, row) {
      return {
        first: sum.first + Number(row.dataset.firstCount),
        topFive: sum.topFive + Number(row.dataset.topFiveCount)
      };
    }, { first: 0, topFive: 0 });
  });

  expect(totals).toEqual({ first: 1000, topFive: 5000 });

  await page.locator('#sort-first').click();
  await expect(page.locator('#song-table tbody tr').first()).toHaveAttribute('data-first-count', '0');
  await expect(page.locator('#profile-grid .histogram i').first()).toHaveAttribute('aria-label', /次，.*%/);
});

// CSV 中保存的答案必须经过当前 assessment.js 重新计算，而不是信任旧结果列。
test('用户可以导入模拟样本集并用当前算法重新计算', async function ({ page }) {
  const answers = new Array(20).fill('A');
  const header = ['schema_version', 'sample_id'].concat(
    answers.map(function (_, index) { return 'q' + String(index + 1).padStart(2, '0'); }),
    ['axis01', 'axis02', 'axis03', 'axis04', 'axis05', 'first_song']
  ).join(',');
  const row = ['1', '1'].concat(answers, ['0', '0', '0', '0', '0', '旧结果应被忽略']).join(',');

  await page.goto('/simulation.html');
  await page.locator('#samples-file').setInputFiles({
    name: 'samples.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFF' + header + '\r\n' + row + '\r\n', 'utf8')
  });

  await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#metric-samples')).toHaveText('1');
  await expect(page.locator('#song-table tbody tr').first()).toContainText('龙书龟契');
  await expect(page.locator('#status')).toContainText('已导入 1 份模拟样本');
});

// 完整报告必须携带复现上下文，不能只下载页面上可见的表格。
test('用户可以导出完整报告和表格化歌曲分布', async function ({ page }) {
  await page.goto('/simulation.html');
  await page.locator('#seed').fill('报告种子');
  await page.locator('#run').click();
  await expect(page.locator('#report')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-summary').click();
  const download = await downloadPromise;
  const report = JSON.parse(await readDownload(download));

  expect(download.suggestedFilename()).toBe('summary.json');
  expect(report.sampleCount).toBe(1000);
  expect(report.seed).toBe('报告种子');
  expect(report.songSnapshot).toHaveLength(100);
  expect(report.questionFingerprint).toMatch(/^fnv1a-/);

  const songDownloadPromise = page.waitForEvent('download');
  await page.locator('#export-songs').click();
  const songDownload = await songDownloadPromise;
  const songCsv = await readDownload(songDownload);

  expect(songDownload.suggestedFilename()).toBe('song-distribution.csv');
  expect(songCsv.split(/\r?\n/).filter(Boolean)).toHaveLength(101);

  const sampleDownloadPromise = page.waitForEvent('download');
  await page.locator('#export-samples').click();
  const sampleDownload = await sampleDownloadPromise;
  const sampleCsv = await readDownload(sampleDownload);

  expect(sampleDownload.suggestedFilename()).toBe('samples.csv');
  expect(sampleCsv.split(/\r?\n/).filter(Boolean)).toHaveLength(1001);
});

// 对比页面读取公开报告格式，不依赖当前页面刚运行过统计。
test('用户可以加载两份报告并查看算法变化', async function ({ page }) {
  const before = {
    schemaVersion: 1, algorithmVersion: '1.0.0', sampleCount: 1000,
    songStatistics: [{ name: '甲曲', firstRate: 10, topFiveRate: 30 }],
    profileStatistics: [{ name: '古典', mean: 60 }]
  };
  const after = {
    schemaVersion: 1, algorithmVersion: '2.0.0', sampleCount: 1000,
    songStatistics: [{ name: '甲曲', firstRate: 12, topFiveRate: 27.5 }],
    profileStatistics: [{ name: '古典', mean: 62.25 }]
  };

  await page.goto('/simulation.html');
  await page.locator('#compare-before').setInputFiles({
    name: 'before.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before))
  });
  await page.locator('#compare-after').setInputFiles({
    name: 'after.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(after))
  });

  await expect(page.locator('#comparison')).toBeVisible();
  await expect(page.locator('#comparison-versions')).toHaveText('1.0.0 → 2.0.0');
  await expect(page.locator('#comparison-songs tbody tr')).toContainText(/甲曲.*\+2\.00.*-2\.50/);
  await expect(page.locator('#comparison-profiles')).toContainText('古典：+2.25');
});

// 诊断工具只从歌曲参数后台进入，不占用普通评测页面导航。
test('歌曲参数后台可以进入独立的分布统计页面', async function ({ page }) {
  await page.goto('/index.html?admin=1');
  await expect(page.locator('#ad-simulation')).toBeVisible();
  await page.locator('#ad-simulation').click();

  await expect(page).toHaveURL(/simulation\.html$/);
  await expect(page.locator('h1')).toHaveText('歌曲入选分布');
});

// 取消只终止当前 Worker，不能用部分统计覆盖上一份完整报告。
test('用户取消大样本运行后仍能查看上一份完整报告', async function ({ page }) {
  await page.goto('/simulation.html');
  await page.locator('#run').click();
  await expect(page.locator('#metric-samples')).toHaveText('1,000');

  await page.locator('#sample-count').selectOption('100000');
  await page.locator('#run').click();
  await page.locator('#cancel').click();

  await expect(page.locator('#status')).toContainText('本次运行已取消');
  await expect(page.locator('#metric-samples')).toHaveText('1,000');
  await expect(page.locator('#run')).toBeEnabled();
});

// 另一个后台标签页修改本地参数时，已完成报告仍保留，但必须提示快照已过期。
test('运行后歌曲参数变化会提示报告仍使用旧快照', async function ({ page }) {
  await page.goto('/simulation.html');
  await page.locator('#run').click();
  await expect(page.locator('#report')).toBeVisible();

  await page.evaluate(function () {
    localStorage.setItem('gfti_songs_override_v1', JSON.stringify({ '杏花弦外雨': [1, 2, 3, 4, 5] }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'gfti_songs_override_v1' }));
  });

  await expect(page.locator('#snapshot-warning')).toBeVisible();
  await expect(page.locator('#snapshot-warning')).toContainText('仍使用运行开始时的参数快照');
});

// 三档样本使用同一 Worker 路径；最大档完成时页面仍能正常更新进度与结果。
test('一万和十万样本档位都能完成', async function ({ page }) {
  test.setTimeout(120000);
  await page.goto('/simulation.html');

  for (const sampleCount of ['10000', '100000']) {
    await page.locator('#sample-count').selectOption(sampleCount);
    await page.locator('#run').click();
    await expect(page.locator('#metric-samples')).toHaveText(Number(sampleCount).toLocaleString('en-US'), {
      timeout: 90000
    });
    await expect(page.locator('#progress-text')).toHaveText('100%');
  }
});

// 当前生效参数与原始参数必须形成不同快照，避免后台调整被统计页忽略。
test('用户可以在当前生效参数和原始参数之间切换', async function ({ page }) {
  await page.goto('/simulation.html');
  await page.evaluate(function () {
    localStorage.setItem('gfti_songs_override_v1', JSON.stringify({ '杏花弦外雨': [1, 2, 3, 4, 5] }));
  });
  await page.reload();

  await page.locator('#run').click();
  await expect(page.locator('#report')).toBeVisible();
  let downloadPromise = page.waitForEvent('download');
  await page.locator('#export-summary').click();
  let report = JSON.parse(await readDownload(await downloadPromise));
  expect(report.songSnapshot.find(function (song) { return song.name === '杏花弦外雨'; }).p).toEqual([1, 2, 3, 4, 5]);

  await page.locator('#song-source').selectOption('original');
  await page.locator('#run').click();
  await expect(page.locator('#metric-source')).toHaveText('原始参数');
  downloadPromise = page.waitForEvent('download');
  await page.locator('#export-summary').click();
  report = JSON.parse(await readDownload(await downloadPromise));
  expect(report.source).toBe('original');
  expect(report.songSnapshot.find(function (song) { return song.name === '杏花弦外雨'; }).p).not.toEqual([1, 2, 3, 4, 5]);
});
