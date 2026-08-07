/**
 * 文件说明：生成 GitHub Pages 发布目录，只复制正式古风气韵评测所需文件。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(process.argv[2] || path.join(projectRoot, 'dist-pages'));
const publishedFiles = ['index.html', 'app.js', 'assessment.js', 'data.js'];

/**
 * 确保目标目录可以安全写入，不覆盖已有文件。
 *
 * @param {string} directory 发布目录绝对路径。
 * @returns {void}
 */
function prepareOutputDirectory(directory) {
  if (directory === projectRoot || directory === path.parse(directory).root) {
    throw new Error('Pages 发布目录不能是项目根目录或磁盘根目录');
  }

  fs.mkdirSync(directory, { recursive: true });
  if (fs.readdirSync(directory).length > 0) {
    throw new Error('Pages 发布目录必须为空：' + directory);
  }
}

/**
 * 复制正式页面资源，并清理只供本地开发使用的模拟入口。
 *
 * @returns {void}
 */
function buildPagesArtifact() {
  prepareOutputDirectory(outputDirectory);

  publishedFiles.forEach(function (fileName) {
    const sourcePath = path.join(projectRoot, fileName);
    const destinationPath = path.join(outputDirectory, fileName);

    if (fileName === 'index.html') {
      // 只修改发布副本；本地后台仍可保留前往模拟诊断页的入口。
      const source = fs.readFileSync(sourcePath, 'utf8');
      const publishedSource = source.replace(
        /\s*<a class="nav" id="ad-simulation" href="simulation\.html">[^<]*<\/a>/,
        ''
      );
      fs.writeFileSync(destinationPath, publishedSource, 'utf8');
      return;
    }

    fs.copyFileSync(sourcePath, destinationPath);
  });

  // 禁用 Jekyll 处理，让 Pages 原样发布白名单中的静态文件。
  fs.writeFileSync(path.join(outputDirectory, '.nojekyll'), '', 'utf8');
  process.stdout.write('GitHub Pages 发布包已生成：' + outputDirectory + '\n');
}

buildPagesArtifact();
