# reconciliation-loop-skill

> 代码驱动的调和循环（Reconciliation Loop）Pro 1.0 —— 让 LLM 只做判断和调度，让 Node.js 代码管纪律。

## 这是什么

这是一个面向 agent 工作流的 **meta-skill**。它把把一件事推进到可验证的终态这件事拆成 7 步循环：

1. 需求分析
2. 声明式目标确认（Goal 锁定 + 预算设置）
3. 步骤拆解
4. Skill 调度（每步按路由表派给下层专家 skill）
5. 单步校验
6. 异常兜底（重试 / 修复 / 放弃）
7. 终态收敛（整体验收 + 交付）

**Pro 1.0 的关键选择**：状态追踪、预算检查、重试计数、快照生成这些容易被 LLM 漏掉或数错的确定性逻辑，全部下沉到 `engine/` 下的 Node.js 脚本。LLM 负责判断下一步该派谁，代码负责不许跳步、不许超预算、不许跳过校验。

一句话：**代码负责纪律，LLM 负责判断。**

## 和同类方案的区别

| 方案 | 状态管理 | 预算约束 | Goal 锁定 |
|---|---|---|---|
| 手写 prompt loop | 靠 LLM 自觉 | 无 | 无 |
| LangGraph | 图结构显式状态机 | 需自行实现 | 需自行实现 |
| Claude Code `/loop` | 隐式 | 隐式 | 无 |
| **本项目** | `state.json` 持久化 + `statemachine.js` 强制转换 | `budget-checker.js` 自动拦截 | `goal.md` 锁定后代码拒绝改写 |

详细对比会在 `docs/research/` 下持续补充。

## 仓库结构

```
reconciliation-loop-skill/
├── SKILL.md                  # 完整规范（7 步循环的全部细节，先读这个）
├── engine/
│   ├── statemachine.js        # 状态机：非法跳步 / 预算超限 / 重试上限代码强制拦截
│   ├── goal-manager.js        # Goal 文档的 init / refine / assess / lock
│   ├── state-store.js         # state.json 读写，子任务与 skill 调用日志
│   ├── budget-checker.js      # 预算设置与检查（80% 预警）
│   ├── progress-snapshot.js    # 生成人类可读进度快照
│   ├── goal.md                # 当前锁定的 Goal 文档
│   └── state.json             # 运行时唯一真相源
└── references/
    ├── goal-template.md       # 声明式 Goal 模板
    ├── skill-routing-table.md # Step 4 的 skill 路由表
    ├── verification-checklist.md # Step 5 / Step 7 校验清单
    ├── state-management.md     # 六要素与七步映射
    ├── agency-agents-index.md  # 下层专家 skill 索引
    └── agency-agents-call-log.md # 调用日志模板
```

## 快速上手

前置：Node.js v14+

```bash
# 1. 看当前状态
node engine/statemachine.js current

# 2. 初始化一个新任务
node engine/goal-manager.js init --title "任务标题" --description "初步描述"
node engine/goal-manager.js refine --field Goal --content "最终状态是..."
node engine/goal-manager.js assess
node engine/goal-manager.js lock

# 3. 推进循环
node engine/statemachine.js transition --to ANALYZING --step 1

# 4. 随时生成进度快照
node engine/progress-snapshot.js
```

完整规范、状态图、每一步的代码交互示例都在 **[SKILL.md](./SKILL.md)**。

## 当前状态

Pro 1.0 代码已就位，正在做：

- 把 daily 技术调研机制跑起来（agentic loop / LangGraph / Claude Code loop 方向）
- 反哺 `engine/` 的边界 case 与错误提示
- 补 README、references 与 research 笔记
