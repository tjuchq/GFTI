/**
 * 文件说明：模拟样本集与模拟汇总报告的版本化交换格式 module。
 */
(function (root, factory) {
  'use strict';

  const publicInterface = factory();

  // 交换格式必须在 Node 测试和浏览器下载流程中保持一致。
  if (typeof module === 'object' && module.exports) {
    module.exports = publicInterface;
  } else {
    root.GFTISimulationArtifacts = publicInterface;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this,
/**
 * 组装模拟数据交换格式 module。
 *
 * @returns {object} CSV、JSON 与报告比较的公开 interface。
 */
function createSimulationArtifactsModule() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const PROFILE_COLUMN_COUNT = 5;

  /**
   * 把模拟样本明细导出成适合表格工具读取的 UTF-8 CSV。
   *
   * @param {Array<object>} records 模拟样本明细。
   * @param {{questionCount: number}} options 题目数量。
   * @returns {string} 带 BOM 的版本化 CSV。
   */
  function exportSamplesCsv(records, options) {
    const questionColumns = createNumberedColumns('q', options.questionCount);
    const profileColumns = createNumberedColumns('axis', PROFILE_COLUMN_COUNT);
    const header = ['schema_version', 'sample_id'].concat(
      questionColumns,
      profileColumns,
      ['first_song']
    );
    const rows = records.map(function (record) {
      return [SCHEMA_VERSION, record.sampleId].concat(
        record.answers,
        record.profile,
        [record.firstSong]
      ).map(escapeCsvCell).join(',');
    });

    return '\uFEFF' + [header.join(',')].concat(rows).join('\r\n') + '\r\n';
  }

  /**
   * 严格读取版本化模拟样本 CSV。
   *
   * @param {string} csv CSV 文件内容。
   * @param {{questionCount: number}} options 当前题目数量。
   * @returns {Array<object>} 可供复算的模拟样本明细。
   */
  function importSamplesCsv(csv, options) {
    const rows = parseCsv(String(csv).replace(/^\uFEFF/, ''));
    const questionColumns = createNumberedColumns('q', options.questionCount);
    const profileColumns = createNumberedColumns('axis', PROFILE_COLUMN_COUNT);
    const expectedHeader = ['schema_version', 'sample_id'].concat(
      questionColumns,
      profileColumns,
      ['first_song']
    );

    if (!rows[0] || rows[0].join('\u0000') !== expectedHeader.join('\u0000')) {
      throw new TypeError('CSV 表头与当前样本版本不匹配');
    }

    return rows.slice(1).filter(function (row) {
      return row.some(function (cell) { return cell !== ''; });
    }).map(function (row, rowIndex) {
      const answerStart = 2;
      const profileStart = answerStart + options.questionCount;

      if (row.length !== expectedHeader.length) {
        throw new TypeError('第 ' + (rowIndex + 2) + ' 行列数不正确');
      }
      if (Number(row[0]) !== SCHEMA_VERSION) {
        throw new TypeError('第 ' + (rowIndex + 2) + ' 行 schema_version 不受支持');
      }
      row.slice(answerStart, profileStart).forEach(function (answer, answerIndex) {
        if (!/^[A-D]$/.test(answer)) {
          throw new TypeError(
            '第 ' + (rowIndex + 2) + ' 行 q' + String(answerIndex + 1).padStart(2, '0') + ' 不是有效答案'
          );
        }
      });
      row.slice(profileStart, profileStart + PROFILE_COLUMN_COUNT).forEach(function (value, axisIndex) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || number > 100) {
          throw new TypeError(
            '第 ' + (rowIndex + 2) + ' 行 axis' + String(axisIndex + 1).padStart(2, '0') + ' 不是有效数值'
          );
        }
      });

      return {
        sampleId: Number(row[1]),
        answers: row.slice(answerStart, profileStart),
        profile: row.slice(profileStart, profileStart + PROFILE_COLUMN_COUNT).map(Number),
        firstSong: row[profileStart + PROFILE_COLUMN_COUNT]
      };
    });
  }

  /**
   * 把完整模拟汇总报告导出为便于审阅的 JSON。
   *
   * @param {object} report 模拟汇总报告。
   * @returns {string} 末尾带换行的 JSON 文本。
   */
  function exportSummaryJson(report) {
    return JSON.stringify(report, null, 2) + '\n';
  }

  /**
   * 把歌曲入选分布导出成一歌一行的 CSV。
   *
   * @param {object} report 模拟汇总报告。
   * @returns {string} 带复现元数据的 UTF-8 CSV。
   */
  function exportSongDistributionCsv(report) {
    const header = [
      'schema_version', 'algorithm_version', 'seed', 'sample_count', 'song',
      'first_count', 'first_rate', 'top_five_count', 'top_five_rate'
    ];
    const rows = report.songStatistics.map(function (song) {
      return [
        report.schemaVersion,
        report.algorithmVersion,
        report.seed || '',
        report.sampleCount,
        song.name,
        song.firstCount,
        song.firstRate,
        song.topFiveCount,
        song.topFiveRate
      ].map(escapeCsvCell).join(',');
    });

    return '\uFEFF' + [header.join(',')].concat(rows).join('\r\n') + '\r\n';
  }

  /**
   * 读取并验证模拟汇总报告 JSON。
   *
   * @param {string} text JSON 文件内容。
   * @returns {object} 可供展示或比较的模拟汇总报告。
   */
  function importSummaryJson(text) {
    let report;

    try {
      report = JSON.parse(text);
    } catch (error) {
      throw new TypeError('模拟汇总报告不是有效 JSON');
    }
    if (!report || report.schemaVersion !== SCHEMA_VERSION) {
      throw new TypeError('不支持的模拟汇总报告版本');
    }
    if (!Array.isArray(report.songStatistics) || !Array.isArray(report.profileStatistics)) {
      throw new TypeError('模拟汇总报告缺少歌曲或五维气韵统计');
    }
    return report;
  }

  /**
   * 比较两份模拟汇总报告中的歌曲频率与五维均值。
   *
   * @param {object} before 修改前报告。
   * @param {object} after 修改后报告。
   * @returns {object} 以百分点表示的可展示变化。
   */
  function compareReports(before, after) {
    const beforeSongs = createRowsByName(before.songStatistics);
    const afterSongs = createRowsByName(after.songStatistics);
    const beforeProfiles = createRowsByName(before.profileStatistics);
    const afterProfiles = createRowsByName(after.profileStatistics);

    return {
      algorithmVersions: { before: before.algorithmVersion, after: after.algorithmVersion },
      sampleCounts: { before: before.sampleCount, after: after.sampleCount },
      songChanges: unionNames(before.songStatistics, after.songStatistics).map(function (name) {
        const left = beforeSongs.get(name) || { firstRate: 0, topFiveRate: 0 };
        const right = afterSongs.get(name) || { firstRate: 0, topFiveRate: 0 };
        return {
          name: name,
          firstRateBefore: left.firstRate,
          firstRateAfter: right.firstRate,
          firstRateDelta: roundTwo(right.firstRate - left.firstRate),
          topFiveRateBefore: left.topFiveRate,
          topFiveRateAfter: right.topFiveRate,
          topFiveRateDelta: roundTwo(right.topFiveRate - left.topFiveRate)
        };
      }),
      profileChanges: unionNames(before.profileStatistics, after.profileStatistics).map(function (name) {
        const left = beforeProfiles.get(name) || { mean: 0 };
        const right = afterProfiles.get(name) || { mean: 0 };
        return {
          name: name,
          meanBefore: left.mean,
          meanAfter: right.mean,
          meanDelta: roundTwo(right.mean - left.mean)
        };
      })
    };
  }

  /**
   * 按名称索引统计行。
   *
   * @param {Array<object>} rows 带 name 的统计行。
   * @returns {Map<string, object>} 名称索引。
   */
  function createRowsByName(rows) {
    return new Map(rows.map(function (row) { return [row.name, row]; }));
  }

  /**
   * 合并两组统计行中的名称并保持首次出现顺序。
   *
   * @param {Array<object>} beforeRows 修改前统计行。
   * @param {Array<object>} afterRows 修改后统计行。
   * @returns {string[]} 去重名称。
   */
  function unionNames(beforeRows, afterRows) {
    return Array.from(new Set(beforeRows.concat(afterRows).map(function (row) { return row.name; })));
  }

  /**
   * 把变化值保留两位小数。
   *
   * @param {number} value 原始变化值。
   * @returns {number} 舍入后的变化值。
   */
  function roundTwo(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * 解析带引号和双引号转义的 CSV 文本。
   *
   * @param {string} text 不含 BOM 的 CSV 文本。
   * @returns {Array<Array<string>>} 单元格矩阵。
   */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        row.push(cell);
        cell = '';
      } else if ((character === '\r' || character === '\n') && !quoted) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        if (character === '\r' && text[index + 1] === '\n') index += 1;
      } else {
        cell += character;
      }
    }

    // 没有换行结尾时也要保留最后一行。
    if (cell !== '' || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  /**
   * 创建带两位序号的字段名。
   *
   * @param {string} prefix 字段前缀。
   * @param {number} count 字段数量。
   * @returns {string[]} 顺序字段名。
   */
  function createNumberedColumns(prefix, count) {
    return Array.from({ length: count }, function (_, index) {
      return prefix + String(index + 1).padStart(2, '0');
    });
  }

  /**
   * 按 RFC 4180 的常用规则转义单个 CSV 单元格。
   *
   * @param {string|number} value 单元格值。
   * @returns {string} 可安全拼入 CSV 的文本。
   */
  function escapeCsvCell(value) {
    const text = String(value);
    if (!/[",\r\n]/.test(text)) return text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return {
    exportSamplesCsv: exportSamplesCsv,
    importSamplesCsv: importSamplesCsv,
    exportSummaryJson: exportSummaryJson,
    importSummaryJson: importSummaryJson,
    exportSongDistributionCsv: exportSongDistributionCsv,
    compareReports: compareReports,
    schemaVersion: SCHEMA_VERSION
  };
});
