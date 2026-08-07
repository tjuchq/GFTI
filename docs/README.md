# 开发者文档

这组文档写给第一次接触本项目的开发者。阅读时不要求你预先了解评测算法、Web Worker、Playwright 或蒙特卡洛抽样。

建议按下面的顺序阅读：

1. [开发说明](./development.md)：先把项目运行起来，了解常用修改流程。
2. [架构说明](./architecture.md)：弄清各文件负责什么，数据如何流动。
3. [算法说明](./algorithm.md)：理解五维气韵、歌曲排序和均匀模拟评测。
4. [测试说明](./testing.md)：运行测试，并为改动补回归测试。

领域词汇统一记录在仓库根目录的 [`CONTEXT.md`](../CONTEXT.md)。设计决策记录在 [`docs/adr/`](./adr/) 中。

## 两个页面

项目没有后端业务服务，也没有构建步骤。浏览器直接加载仓库里的 HTML 和 JavaScript 文件。

| 页面 | 用途 | 地址 |
| --- | --- | --- |
| 普通评测页 | 用户完成二十道题并查看五维气韵与契合歌曲 | `http://127.0.0.1:8777/index.html` |
| 模拟诊断页 | 开发者生成均匀模拟评测，查看歌曲入选分布 | `http://127.0.0.1:8777/simulation.html` |

不要双击 `simulation.html` 后用 `file://` 地址运行。浏览器会阻止页面创建 Web Worker，点击“开始模拟”后无法计算。启动方式见[开发说明](./development.md#第一次运行)。

## 不确定从哪里改

| 你想做的事 | 先看哪里 |
| --- | --- |
| 修改题目、选项权重或歌曲参数 | [`data.js`](../data.js) 和[算法说明](./algorithm.md) |
| 修改普通答题页面 | [`index.html`](../index.html)、[`app.js`](../app.js) |
| 修改评测公式或歌曲排序 | [`assessment.js`](../assessment.js) |
| 修改随机样本或统计口径 | [`simulation.js`](../simulation.js) |
| 修改 CSV、JSON 导入导出 | [`simulation-artifacts.js`](../simulation-artifacts.js) |
| 修改模拟诊断页面 | [`simulation.html`](../simulation.html)、[`simulation-page.js`](../simulation-page.js) |
| 修改后台计算 | [`simulation-worker.js`](../simulation-worker.js) |
| 添加或修改测试 | [`tests/`](../tests/) 和[测试说明](./testing.md) |

## 修改评测算法的三条命令

修改 [`assessment.js`](../assessment.js) 后，按顺序运行下面三条命令。

第一步，先运行算法测试，确认新实现是否改变了评测结果：

```powershell
npm run test:assessment
```

第二步，批准新版本并更新旧基准。当前版本是 `1.0.2`，所以下一个示例版本是 `1.0.3`：

```powershell
npm run algorithm:update-baseline -- 1.0.3
```

第三步，检查生成的差异符合预期后，运行完整测试：

```powershell
npm test
```

如果只是拆函数、改名称、整理结构或补注释，不要运行第二条命令，也不要更新算法版本。此时算法测试应保持原有输出完全不变。完整流程和差异检查方法见[开发说明中的“修改评测算法”](./development.md#修改评测算法)。
