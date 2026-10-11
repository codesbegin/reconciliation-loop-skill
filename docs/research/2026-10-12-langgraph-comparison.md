# 调研：LangGraph —— 对本 skill 状态机实现的启发

> **日期**：2026-10-12
> **参考**：LangGraph（LangChain 出品，图式 Agent 编排框架）
> **性质**：调研建议，不直接改 engine/ 代码，等用户审批后再决定是否落地

## LangGraph 是什么

LangGraph 把 Agent 的执行建模成一张图：Node 是一个函数/LLM 调用/工具调用，Edge 是节点之间的转移（可以固定也可以条件路由），State 是一个 TypedDict 在节点间流转，每个节点返回部分更新。

它和传统链的区别是：图可以有环（loop back）、可以分支、可以暂停在某个节点等人介入。

## 对比本 skill 的 engine/statemachine.js

| 维度 | LangGraph | 本 skill 现状 |
|---|---|---|
| 拓扑 | 任意有向图，支持环/分支/并行 | 7 步线性序列 |
| 状态 | TypedDict + reducer，节点返回 patch | state.json 单 JSON 文件，LLM 直接读写 |
| 持久化 | 内置 Checkpointer（SQLite/Postgres），可恢复 | state.json 手动读写 |
| 人介入 | 内置 interrupt()，可暂停等人审批 | 异常兜底靠重试，没有显式人介入点 |
| 条件路由 | 边绑定函数动态选下一个节点 | 状态机硬编码转移表 |
| 并发 | 支持并行节点 | 无 |

## 值得借鉴的点

### 1. 状态更新用 patch 而非整体覆盖

当前 LLM 每次写完 state.json 都是整体覆盖。LangGraph 的做法是每个节点只返回它改动的字段（patch），由 reducer 合并。

启发：可以在 state-store.js 里加一个 update(patch) 方法，只允许写特定字段，防止 LLM 意外清空其他字段。这是低成本高价值的改进。

### 2. 显式的人介入点

LangGraph 的 interrupt() 是一等公民：跑到某个节点可以暂停，等人输入后再继续。

当前 skill 的 7 步里，目标定义和异常兜底其实是天然的人介入点——目标错了就该停下来问用户，而不是自己硬跑。可以在 goal-manager.js 里加一个 needsApproval 标志，遇到高风险动作时暂停循环。

### 3. 条件边（动态路由）

当前状态机的转移是硬编码的。LangGraph 允许边绑定一个函数：根据当前 state 决定下一步去哪。

启发：如果未来某一步失败率高，可以加一条条件边：失败 N 次走异常兜底分支而不是死循环。statemachine.js 已经有这个雏形，但可以显式化。

## 不建议照搬的点

- 整张图迁移到 LangGraph：当前 7 步线性流程不需要图灵完备的编排框架。引入 LangGraph 等于让 skill 依赖 Python 运行时，违背本地优先零依赖的初衷。
- 并行节点：当前任务流没有并行需求，加了反而复杂。
- Checkpointer：state.json 已经够了，上 SQLite 是过度设计。

## 待用户审批

1. 是否在 state-store.js 加 update(patch) 方法替代整体覆盖？
2. 是否在 goal-manager.js 加显式人介入点（高风险动作暂停）？

这两条都是纯增量、低风险。审批后再动代码。
