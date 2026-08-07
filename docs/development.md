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

算法只在 [`assessment.js`](../assessment.js) 中实现。第一次修改算法时，先记住下面三个文件的分工：

| 文件 | 谁来修改 | 用途 |
| --- | --- | --- |
| [`assessment.js`](../assessment.js) | 开发者修改算法；更新命令修改版本号 | 正式算法实现 |
| [`tests/fixtures/algorithm-baseline.json`](../tests/fixtures/algorithm-baseline.json) | 只由更新命令生成 | 唯一已批准的固定答案和完整输出 |
| [`tests/page.integration.spec.cjs`](../tests/page.integration.spec.cjs) | 通常不需要修改 | 验证页面正确展示算法返回结果 |

不要在 `app.js`、`simulation.js` 或页面测试中复制评测公式和固定结果。

### 最短修改流程

假设你已经修改了 `assessment.js`，并准备把变化作为正式新算法发布：

1. 保存 `assessment.js`。
2. 运行算法测试：

   ```powershell
   npm run test:assessment
   ```

3. 如果失败信息提示“算法行为已变化”，说明唯一基线成功发现了新输出。打开 `tests/fixtures/algorithm-baseline.json` 查看当前版本，例如 `1.0.1`，然后选择更高版本，例如 `1.0.2`。
4. 运行更新命令：

   ```powershell
   npm run algorithm:update-baseline -- 1.0.2
   ```

5. 命令会自动完成两件事：

   - 把 `assessment.js` 中的 `algorithmVersion` 更新为 `1.0.2`。
   - 使用固定答案重新计算，并覆盖唯一算法基线。

6. 检查生成的差异：

   ```powershell
   git diff -- assessment.js tests/fixtures/algorithm-baseline.json
   ```

   重点确认五维气韵、歌曲顺序、距离和相似度的变化符合需求。不要因为命令成功就直接提交。
7. 如果公式、参数或排序规则改变，同步更新[算法说明](./algorithm.md)。命令只能计算结果，不能解释算法含义。
8. 运行完整测试：

   ```powershell
   npm test
   ```

完整测试通过后，才能提交和推送。推送到 `main` 后，GitHub Actions 会重新测试并部署正式页面。

### 哪些文件不需要跟着改

有意修改算法时，通常不需要手工修改：

- `tests/page.integration.spec.cjs`：它会从公开评测 interface 获取期望结果。
- `tests/fixtures/algorithm-baseline.json`：由更新命令生成，不要复制粘贴输出。
- `simulation.js`：模拟诊断本来就调用同一个 `assessment.evaluate()`。
- GitHub Pages 工作流：它只负责测试、打包和部署。

算法测试还会检查输入错误、结果范围、距离排序等稳定规则。如果更新基线后这些测试仍然失败，说明新算法改变了公开规则，不能靠重复运行命令解决。此时应阅读失败的测试名称，确认新规则是否真的要取消或修改。

### 只重构、不改变结果

如果只是改函数名、拆函数、补注释或整理代码结构，并不打算改变任何评测结果：

1. 不要运行基线更新命令。
2. 不要更新算法版本。
3. 运行 `npm run test:assessment`。
4. 如果基线失败，应修正实现，让原有输出恢复一致。

基线更新命令代表“人工批准算法行为变化”，不是让失败测试变绿的通用修复命令。

### 公开 interface

`assessment.js` 对外提供：

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

当前实现会在原始计分后只拉伸参与者五维气韵。歌曲参数是最终坐标，不参与拉伸。公式与配置见[算法说明](./algorithm.md#参与者五维气韵如何拉伸)。

若要比较新旧算法的整体分布，准备一份固定的 `samples.csv`，分别用两个版本重新计算，再比较两份 `summary.json`。不要为新旧版本各生成一批随机答案。

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

Pages 不直接发布仓库根目录。推送到 `main` 后，[`deploy-pages.yml`](../.github/workflows/deploy-pages.yml) 会运行完整测试，生成白名单发布包，再部署正式评测页面。

```text
<Pages 根地址>/index.html
```

`<Pages 根地址>/simulation.html` 应返回 404，这是有意设置的发布边界。模拟诊断页继续通过本地服务器访问。

第一次部署前，在仓库 `Settings → Pages → Build and deployment` 中把来源设为 `GitHub Actions`。之后可以推送 `main` 自动部署，也可以在 Actions 页面手动运行“测试并部署 GitHub Pages”。

本地检查发布包：

```powershell
npm run build:pages
```

结果写入 `dist-pages/`，该目录已被 Git 忽略。若目录已有文件，脚本会停止，避免覆盖不明内容；检查完成后可以手动清空该目录再重新生成。

### 修改算法后 Actions 部署失败

先查看失败步骤：

- `运行完整测试` 失败：在本地运行 `npm test`，处理相同测试错误。算法基线不一致时，按“最短修改流程”批准新版本。
- `配置 GitHub Pages` 返回 404：仓库尚未在 `Settings → Pages` 中把来源设为 `GitHub Actions`。
- `部署 GitHub Pages` 失败：先确认测试和“上传正式页面发布包”步骤已经成功，再查看该步骤的具体权限或环境错误。

修复代码后需要创建新提交并推送。直接重跑旧的失败任务仍然使用旧提交，不会包含本地修复。

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
