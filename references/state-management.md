# 循环状态管理（Loop State Management）

## 一、六要素与七步的映射

| 要素 | 含义 | 对应步骤 |
|------|------|---------|
| **goal** | 目标 | Step 2 |
| **state** | 状态 | 贯穿七步 |
| **context** | 上下文 | Step 1 + Step 4 |
| **act** | 执行 | Step 4 |
| **capture** | 捕获 | Step 5 |
| **stop** | 停止 | Step 6 + Step 7 |

## 二、State 的生命周期

Step 1 → Step 2 初始化 state → Step 3 更新待执行列表 → 循环体(Step 4→5→6) → Step 7 归档

## 三、State 持久化规则

- 每完成一个子任务 → 更新已完成列表
- 每异常兜底 → 追加异常记录
- 每周一轮 → 更新当前轮数
- 子任务完成后必须立即更新 state