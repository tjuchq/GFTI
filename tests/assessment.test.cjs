/**
 * 文件说明：通过古风气韵评测的公开 interface 验证计分、排序和诊断结果。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAssessment, algorithmVersion } = require('../assessment.js');

// 统计报告依赖明确的算法身份；只有公式、计分或排序变化时才更新它。
test('评测 interface 公开稳定的算法版本', function () {
  assert.equal(algorithmVersion, '1.0.1');
});

/**
 * 构造一个能手算结果的小数据集，避免测试重复生产数据里的计算过程。
 *
 * @returns {{questions: Array<object>, songs: Array<object>}} 评测所需的题目和歌曲。
 */
function createWorkedExample() {
  // 选择 A 后原始值为 [40,9,0,0,0]，逐轴拉伸并截断后得到 [28,0,0,0,0]。
  return {
    questions: [
      {
        options: [
          { key: 'A', mainAxis: 0, main: 16, subAxis: 1, sub: 9 },
          { key: 'B', mainAxis: 0, main: 0, subAxis: 1, sub: 0 }
        ]
      }
    ],
    songs: [
      { name: '同调曲', p: [40, 9, 0, 0, 0] },
      { name: '远调曲', p: [100, 9, 0, 0, 0] }
    ]
  };
}

/**
 * 构造两个原始距离不同、保留两位后相同的歌曲，用来锁定线上排序规则。
 *
 * @returns {{questions: Array<object>, songs: Array<object>}} 舍入并列用例。
 */
function createRoundedTieExample() {
  // 两首歌的距离分别为 100 和 √10001，线上都会显示为 100.00。
  return {
    questions: [
      {
        options: [
          { key: 'A', mainAxis: 0, main: 0, subAxis: 1, sub: 0 }
        ]
      }
    ],
    songs: [
      { name: '乙曲', p: [100, 0, 0, 0, 0] },
      { name: '甲曲', p: [100, 1, 0, 0, 0] }
    ]
  };
}

/**
 * 在隔离上下文中读取线上 data.js，得到页面使用的真实评测数据。
 *
 * @returns {object} 线上题目、歌曲和轴数据。
 */
function loadProductionData() {
  const dataPath = path.resolve(__dirname, '..', 'data.js');
  const source = fs.readFileSync(dataPath, 'utf8');
  const context = { window: {} };

  // data.js 是经典浏览器脚本；vm 只提供它需要的 window，不改写生产文件格式。
  vm.runInNewContext(source, context, { filename: dataPath });

  // JSON 往返把 vm realm 的数组转回当前 Node realm，断言只比较数据值。
  return JSON.parse(JSON.stringify(context.window.GFTI_DATA));
}

// 这条 tracer bullet 覆盖完整评测行为，不直接测试内部数学辅助函数。
test('完整答案会得到逐轴拉伸后的五维气韵和契合歌曲', function () {
  const assessment = createAssessment(createWorkedExample());

  assert.deepEqual(assessment.evaluate(['A'], { topN: 2 }), {
    profile: [28, 0, 0, 0, 0],
    matches: [
      { name: '同调曲', distance: 0, similarity: 100, displayPercent: 100 },
      { name: '远调曲', distance: 72, similarity: 19.29, displayPercent: 19 }
    ]
  });
});

// 调用者应收到稳定、可读的输入错误，而不是内部属性访问异常。
test('缺失答案会被评测 interface 明确拒绝', function () {
  const assessment = createAssessment(createWorkedExample());

  assert.throws(function () {
    assessment.evaluate([]);
  }, /每道题都必须有有效答案/);
});

// 选项键来自页面和数据的接线，失配时应在评测 seam 立即暴露。
test('未知选项会被评测 interface 明确拒绝', function () {
  const assessment = createAssessment(createWorkedExample());

  assert.throws(function () {
    assessment.evaluate(['Z']);
  }, /每道题都必须有有效答案/);
});

// 当前线上实现使用两位小数距离排序；重构不能悄悄改变这个结果。
test('距离舍入后并列的歌曲按名称排序', function () {
  const assessment = createAssessment(createRoundedTieExample());

  assert.deepEqual(assessment.evaluate(['A'], { topN: 2 }), {
    profile: [0, 0, 0, 0, 0],
    matches: [
      { name: '甲曲', distance: 100, similarity: 10, displayPercent: 10 },
      { name: '乙曲', distance: 100, similarity: 10, displayPercent: 10 }
    ]
  });
});

// 这组字面量记录算法 1.0.1 的正式基线，后续重构不能悄悄改变完整结果。
test('生产数据的固定答案保持算法 1.0.1 完整输出', function () {
  const data = loadProductionData();
  const assessment = createAssessment(data);
  const answers = data.questions.map(function () { return 'A'; });

  assert.deepEqual(assessment.evaluate(answers, { topN: 5 }), {
    profile: [100, 90, 100, 100, 94.8],
    matches: [
      { name: '龙书龟契', distance: 11.45, similarity: 100, displayPercent: 100 },
      { name: '东阳夜怪醉话', distance: 21.98, similarity: 100, displayPercent: 100 },
      { name: '旷古回响', distance: 35.82, similarity: 77.94, displayPercent: 78 },
      { name: '九九八十一', distance: 40.67, similarity: 60.45, displayPercent: 60 },
      { name: '永定四十年', distance: 53.4, similarity: 35.07, displayPercent: 35 }
    ]
  });
});
