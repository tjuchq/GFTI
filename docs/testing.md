# 测试说明

## 测试要解决什么问题

这个项目最需要防住两类回归：

1. 重构后，同一份答案得到不同的五维气韵或歌曲顺序。
2. 模拟统计看似能运行，但随机样本、导入导出或页面接线发生变化。

测试分成纯逻辑测试和浏览器集成测试。纯逻辑测试运行快，适合锁定公式和数据格式；浏览器测试负责确认真实点击流程。

## 第一次运行测试

先安装 Node.js。项目没有声明最低 Node.js 版本，当前代码已在 Node.js 22 下验证。

在仓库根目录运行：

```powershell
npm install
npm test
```

`npm test` 会依次运行评测算法测试、模拟测试和浏览器集成测试。任意一组失败，命令都会返回非零退出码。

如果 Playwright 提示缺少 Chromium，再运行：

```powershell
npx playwright install chromium
```

## 测试分层

### 评测算法测试

命令：

```powershell
npm run test:assessment
```

文件：[`tests/assessment.test.cjs`](../tests/assessment.test.cjs)

这里验证：

- 模块公开明确的算法版本。
- 手算用例得到固定的五维气韵、距离和相似度。
- 缺少答案或未知选项会被拒绝。
- 距离保留两位后并列时，歌曲按中文名称排序。
- 生产数据中的固定答案保持现有完整输出。

最后一项是算法重构的安全网。除非产品明确决定修改算法，否则不要因为测试失败就更新期望值。

### 模拟与交换格式测试

命令：

```powershell
npm run test:simulation
```

文件：

- [`tests/simulation.test.cjs`](../tests/simulation.test.cjs)
- [`tests/simulation-artifacts.test.cjs`](../tests/simulation-artifacts.test.cjs)

这些测试验证固定种子样本、歌曲统计、五维直方图、并列统计、参数快照、题目指纹、CSV、JSON 和报告比较。

固定种子测试使用字面量答案作为期望值。不要在测试里重新实现随机算法或计分公式来计算期望值，否则生产代码和测试可能一起写错，测试仍然通过。

### 浏览器集成测试

命令：

```powershell
npm run test:integration
```

相关文件：

- [`tests/page.integration.spec.cjs`](../tests/page.integration.spec.cjs)
- [`tests/simulation-page.integration.spec.cjs`](../tests/simulation-page.integration.spec.cjs)
- [`playwright.config.cjs`](../playwright.config.cjs)
- [`tests/test-server.cjs`](../tests/test-server.cjs)

Playwright 会启动本地静态服务器，然后用真实 Chromium 点击页面。当前覆盖普通评测完整答题，以及模拟页的运行、取消、排序、导入、导出、报告比较、参数来源和样本档位。

自动测试会实际运行十万样本，并检查一百万样本档位可以选择。为了控制持续集成耗时，一百万样本的完整性能由开发者手动测试。

浏览器测试固定使用一个 worker，避免多个测试同时争用端口或让大样本测试相互影响。

## 本地测试服务器

测试服务器监听：

```text
http://127.0.0.1:8777
```

它只提供仓库里的静态文件，并拒绝跳出仓库路径的请求。Playwright 通常会自动启动它。

如果看到下面的错误：

```text
EADDRINUSE: address already in use 127.0.0.1:8777
```

说明 8777 端口已经有服务。先访问 `http://127.0.0.1:8777/index.html`；如果页面能打开，可以继续使用。若服务不是本项目，再关闭占用该端口的进程。

## 如何为改动补测试

遵循红、绿两个步骤：

1. 先写一个能复现问题或描述新行为的测试，运行它并确认失败。
2. 只写足够的实现让测试通过，再运行相关测试和 `npm test`。

按改动位置选择测试入口：

| 改动 | 测试放置位置 |
| --- | --- |
| 五维计分、距离、相似度、歌曲排序 | `assessment.test.cjs` |
| 固定种子、批量统计、参数快照 | `simulation.test.cjs` |
| CSV、JSON、报告比较 | `simulation-artifacts.test.cjs` |
| 用户点击、页面文字、下载、Worker 接线 | `*.integration.spec.cjs` |

测试名称应描述用户或调用者观察到的行为。例如“固定种子会生成完全相同的模拟样本集”比“调用 createRandom 三次”更稳。前者允许内部重构，后者把测试绑在实现细节上。

## 修改算法时怎么测试

如果产品决定修改算法，按下面的顺序做：

1. 用旧代码和固定答案保存当前输出。
2. 准备固定的 `samples.csv`，不要为修改前后分别生成随机数据。
3. 先添加描述新规则的失败测试。
4. 修改 `assessment.js`，同时更新 `algorithmVersion`。
5. 运行 `npm run test:assessment`。
6. 导入同一份 `samples.csv` 生成新报告，与旧 `summary.json` 比较。
7. 运行完整的 `npm test`。

只有算法需求确实改变时，才能更新“生产数据的固定答案保持现有完整输出”这条测试。提交说明要写清楚公式或排序为什么改变。

## 提交前检查

```powershell
npm test
git diff --check
git status --short
```

确认没有把 `node_modules/`、`test-results/` 或 `playwright-report/` 加入 Git。这些目录已经写入 `.gitignore`。
