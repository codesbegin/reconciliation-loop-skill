---
name: reconciliation-loop-pro1.0
description: 【调和循环 Pro·代码驱动版】基于 reconciliation-loop 的 7 步循环，将状态追踪、预算检查、重试计数、快照生成等确定性逻辑下沉到 Node.js 代码（engine/ 目录）。LLM 只做判断和决策，代码保证不犯错。通过 `node engine/statemachine.js` 命令与状态机交互，非法跳步、超预算、超重试被代码强制拦截。
---

# Reconciliation Loop Pro 1.0 — 代码驱动调和循环

## 核心哲学

> **主推进手（大模型）不精通所有领域，但知道"当前子任务需要什么能力"。**
> **Skill = 专家顾问。主推进手只做判断和调度，执行交给专家。**
>
> **声明式目标（Declarative Goal）：** 定义"最终状态是什么样"，不是"我要做哪些步骤"。
> **调和循环（Reconciliation Loop）：** 持续比对"当前状态"与"期望状态"，直到收敛。
>
> **Pro 1.0 增强：** 状态追踪、预算检查、重试计数、快照生成——这些确定性逻辑由 `engine/` 下的 Node.js 脚本强制执行。LLM 管判断，代码管纪律。

---

## 前置：检查 Node.js 环境

```bash
node --version   # 需要 v14+
```

如果未安装 Node.js，本 skill 无法运行。安装后重试。

---

## 循环设计要素（六要素 → 七步映射）

| 要素 | 提示词中的槽位 | 对应步骤 | 代码实现 |
|------|--------------|---------|---------|
| **goal** | "最终状态是什么" | Step 2 | `state-store.js set-goal` |
| **state** | "当前进展到哪了" | 贯穿七步 | `state.json`（唯一真相源）+ `statemachine.js current` |
| **context** | "这一轮 Agent 需要知道什么" | Step 1 + Step 4 | LLM 从 `state.json` 提取 + `progress-snapshot.js` 生成 |
| **act** | "Agent 可以执行哪些动作" | Step 4 | 按 `references/skill-routing-table.md` 路由 |
| **capture** | "执行后必须捕获什么结果" | Step 5 | `state-store.js update-subtask` + `state-store.js log-skill-call` |
| **stop** | "什么条件下停止循环" | Step 6 + Step 7 | `statemachine.js` 自动检查预算，超限自动转入 BUDGET_EXCEEDED |

---

## Engine 脚本速查

所有脚本位于 `engine/` 目录，从 skill 根目录执行。

| 脚本 | 命令 | 用途 |
|------|------|------|
| `statemachine.js` | `node engine/statemachine.js current` | 查看当前状态 |
| | `node engine/statemachine.js reset` | 重置状态机 |
| | `node engine/statemachine.js transition --to <STATE> [--step <N>] [--skill-call]` | 状态转换（带预算检查） |
| `goal-manager.js` | `node engine/goal-manager.js init --title "..." --description "..."` | 初始化 Goal 文档 |
| | `node engine/goal-manager.js refine --field <Goal|MustHave|MustNotHave|Acceptance|Budget> --content "..."` | 细化 Goal 字段 |
| | `node engine/goal-manager.js assess` | 评估需求明确程度 |
| | `node engine/goal-manager.js show` | 显示 Goal 文档内容 |
| | `node engine/goal-manager.js lock` | 锁定 Goal（开始执行） |
| | `node engine/goal-manager.js unlock` | 解锁 Goal（需要修改时） |
| | `node engine/goal-manager.js add-task --title "..." --acceptance "..."` | 添加执行任务 |
| | `node engine/goal-manager.js complete-task --id <N> --evidence "..."` | 标记任务完成 |
| | `node engine/goal-manager.js progress` | 查看执行进度 |
| `state-store.js` | `node engine/state-store.js set-goal '<JSON>'` | 写入 Goal（同步到 goalDoc） |
| | `node engine/state-store.js add-subtask --title "..." --type "code"` | 添加子任务 |
| | `node engine/state-store.js update-subtask --id N --status DONE [--evidence "..."]` | 更新子任务状态 |
| | `node engine/state-store.js log-skill-call` | 记录 Skill 调用 |
| | `node engine/state-store.js get` | 读取完整 state |
| `budget-checker.js` | `node engine/budget-checker.js check` | 检查预算（含 80% 预警） |
| | `node engine/budget-checker.js set --max-rounds N --max-skill-calls N --max-minutes N` | 设置预算 |
| `progress-snapshot.js` | `node engine/progress-snapshot.js` | 生成进度快照文本 |

