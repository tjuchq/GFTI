/**
 * 文件说明：批准一次有意的算法变化，同时更新算法版本和唯一固定输出基线。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = process.cwd();
const assessmentPath = path.join(projectRoot, 'assessment.js');
const dataPath = path.join(projectRoot, 'data.js');
const baselinePath = path.join(projectRoot, 'tests', 'fixtures', 'algorithm-baseline.json');

/**
 * 把三段式版本号转换成可比较的整数数组。
 *
 * @param {string} version 待解析版本号。
 * @returns {number[]} 主版本、次版本和修订版本。
 */
function parseVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new TypeError('新算法版本必须使用 x.y.z 格式，例如 1.0.2');
  }
  return version.split('.').map(Number);
}

/**
 * 判断候选版本是否严格高于当前版本。
 *
 * @param {string} candidate 候选版本。
 * @param {string} current 当前已批准版本。
 * @returns {boolean} 候选版本是否更高。
 */
function isHigherVersion(candidate, current) {
  const left = parseVersion(candidate);
  const right = parseVersion(current);

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

/**
 * 在 Node.js 中读取浏览器格式的生产数据。
 *
 * @returns {object} 当前题目、歌曲和五维定义。
 */
function loadProductionData() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(dataPath, 'utf8'), context, { filename: dataPath });
  return JSON.parse(JSON.stringify(context.window.GFTI_DATA));
}

/**
 * 生成并写入新算法基线。
 *
 * @returns {void}
 */
function updateAlgorithmBaseline() {
  const newVersion = process.argv[2];
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const assessmentSource = fs.readFileSync(assessmentPath, 'utf8');
  const versionMatch = assessmentSource.match(/const ALGORITHM_VERSION = '(\d+\.\d+\.\d+)';/);

  if (!newVersion) {
    throw new TypeError('请提供新算法版本，例如 npm run algorithm:update-baseline -- 1.0.2');
  }
  if (!versionMatch) {
    throw new Error('无法在 assessment.js 中找到唯一的 ALGORITHM_VERSION');
  }
  if (!isHigherVersion(newVersion, baseline.algorithmVersion)) {
    throw new Error('新算法版本必须高于已批准版本 ' + baseline.algorithmVersion);
  }
  if (versionMatch[1] !== baseline.algorithmVersion && versionMatch[1] !== newVersion) {
    throw new Error('assessment.js 的版本与当前基线或目标版本不一致');
  }

  const data = loadProductionData();
  const currentAssessment = require(assessmentPath);
  const assessment = currentAssessment.createAssessment(data);

  if (!Array.isArray(baseline.answers) || baseline.answers.length !== data.questions.length) {
    throw new Error('算法基线中的固定答案数量与当前题目数量不一致');
  }

  const nextBaseline = {
    algorithmVersion: newVersion,
    answers: baseline.answers,
    expected: assessment.evaluate(baseline.answers, { topN: 5 })
  };
  const nextAssessmentSource = assessmentSource.replace(
    versionMatch[0],
    "const ALGORITHM_VERSION = '" + newVersion + "';"
  );

  // 两个文件都准备完成后再写入，避免计算失败时留下半成品。
  fs.writeFileSync(assessmentPath, nextAssessmentSource, 'utf8');
  fs.writeFileSync(baselinePath, JSON.stringify(nextBaseline, null, 2) + '\n', 'utf8');

  process.stdout.write(
    '算法基线已从 ' + baseline.algorithmVersion + ' 更新到 ' + newVersion +
    '。请检查 Git 差异并补充算法说明。\n'
  );
}

try {
  updateAlgorithmBaseline();
} catch (error) {
  process.stderr.write('算法基线更新失败：' + error.message + '\n');
  process.exitCode = 1;
}
