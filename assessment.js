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
  const ALGORITHM_VERSION = '1.1.0';

  /* ==========================================================
   * 参与者五维气韵的逐轴软饱和拉伸配置（v1.1.0）
   *
   * 问题背景：原始得分大量聚集在 40~60（古典轴 60~80），
   *          旧版线性拉伸 + clamp 会把两端截断堆积（100 分桶异常高），
   *          且古典轴 center=70 把整体分布推偏（均值 63）。
   *
   * 方案：五轴统一 center=50，用 tanh 软饱和替代线性拉伸：
   *   stretched = center + tanh(((raw - center) / 30) * gain) * amplitude
   *   amplitude = min(center, 100 - center) = 50
   *
   * 性质：
   *   - tanh 输出严格在 (-1, 1)，结果严格落在 (0, 100)，永不 clamp、不堆积；
   *   - S 形映射近似正态 CDF，钟形原始分过一遍后接近均匀分布；
   *   - 中间区域近似线性（保留区分度），两端自然饱和。
   *
   * 效果示例（center=50, gain=2）：
   *   原始 20 → 50 + tanh(-2)    * 50 ≈ 1.8
   *   原始 30 → 50 + tanh(-1.33) * 50 ≈ 6.5
   *   原始 40 → 50 + tanh(-0.67) * 50 ≈ 20.9
   *   原始 50 → 50
   *   原始 60 → 50 + tanh(0.67)  * 50 ≈ 79.1
   *   原始 70 → 50 + tanh(1.33)  * 50 ≈ 93.5
   *   原始 80 → 50 + tanh(2)     * 50 ≈ 98.2
   * ========================================================== */
  var PARTICIPANT_SPREAD_CONFIG = [
    { center: 50, gain: 2 },   // 古典
    { center: 50, gain: 2 },   // 旁征博引
    { center: 50, gain: 2 },   // 含蓄蕴藉
    { center: 50, gain: 2 },   // 致密沉实
    { center: 50, gain: 2 }    // 精心构架
  ];

  /* ==========================================================
   * 古典轴 gamma warp（v1.1.0，替代旧版线性 bias）
   *
   * 在拉伸之后，仅对参与者古典轴（index 0）做幂函数 warp，
   * 把结果微微推向古典一侧，保留"往古典拉"的产品特性。
   *
   * 性质：
   *   - 非线性（幂函数，不是线性加减）；
   *   - 0 和 100 是不动点，不改变上下限；
   *   - strength < 1 时整体上推；strength 越接近 1 推力越轻。
   *
   * 效果示例（strength=0.8）：
   *   20  → 100 * 0.2^0.8 ≈ 27.6
   *   50  → 100 * 0.5^0.8 ≈ 57.4
   *   80  → 100 * 0.8^0.8 ≈ 83.7
   *   100 → 100
   *
   * 注意：歌曲参数始终保持 data 里的原始数值，不做任何变换；
   *       距离计算的歌曲一侧永远是原始向量。
   * ========================================================== */
  var CLASSICAL_AXIS_INDEX = 0;
  var CLASSICAL_LEAN_STRENGTH = 0.8;

  /**
   * 对参与者五维气韵做逐轴软饱和拉伸，增大区分度且不产生端点堆积。
   *
   * @param {number[]} rawProfile scoreProfile 输出的原始五维值（每轴 0~100）。
   * @returns {number[]} 拉伸后的五维值，每轴落在 (0, 100)。
   */
  function spreadParticipantProfile(rawProfile) {
    return rawProfile.map(function (val, i) {
      var cfg = PARTICIPANT_SPREAD_CONFIG[i];
      var normalized = (val - cfg.center) / 30;
      var amplitude = Math.min(cfg.center, 100 - cfg.center);
      var stretched = cfg.center + Math.tanh(normalized * cfg.gain) * amplitude;
      return Math.round(Math.max(0, Math.min(100, stretched)) * 100) / 100;
    });
  }

  /**
   * 古典轴 gamma warp：把拉伸后的古典值推向古典一侧。
   *
   * @param {number} value 拉伸后的古典轴值（0~100）。
   * @param {number} strength 幂指数，<1 时往古典侧推；0 与 100 为不动点。
   * @returns {number} warp 后的值，保留两位小数，仍在 [0, 100]。
   */
  function leanClassical(value, strength) {
    var warped = 100 * Math.pow(value / 100, strength);
    return Math.round(Math.max(0, Math.min(100, warped)) * 100) / 100;
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

      // 仅参与者古典轴在拉伸后接 gamma warp；歌曲侧保持原始坐标。
      profile[CLASSICAL_AXIS_INDEX] = leanClassical(
        profile[CLASSICAL_AXIS_INDEX], CLASSICAL_LEAN_STRENGTH);

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
   * @param {number[]} profile 参与者五维气韵（已拉伸 + 古典 warp）。
   * @param {number[]} songProfile 歌曲参数（data 原始坐标，不拉伸不变换）。
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
