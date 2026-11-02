# 古风TI · 听雨楼雅集

一套古风歌曲的气质评测：**二十道情境题 → 五维气韵 → 从曲库里挑出最契合的几首**。纯静态页面，无后端、无构建步骤，改完刷新即生效。

![评测页](https://img.shields.io/badge/页面-纯静态-9e3d32) ![依赖](https://img.shields.io/badge/依赖-仅%20Playwright%20(测试)-b08968)

## 仓库里有三个入口，别混在一起看

这是本仓库最容易搞混的地方：三套东西各有各的页面，共用同一份题库与算法口径。

| 入口 | 地址 | 给谁用 | 数据从哪来 |
|---|---|---|---|
| **① 答题**（主页） | `index.html` | 普通用户 | 仓库内 `data.js` |
| **② 答题攻略**（计算器） | `gfti-rank-guide.html` | 想「按目标曲目反推答案」的人 | 自带一份题库快照，优先拉线上 `data.js` |
| **③ 模拟诊断**（开发者） | `simulation.html` | 调参、看成百上千次模拟的入选分布 | 同上 |
| ↳ 附带：**参数后台** | `index.html?admin=1` | 只想手改某首歌的五维参数 | 改本机 localStorage，导出 `data.js` 才正式生效 |

- ① 和 ③ 的源码分工见 [`docs/architecture.md`](docs/architecture.md)。
- ② 是单文件工具，内部同时含有「题库快照 + 算法副本 + 求解器」，读之前先看文件顶部那段结构说明。
- **②③ 不在 GitHub Pages 发布包内**（详见 `docs/architecture.md` 的「发布边界」），需要在仓库目录里直接打开。

## 快速开始

```bash
# 起一个本地静态服务（不要用 file:// 打开 simulation.html，Web Worker 会被拦）
python -m http.server 8777
```

| 想打开 | 地址 |
|---|---|
| 答题 | http://127.0.0.1:8777/index.html |
| 答题攻略 | http://127.0.0.1:8777/gfti-rank-guide.html |
| 模拟诊断 | http://127.0.0.1:8777/simulation.html |
| 参数后台 | http://127.0.0.1:8777/index.html?admin=1 |

## 目录结构

```
├─ index.html              ① 答题页（三幕：缘起 / 问途 / 曲终）+ 参数后台结构
├─ app.js                  ① 的交互：状态机、选项、结果页、分享卡 canvas、参数面板
├─ assessment.js           纯算法：五维拉伸 → 距离 → 相似度 → 排序
├─ data.js                 题库（20 题 × 4 选项权重）+ 曲库（100 首 × 5 维参数）
├─ gfti-rank-guide.html    ② 攻略计算器（单文件：内嵌题库快照 + 算法副本 + 求解器）
├─ simulation.html         ③ 模拟诊断页
├─ simulation.js           固定种子随机答案、批量评测、统计汇总
├─ simulation-worker.js    在 Web Worker 里跑模拟，回传进度
├─ simulation-page.js      ③ 的界面：参数、图表、表格、下载
├─ simulation-artifacts.js CSV / JSON 导入导出与报告比较
├─ scripts/build-pages.cjs 生成 GitHub Pages 发布目录（白名单：4 个文件）
├─ tests/                  算法基线、模拟、发布包、以及真实浏览器集成测试
└─ docs/                   开发说明、架构、算法、测试、ADR
```

## 算法一句话版

```text
答案 → 逐题累加主/副轴权重 → 第 0 轴开方收敛
     → 五维 tanh 软饱和拉伸 → 第 0 轴 gamma warp
     → 与「压缩到中心 50 的歌曲坐标」算 Lp(p=0.2) 距离
     → 平台幂律转相似度：R ≤ 15000 记 100，之后按 1.5 次幂衰减
     → 距离升序、同名按中文排序，取前 N
```

参数全部集中在 `assessment.js` 顶部，改完跑一次 `npm test` 会用基线锁住输出差异。细节见 [`docs/algorithm.md`](docs/algorithm.md)。

## 测试

```bash
npm install          # 只装 Playwright（用于浏览器集成测试）
npm test             # 算法 + 模拟 + 发布包 + 浏览器集成
```

单独跑：

```bash
npm run test:assessment     # 算法基线与排序规则
npm run test:simulation     # 固定种子与统计口径
npm run test:pages          # 发布包白名单
npm run test:integration    # 真实浏览器里点完两个页面
```

### 仓库现状：测试基线过期

`tests/fixtures/algorithm-baseline.json` 里锁的是 **1.0.3** 版算法，而 `assessment.js` 已经迭代到 **1.5.1**（中间经历 tanh 拉伸、歌曲压缩、Lp 距离、平台幂律四次改动），所以 `test:assessment` / `test:simulation` 目前是红的。这不是代码坏了，是**基线没跟着算法走**。

两条路都能让测试变绿，但都会改变被锁定的行为，因此没有并入这次代码整理：

```bash
# A. 承认当前算法为新基线（会改写基线文件与版本号）
npm run algorithm:update-baseline -- 1.5.1

# B. 把算法退回基线版本（会改变线上评测结果）
```

只想单独验证算法本身，绕开基线断言：

```bash
node --test tests/assessment.test.cjs
```

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/development.md`](docs/development.md) | 跑起来、常用修改流程 |
| [`docs/architecture.md`](docs/architecture.md) | 每个文件负责什么、数据怎么流动、发布边界 |
| [`docs/algorithm.md`](docs/algorithm.md) | 五维、距离、相似度、模拟口径 |
| [`docs/testing.md`](docs/testing.md) | 测试怎么写、改算法要跑哪三条命令 |
| [`CONTEXT.md`](CONTEXT.md) | 领域词汇表 |
| [`docs/adr/`](docs/adr/) | 设计决策记录 |
