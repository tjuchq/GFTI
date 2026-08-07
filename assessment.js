/**
 * 文件说明：古风气韵评测的纯算法 module，不读取页面、存储或浏览器全局状态。
 */
/**
 * 把同一份评测 interface 暴露给 Node 测试和浏览器页面。
 *
 * @param {object} root 当前运行环境的全局对象。
 * @param {function(): object} factory 创建公开 interface 的工厂函数。
 * @returns {void}
 */
(function (root, factory) {
  'use strict';

  const publicInterface = factory();

  // Node 测试通过 CommonJS 加载；浏览器通过经典 script 获取同一份 interface。
  if (typeof module === 'object' && module.exports) {
    module.exports = publicInterface;
  } else {
    root.GFTIAssessment = publicInterface;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this,
/**
 * 组装古风气韵评测 module，并隐藏内部数学实现。
 *
 * @returns {{createAssessment: function(object): object, algorithmVersion: string}} 公开 interface。
 */
function createAssessmentModule() {
  'use strict';

  const AXIS_COUNT = 5;
  const ALGORITHM_VERSION = '1.0.3';

  /* ==========================================================
   * 参与者五维气韵的逐轴温和拉伸配置
   *
   * 问题背景：原始得分大量聚集在 40~60（古典轴 60~80），
   *          导致用户向量与歌曲向量距离差异小、区分度差。
   *
   * 方案：以每轴的「聚集中心」为锚点，将偏差乘以增益系数 gain，
   *       做温和的线性放大（gain=1.6 表示偏差放大 60%），
   *       然后 clamp 到 [0, 100]。
   *       古典轴（index=0）额外加正向偏移 bias，保持"往古典拉"的特性。
   *
   * 效果示例（gain=1.6, 其他轴 center=50）：
   *   原始 30 → 50 + (30-50)*1.6 = 18
   *   原始 40 → 50 + (40-50)*1.6 = 34
   *   原始 50 → 50 + 0           = 50（中心不变）
   *   原始 60 → 50 + (60-50)*1.6 = 66
   *   原始 70 → 50 + (70-50)*1.6 = 82
   *
   * 效果示例（gain=1.6, 古典轴 center=70, bias=6）：
   *   原始 50 → 70 + (50-70)*1.6 + 6 = 44
   *   原始 60 → 70 + (60-70)*1.6 + 6 = 60
   *   原始 70 → 70 + 0 + 6           = 76
   *   原始 80 → 70 + (80-70)*1.6 + 6 = 92
   * ========================================================== */
  var PARTICIPANT_SPREAD_CONFIG = [
    { center: 70, gain: 2, bias: -6 },   // 古典：聚集在 70，保留 +6 偏移
    { center: 50, gain: 2, bias: 0 },   // 旁征博引
    { center: 50, gain: 2, bias: 0 },   // 含蓄蕴藉
    { center: 50, gain: 2, bias: 0 },   // 致密沉实
    { center: 50, gain: 2, bias: 0 }    // 精心构架
  ];

  /**
   * 对参与者五维气韵做逐轴温和拉伸，增大区分度。
   *
   * @param {number[]} rawProfile scoreProfile 输出的原始五维值（每轴 0~100）。
   * @returns {number[]} 拉伸后的五维值，每轴 clamp 到 [0, 100]。
   */
  function spreadParticipantProfile(rawProfile) {
    return rawProfile.map(function (val, i) {
      var cfg = PARTICIPANT_SPREAD_CONFIG[i];
      var deviation = val - cfg.center;
      var stretched = cfg.center + deviation * cfg.gain + cfg.bias;
      return Math.round(Math.max(0, Math.min(100, stretched)) * 100) / 100;
    });
  }

  /**
   * 使用题目与歌曲数据创建一次可复用的古风气韵评测。
   *
   * @param {{questions: Array<object>, songs: Array<object>}} data 题目与歌曲数据。
   * @returns {{evaluate: function(Array<string>, {topN?: number}=): object}} 公开评测 interface。
   */
  function createAssessment(data) {
    // 歌曲参数是最终坐标，只复制数据以避免评测过程改写调用方输入。
    var songs = data.songs.map(function (song) {
      return { name: song.name, p: song.p.slice() };
    });

    /**
     * 根据完整答案计算五维气韵，并找出最契合的歌曲。
     *
     * @param {Array<string>} answers 每道题对应的选项键。
     * @param {{topN?: number}} [options] 返回歌曲数量。
     * @returns {{profile: number[], matches: Array<object>}} 评测结果与诊断值。
     */
    function evaluate(answers, options) {
      if (!Array.isArray(answers) || answers.length !== data.questions.length) {
        throw new TypeError('每道题都必须有有效答案');
      }

      var rawProfile = scoreProfile(data.questions, answers);
      var profile = spreadParticipantProfile(rawProfile);
      var topN = options && options.topN ? options.topN : 5;

      // 线上版本先把距离保留两位再排序；这里照旧处理，避免重构改变名次。
      var matches = songs.map(function (song) {
        var songDistance = calculateDistance(profile, song.p);
        var songSimilarity = calculateSimilarity(songDistance);

        return {
          name: song.name,
          distance: Math.round(songDistance * 100) / 100,
          similarity: songSimilarity,
          displayPercent: Math.round(Math.min(songSimilarity, 100))
        };
      }).sort(function (left, right) {
        return left.distance - right.distance || left.name.localeCompare(right.name, 'zh');
      }).slice(0, topN);

      return { profile: profile, matches: matches };
    }

    return { evaluate: evaluate };
  }

  /**
   * 把答案转换成五维气韵（原始值，未拉伸）。
   *
   * @param {Array<object>} questions 题目数据。
   * @param {Array<string>} answers 选项键。
   * @returns {number[]} 五维气韵原始值。
   */
  function scoreProfile(questions, answers) {
    var profile = [0, 0, 0, 0, 0];

    questions.forEach(function (question, questionIndex) {
      var answer = answers[questionIndex];
      var option = question.options.find(function (candidate) {
        return candidate.key === answer;
      });

      if (!option) {
        throw new TypeError('每道题都必须有有效答案');
      }

      // 每个选项同时影响一个主维度和一个副维度。
      profile[option.mainAxis] += option.main;
      profile[option.subAxis] += option.sub;
    });

    // 第一维沿用线上规则，开方后乘十并向下取整。
    profile[0] = Math.floor(Math.sqrt(profile[0]) * 10);
    return profile;
  }

  /**
   * 计算五维气韵与歌曲参数之间的欧氏距离。
   *
   * @param {number[]} profile 参与者五维气韵（已拉伸）。
   * @param {number[]} songProfile 歌曲参数（最终坐标，不拉伸）。
   * @returns {number} 未取整的欧氏距离。
   */
  function calculateDistance(profile, songProfile) {
    var squaredDistance = 0;

    for (var axisIndex = 0; axisIndex < AXIS_COUNT; axisIndex += 1) {
      var difference = profile[axisIndex] - songProfile[axisIndex];
      squaredDistance += difference * difference;
    }

    return Math.sqrt(squaredDistance);
  }

  /**
   * 把距离换算成保留两位小数的相似度。
   *
   * 公式：k = 100000 / R²
   *   R ≈ 31.62 → 100000/1000 = 100%（截断）
   *   R = 50    → 100000/2500 = 40%
   *   R = 100   → 100000/10000 = 10%
   *
   * @param {number} distance 欧氏距离。
   * @returns {number} 0 到 100 之间的相似度。
   */
  function calculateSimilarity(distance) {
    if (distance < 0.01) return 100;

    var raw = 100000 / (distance * distance);
    return Math.round(Math.min(raw, 100) * 100) / 100;
  }

  return {
    createAssessment: createAssessment,
    algorithmVersion: ALGORITHM_VERSION
  };
});
