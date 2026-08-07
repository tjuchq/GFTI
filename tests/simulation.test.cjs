/**
 * 文件说明：通过模拟模块的公开 interface 验证可复现样本与统计报告。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSimulation } = require('../simulation.js');
const { createAssessment } = require('../assessment.js');

/**
 * 构造两道四选一题，固定种子的答案可以直接写成独立字面量。
 *
 * @returns {Array<object>} 用于模拟的最小题目集合。
 */
function createQuestions() {
  return [1, 2].map(function () {
    return {
      options: ['A', 'B', 'C', 'D'].map(function (key) {
        return { key: key };
      })
    };
  });
}

/**
 * 构造可手算的两极歌曲数据，三份答案会产生 2:1 的第一契合次数。
 *
 * @returns {{questions: Array<object>, songs: Array<object>, axes: Array<object>}} 统计用例。
 */
function createStatisticsExample() {
  return {
    questions: [
      {
        options: [
          { key: 'A', mainAxis: 0, main: 0, subAxis: 1, sub: 0 },
          { key: 'B', mainAxis: 0, main: 100, subAxis: 1, sub: 0 }
        ]
      }
    ],
    songs: [
      { name: '低调曲', p: [0, 0, 0, 0, 0] },
      { name: '中间曲', p: [50, 0, 0, 0, 0] },
      { name: '高调曲', p: [100, 0, 0, 0, 0] }
    ],
    axes: ['古典', '旁征博引', '含蓄蕴藉', '致密沉实', '精心构架'].map(function (name) {
      return { pos: name };
    })
  };
}

// Mulberry32 的公开序列在种子 1 下对应 CA、CD、DB，锁定跨浏览器复现能力。
test('固定种子会生成完全相同的模拟样本集', function () {
  const simulation = createSimulation({ questions: createQuestions() });

  assert.deepEqual(simulation.createSampleSet({ sampleCount: 3, seed: '1' }), [
    ['C', 'A'],
    ['C', 'D'],
    ['D', 'B']
  ]);
});

// 期望值来自三份手工答案，避免在断言中重复生产统计公式。
test('固定模拟样本集会得到歌曲与五维气韵的完整汇总', function () {
  const data = createStatisticsExample();
  const simulation = createSimulation({
    questions: data.questions,
    songs: data.songs,
    axes: data.axes,
    assessment: createAssessment(data),
    algorithmVersion: '1.0.0'
  });

  assert.deepEqual(simulation.run({ samples: [['A'], ['A'], ['B']] }), {
    schemaVersion: 1,
    algorithmVersion: '1.0.0',
    sampleCount: 3,
    tieCounts: { first: 0, topFiveBoundary: 0 },
    songStatistics: [
      { name: '低调曲', firstCount: 2, firstRate: 66.67, topFiveCount: 3, topFiveRate: 100 },
      { name: '中间曲', firstCount: 0, firstRate: 0, topFiveCount: 3, topFiveRate: 100 },
      { name: '高调曲', firstCount: 1, firstRate: 33.33, topFiveCount: 3, topFiveRate: 100 }
    ],
    profileStatistics: [
      { name: '古典', mean: 33.33, min: 0, max: 100, bins: [2, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
      { name: '旁征博引', mean: 0, min: 0, max: 0, bins: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { name: '含蓄蕴藉', mean: 0, min: 0, max: 0, bins: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { name: '致密沉实', mean: 0, min: 0, max: 0, bins: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { name: '精心构架', mean: 0, min: 0, max: 0, bins: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
    ]
  });
});

// 大样本默认不保留明细；只有导出流程明确请求时才返回可交换记录。
test('请求样本明细时会返回答案、五维气韵和第一契合歌曲', function () {
  const data = createStatisticsExample();
  const simulation = createSimulation({
    questions: data.questions,
    songs: data.songs,
    axes: data.axes,
    assessment: createAssessment(data),
    algorithmVersion: '1.0.0'
  });

  const report = simulation.run({ samples: [['A'], ['B']], includeSampleRecords: true });

  assert.deepEqual(report.sampleRecords, [
    { sampleId: 1, answers: ['A'], profile: [0, 0, 0, 0, 0], firstSong: '低调曲' },
    { sampleId: 2, answers: ['B'], profile: [100, 0, 0, 0, 0], firstSong: '高调曲' }
  ]);
});

// 报告必须自带复现上下文，不能依赖调用者记住当时使用了哪份参数。
test('固定种子运行会冻结随机规则与评测参数身份', function () {
  const data = createStatisticsExample();
  const simulation = createSimulation({
    questions: data.questions,
    songs: data.songs,
    axes: data.axes,
    assessment: createAssessment(data),
    algorithmVersion: '1.0.0'
  });

  const report = simulation.run({ sampleCount: 3, seed: '1', source: 'original' });

  assert.deepEqual({
    sampleCount: report.sampleCount,
    seed: report.seed,
    resolvedSeed: report.resolvedSeed,
    randomVersion: report.randomVersion,
    source: report.source,
    questionFingerprint: report.questionFingerprint,
    songSnapshot: report.songSnapshot
  }, {
    sampleCount: 3,
    seed: '1',
    resolvedSeed: 1,
    randomVersion: 'mulberry32-v1',
    source: 'original',
    questionFingerprint: 'fnv1a-eae2f83f',
    songSnapshot: data.songs
  });
});

// Worker 通过这个公开回调发送进度，页面无需了解统计循环的内部结构。
test('模拟运行会报告可展示的完成进度', function () {
  const data = createStatisticsExample();
  const progress = [];
  const simulation = createSimulation({
    questions: data.questions,
    songs: data.songs,
    axes: data.axes,
    assessment: createAssessment(data),
    algorithmVersion: '1.0.0'
  });

  simulation.run({
    sampleCount: 3,
    seed: '1',
    onProgress: function (event) { progress.push(event); }
  });

  assert.deepEqual(progress, [{ completed: 3, total: 3 }]);
});

// 导入样本重新计算时随机信息为空，但本次生效参数仍必须随报告保存。
test('导入样本生成的报告同样保存参数来源与快照', function () {
  const data = createStatisticsExample();
  const simulation = createSimulation({
    questions: data.questions,
    songs: data.songs,
    axes: data.axes,
    assessment: createAssessment(data),
    algorithmVersion: '1.0.0'
  });

  const report = simulation.run({ samples: [['A']], source: 'current' });

  assert.deepEqual({
    source: report.source,
    questionFingerprint: report.questionFingerprint,
    songSnapshot: report.songSnapshot
  }, {
    source: 'current',
    questionFingerprint: 'fnv1a-eae2f83f',
    songSnapshot: data.songs
  });
});

// 选项键不变但计分权重变化时，旧报告不能被误认成同一份题目结构。
test('题目计分权重变化会产生不同的题目指纹', function () {
  const beforeData = createStatisticsExample();
  const afterData = createStatisticsExample();
  afterData.questions[0].options[1].main = 99;

  const before = createSimulation({
    questions: beforeData.questions,
    songs: beforeData.songs,
    axes: beforeData.axes,
    assessment: createAssessment(beforeData),
    algorithmVersion: '1.0.0'
  }).run({ sampleCount: 1, seed: '1' });
  const after = createSimulation({
    questions: afterData.questions,
    songs: afterData.songs,
    axes: afterData.axes,
    assessment: createAssessment(afterData),
    algorithmVersion: '1.0.0'
  }).run({ sampleCount: 1, seed: '1' });

  assert.notEqual(before.questionFingerprint, after.questionFingerprint);
});
