/**
 * 文件说明：通过命令行 interface 验证算法版本与唯一基线的一键更新流程。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * 创建只包含算法更新命令所需文件的临时项目。
 *
 * @returns {string} 临时项目根目录。
 */
function createTemporaryProject() {
  const sourceRoot = path.resolve(__dirname, '..');
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gfti-algorithm-'));
  const fixtureDirectory = path.join(projectRoot, 'tests', 'fixtures');

  fs.mkdirSync(fixtureDirectory, { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, 'assessment.js'), path.join(projectRoot, 'assessment.js'));
  fs.copyFileSync(path.join(sourceRoot, 'data.js'), path.join(projectRoot, 'data.js'));
  fs.copyFileSync(
    path.join(sourceRoot, 'tests', 'fixtures', 'algorithm-baseline.json'),
    path.join(fixtureDirectory, 'algorithm-baseline.json')
  );
  return projectRoot;
}

/**
 * 根据当前算法版本生成下一个修订版本，避免测试与某个正式版本绑定。
 *
 * @param {string} currentVersion 当前已批准的算法版本。
 * @returns {string} 修订号增加一后的算法版本。
 */
function createNextPatchVersion(currentVersion) {
  const parts = currentVersion.split('.').map(Number);

  // 正式基线已经约束为三段式版本；这里只推进修订号来测试升级流程。
  parts[2] += 1;
  return parts.join('.');
}

test('算法基线更新命令会同时更新版本和固定输出', function () {
  const sourceRoot = path.resolve(__dirname, '..');
  const projectRoot = createTemporaryProject();
  const originalBaseline = require('./fixtures/algorithm-baseline.json');
  const nextVersion = createNextPatchVersion(originalBaseline.algorithmVersion);

  try {
    // 从临时项目根目录调用正式命令，避免测试改写当前工作区。
    const result = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'scripts', 'update-algorithm-baseline.cjs'), nextVersion],
      { cwd: projectRoot, encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(
      fs.readFileSync(path.join(projectRoot, 'assessment.js'), 'utf8')
        .includes("ALGORITHM_VERSION = '" + nextVersion + "'")
    );

    const updatedBaseline = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'tests', 'fixtures', 'algorithm-baseline.json'),
      'utf8'
    ));
    assert.equal(updatedBaseline.algorithmVersion, nextVersion);
    assert.deepEqual(updatedBaseline.answers, originalBaseline.answers);
    assert.deepEqual(updatedBaseline.expected, originalBaseline.expected);
  } finally {
    // 临时项目不含用户数据，命令测试结束后立即清理。
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
