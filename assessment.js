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
 * @returns {{createAssessment: function(object): object}} 公开 interface。
 */
function createAssessmentModule() {
  'use strict';

  const AXIS_COUNT = 5;

/**
 * 使用题目与歌曲数据创建一次可复用的古风气韵评测。
 *
 * @param {{questions: Array<object>, songs: Array<object>}} data 题目与歌曲数据。
 * @returns {{evaluate: function(Array<string>, {topN?: number}=): object}} 公开评测 interface。
 */
  function createAssessment(data) {
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

      const profile = scoreProfile(data.questions, answers);
      const topN = options && options.topN ? options.topN : 5;

      // 线上版本先把距离保留两位再排序；这里照旧处理，避免重构改变名次。
      const matches = data.songs.map(function (song) {
        const songDistance = calculateDistance(profile, song.p);
        const songSimilarity = calculateSimilarity(songDistance);

        return {
          name: song.name,
          distance: Math.round(songDistance * 100) / 100,
          similarity: songSimilarity,
          displayPercent: Math.round(songSimilarity)
        };
      }).sort(function (left, right) {
        return left.distance - right.distance || left.name.localeCompare(right.name, 'zh');
      }).slice(0, topN);

      return { profile: profile, matches: matches };
    }

    return { evaluate: evaluate };
  }

/**
 * 把答案转换成五维气韵。
 *
 * @param {Array<object>} questions 题目数据。
 * @param {Array<string>} answers 选项键。
 * @returns {number[]} 五维气韵。
 */
  function scoreProfile(questions, answers) {
    const profile = [0, 0, 0, 0, 0];

    questions.forEach(function (question, questionIndex) {
      const answer = answers[questionIndex];
      const option = question.options.find(function (candidate) {
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
 * @param {number[]} profile 五维气韵。
 * @param {number[]} songProfile 歌曲参数。
 * @returns {number} 未取整的欧氏距离。
 */
  function calculateDistance(profile, songProfile) {
    let squaredDistance = 0;

    for (let axisIndex = 0; axisIndex < AXIS_COUNT; axisIndex += 1) {
      const difference = profile[axisIndex] - songProfile[axisIndex];
      squaredDistance += difference * difference;
    }

    return Math.sqrt(squaredDistance);
  }

/**
 * 把距离换算成保留两位小数的相似度。
 *
 * @param {number} distance 欧氏距离。
 * @returns {number} 0 到 100 之间的相似度。
 */
  function calculateSimilarity(distance) {
    if (distance < 0.01) return 100;

    // 最新线上实现使用 100000 / R²；距离 50 时结果为 40%。
    const rawSimilarity = 100000 / (distance * distance);
    return Math.round(Math.min(rawSimilarity, 100) * 100) / 100;
  }

  return { createAssessment: createAssessment };
});