---

## 状态机定义

```
                    ┌──────────┐
        ┌──────────→│  IDLE    │←──────────┐
        │           └────┬─────┘           │
        │                │ start()         │ reset()
        │           ┌────▼─────┐           │
        │           │ ANALYZING│           │
        │           └────┬─────┘           │
        │     complete()  │                │
        │           ┌────▼──────────┐      │
        │           │REFINING_GOAL  │      │
        │           │(迭代提问+评估) │      │
        │           └────┬──────────┘      │
        │     lock()     │  unlock()       │
        │           ┌────▼──────┐          │
        │           │GOAL_DEFINED│         │
        │           └────┬──────┘          │
        │     complete()  │                │
        │           ┌────▼──────┐          │
        │           │DECOMPOSING│          │
        │           └────┬──────┘          │
        │     complete()  │                │
        │           ┌────▼──────┐          │
        │     ┌─────│ EXECUTING │─────┐    │
        │     │     └────┬──────┘     │    │
        │     │  verify()│   error()  │    │
        │     │     ┌────▼──────┐     │    │
        │     │     │ VERIFYING │     │    │
        │     │     └────┬──────┘     │    │
        │     │  pass()  │  fail()    │    │
        │     │     ┌────▼──────────┐ │    │
        │     │     │HANDLING       │─┘    │
        │     │     │_EXCEPTION     │      │
        │     │     └───────────────┘      │
        │     │  all subtasks done         │
        │     └─────────────┐              │
        │              ┌────▼──────┐       │
        │              │CONVERGING │       │
        │              └────┬──────┘       │
        │        converge() │  fail()      │
        │              ┌────▼──────┐       │
        │              │   DONE    │       │
        │              └───────────┘       │
        │                                  │
        │     budget exceeded ─────────────┘
        │     (任何状态都可能触发，代码自动)
        │           ┌────▼──────────┐
        └───────────│BUDGET_EXCEEDED│
                    └───────────────┘
```

**代码强制约束（LLM 无法绕过）：**
- 非法跳步 → 代码返回 `{"ok":false,"error":"非法跳步：...","allowedTransitions":[...]}"`
- 预算超限 → 代码自动转入 `BUDGET_EXCEEDED`，LLM 无法阻止
- 重试超过 2 次 → 代码自动转入 `FAILED`，LLM 无法阻止
- 每次进入 EXECUTING → 代码自动消耗一轮

---

## 7 步循环 — 代码驱动版

### Step 1. 需求分析（初步理解）

**LLM 职责：** 理解用户意图，输出初步需求分析笔记。

**代码交互：**
```bash
node engine/statemachine.js transition --to ANALYZING --step 1
```

**产出物：** 需求分析笔记（同 reconciliation-loop 格式）

**校验点：**
- ✅ 用户已确认分析笔记
- ✅ `node engine/statemachine.js current` 显示 `state: ANALYZING`

---

### Step 1.5. 迭代提问 + Goal 文档完善（核心改进）

> **这是 Pro 1.0 的关键改进点。** 模型不断向用户提问来完善 Goal，每次更新后评估需求明确程度，用户自主判断是否开始执行或继续细化。

**LLM 职责：**
1. 初始化 Goal 文档
2. 基于初步需求分析，提出第一批问题（针对 Goal/Must Have/Must Not Have/验收步骤 中的空缺）
3. 用户回答后，更新 Goal 文档对应字段
4. 评估需求明确程度，展示给用户
5. 如果明确程度 < 80 分 → 继续提问（针对待澄清项）
6. 如果明确程度 ≥ 80 分 → 告诉用户"可以开始了"，等用户决定

