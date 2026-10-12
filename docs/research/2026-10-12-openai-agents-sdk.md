# 调研：OpenAI Agents SDK —— 与本 skill 的对比

> **日期**：2026-10-12
> **参考**：OpenAI Agents SDK（Python，轻量编排框架）
> **视角**：跳出 BearAgent/LangGraph，看 OpenAI 官方 SDK 的设计取舍

## OpenAI Agents SDK 核心抽象

- Agent：instructions + tools + model 配置
- Runner：执行 Agent，返回最终结果
- Handoff：Agent 之间把控制权交给对方（切换主 Agent）
- Guardrails：输入/输出校验器，在 LLM 调用前后跑
- Session：跨 Agent 共享上下文（内存对象）
- Tracing：内置执行轨迹

## 对比本 skill

| 维度 | OpenAI Agents SDK | 本 skill |
|---|---|---|
| 核心抽象 | Agent = instructions+tools+model | 7 步固定循环 |
| Agent 间协作 | Handoff 主 Agent 切换 | 主循环调子 skill |
| 校验 | Guardrails 输入/输出双向 | 只有预算检查，无输入输出校验 |
| 上下文 | Session 内存对象 | state.json 文件 |
| 可观测 | 内置 Tracing | progress-snapshot 手动快照 |
| 人介入 | 内置 approval 工具 | 无 |

## 值得拿的设计

### 1. Guardrails（输入/输出校验）

OpenAI 在 LLM 每次调用前后跑一组校验器。输入校验防幻觉指令，输出校验防胡说八道。

启发：在 statemachine.js 每一步之间加校验钩子。比如目标定义步的输出必须是合法 JSON；单步校验步的输出必须明确 PASS/FAIL。当前这些校验靠 LLM 自觉，没有强制。

低成本高价值增量：加一个 engine/guardrails.js，暴露 validateStepOutput(stepName, output) 函数，statemachine 在转移前调用。

### 2. Tracing 内置

OpenAI 内置执行轨迹导出。本 skill 的 history 数组在 state.json 里，但没有结构化 trace（每步耗时、token、输入输出快照）。

启发：progress-snapshot.js 可以扩展成每次快照都记录 stepName + timestamp + token 消耗，形成可回放轨迹。和今天刚加的 budget-checker token 维度天然衔接。

### 3. Handoff vs Skill 调度

暂不照搬——当前 7 步循环足够，等真出现主循环卡住、需要换脑子的场景再说。

## 不建议照搬

- Python 运行时依赖：违背零依赖初衷
- Session 内存对象：进程崩了就没，state.json 文件反而更可靠
- Dashboard 绑定：厂商锁定

## 待落地（已具备动手条件）

1. engine/guardrails.js：步骤输出校验钩子
2. progress-snapshot 扩展：每次快照记录 step 元数据

这两条比之前攒的人介入点更具体，可以优先做。
