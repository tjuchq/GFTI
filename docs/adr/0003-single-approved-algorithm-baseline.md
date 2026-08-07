# 使用唯一基线批准算法变化

古风气韵评测的固定答案、五维气韵和契合歌曲只保存在 `tests/fixtures/algorithm-baseline.json`。算法测试读取这份基线；页面集成测试只比较页面展示与 `assessment.evaluate()` 的返回值，不重复保存算法数值。

有意修改算法时，开发者运行 `npm run algorithm:update-baseline -- <新版本>`。命令验证新版本高于当前版本，使用固定答案重新计算结果，并同时更新 `assessment.js` 与唯一基线。开发者必须检查 Git 差异并人工确认公式说明，命令不会自动批准算法语义。

## Consequences

直接修改 `assessment.js` 后，测试会失败并显示更新命令。算法变化只需要审核算法实现、一个基线差异和相关公式文档，不再修改页面测试。无意变化仍会被基线测试阻止部署。