**代码交互：**
```bash
# 1. 进入迭代提问状态
node engine/statemachine.js transition --to REFINING_GOAL --step 1.5

# 2. 初始化 Goal 文档
node engine/goal-manager.js init --title "任务标题" --description "初步描述"

# 3. 每次用户回答后，更新对应字段
node engine/goal-manager.js refine --field Goal --content "最终状态是..."
node engine/goal-manager.js refine --field MustHave --content "1. ...\n2. ..."
node engine/goal-manager.js refine --field MustNotHave --content "1. ..."
node engine/goal-manager.js refine --field Acceptance --content "1. ...\n2. ..."
node engine/goal-manager.js refine --field Budget --content "最大轮数: 10\n最大调用: 20\n最大时间: 120分钟"

# 4. 每次更新后评估明确程度
node engine/goal-manager.js assess
→ 返回 { score: 65, level: "🟡 基本明确", gaps: ["Must Not Have 未填写", "验收步骤未填写"] }

# 5. 用户决定开始 → 锁定 Goal
node engine/goal-manager.js lock
→ 返回 { ok: true, locked: true, clarity: { score: 85, level: "🟢 明确" } }

# 6. 进入 Goal 已定义状态
node engine/statemachine.js transition --to GOAL_DEFINED --step 2
```

**需求明确程度评估规则（代码自动计算）：**

| 字段 | 权重 | 评分标准 |
|------|------|---------|
| Goal | 30 分 | >20 字 = 30 分；>0 字 = 10 分；空 = 0 分 |
| Must Have | 25 分 | ≥2 条 = 25 分；≥1 条 = 10 分；空 = 0 分 |
| Must Not Have | 15 分 | 有内容 = 15 分；空 = 0 分 |
| 验收步骤 | 20 分 | ≥1 条 = 20 分；空 = 0 分 |
| 预算约束 | 10 分 | 有内容 = 10 分；空 = 0 分（使用默认值） |

| 总分 | 等级 | 建议 |
|------|------|------|
| ≥80 | 🟢 明确 | 可以开始执行 |
| 50-79 | 🟡 基本明确 | 建议继续细化待澄清项 |
| 20-49 | 🟠 模糊 | 需要继续提问完善 |
| <20 | 🔴 不明确 | 必须继续细化 |

**LLM 提问策略：**
- 第一轮提问：针对所有空缺字段（"你的最终目标是什么？""有什么是必须做到的？""有什么是绝对不能出现的？"）
- 第二轮提问：针对评分 <50 的字段深入追问
- 第三轮及以后：只针对"待澄清项"列表中的具体缺口提问
- **不问废话**：如果用户已经在初始描述中说清楚了某个字段，不重复问

**用户自主决策：**
- 明确程度 ≥ 80 分时，LLM 告诉用户"需求已足够明确，可以开始执行。是否开始？"
- 用户说"开始" → `goal-manager.js lock` → 进入 Step 2
- 用户说"继续细化" → LLM 继续提问
- **即使用户在 50 分时说"开始"，也允许**（代码只在 <50 分时阻止锁定）

**Goal 文档 = Plan 文档：**
- Goal 文档（`engine/goal.md`）既是目标声明，也是执行计划
- Step 3 拆解的子任务会写入 Goal 文档的"执行计划"部分
- 执行时每完成一个子任务，Goal 文档中对应项标记为 ✅
- 中断后恢复时，读 Goal 文档就知道"还剩什么没做"

---

### Step 2. 声明式目标确认（锁定 + 预算设置）

**LLM 职责：** 确认 Goal 已锁定，设置预算约束。

**代码交互：**
```bash
# Goal 已在 Step 1.5 锁定，这里只做状态转换
node engine/statemachine.js transition --to GOAL_DEFINED --step 2

# 设置预算（如果 Goal 文档中没写，用默认值）
node engine/budget-checker.js set --max-rounds 10 --max-skill-calls 20 --max-minutes 120

# 同步 Goal 到 state.json（供 statemachine 使用）
node engine/state-store.js set-goal '{"Goal":"...","Must Have":"...","Must Not Have":"...","验收步骤":"..."}'
```

