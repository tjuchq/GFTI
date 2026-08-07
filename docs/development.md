# 开发说明

## 开发环境

你需要：

- Git，用来查看和提交改动。
- Node.js 和 npm，用来运行测试与本地静态服务器。
- 一个现代浏览器。浏览器集成测试使用 Chromium。

项目没有打包器，也没有 TypeScript 编译步骤。修改 `.html`、`.js` 或 `.md` 后保存文件，刷新浏览器即可看到变化。

## 第一次运行

在仓库根目录打开 PowerShell：

```powershell
npm install
node tests/test-server.cjs
```

终端出现下面的地址后，不要关闭这个终端：

```text
GFTI test server: http://127.0.0.1:8777
```

然后在浏览器打开：

```text
http://127.0.0.1:8777/index.html
```

模拟诊断页是：

```text
http://127.0.0.1:8777/simulation.html
```

停止服务器时，在运行服务器的终端按 `Ctrl+C`。

### 为什么不能双击 simulation.html

双击文件后，地址会以 `file://` 开头。模拟页使用 Web Worker 处理最多一百万次计算，浏览器通常会阻止本地文件加载 Worker。结果是点击“开始模拟”后没有计算。

本地开发时始终通过 `http://127.0.0.1:8777` 打开。部署到 GitHub Pages 后使用 HTTPS，也可以正常运行。

## 常用地址

| 地址 | 用途 |
| --- | --- |
| `/index.html` | 普通评测 |
| `/index.html?admin=1` | 歌曲参数后台 |
| `/simulation.html` | 模拟诊断 |

歌曲参数后台的修改保存在当前浏览器。换浏览器、清理站点数据或点击“还原为原始参数”后，本地覆盖会消失。

## 修改数据

题目、选项权重、维度名称和原始歌曲参数都在 [`data.js`](../data.js)。五维数组顺序固定为：

```text
古典 / 旁征博引 / 含蓄蕴藉 / 致密沉实 / 精心构架
```

歌曲格式：

```js
{
  "name": "歌曲名",
  "p": [80, 40, 65, 70, 55]
}
```

五个数分别对应上面的五个维度。修改后至少运行：

```powershell
npm run test:assessment
npm run test:integration
```

也可以先在 `/index.html?admin=1` 调整歌曲参数。后台会保存本地覆盖，并能导出新的 `data.js`。导出文件替换仓库文件前，要检查 Git 差异并运行完整测试。

## 修改普通评测页面

页面结构和样式在 [`index.html`](../index.html)，交互在 [`app.js`](../app.js)。

`app.js` 应只负责这些工作：

- 保存当前题号和答案。
- 切换页面场景。
- 调用 `assessment.js`。
- 把结果渲染到页面。
- 维护歌曲参数后台和分享卡片。

如果改动涉及“某个答案应该加多少分”“相似度怎么算”，不要写进 `app.js`，应修改 `assessment.js` 并补算法测试。

## 修改评测算法

算法只在 [`assessment.js`](../assessment.js) 中实现。它的公开内容是：

```js
{
  createAssessment,
  algorithmVersion
}
```

典型调用：

```js
const assessment = createAssessment({ questions, songs });
const result = assessment.evaluate(answers, { topN: 5 });
```

返回值包括 `profile` 和 `matches`。字段说明见[算法说明](./algorithm.md)。

修改公式、计分或排序规则时：

1. 先写失败测试。
2. 修改算法。
3. 更新 `algorithmVersion`。
4. 使用固定答案确认变化符合需求。
5. 使用同一份 `samples.csv` 比较修改前后的分布。

只改函数名、注释或文件结构时，不要更新算法版本。

## 修改模拟诊断

先判断改动属于哪一层：

- 随机答案或统计口径：改 `simulation.js`。
- CSV、JSON 或报告比较：改 `simulation-artifacts.js`。
- Worker 消息和后台运行：改 `simulation-worker.js`。
- 表单、图表、表格或提示：改 `simulation-page.js` 和 `simulation.html`。

不要把评测公式复制到这些文件。模拟功能必须调用 `assessment.js`，否则普通页面和统计页面可能得到不同结果。

## 三种导出文件

### summary.json

完整的模拟汇总报告。它包含算法版本、随机规则、题目指纹、歌曲参数快照、歌曲统计和五维统计。比较算法前后结果时优先保留这个文件。

### song-distribution.csv

一首歌曲一行，适合用 Excel、Python 或 R 排序和画图。它不包含完整的嵌套参数快照。

### samples.csv

一次模拟一行，包含二十道答案、五维气韵和第一契合歌曲。页面只在用户点击导出时重放同一随机种子并生成它。

导入 `samples.csv` 后，页面只信任答案列。五维气韵和第一契合歌曲会使用当前 `assessment.js` 重新计算。

## GitHub Pages 部署

项目是静态文件，GitHub Pages 应发布仓库根目录中的 HTML 和 JavaScript。部署后确认下面两个地址都能访问：

```text
<Pages 根地址>/index.html
<Pages 根地址>/simulation.html
```

如果普通评测正常而模拟页无反应，先在浏览器开发者工具中检查 `simulation-worker.js`、`assessment.js` 和 `simulation.js` 是否返回 404。部署路径区分大小写。

## 常见问题

### 点击“开始模拟”没有反应

先看地址栏。如果地址以 `file://` 开头，请启动本地服务器并改用 `http://127.0.0.1:8777/simulation.html`。

如果已经通过 HTTP 或 HTTPS 打开，查看浏览器控制台是否有 Worker 脚本 404 或 JavaScript 错误。

### 统计结果每次不同

检查随机种子是否相同，也要检查样本数、算法版本、题目指纹和歌曲参数快照。只比较种子不够。

### 一百万样本运行较慢

这是当前 CPU 计算路径的预期表现。运行期间可以观察进度或点击取消；页面不会把全部样本长期保存在内存中。不同浏览器和设备的完成时间会有明显差异。

### 当前参数和原始参数有什么区别

原始参数来自 `data.js`。当前参数还包括歌曲参数后台保存在本浏览器中的覆盖值。报告中的 `source` 和 `songSnapshot` 记录了本次实际使用的数据。

### 修改算法后旧报告无法直接解释

先检查 `algorithmVersion`。如果版本不同，使用同一份 `samples.csv` 在新算法下重新计算，再比较两份 `summary.json`。
