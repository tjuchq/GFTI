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
  const ALGORITHM_VERSION = '1.5.1';

  /* ==========================================================
   * 参与者五维气韵的逐轴软饱和拉伸配置（v1.1.0，沿用）
   * ========================================================== */
  var PARTICIPANT_SPREAD_CONFIG = [
    { center: 70, gain: 2.25 },
    { center: 50, gain: 1.6 },
    { center: 50, gain: 1.6 },
    { center: 50, gain: 1.6 },
    { center: 50, gain: 1.6 }
  ];

  /* ==========================================================
   * 古典轴 gamma warp（v1.1.0，沿用）
   * ========================================================== */
  var CLASSICAL_AXIS_INDEX = 0;
  var CLASSICAL_LEAN_STRENGTH = 0.75;

  /* ==========================================================
   * Lp 可调配距离（v1.3.0 引入，v1.5.1 沿用）
   * ========================================================== */
  var DISTANCE_POWER = 0.2;

  /* ==========================================================
   * 歌曲坐标以 50 为中心的对称线性压缩（v1.4.1，沿用）
   * ========================================================== */
  var SONG_COMPRESS_SCALE = 0.8;

  /* ==========================================================
   * 带平台的反比幂律相似度（v1.5.1）
   *
   *   R ≤ PLATEAU        → 100
   *   R > PLATEAU        → 100 / (1 + ((R - PLATEAU) / DECAY_BASE) ^ EXPONENT)
   *
   *   PLATEAU  = 31200  → 每轴差 ≤10 时全部 100%
   *   DECAY_BASE = 43900 → 平台边缘外 43900 处降至 50%
   *   EXPONENT = 1.2     → 衰减陡度
   *
   *   关键锚点（p=0.2）：
   *     每轴差  0 → R=0      → 100%
   *     每轴差  5 → R≈15300  → 100%
   *     每轴差 10 → R≈31200  → 100%
   *     每轴差 20 → R≈62400  →  60%
   *     每轴差 30 → R≈92700  →  37%
   *     每轴差 50 → R≈160000 →  18%
   *
   *   单调递减，相对排序与距离排序完全一致。
   * ========================================================== */
  var SIMILARITY_PLATEAU = 31200;
  var SIMILARITY_DECAY_BASE = 43900;
  var SIMILARITY_EXPONENT = 1.2;

  /**
   * 对参与者五维气韵做逐轴软饱和拉伸。
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
   * 古典轴 gamma warp。
   */
  function leanClassical(value, strength) {
    var warped = 100 * Math.pow(value / 100, strength);
    return Math.round(Math.max(0, Math.min(100, warped)) * 100) / 100;
  }

  /**
   * 歌曲坐标对称线性压缩。
   */
  function compressSongProfile(songP) {
    return songP.map(function (val) {
      var compressed = 50 + (val - 50) * SONG_COMPRESS_SCALE;
      return Math.round(compressed * 100) / 100;
    });
  }

  /**
   * 创建评测实例。
   */
  function createAssessment(data) {
    var songs = data.songs.map(function (song) {
      return { name: song.name, p: compressSongProfile(song.p) };
    });

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
        return left.distance - right.distance || left.name.localeCompare(right.name, 'zh');
      }).slice(0, topN);

      return { profile: profile, matches: matches };
    }

    return { evaluate: evaluate };
  }

  /**
   * 答案转五维气韵原始值。
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

  /**
   * Lp 距离计算。
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
   * 带平台的反比幂律相似度（v1.5.1）。
   *
   * R ≤ PLATEAU → 100
   * R > PLATEAU → 100 / (1 + ((R - PLATEAU) / DECAY_BASE) ^ EXPONENT)
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

  return {
    createAssessment: createAssessment,
    algorithmVersion: ALGORITHM_VERSION
  };
});
