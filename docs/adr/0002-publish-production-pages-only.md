# GitHub Pages 只发布正式评测页面

GitHub Pages 使用自定义 GitHub Actions 工作流发布。工作流先运行完整测试，再通过白名单生成 `dist-pages`：只包含 `index.html`、`app.js`、`assessment.js`、`data.js` 和 `.nojekyll`。均匀模拟评测页面、测试、文档和开发脚本保留在仓库中，但不进入 Pages 发布包。

## Consequences

模拟诊断页只能通过本地开发服务器使用，直接访问 Pages 上的 `simulation.html` 会返回 404。新增正式页面资源时，必须同时更新 `scripts/build-pages.cjs` 的白名单和 `tests/pages-build.test.cjs` 的期望文件列表。公开页面仍需要下载 `assessment.js`，因此评测公式不是保密代码。
