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
  const ALGORITHM_VERSION = '1.4.1';

  /* ==========================================================
   * 参与者五维气韵的逐轴软饱和拉伸配置（v1.1.0，沿用）
   *   stretched = 50 + tanh(((raw - center) / 30) * gain) * 50
   * ========================================================== */
  var PARTICIPANT_SPREAD_CONFIG = [
    { center: 70, gain: 2.25 },   // 古典
    { center: 50, gain: 1.6 },    // 旁征博引
    { center: 50, gain: 1.6 },    // 含蓄蕴藉
    { center: 50, gain: 1.6 },    // 致密沉实
    { center: 50, gain: 1.6 }     // 精心构架
  ];

  /* ==========================================================
   * 古典轴 gamma warp（v1.1.0，沿用）
   *   warped = 100 * (value / 100) ^ strength，0 与 100 为不动点
   * ========================================================== */
  var CLASSICAL_AXIS_INDEX = 0;
  var CLASSICAL_LEAN_STRENGTH = 0.75;

  /* ==========================================================
   * Lp 可调配距离（v1.3.0 引入，v1.4.1 沿用）
   *   距离 = (Σ |diff_i| ^ DISTANCE_POWER) ^ (1 / DISTANCE_POWER)
   *   p=2 欧氏，p=1 曼哈顿，<1 更激进地压缩大差异
   * ========================================================== */
  var DISTANCE_POWER = 0.4;

  /* ==========================================================
   * 歌曲坐标以 50 为中心的对称线性压缩（v1.4.1）
   *   compressed = 50 + (value - 50) * SONG_COMPRESS_SCALE
   *
   *   50 始终映射到 50（不动点）
   *   SCALE = 1.0 → 不压缩
   *   SCALE < 1.0 → 往中心收（0.8 即 0→10, 100→90）
   *   SCALE > 1.0 → 往外推（一般不用）
   *
   * 仅作用于歌曲参数，参与者气韵不做此变换。
   * 压缩在 createAssessment 初始化时一次性完成，运行时零开销。
   * ========================================================== */
  var SONG_COMPRESS_SCALE = 0.8;

  /* ==========================================================
   * 高斯核相似度（v1.2.0 公式，v1.4.1 沿用）
   *   similarity = 100 * exp(-(R / SIGMA)^2)
   *   注意：v1.4.1 改了压缩公式，距离数值范围可能微调，
   *   SIGMA 当前保持 70，跑真实歌单后再决定是否需要调。
   * ========================================================== */
  var SIGMA = 70;

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
      var stretched = 50 + Math.tanh(normalized * cfg.gain) * 50;
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
   * 对歌曲五维坐标做以 50 为中心的对称线性压缩（v1.4.1）。
   *   compressed = 50 + (value - 50) * SONG_COMPRESS_SCALE
   *   50 为不动点；SCALE=0.8 时 0→10, 100→90。
   *
   * @param {number[]} songP 歌曲原始五维参数。
   * @returns {number[]} 压缩后的五维参数。
   */
  function compressSongProfile(songP) {
    return songP.map(function (val) {
      var compressed = 50 + (val - 50) * SONG_COMPRESS_SCALE;
      return Math.round(compressed * 100) / 100;
    });
  }

  /**
   * 使用题目与歌曲数据创建一次可复用的古风气韵评测。
   *
   * @param {{questions: Array<object>, songs: Array<object>}} data 题目与歌曲数据。
   * @returns {{evaluate: function(Array<string>, {topN?: number}=): object}} 公开评测 interface。
   */
  function createAssessment(data) {
    // 歌曲参数在初始化时一次性压缩，后续距离计算直接用压缩后坐标。
    var songs = data.songs.map(function (song) {
      return { name: song.name, p: compressSongProfile(song.p) };
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

      // 仅参与者古典轴在拉伸后接 gamma warp；歌曲侧已压缩，不再额外变换。
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
   * 计算五维气韵与歌曲参数之间的 Lp 距离（v1.3.0 引入，v1.4.1 沿用）。
   *
   * 距离 = (Σ |profile_i - song_i| ^ DISTANCE_POWER) ^ (1 / DISTANCE_POWER)
   *   DISTANCE_POWER=2 为欧氏，=1 为曼哈顿，<1 更激进地压缩大差异。
   *   五轴等权，不做轴权重区分。
   *
   * @param {number[]} profile 参与者五维气韵（已拉伸 + 古典 warp）。
   * @param {number[]} songProfile 歌曲参数（v1.4.1 已对称压缩）。
   * @returns {number} 未取整的 Lp 距离。
   */
  function calculateDistance(profile, songProfile) {
    var powerSum = 0;

    for (var axisIndex = 0; axisIndex < AXIS_COUNT; axisIndex += 1) {
      var difference = Math.abs(profile[axisIndex] - songProfile[axisIndex]);
      powerSum += Math.pow(difference, DISTANCE_POWER);
    }

    return Math.pow(powerSum, 1 / DISTANCE_POWER);
  }

  /**
   * 把距离换算成保留两位小数的相似度（高斯核，v1.2.0 公式，v1.4.1 沿用）。
   *
   * 公式：similarity = 100 * exp(-(R / SIGMA)^2)
   *   单调递减，R 越小相似度越大，排序次序与距离排序一致。
   *   SIGMA 控制衰减宽度；v1.4.1 改压缩公式后距离范围可能微调，当前保持 70。
   *
   * @param {number} distance Lp 距离。
   * @returns {number} 0 到 100 之间的相似度。
   */
  function calculateSimilarity(distance) {
    var raw = 100 * Math.exp(-(distance * distance) / (SIGMA * SIGMA));
    return Math.round(Math.min(raw, 100) * 100) / 100;
  }

  return {
    createAssessment: createAssessment,
    algorithmVersion: ALGORITHM_VERSION
  };
});
