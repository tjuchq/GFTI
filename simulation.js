/**
 * 文件说明：均匀模拟评测的纯逻辑 module，负责可复现样本与统计报告。
 */
(function (root, factory) {
  'use strict';

  const publicInterface = factory();

  // Node 测试和浏览器、Worker 共用同一份实现，避免随机规则出现分叉。
  if (typeof module === 'object' && module.exports) {
    module.exports = publicInterface;
  } else {
    root.GFTISimulation = publicInterface;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this,
/**
 * 组装均匀模拟评测 module。
 *
 * @returns {{createSimulation: function(object): object}} 公开 interface。
 */
function createSimulationModule() {
  'use strict';

  const RANDOM_VERSION = 'mulberry32-v1';

  /**
   * 创建绑定题目结构的均匀模拟评测。
   *
   * @param {{questions: Array<object>}} config 模拟所需题目。
   * @returns {{createSampleSet: function(object): Array<Array<string>>, run: function(object): object}} 模拟 interface。
   */
  function createSimulation(config) {
    /**
     * 按固定种子生成一批均匀模拟答案。
     *
     * @param {{sampleCount: number, seed: string|number}} request 样本数量与种子。
     * @returns {Array<Array<string>>} 可复现的模拟样本集。
     */
    function createSampleSet(request) {
      const sampleCount = Number(request.sampleCount);
      const random = createRandom(resolveSeed(request.seed));
      const samples = [];

      if (!Number.isInteger(sampleCount) || sampleCount < 1) {
        throw new TypeError('样本数量必须是正整数');
      }

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        samples.push(createAnswers(config.questions, random));
      }

      return samples;
    }

    /**
     * 对给定模拟样本集执行当前古风气韵评测并生成汇总报告。
     *
     * @param {{samples?: Array<Array<string>>, sampleCount?: number, seed?: string|number, source?: string}} request 样本或生成参数。
     * @returns {object} 歌曲、五维气韵和并列情况的模拟汇总报告。
     */
    function run(request) {
      if (!config.assessment || typeof config.assessment.evaluate !== 'function') {
        throw new TypeError('生成汇总报告需要古风气韵评测 interface');
      }
      if (!request) {
        throw new TypeError('模拟样本集不能为空');
      }

      const suppliedSamples = Array.isArray(request.samples) ? request.samples : null;
      const sampleCount = suppliedSamples ? suppliedSamples.length : Number(request.sampleCount);
      const resolvedSeed = suppliedSamples ? null : resolveSeed(request.seed);
      const random = suppliedSamples ? null : createRandom(resolvedSeed);

      if (!Number.isInteger(sampleCount) || sampleCount < 1) {
        throw new TypeError('模拟样本集不能为空');
      }

      const songStatistics = createSongStatistics(config.songs);
      const profileStatistics = createProfileStatistics(config.axes);
      const tieCounts = { first: 0, topFiveBoundary: 0 };
      const sampleRecords = request.includeSampleRecords ? [] : null;

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        // 生成模式逐条计算而不保留答案，十万次运行也只占用固定的统计内存。
        const answers = suppliedSamples
          ? suppliedSamples[sampleIndex]
          : createAnswers(config.questions, random);
        const result = config.assessment.evaluate(answers, { topN: config.songs.length });

        collectSongStatistics(songStatistics, result.matches);
        collectProfileStatistics(profileStatistics, result.profile);
        collectTieCounts(tieCounts, result.matches);

        if (sampleRecords) {
          sampleRecords.push({
            sampleId: sampleIndex + 1,
            answers: answers.slice(),
            profile: result.profile.slice(),
            firstSong: result.matches[0].name
          });
        }

        if (typeof request.onProgress === 'function' &&
            ((sampleIndex + 1) % (request.progressEvery || 1000) === 0 || sampleIndex + 1 === sampleCount)) {
          request.onProgress({ completed: sampleIndex + 1, total: sampleCount });
        }
      }

      const report = {
        schemaVersion: 1,
        algorithmVersion: config.algorithmVersion,
        sampleCount: sampleCount,
        tieCounts: tieCounts,
        songStatistics: finishSongStatistics(songStatistics, sampleCount),
        profileStatistics: finishProfileStatistics(profileStatistics, sampleCount)
      };

      // 明细可能很大，仅在调用者明确要求导出时加入报告。
      if (sampleRecords) report.sampleRecords = sampleRecords;
      if (!suppliedSamples) {
        report.seed = String(request.seed == null ? '' : request.seed);
        report.resolvedSeed = resolvedSeed;
        report.randomVersion = RANDOM_VERSION;
      }
      if (!suppliedSamples || request.source) {
        report.source = request.source || 'current';
        report.questionFingerprint = createQuestionFingerprint(config.questions);
        report.songSnapshot = config.songs.map(function (song) {
          return { name: song.name, p: song.p.slice() };
        });
      }
      return report;
    }

    return {
      createSampleSet: createSampleSet,
      run: run
    };
  }

  /**
   * 为所有题目生成一份独立均匀答案。
   *
   * @param {Array<object>} questions 题目集合。
   * @param {function(): number} random 固定种子随机序列。
   * @returns {string[]} 一份完整答案。
   */
  function createAnswers(questions, random) {
    return questions.map(function (question) {
      const optionIndex = Math.floor(random() * question.options.length);
      return question.options[optionIndex].key;
    });
  }

  /**
   * 为题目及选项结构创建轻量稳定指纹。
   *
   * @param {Array<object>} questions 题目集合。
   * @returns {string} 带算法前缀的十六进制指纹。
   */
  function createQuestionFingerprint(questions) {
    const structure = questions.map(function (question) {
      return question.options.map(function (option) {
        return {
          key: option.key,
          mainAxis: option.mainAxis,
          main: option.main,
          subAxis: option.subAxis,
          sub: option.sub
        };
      });
    });
    const text = JSON.stringify(structure);
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 'fnv1a-' + (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * 为每首歌曲创建可累计的统计行。
   *
   * @param {Array<object>} songs 生效歌曲参数。
   * @returns {Array<object>} 与歌曲顺序一致的统计行。
   */
  function createSongStatistics(songs) {
    return songs.map(function (song) {
      return { name: song.name, firstCount: 0, topFiveCount: 0 };
    });
  }

  /**
   * 累计一次评测中的第一契合歌曲与前五首契合歌曲。
   *
   * @param {Array<object>} statistics 歌曲统计行。
   * @param {Array<object>} matches 已按当前算法排序的契合歌曲。
   * @returns {void}
   */
  function collectSongStatistics(statistics, matches) {
    const rowsByName = new Map(statistics.map(function (row) { return [row.name, row]; }));

    if (matches[0]) rowsByName.get(matches[0].name).firstCount += 1;
    matches.slice(0, 5).forEach(function (match) {
      rowsByName.get(match.name).topFiveCount += 1;
    });
  }

  /**
   * 把歌曲次数转换成保留两位小数的频率。
   *
   * @param {Array<object>} statistics 歌曲统计行。
   * @param {number} sampleCount 样本总数。
   * @returns {Array<object>} 完整歌曲统计。
   */
  function finishSongStatistics(statistics, sampleCount) {
    return statistics.map(function (row) {
      return {
        name: row.name,
        firstCount: row.firstCount,
        firstRate: roundTwo(row.firstCount * 100 / sampleCount),
        topFiveCount: row.topFiveCount,
        topFiveRate: roundTwo(row.topFiveCount * 100 / sampleCount)
      };
    });
  }

  /**
   * 为五维气韵创建累计器。
   *
   * @param {Array<object>} axes 五维气韵名称。
   * @returns {Array<object>} 五维统计累计器。
   */
  function createProfileStatistics(axes) {
    return axes.map(function (axis) {
      return {
        name: axis.pos,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        bins: new Array(10).fill(0)
      };
    });
  }

  /**
   * 累计一次评测的五维气韵。
   *
   * @param {Array<object>} statistics 五维统计累计器。
   * @param {number[]} profile 一次评测的五维气韵。
   * @returns {void}
   */
  function collectProfileStatistics(statistics, profile) {
    profile.forEach(function (value, axisIndex) {
      const row = statistics[axisIndex];
      const binIndex = Math.max(0, Math.min(9, Math.floor(value / 10)));

      row.sum += value;
      row.min = Math.min(row.min, value);
      row.max = Math.max(row.max, value);
      row.bins[binIndex] += 1;
    });
  }

  /**
   * 生成可直接展示的五维气韵统计。
   *
   * @param {Array<object>} statistics 五维统计累计器。
   * @param {number} sampleCount 样本总数。
   * @returns {Array<object>} 完整五维气韵统计。
   */
  function finishProfileStatistics(statistics, sampleCount) {
    return statistics.map(function (row) {
      return {
        name: row.name,
        mean: roundTwo(row.sum / sampleCount),
        min: row.min,
        max: row.max,
        bins: row.bins
      };
    });
  }

  /**
   * 累计当前排序规则产生的第一名和前五边界并列。
   *
   * @param {{first: number, topFiveBoundary: number}} counts 并列累计值。
   * @param {Array<object>} matches 全部契合歌曲。
   * @returns {void}
   */
  function collectTieCounts(counts, matches) {
    if (matches.length > 1 && matches[0].distance === matches[1].distance) counts.first += 1;
    if (matches.length > 5 && matches[4].distance === matches[5].distance) counts.topFiveBoundary += 1;
  }

  /**
   * 把统计值保留两位小数。
   *
   * @param {number} value 原始统计值。
   * @returns {number} 舍入后的数值。
   */
  function roundTwo(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * 把用户输入稳定转换成无符号 32 位种子。
   *
   * @param {string|number} input 用户输入的种子。
   * @returns {number} 随机算法使用的整数种子。
   */
  function resolveSeed(input) {
    const text = String(input == null ? '' : input);

    if (/^\d+$/.test(text)) return Number(text) >>> 0;

    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      // FNV-1a 只依赖 UTF-16 码元，因此各浏览器得到相同结果。
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * 创建 Mulberry32 伪随机序列。
   *
   * @param {number} seed 无符号 32 位种子。
   * @returns {function(): number} 返回 [0, 1) 数值的函数。
   */
  function createRandom(seed) {
    let state = seed >>> 0;

    return function random() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    createSimulation: createSimulation,
    randomVersion: RANDOM_VERSION
  };
});
