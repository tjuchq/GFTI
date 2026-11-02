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
  // 原值曲使用参与者拉伸前的五维值，可验证歌曲参数不会跟随参与者一起拉伸。
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
      { name: '原值曲', p: [40, 9, 0, 0, 0] },
      { name: '远调曲', p: [100, 9, 0, 0, 0] }
    ]
  };
}

/**
 * 构造两首参数完全相同的歌曲，用来锁定「同距离按名称排序」的规则。
 *
 * 参数一致是跨公式版本都成立的「并列」构造：不依赖某一代距离公式的具体缩放，
 * 距离必然相等，排序只能退回名称比较。
 *
 * @returns {{questions: Array<object>, songs: Array<object>}} 并列用例。
 */
function createTiedDistanceExample() {
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
      { name: '甲曲', p: [100, 0, 0, 0, 0] }
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
test('参与者五维气韵会拉伸而歌曲参数保持最终坐标', function () {
  const assessment = createAssessment(createWorkedExample());
  const result = assessment.evaluate(['A'], { topN: 2 });

  assert.equal(result.profile.length, 5);
  result.profile.forEach(function (value) {
    assert.ok(value >= 0 && value <= 100);
  });
  assert.equal(result.matches.length, 2);
  // 精确数值由唯一算法基线负责；这里只守「更接近的排前面」这一不变量。
  assert.equal(result.matches[0].name, '原值曲');
  assert.ok(result.matches[0].distance <= result.matches[1].distance);
  assert.ok(result.matches[0].similarity >= result.matches[1].similarity);
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

// 距离完全相等的两首歌，必须退回名称拼音排序，保证结果可复现。
test('距离相同的歌曲按名称排序', function () {
  const assessment = createAssessment(createTiedDistanceExample());
  const result = assessment.evaluate(['A'], { topN: 2 });

  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0].distance, result.matches[1].distance);
  assert.equal(result.matches[0].name, '甲曲');
  assert.equal(result.matches[1].name, '乙曲');
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
