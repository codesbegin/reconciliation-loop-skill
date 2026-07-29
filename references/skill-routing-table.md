# Skill 路由表（Skill Routing Table）

> **用途：** 主推进手在 Step 4 和 Step 3 中，根据子任务类型快速判断"该调用哪个下层 skill"。

---

## 路由表 — 按子任务类型匹配

### 类型 1：需求理解 / 设计探索

调用 **brainstorming**，但跳过它的后续步骤。

### 类型 2：任务拆解 / 计划生成

调用 **writing-plans**，但输出格式用 TodoWrite + reconciliation-loop 定义。

### 类型 3：代码执行 / 功能开发

调用 **test-driven-development** + **subagent-driven-development**。

### 类型 4：前端 / UI / 设计

调用 **frontend-design** 或 **ui-ux-pro-max**。

### 类型 5：调试 / 排查问题

调用 **systematic-debugging**。

### 类型 6：代码审查 / 质量检查

调用 **requesting-code-review** 或 **receiving-code-review**。

### 类型 7：Git / 版本管理 / 工作区

调用 **using-git-worktrees** 或 **finishing-a-development-branch**。

### 类型 8：最终验证 / 交付

调用 **verification-before-completion**。

---

## 路由决策流程

1. 判断任务类型（8 类）
2. 判断是否需要"执行型"skill 还是"方法论型"skill
3. 执行：执行型完整调用，方法论型阅读核心原则，护栏型在关键节点强制触发

---

## 行业专家路由：Agency Agents

当子任务涉及具体行业/专业领域时，从 agency-agents-index.md 中查找对应专家。