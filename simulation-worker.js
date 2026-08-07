/**
 * 文件说明：在独立线程中运行均匀模拟评测，并把进度和完整报告发送给页面。
 */
'use strict';

importScripts('assessment.js', 'simulation.js', 'simulation-artifacts.js');

/**
 * 处理页面发来的模拟请求。
 *
 * @param {MessageEvent} event Worker 消息事件。
 * @returns {void}
 */
self.onmessage = function (event) {
  const message = event.data;
  if (!message || !['run', 'runSamples', 'exportSamples'].includes(message.type)) return;

  try {
    const data = message.data;
    const assessment = self.GFTIAssessment.createAssessment(data);
    const simulation = self.GFTISimulation.createSimulation({
      questions: data.questions,
      songs: data.songs,
      axes: data.axes,
      assessment: assessment,
      algorithmVersion: self.GFTIAssessment.algorithmVersion
    });
    const request = {
      source: message.source,
      onProgress: function (progress) {
        self.postMessage({ type: 'progress', progress: progress });
      }
    };

    // 导入模式使用 CSV 中的答案；普通模式在 Worker 内逐条生成，避免占用页面内存。
    if (message.type === 'runSamples') {
      request.samples = message.samples;
    } else {
      request.sampleCount = message.sampleCount;
      request.seed = message.seed;
      request.includeSampleRecords = message.type === 'exportSamples';
    }
    const report = simulation.run(request);

    if (message.type === 'exportSamples') {
      self.postMessage({
        type: 'samplesCsv',
        csv: self.GFTISimulationArtifacts.exportSamplesCsv(report.sampleRecords, {
          questionCount: data.questions.length
        })
      });
      return;
    }
    self.postMessage({ type: 'complete', report: report });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error) });
  }
};
