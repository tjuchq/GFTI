/**
 * 文件说明：通过交换格式 module 的公开 interface 验证版本化 CSV 与 JSON。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  exportSamplesCsv,
  importSamplesCsv,
  exportSummaryJson,
  importSummaryJson,
  exportSongDistributionCsv,
  compareReports
} = require('../simulation-artifacts.js');

// 字面量同时锁定字段顺序、版本号、UTF-8 BOM、换行和逗号转义。
test('模拟样本集会导出为版本化 CSV', function () {
  const csv = exportSamplesCsv([
    { sampleId: 1, answers: ['A'], profile: [0, 1, 2, 3, 4], firstSong: '低,调曲' },
    { sampleId: 2, answers: ['B'], profile: [100, 90, 80, 70, 60], firstSong: '高调曲' }
  ], { questionCount: 1 });

  assert.equal(csv,
    '\uFEFFschema_version,sample_id,q01,axis01,axis02,axis03,axis04,axis05,first_song\r\n' +
    '1,1,A,0,1,2,3,4,"低,调曲"\r\n' +
    '1,2,B,100,90,80,70,60,高调曲\r\n');
});

// 导入后的答案可直接交还模拟 interface，逗号转义不能破坏歌曲名称。
test('版本化 CSV 会还原成可复算的模拟样本集', function () {
  const csv = '\uFEFFschema_version,sample_id,q01,axis01,axis02,axis03,axis04,axis05,first_song\r\n' +
    '1,7,A,0,1,2,3,4,"低,调曲"\r\n';

  assert.deepEqual(importSamplesCsv(csv, { questionCount: 1 }), [
    { sampleId: 7, answers: ['A'], profile: [0, 1, 2, 3, 4], firstSong: '低,调曲' }
  ]);
});

// 非法答案不能被静默跳过，否则导入后的样本分布会与原文件不同。
test('CSV 存在非法答案时会拒绝整份文件并指出行号', function () {
  const csv = 'schema_version,sample_id,q01,axis01,axis02,axis03,axis04,axis05,first_song\r\n' +
    '1,7,Z,0,1,2,3,4,低调曲\r\n';

  assert.throws(function () {
    importSamplesCsv(csv, { questionCount: 1 });
  }, /第 2 行.*q01/);
});

// 诊断列同样属于版本化契约，非数值不能以 NaN 混入后续导出。
test('CSV 存在非法五维气韵时会拒绝整份文件并指出字段', function () {
  const csv = 'schema_version,sample_id,q01,axis01,axis02,axis03,axis04,axis05,first_song\r\n' +
    '1,7,A,坏值,1,2,3,4,低调曲\r\n';

  assert.throws(function () {
    importSamplesCsv(csv, { questionCount: 1 });
  }, /第 2 行.*axis01/);
});

// JSON 保留嵌套参数快照，末尾换行使下载文件适合版本管理和文本工具。
test('模拟汇总报告会导出为稳定的版本化 JSON', function () {
  assert.equal(exportSummaryJson({
    schemaVersion: 1,
    algorithmVersion: '1.0.0',
    sampleCount: 3
  }), '{\n  "schemaVersion": 1,\n  "algorithmVersion": "1.0.0",\n  "sampleCount": 3\n}\n');
});

// 不支持的报告版本不能进入对比流程，避免把字段缺失误判成算法差异。
test('导入未知版本的模拟汇总报告会被明确拒绝', function () {
  assert.throws(function () {
    importSummaryJson('{"schemaVersion":2,"songStatistics":[],"profileStatistics":[]}');
  }, /不支持的模拟汇总报告版本/);
});

// 结构残缺的 JSON 不能等到比较渲染时才暴露内部属性错误。
test('导入缺少统计结构的模拟汇总报告会被明确拒绝', function () {
  assert.throws(function () {
    importSummaryJson('{"schemaVersion":1,"algorithmVersion":"1.0.0","sampleCount":1000}');
  }, /缺少歌曲或五维气韵统计/);
});

// 歌曲汇总保持一歌一行，适合直接交给 Excel、Python 或 R 排序作图。
test('歌曲入选分布会导出为表格化 CSV', function () {
  const csv = exportSongDistributionCsv({
    schemaVersion: 1,
    algorithmVersion: '1.0.0',
    seed: '测试种子',
    sampleCount: 1000,
    songStatistics: [
      { name: '低,调曲', firstCount: 125, firstRate: 12.5, topFiveCount: 369, topFiveRate: 36.9 }
    ]
  });

  assert.equal(csv,
    '\uFEFFschema_version,algorithm_version,seed,sample_count,song,first_count,first_rate,top_five_count,top_five_rate\r\n' +
    '1,1.0.0,测试种子,1000,"低,调曲",125,12.5,369,36.9\r\n');
});

// 对比结果使用百分点差值，避免把 10% 到 12% 错写成增长 20%。
test('两份模拟汇总报告会按歌曲和五维气韵给出变化', function () {
  const before = {
    algorithmVersion: '1.0.0', sampleCount: 1000,
    songStatistics: [{ name: '甲曲', firstRate: 10, topFiveRate: 30 }],
    profileStatistics: [{ name: '古典', mean: 60 }]
  };
  const after = {
    algorithmVersion: '2.0.0', sampleCount: 1000,
    songStatistics: [{ name: '甲曲', firstRate: 12, topFiveRate: 27.5 }],
    profileStatistics: [{ name: '古典', mean: 62.25 }]
  };

  assert.deepEqual(compareReports(before, after), {
    algorithmVersions: { before: '1.0.0', after: '2.0.0' },
    sampleCounts: { before: 1000, after: 1000 },
    songChanges: [{
      name: '甲曲',
      firstRateBefore: 10,
      firstRateAfter: 12,
      firstRateDelta: 2,
      topFiveRateBefore: 30,
      topFiveRateAfter: 27.5,
      topFiveRateDelta: -2.5
    }],
    profileChanges: [{ name: '古典', meanBefore: 60, meanAfter: 62.25, meanDelta: 2.25 }]
  });
});