**产出物：** 已锁定的 Goal 文档（`engine/goal.md`）

**GOAL 不可变性铁律：**
- ⚠️ Goal 文档锁定后即不可修改（代码强制：`goal-manager.js refine` 在 locked 状态下返回错误）
- ✅ 允许在执行中发现遗漏 → `goal-manager.js unlock` → 修改 → 重新 `lock` → 用户再次确认
- ❌ 绝对禁止：悄悄修改 Goal / 因"实现有难度"降低验收标准 / 把"没达成"说成"已达成"

---

### Step 3. 步骤拆解（动态，非固定流水线）

**LLM 职责：** 调用 writing-plans 拆解子任务，用 TodoWrite 管理。

**代码交互：**
```bash
node engine/statemachine.js transition --to DECOMPOSING --step 3

# 逐个添加子任务
node engine/state-store.js add-subtask --title "..." --type "code" --must-have "对应 Goal 的 Must Have 项"
node engine/state-store.js add-subtask --title "..." --type "doc" --depends-on "1"
# ... 重复直到所有子任务添加完毕
```

**校验点：**
- ✅ 每个子任务都有验收要点
- ✅ 子任务粒度足够小（一次 Skill 调用能完成）
- ✅ `node engine/progress-snapshot.js` 显示子任务列表

---

### Step 4-6. 执行循环体

每轮循环 LLM 执行以下操作：

```
┌─ 每轮开始前 ──────────────────────────────────────────┐
│ # 1. 检查预算                                          │
│ node engine/budget-checker.js check                    │
│ → 如果 exceeded: true → 停止，报告用户                 │
│ → 如果 warnings 非空 → 提醒用户"接近预算上限"          │
│                                                        │
│ # 2. 进入执行状态                                      │
│ node engine/statemachine.js transition --to EXECUTING  │
│ → 如果 BUDGET_EXCEEDED → 停止                          │
│                                                        │
│ # 3. Step 4: Skill 调度                                │
│ 查 references/skill-routing-table.md，路由到 skill     │
│ 调用前: node engine/state-store.js log-skill-call      │
│                                                        │
│ # 4. Step 5: 单步校验                                  │
│ node engine/statemachine.js transition --to VERIFYING  │
│ LLM 按 verification-checklist.md 校验内容              │
│                                                        │
│ # 5. 校验通过 → 更新子任务                             │
│ node engine/state-store.js update-subtask --id N \     │
│   --status DONE --evidence "校验结果摘要"              │
│                                                        │
│ # 6. 校验失败 → 进入异常兜底                           │
│ node engine/statemachine.js transition \               │
│   --to HANDLING_EXCEPTION                              │
│ → LLM 决策处置策略                                     │
│ → 重试: node engine/statemachine.js transition \       │
│     --to EXECUTING                                     │
│     （代码自动检查重试次数，第 3 次自动 FAILED）        │
│                                                        │
│ # 7. 检查是否全部完成                                  │
│ node engine/state-store.js update-subtask 返回 \       │
│   progress.allDone = true → 进入 Step 7                │
└────────────────────────────────────────────────────────┘
```

**调用的下层 skill：** agentic-skill-router（路由）、verification-before-completion（校验）、systematic-debugging（异常排查）

**异常处置：** LLM 决策策略，代码强制执行：
- 重试最多 2 次（代码自动计数，第 3 次 → FAILED）
- 预算超限自动停止（代码每次 transition 检查）
- 不允许跳过子任务（state-store 记录所有子任务状态）

---

### Step 7. 终态收敛（整体验收 + 交付闭环）

**LLM 职责：** 对照 Goal 逐项验收，生成交付摘要。

**代码交互：**
```bash
node engine/statemachine.js transition --to CONVERGING --step 7

# 生成快照用于交付摘要
node engine/progress-snapshot.js

# 验收通过
node engine/statemachine.js transition --to DONE

# 归档 state（可选）
node engine/state-store.js archive --to "archive/任务名-2026-06-17.json"
```

**产出物：** 交付摘要（同 reconciliation-loop 格式）

---

