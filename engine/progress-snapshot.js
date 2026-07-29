#!/usr/bin/env node
/**
 * progress-snapshot.js — 进度快照生成
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');

function load() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function now() { return new Date().toISOString(); }

function formatGoal(goal) {
  if (!goal) return '（未设定）';
  if (goal.Goal) {
    let out = `Goal: ${goal.Goal}\n`;
    if (goal['Must Have']) out += `Must Have:\n${goal['Must Have'].split('\n').filter(Boolean).map(l => `  - ${l.trim()}`).join('\n')}\n`;
    if (goal['Must Not Have']) out += `Must Not Have:\n${goal['Must Not Have'].split('\n').filter(Boolean).map(l => `  - ${l.trim()}`).join('\n')}\n`;
    return out;
  }
  return `Goal: ${goal.summary || JSON.stringify(goal)}`;
}

function formatBudget(budget, consumed) {
  const lines = [];
  if (budget.maxRounds > 0) lines.push(`  轮数: ${consumed.rounds}/${budget.maxRounds}`);
  if (budget.maxSkillCalls > 0) lines.push(`  Skill 调用: ${consumed.skillCalls}/${budget.maxSkillCalls}`);
  if (budget.maxMinutes > 0 && consumed.startedAt) {
    const elapsed = ((Date.now() - new Date(consumed.startedAt).getTime()) / 60000).toFixed(1);
    lines.push(`  时间: ${elapsed}/${budget.maxMinutes} 分钟`);
  }
  return lines.join('\n');
}

function formatSubtasks(subtasks) {
  if (!subtasks || subtasks.length === 0) return '（无子任务）';
  return subtasks.map(t => {
    const statusIcon = { DONE: '✅', FAILED: '❌', SKIPPED: '⏭️', PENDING: '⬜', IN_PROGRESS: '🔄' }[t.status] || '⬜';
    const evidence = t.evidence ? ` — ${t.evidence.substring(0, 60)}` : '';
    return `  ${t.id}. ${statusIcon} ${t.title} [${t.status}]${evidence}`;
  }).join('\n');
}

function formatHistory(history) {
  if (!history || history.length === 0) return '（无历史记录）';
  return history.slice(-10).map(h => {
    const auto = h.auto ? ' [自动]' : '';
    return `  ${h.at}  ${h.from} → ${h.to}${auto}${h.reason ? ` (${h.reason})` : ''}`;
  }).join('\n');
}

function main() {
  const s = load();
  if (!s) { console.log(JSON.stringify({ ok: false, error: 'state.json 不存在' })); return; }
  const stateMap = { IDLE: '空闲', ANALYZING: 'Step 1', GOAL_DEFINED: 'Step 2', DECOMPOSING: 'Step 3', EXECUTING: 'Step 4-6', VERIFYING: 'Step 5', HANDLING_EXCEPTION: 'Step 6', CONVERGING: 'Step 7', DONE: '已完成', BUDGET_EXCEEDED: '预算超限', FAILED: '失败' };
  const done = s.subtasks.filter(t => t.status === 'DONE').length;
  const total = s.subtasks.length;
  const snapshot = ['═══════════════════════════════════════', '【进度快照 · Progress Snapshot】', `生成时间: ${now()}`, '', `■ 当前状态: ${stateMap[s.state] || s.state}`, `■ 子任务进度: ${done}/${total} 完成`, '', '■ Goal 声明:', formatGoal(s.goal), '', '■ 已完成的子任务:', formatSubtasks(s.subtasks.filter(t => t.status === 'DONE')), '', '■ 待执行的子任务:', formatSubtasks(s.subtasks.filter(t => t.status !== 'DONE')), '', '■ 预算消耗:', formatBudget(s.budget, s.consumed), '', '■ 重试情况:', `  当前重试次数: ${s.retryCount.current}/${s.retryCount.max}`, '', '■ 最近状态变更:', formatHistory(s.history), '', '═══════════════════════════════════════'].join('\n');
  console.log(snapshot);
}

main();