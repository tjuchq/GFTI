/**
 * 文件说明：歌曲入选分布页面的交互与展示，只负责适配 Worker 和 DOM。
 */
(function () {
  'use strict';

  const DATA = window.GFTI_DATA;
  const SONG_OVERRIDE_KEY = 'gfti_songs_override_v1';
  const state = {
    worker: null,
    report: null,
    importedCount: 0,
    lastGeneratedRequest: null,
    comparisonBefore: null,
    comparisonAfter: null,
    songSort: { key: 'firstCount', direction: -1 }
  };
  /**
   * 按 id 获取页面元素。
   *
   * @param {string} id 元素 id。
   * @returns {HTMLElement} 对应页面元素。
   */
  const $ = function (id) { return document.getElementById(id); };

  /**
   * 深复制原始歌曲参数，防止统计期间被页面状态修改。
   *
   * @returns {Array<object>} 原始歌曲参数快照。
   */
  function cloneOriginalSongs() {
    return DATA.songs.map(function (song) {
      return { name: song.name, p: song.p.slice() };
    });
  }

  /**
   * 读取后台保存在当前浏览器的生效歌曲参数。
   *
   * @returns {Array<object>} 当前生效歌曲参数快照。
   */
  function loadCurrentSongs() {
    const originals = cloneOriginalSongs();

    try {
      const overrides = JSON.parse(localStorage.getItem(SONG_OVERRIDE_KEY) || '{}');
      return originals.map(function (song) {
        const profile = overrides[song.name];
        return {
          name: song.name,
          p: Array.isArray(profile) && profile.length === 5 ? profile.slice() : song.p.slice()
        };
      });
    } catch (error) {
      return originals;
    }
  }

  /**
   * 按页面选择冻结本次模拟使用的完整数据。
   *
   * @param {string} source 歌曲参数来源。
   * @returns {object} 可传给 Worker 的数据快照。
   */
  function createDataSnapshot(source) {
    return {
      axes: DATA.axes.map(function (axis) { return { pos: axis.pos, neg: axis.neg }; }),
      questions: JSON.parse(JSON.stringify(DATA.questions)),
      songs: source === 'original' ? cloneOriginalSongs() : loadCurrentSongs()
    };
  }

  /**
   * 启动一次新的均匀模拟评测。
   *
   * @returns {void}
   */
  function startRun() {
    stopWorker();

    const sampleCount = Number($('sample-count').value);
    const seed = $('seed').value;
    const source = $('song-source').value;
    const data = createDataSnapshot(source);

    state.importedCount = 0;
    state.lastGeneratedRequest = {
      sampleCount: sampleCount,
      seed: seed,
      source: source,
      data: data
    };
    state.worker = new Worker('simulation-worker.js');
    $('run').disabled = true;
    $('cancel').disabled = false;
    $('progress').value = 0;
    $('progress-text').textContent = '0%';
    $('status').textContent = '正在生成均匀模拟评测……';

    state.worker.onmessage = handleWorkerMessage;
    state.worker.onerror = function () {
      finishWithError('后台计算线程启动失败');
    };
    state.worker.postMessage({
      type: 'run',
      sampleCount: sampleCount,
      seed: seed,
      source: source,
      data: data
    });
  }

  /**
   * 严格读取用户选择的模拟样本 CSV，并交给当前算法复算。
   *
   * @param {Event} event 文件输入事件。
   * @returns {Promise<void>}
   */
  async function importSamples(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const records = window.GFTISimulationArtifacts.importSamplesCsv(await file.text(), {
        questionCount: DATA.questions.length
      });
      const source = $('song-source').value;

      stopWorker();
      state.importedCount = records.length;
      state.lastGeneratedRequest = null;
      state.worker = new Worker('simulation-worker.js');
      state.worker.onmessage = handleWorkerMessage;
      state.worker.onerror = function () { finishWithError('后台计算线程启动失败'); };
      $('run').disabled = true;
      $('cancel').disabled = false;
      $('progress').value = 0;
      $('progress-text').textContent = '0%';
      $('status').textContent = '正在使用当前算法复算导入样本……';
      state.worker.postMessage({
        type: 'runSamples',
        samples: records.map(function (record) { return record.answers; }),
        source: source,
        data: createDataSnapshot(source)
      });
    } catch (error) {
      $('status').textContent = '导入失败：' + error.message;
    } finally {
      // 清空 input 后，同一文件修正后仍可再次选择。
      event.target.value = '';
    }
  }

  /**
   * 接收 Worker 的进度、报告或错误消息。
   *
   * @param {MessageEvent} event Worker 消息事件。
   * @returns {void}
   */
  function handleWorkerMessage(event) {
    const message = event.data;

    if (message.type === 'progress') {
      const percent = Math.round(message.progress.completed * 100 / message.progress.total);
      $('progress').value = percent;
      $('progress-text').textContent = percent + '%';
      return;
    }
    if (message.type === 'error') {
      finishWithError(message.message);
      return;
    }
    if (message.type === 'complete') {
      state.report = message.report;
      stopWorker();
      $('progress').value = 100;
      $('progress-text').textContent = '100%';
      $('status').textContent = state.importedCount
        ? '已导入 ' + state.importedCount + ' 份模拟样本，并用当前算法重新计算。'
        : '模拟完成，结果仅代表均匀答案空间中的抽样频率。';
      renderReport(message.report);
      $('export-samples').disabled = !state.lastGeneratedRequest;
    }
  }

  /**
   * 停止当前 Worker 并恢复运行按钮。
   *
   * @returns {void}
   */
  function stopWorker() {
    if (state.worker) state.worker.terminate();
    state.worker = null;
    $('run').disabled = false;
    $('cancel').disabled = true;
  }

  /**
   * 展示后台计算失败信息，同时保留上一份完整报告。
   *
   * @param {string} message 错误原因。
   * @returns {void}
   */
  function finishWithError(message) {
    stopWorker();
    $('status').textContent = '运行失败：' + message;
  }

  /**
   * 渲染一份完整模拟汇总报告。
   *
   * @param {object} report 模拟汇总报告。
   * @returns {void}
   */
  function renderReport(report) {
    $('report').hidden = false;
    $('snapshot-warning').hidden = true;
    $('metric-samples').textContent = report.sampleCount.toLocaleString('zh-CN');
    $('metric-version').textContent = report.algorithmVersion;
    $('metric-source').textContent = report.source === 'original' ? '原始参数' : '当前生效参数';
    $('metric-first-ties').textContent = report.tieCounts.first.toLocaleString('zh-CN');
    $('metric-cutoff-ties').textContent = report.tieCounts.topFiveBoundary.toLocaleString('zh-CN');
    renderTopChart(report.songStatistics);
    renderProfileStatistics(report.profileStatistics, report.sampleCount);
    renderSongTable(report.songStatistics);
    // 若参数恰好在 Worker 运行期间变化，报告完成时也要立即暴露快照差异。
    checkSnapshotChange();
  }

  /**
   * 检查后台参数是否已偏离报告冻结的生效歌曲参数。
   *
   * @returns {void}
   */
  function checkSnapshotChange() {
    if (!state.report || state.report.source !== 'current') return;
    const changed = JSON.stringify(loadCurrentSongs()) !== JSON.stringify(state.report.songSnapshot);
    $('snapshot-warning').hidden = !changed;
  }

  /**
   * 渲染第一契合率最高的十五首歌曲。
   *
   * @param {Array<object>} statistics 歌曲统计。
   * @returns {void}
   */
  function renderTopChart(statistics) {
    const topSongs = statistics.slice().sort(function (left, right) {
      return right.firstRate - left.firstRate || right.topFiveRate - left.topFiveRate ||
        left.name.localeCompare(right.name, 'zh');
    }).slice(0, 15);
    const maximum = Math.max.apply(null, topSongs.map(function (song) { return song.firstRate; }).concat([1]));

    $('top-chart').innerHTML = topSongs.map(function (song, index) {
      const width = song.firstRate * 100 / maximum;
      return '<div class="bar-row"><span class="rank">' + (index + 1) + '</span>' +
        '<span class="bar-name">' + escapeHtml(song.name) + '</span>' +
        '<span class="bar-track"><i style="width:' + width + '%"></i></span>' +
        '<strong>' + song.firstRate.toFixed(2) + '%</strong></div>';
    }).join('');
  }

  /**
   * 渲染五维均值、范围和十档直方图。
   *
   * @param {Array<object>} statistics 五维气韵统计。
   * @param {number} sampleCount 样本总数。
   * @returns {void}
   */
  function renderProfileStatistics(statistics, sampleCount) {
    $('profile-grid').innerHTML = statistics.map(function (axis) {
      const maximum = Math.max.apply(null, axis.bins.concat([1]));
      const bins = axis.bins.map(function (count, index) {
        const height = Math.max(2, count * 100 / maximum);
        const label = (index * 10) + '–' + (index === 9 ? 100 : index * 10 + 9) + '：' +
          count + ' 次，' + (count * 100 / sampleCount).toFixed(2) + '%';
        return '<i title="' + label + '" aria-label="' + label + '" style="height:' + height + '%"></i>';
      }).join('');
      return '<article class="axis-card"><h3>' + escapeHtml(axis.name) + '</h3>' +
        '<p>均值 <strong>' + axis.mean.toFixed(2) + '</strong> · ' + axis.min + '–' + axis.max + '</p>' +
        '<div class="histogram">' + bins + '</div></article>';
    }).join('');
  }

  /**
   * 渲染全部歌曲的可排序基础表格。
   *
   * @param {Array<object>} statistics 歌曲统计。
   * @returns {void}
   */
  function renderSongTable(statistics) {
    const sort = state.songSort;
    const sorted = statistics.slice().sort(function (left, right) {
      const leftValue = left[sort.key];
      const rightValue = right[sort.key];
      const comparison = typeof leftValue === 'string'
        ? leftValue.localeCompare(rightValue, 'zh')
        : leftValue - rightValue;
      return comparison * sort.direction || left.name.localeCompare(right.name, 'zh');
    });

    $('song-table-body').innerHTML = sorted.map(function (song, index) {
      const zeroClass = song.firstCount === 0 ? ' class="zero"' : '';
      return '<tr' + zeroClass + ' data-first-count="' + song.firstCount +
        '" data-top-five-count="' + song.topFiveCount + '"><td>' + (index + 1) + '</td><td>' +
        escapeHtml(song.name) + '</td><td>' + song.firstCount + '</td><td>' +
        song.firstRate.toFixed(2) + '%</td><td>' + song.topFiveCount + '</td><td>' +
        song.topFiveRate.toFixed(2) + '%</td></tr>';
    }).join('');
  }

  /**
   * 切换全部歌曲表格的排序字段或方向。
   *
   * @param {string} key 歌曲统计字段。
   * @returns {void}
   */
  function changeSongSort(key) {
    if (state.songSort.key === key) {
      state.songSort.direction *= -1;
    } else {
      state.songSort = { key: key, direction: key === 'name' ? 1 : -1 };
    }
    if (state.report) renderSongTable(state.report.songStatistics);
  }

  /**
   * 转义来自数据文件的文本，避免通过 innerHTML 注入标记。
   *
   * @param {string} value 原始文本。
   * @returns {string} HTML 安全文本。
   */
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  /**
   * 触发浏览器下载一份 UTF-8 文本文件。
   *
   * @param {string} filename 下载文件名。
   * @param {string} content 文件内容。
   * @param {string} type MIME 类型。
   * @returns {void}
   */
  function downloadText(filename, content, type) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));

    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  /**
   * 下载包含复现上下文的完整模拟汇总报告。
   *
   * @returns {void}
   */
  function exportSummary() {
    if (!state.report) return;
    downloadText(
      'summary.json',
      window.GFTISimulationArtifacts.exportSummaryJson(state.report),
      'application/json'
    );
  }

  /**
   * 下载一歌一行的歌曲入选分布 CSV。
   *
   * @returns {void}
   */
  function exportSongDistribution() {
    if (!state.report) return;
    downloadText(
      'song-distribution.csv',
      window.GFTISimulationArtifacts.exportSongDistributionCsv(state.report),
      'text/csv'
    );
  }

  /**
   * 在 Worker 中用相同种子重放样本，并按需生成大 CSV。
   *
   * @returns {void}
   */
  function exportSamples() {
    if (!state.lastGeneratedRequest || state.worker) return;

    const request = state.lastGeneratedRequest;
    state.worker = new Worker('simulation-worker.js');
    $('run').disabled = true;
    $('cancel').disabled = false;
    $('status').textContent = '正在重放同一批样本并生成 samples.csv……';
    state.worker.onmessage = function (event) {
      const message = event.data;

      if (message.type === 'progress') {
        const percent = Math.round(message.progress.completed * 100 / message.progress.total);
        $('progress').value = percent;
        $('progress-text').textContent = percent + '%';
      } else if (message.type === 'samplesCsv') {
        stopWorker();
        downloadText('samples.csv', message.csv, 'text/csv');
        $('status').textContent = 'samples.csv 已生成；页面未长期保留逐条样本。';
      } else if (message.type === 'error') {
        finishWithError(message.message);
      }
    };
    state.worker.postMessage(Object.assign({ type: 'exportSamples' }, request));
  }

  /**
   * 读取一侧模拟汇总报告，并在两侧齐备时展示变化。
   *
   * @param {'before'|'after'} side 报告位置。
   * @param {Event} event 文件输入事件。
   * @returns {Promise<void>}
   */
  async function loadComparisonReport(side, event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const report = window.GFTISimulationArtifacts.importSummaryJson(await file.text());
      if (side === 'before') state.comparisonBefore = report;
      else state.comparisonAfter = report;

      $('comparison-status').textContent = '已读取 ' + file.name;
      if (state.comparisonBefore && state.comparisonAfter) renderComparison();
    } catch (error) {
      $('comparison-status').textContent = '报告读取失败：' + error.message;
    }
  }

  /**
   * 渲染两份报告的歌曲频率与五维均值变化。
   *
   * @returns {void}
   */
  function renderComparison() {
    const comparison = window.GFTISimulationArtifacts.compareReports(
      state.comparisonBefore,
      state.comparisonAfter
    );

    $('comparison').hidden = false;
    $('comparison-versions').textContent = comparison.algorithmVersions.before + ' → ' +
      comparison.algorithmVersions.after;
    $('comparison-profiles').innerHTML = comparison.profileChanges.map(function (axis) {
      return '<span>' + escapeHtml(axis.name) + '：' + formatDelta(axis.meanDelta) + '</span>';
    }).join('');
    $('comparison-song-body').innerHTML = comparison.songChanges.slice().sort(function (left, right) {
      return Math.abs(right.firstRateDelta) - Math.abs(left.firstRateDelta);
    }).map(function (song) {
      return '<tr><td>' + escapeHtml(song.name) + '</td><td>' +
        formatDelta(song.firstRateDelta) + '</td><td>' + formatDelta(song.topFiveRateDelta) + '</td></tr>';
    }).join('');
  }

  /**
   * 把百分点变化格式化成带符号的两位小数。
   *
   * @param {number} value 变化值。
   * @returns {string} 可直接展示的变化。
   */
  function formatDelta(value) {
    return (value >= 0 ? '+' : '') + value.toFixed(2);
  }

  $('run').addEventListener('click', startRun);
  $('samples-file').addEventListener('change', importSamples);
  $('export-summary').addEventListener('click', exportSummary);
  $('export-songs').addEventListener('click', exportSongDistribution);
  $('export-samples').addEventListener('click', exportSamples);
  $('compare-before').addEventListener('change', function (event) {
    loadComparisonReport('before', event);
  });
  $('compare-after').addEventListener('change', function (event) {
    loadComparisonReport('after', event);
  });
  $('song-table').addEventListener('click', function (event) {
    const button = event.target.closest('[data-sort]');
    if (button) changeSongSort(button.dataset.sort);
  });
  window.addEventListener('storage', function (event) {
    if (event.key === SONG_OVERRIDE_KEY) checkSnapshotChange();
  });
  $('cancel').addEventListener('click', function () {
    if (!state.worker) return;
    stopWorker();
    $('status').textContent = '本次运行已取消，上一份完整报告仍然保留。';
  });
})();
