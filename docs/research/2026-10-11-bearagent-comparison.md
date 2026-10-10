# 调研：BearAgent 的事件溯源运行时 —— 对本 skill 的启发

> **日期**：2026-10-11
> **来源**：通过 zread.ai 对 CherryYang05/BearAgent 的分析
> **性质**：调研建议，**不直接改 engine/ 代码**，等用户审批后再决定是否落地

## BearAgent 是什么

一个本地优先的 Agent 运行时（Python），P1（可审查执行）已于 2026-09-08 关闭，当前在做 P2（可恢复执行）。核心主张：把模型输出当提案而非许可，在 LLM 和外部副作用之间插入一个确定性运行时。

## 架构对比

| 维度 | BearAgent | 本 skill 当前实现 |
|---|---|---|
| 状态存储 | SQLite WAL 事件流，不可变 Event 追加 | engine/state.json 单文件快照 |
| 状态推导 | Reducer（纯函数）把 Event 折叠成 RunState | LLM 直接读写 state.json |
| 预算维度 | 5 维：模型迭代、工具调用、Token、成本、挂钟时间 | 3 维：轮数、Skill 调用数、分钟数 |
| 工具策略 | 默认拒绝：注册表、参数校验、策略评估、有界执行 | skill-routing-table.md 白名单 |
| 恢复 | Event replay 重建状态；run check 识别非终止 run | 中断后读 state.json 继续 |
| 架构 | 端口-适配器（六边形），核心不 import 适配器 | engine/ 脚本直接耦合 Node |
| 产出边界 | 工作区只读 + outputs/** 原子写入 | 无明确产出边界 |

## 值得借鉴的点（候选，未实施）

### 1. 预算维度补全（低成本，高价值）

当前 budget-checker.js 只追踪轮数、Skill 调用数、分钟数。BearAgent 多了两个维度：

- Token 消耗：LLM 调用通常会返回 usage，可以在 state-store.js log-skill-call 时记录 prompt_tokens / completion_tokens
- 成本估算：按模型单价换算 token 成本

建议：在 budget-checker 里加 max-tokens 和 max-cost-usd 两个软上限，80% 时预警。这是纯增量，不破坏现有接口。

### 2. UNKNOWN 状态（语义提升）

BearAgent 对外部操作定义了三态：CONFIRMED（操作完成且有证据）、REFUSED（策略拒绝）、UNKNOWN（操作可能已发生但运行时无法确认，比如超时的支付）。

当前 skill 的异常兜底只有重试/失败两态。对于调用外部 API、发请求这类副作用，超时后的状态值得单独建模。

### 3. Event 溯源（长期方向，不现在做）

把 state.json 从快照升级为事件流 + reducer 是个大工程。短期不动，但值得知道这个方向存在。如果未来 state.json 越来越复杂（要追溯为什么状态是这样），再考虑。

## 不建议照搬的点

- 六边形架构 + 端口适配器：对当前规模的 skill 过度设计，engine/ 脚本直接耦合 Node 反而简单。
- SQLite 持久化：当前 state.json 已经够用，换 SQLite 是性能问题，不是正确性问题。
- Python 重写：没必要。

## 待用户审批

1. 是否在 budget-checker 里加 token / 成本两个预算维度？
2. 是否在异常状态机里加 UNKNOWN 态？
3. 事件溯源是否列入 roadmap 的长期方向？

审批后再动 engine/ 代码。
