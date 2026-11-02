/**
 * 古风气韵评测 · 纯算法 module
 *
 * 本文件只做数学计算，不读取页面、localStorage 或任何浏览器全局状态，
 * 因此 Node 测试和浏览器页面可以共用同一份实现。
 *
 * 对外只暴露两个成员：
 *   - createAssessment(data) → { evaluate(answers, options) }
 *   - algorithmVersion       → 当前算法版本号
 */
(function (root, factory) {
  'use strict';

  const publicInterface = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = publicInterface;
  } else {
    root.GFTIAssessment = publicInterface;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this,
/**
 * 组装评测 module，隐藏内部数学实现。
 *
 * @returns {{createAssessment: function(object): object, algorithmVersion: string}} 公开 interface。
 */
function createAssessmentModule() {
  'use strict';

  const AXIS_COUNT = 5;
  const ALGORITHM_VERSION = '1.5.1';

  /* ==========================================================
   * 参与者五维气韵的逐轴软饱和拉伸（v1.1.0 起沿用）
   * 第 0 轴（古典）的中心点更高、增益更大，其余四轴一致。
   * ========================================================== */
  var PARTICIPANT_SPREAD_CONFIG = [
    { center: 70, gain: 2.25 },
    { center: 50, gain: 1.6 },
    { center: 50, gain: 1.6 },
    { center: 50, gain: 1.6 },
    { center: 50, gain: 1.6 }
  ];

  /* ==========================================================
   * 古典轴 gamma warp（v1.1.0 起沿用）
   * ========================================================== */
  var CLASSICAL_AXIS_INDEX = 0;
  var CLASSICAL_LEAN_STRENGTH = 0.75;

  /* ==========================================================
   * Lp 可调配距离（v1.3.0 引入）
   * ========================================================== */
  var DISTANCE_POWER = 0.2;

  /* ==========================================================
   * 歌曲坐标以 50 为中心的对称线性压缩（v1.4.1 起沿用）
   * ========================================================== */
  var SONG_COMPRESS_SCALE = 0.8;

  /* ==========================================================
   * 带平台的反比幂律相似度（v1.5.1）
   *
   *   R ≤ PLATEAU  → 100
   *   R > PLATEAU  → 100 / (1 + ((R - PLATEAU) / DECAY_BASE) ^ EXPONENT)
   *
   *   PLATEAU    = 15000 → 平台区内一律 100%
   *   DECAY_BASE = 25000 → 平台边缘外 25000 处降至 50%
   *   EXPONENT   = 1.5   → 衰减陡度
   *
   *   单调递减，相对排序与距离排序完全一致。
   * ========================================================== */
  var SIMILARITY_PLATEAU = 15000;
  var SIMILARITY_DECAY_BASE = 25000;
  var SIMILARITY_EXPONENT = 1.5;

  /* ---------------- 坐标变换 ---------------- */

  /**
   * 参与者侧：逐轴软饱和拉伸，把原始分映射到 0~100。
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
   * 古典轴：gamma warp，向高分段倾斜。
   */
  function leanClassical(value, strength) {
    var warped = 100 * Math.pow(value / 100, strength);
    return Math.round(Math.max(0, Math.min(100, warped)) * 100) / 100;
  }

  /**
   * 歌曲侧：以 50 为中心的对称线性压缩。
   */
  function compressSongProfile(songP) {
    return songP.map(function (val) {
      var compressed = 50 + (val - 50) * SONG_COMPRESS_SCALE;
      return Math.round(compressed * 100) / 100;
    });
  }

  /* ---------------- 距离与相似度 ---------------- */

  /**
   * Lp 距离（v1.5.2 的防溢出写法）。
   *
   * 内部求和后先乘 0.1 再取 1/DISTANCE_POWER 次方，最后乘 100000，
   * 避免 p=0.2 时中间值上溢导致相似度恒为 0。
   * 该缩放是单调变换，不改变任何两首歌的相对排序。
   *
   * @param {number[]} profile 参与者五维坐标。
   * @param {number[]} songProfile 歌曲五维坐标（已压缩）。
   * @returns {number} Lp 距离。
   */
  function calculateDistance(profile, songProfile) {
    var powerSum = 0;

    for (var axisIndex = 0; axisIndex < AXIS_COUNT; axisIndex += 1) {
      var difference = Math.abs(profile[axisIndex] - songProfile[axisIndex]);
      powerSum += Math.pow(difference, DISTANCE_POWER);
    }

    return 100000 * Math.pow(powerSum * 0.1, 1 / DISTANCE_POWER);
  }

  /**
   * 带平台的反比幂律相似度（v1.5.1）。
   *
   * R ≤ PLATEAU → 100；否则按 (R - PLATEAU) / DECAY_BASE 的 EXPONENT 次幂衰减。
   *
   * @param {number} distance Lp 距离。
   * @returns {number} 0~100 相似度，保留两位小数。
   */
  function calculateSimilarity(distance) {
    if (distance <= SIMILARITY_PLATEAU) {
      return 100;
    }

    var excess = distance - SIMILARITY_PLATEAU;
    var raw = 100 / (1 + Math.pow(excess / SIMILARITY_DECAY_BASE, SIMILARITY_EXPONENT));
    return Math.round(raw * 100) / 100;
  }

  /* ---------------- 评分 ---------------- */

  /**
   * 答案转五维原始分。
   *
   * 每题选中的选项把 main/sub 两个权重累加到对应轴；
   * 第 0 轴最后做一次平方根压缩，抑制极端值。
   *
   * @param {object[]} questions 题目定义。
   * @param {string[]} answers 与题目一一对应的选项 key。
   * @returns {number[]} 五维原始分。
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

      profile[option.mainAxis] += option.main;
      profile[option.subAxis] += option.sub;
    });

    profile[0] = Math.floor(Math.sqrt(profile[0]) * 10);
    return profile;
  }

  /* ---------------- 对外 interface ---------------- */

  /**
   * 创建一次评测实例。
   *
   * @param {{questions: object[], songs: {name: string, p: number[]}[]}} data 题库与曲库。
   * @returns {{evaluate: function(string[], object=): {profile: number[], matches: object[]}}}
   */
  function createAssessment(data) {
    // 歌曲坐标在实例创建时压缩一次，避免每次评估重复计算
    var songs = data.songs.map(function (song) {
      return { name: song.name, p: compressSongProfile(song.p) };
    });

    /**
     * 按答案算五维坐标，并给出最契合的 topN 首。
     *
     * @param {string[]} answers 每题的选项 key。
     * @param {{topN: number}=} options 返回条数，默认 5。
     * @returns {{profile: number[], matches: object[]}}
     */
    function evaluate(answers, options) {
      if (!Array.isArray(answers) || answers.length !== data.questions.length) {
        throw new TypeError('每道题都必须有有效答案');
      }

      var rawProfile = scoreProfile(data.questions, answers);
      var profile = spreadParticipantProfile(rawProfile);
      profile[CLASSICAL_AXIS_INDEX] = leanClassical(
        profile[CLASSICAL_AXIS_INDEX], CLASSICAL_LEAN_STRENGTH);

      var topN = options && options.topN ? options.topN : 5;

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
        // 距离升序；距离相同按歌名中文排序，保证结果稳定
        return left.distance - right.distance || left.name.localeCompare(right.name, 'zh');
      }).slice(0, topN);

      return { profile: profile, matches: matches };
    }

    return { evaluate: evaluate };
  }

  return {
    createAssessment: createAssessment,
    algorithmVersion: ALGORITHM_VERSION
  };
});