## 中断-恢复机制

**恢复流程：**
```bash
# 1. 查看当前状态
node engine/statemachine.js current

# 2. 生成进度快照
node engine/progress-snapshot.js

# 3. 查看 Goal 文档（知道目标是什么、还剩什么没做）
node engine/goal-manager.js show

# 4. 查看执行进度
node engine/goal-manager.js progress

# 5. 把快照 + Goal 文档展示给用户，确认"从断点继续？"
# 6. 用户确认后，从当前状态继续执行
```

**恢复原则：**
- 不重做已完成并校验通过的子任务（Goal 文档中已标记 ✅ 的不重做）
- 不修改已锁定的 Goal（如需修改必须 unlock → 修改 → 重新 lock → 用户确认）
- 如果距上次执行已过数小时/数天，先确认 Goal 和上下文仍有效
- **State 持久化**：`state.json` + `goal.md` 双重持久化。state.json 是程序数据源，goal.md 是人类可读视图。每次操作自动落盘，对话中断不影响完整性
- **中断可继续发起重试**：如果任务因预算超限或异常失败，用户可以重新发起，Goal 文档中的已完成项保留，只继续未完成的部分

---

## 自动触发（Cron 定时任务）

**自动触发条件：**

| 触发方式 | 条件 | 示例 |
|---------|------|------|
| Cron 表达式 | 用户设定了周期性任务 | "每周日 20:00 做周 Review" |
| state.json 检测 | 检测到未完成的子任务且超过 N 小时未处理 | 主动提醒用户"上次任务未完成" |
| 异常堆积检测 | 校验连续失败 ≥3 次 | 自动进入异常兜底 |

**Cron 触发规则：**
- 自动触发时，循环从 Step 1 开始，输入是"上一次的 Goal + state 快照"
- 如果 Goal 已过期，自动停止并报告
- 自动触发同样遵守预算约束——连续 3 次超预算，停止自动触发

---

## 前置依赖检查

### 必需依赖（Hard Dependencies）

| Skill 名称 | 使用位置 | 作用 |
|---|---|---|
| **brainstorming** | Step 1 | 需求分析 |
| **writing-plans** | Step 3 | 步骤拆解 |
| **agentic-skill-router** | Step 4 | Skill 路由 |
| **verification-before-completion** | Step 5 + Step 7 | 校验 |

### 可选依赖

| Skill 名称 | 触发场景 |
|---|---|
| **systematic-debugging** | Step 6 异常兜底 |
| **test-driven-development** | 代码/工程类任务 |
| **receiving-code-review** | 代码审查反馈 |
| **requesting-code-review** | 发起代码审查 |
| **frontend-design / ui-ux-pro-max** | 设计/界面任务 |
| **using-git-worktrees** | Git 分支管理 |
| **finishing-a-development-branch** | 代码收尾 |
| **subagent-driven-development** | 大型代码任务 |
| **executing-plans** | 按计划执行 |
| **writing-skills** | 创建/编辑 skill |
| **using-superpowers** | 辅助 |

---

## 参考文件

- `references/goal-template.md` — Step 2 声明式目标的完整模板与示例（含预算约束）
- `references/skill-routing-table.md` — Step 4 Skill 调度的完整路由表
- `references/agency-agents-index.md` — Agency Agents 专家索引
- `references/agency-agents-call-log.md` — Agency Agents 调用日志
- `references/verification-checklist.md` — Step 5 / Step 7 校验清单
- `references/state-management.md` — 六要素与七步映射（参考，代码已实现）

---

## 使用方式

用户说 "使用 reconciliation-loop-pro 处理这个任务" 时：

1. 先运行 `node engine/statemachine.js reset` 初始化
2. 按 7 步循环推进，每步通过 `node engine/statemachine.js transition` 推进状态
3. 子任务通过 `node engine/state-store.js` 管理
4. 每轮开始前运行 `node engine/budget-checker.js check`
5. 中断恢复时运行 `node engine/statemachine.js current` + `node engine/progress-snapshot.js`

**代码负责纪律，LLM 负责判断。代码不会忘记、不会数错、不会放水。**