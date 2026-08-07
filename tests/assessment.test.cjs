/**
 * 文件说明：通过古风气韵评测的公开 interface 验证计分、排序和诊断结果。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAssessment, algorithmVersion } = require('../assessment.js');
const algorithmBaseline = require('./fixtures/algorithm-baseline.json');
const ALGORITHM_CHANGE_GUIDANCE =
  '算法行为已变化。如属有意修改，请运行 npm run algorithm:update-baseline -- <新版本>';

// 统计报告依赖明确的算法身份；只有公式、计分或排序变化时才更新它。
test('评测 interface 公开稳定的算法版本', function () {
  assert.equal(algorithmVersion, algorithmBaseline.algorithmVersion, ALGORITHM_CHANGE_GUIDANCE);
});

/**
 * 构造一个能手算结果的小数据集，避免测试重复生产数据里的计算过程。
 *
 * @returns {{questions: Array<object>, songs: Array<object>}} 评测所需的题目和歌曲。
 */
function createWorkedExample() {
  // 同调曲使用选择 A 后的原始五维值，可验证双方经过同一算法处理后距离仍为零。
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

// 这条 tracer bullet 验证稳定不变量，精确数值只由唯一算法基线负责。
test('完整答案会得到有效五维气韵和按距离排序的契合歌曲', function () {
  const assessment = createAssessment(createWorkedExample());
  const result = assessment.evaluate(['A'], { topN: 2 });

  assert.equal(result.profile.length, 5);
  result.profile.forEach(function (value) {
    assert.ok(value >= 0 && value <= 100);
  });
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches[0], {
    name: '同调曲', distance: 0, similarity: 100, displayPercent: 100
  });
  assert.ok(result.matches[0].distance <= result.matches[1].distance);
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

// 唯一基线集中保存正式算法输出，避免测试与页面各维护一份重复字面量。
test('生产数据的固定答案符合已批准算法基线', function () {
  const data = loadProductionData();
  const assessment = createAssessment(data);
  assert.equal(algorithmVersion, algorithmBaseline.algorithmVersion, ALGORITHM_CHANGE_GUIDANCE);
  assert.deepEqual(
    assessment.evaluate(algorithmBaseline.answers, { topN: 5 }),
    algorithmBaseline.expected,
    ALGORITHM_CHANGE_GUIDANCE
  );
});
