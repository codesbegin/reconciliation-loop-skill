#!/usr/bin/env node
/**
 * goal-manager.js — Goal 文档管理器
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');
const GOAL_FILE = path.join(__dirname, 'goal.md');

function goalTemplate(data = {}) {
  const now = new Date().toISOString();
  const tasks = (data.tasks || []).map((t, i) => {
    const icon = t.status === 'DONE' ? '✅' : t.status === 'FAILED' ? '❌' : '⬜';
    const evidence = t.evidence ? ` — ${t.evidence}` : '';
    return `${i + 1}. ${icon} ${t.title} [验收: ${t.acceptance || '未定义'}]${evidence}`;
  }).join('\n');
  const clarity = data.clarity || { score: 0, level: '未知', gaps: [] };
  return `# Goal 文档 — ${data.title || '未命名任务'}\n\n> **状态**: ${data.locked ? '🔒 已锁定（执行中）' : '🔓 可编辑（细化中）'}\n> **创建时间**: ${data.createdAt || now}\n> **最后更新**: ${data.updatedAt || now}\n> **需求明确程度**: ${clarity.score}/100 (${clarity.level})\n\n---\n\n## Goal（最终状态是什么）\n\n${data.goal || '（待填写）'}\n\n## Must Have（必须包含什么）\n\n${data.mustHave || '（待填写）'}\n\n## Must Not Have（明确禁止什么）\n\n${data.mustNotHave || '（待填写）'}\n\n## 验收步骤（怎么判断完成了）\n\n${data.acceptance || '（待填写）'}\n\n## 预算约束\n\n${data.budget || '（待填写）'}\n\n---\n\n## 执行计划\n\n${tasks || '（Goal 锁定后自动生成）'}\n\n---\n\n## 需求明确程度评估\n\n${clarity.gaps && clarity.gaps.length > 0 ? `### 待澄清项 (${clarity.gaps.length})\n${clarity.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}` : '### ✅ 所有关键字段已明确'}\n\n---\n\n## 变更历史\n\n${(data.history || []).map(h => `- ${h.at}: ${h.action} — ${h.detail}`).join('\n') || '（无）'}\n`;
}

function loadGoal() {
  if (!fs.existsSync(GOAL_FILE)) return null;
  const stateFile = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : {};
  return stateFile.goalDoc || null;
}

function saveGoalDoc(data) {
  const stateFile = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : {};
  stateFile.goalDoc = data;
  fs.writeFileSync(STATE_FILE, JSON.stringify(stateFile, null, 2), 'utf-8');
  fs.writeFileSync(GOAL_FILE, goalTemplate(data), 'utf-8');
}

function now() { return new Date().toISOString(); }

function assessClarity(data) {
  const gaps = [];
  let score = 0;
  if (data.goal && data.goal.length > 20) score += 30;
  else if (data.goal && data.goal.length > 0) { score += 10; gaps.push('Goal 描述太短'); }
  else gaps.push('Goal 未填写');
  if (data.mustHave && data.mustHave.split('\n').filter(l => l.trim()).length >= 2) score += 25;
  else if (data.mustHave && data.mustHave.trim()) { score += 10; gaps.push('Must Have 条目太少'); }
  else gaps.push('Must Have 未填写');
  if (data.mustNotHave && data.mustNotHave.trim()) score += 15;
  else gaps.push('Must Not Have 未填写');
  if (data.acceptance && data.acceptance.split('\n').filter(l => l.trim()).length >= 1) score += 20;
  else gaps.push('验收步骤未填写');
  if (data.budget && data.budget.trim()) score += 10;
  else gaps.push('预算约束未填写');
  let level;
  if (score >= 80) level = '🟢 明确 — 可以开始执行';
  else if (score >= 50) level = '🟡 基本明确';
  else if (score >= 20) level = '🟠 模糊';
  else level = '🔴 不明确';
  return { score, level, gaps };
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'init') {
    const titleIdx = args.indexOf('--title');
    const descIdx = args.indexOf('--description');
    const data = { title: titleIdx !== -1 ? args[titleIdx + 1] : '未命名任务', goal: descIdx !== -1 ? args[descIdx + 1] : '', mustHave: '', mustNotHave: '', acceptance: '', budget: '', tasks: [], locked: false, createdAt: now(), updatedAt: now(), history: [{ at: now(), action: 'init', detail: '初始化 Goal 文档' }] };
    data.clarity = assessClarity(data);
    saveGoalDoc(data);
    console.log(JSON.stringify({ ok: true, message: 'Goal 文档已创建', clarity: data.clarity }, null, 2));
    return;
  }
  if (cmd === 'refine') {
    const fieldIdx = args.indexOf('--field');
    const contentIdx = args.indexOf('--content');
    if (fieldIdx === -1 || contentIdx === -1) { console.log(JSON.stringify({ ok: false, error: '用法: refine --field <Goal|MustHave|MustNotHave|Acceptance|Budget> --content "..."' })); return; }
    const field = args[fieldIdx + 1];
    const content = args[contentIdx + 1];
    const fieldMap = { Goal: 'goal', MustHave: 'mustHave', MustNotHave: 'mustNotHave', Acceptance: 'acceptance', Budget: 'budget' };
    if (!fieldMap[field]) { console.log(JSON.stringify({ ok: false, error: `未知字段: ${field}` })); return; }
    const data = loadGoal();
    if (!data) { console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' })); return; }
    if (data.locked) { console.log(JSON.stringify({ ok: false, error: 'Goal 已锁定，不能修改。如需修改请先 unlock' })); return; }
    data[fieldMap[field]] = content;
    data.updatedAt = now();
    data.history.push({ at: now(), action: 'refine', detail: `更新 ${field}` });
    data.clarity = assessClarity(data);
    saveGoalDoc(data);
    console.log(JSON.stringify({ ok: true, field: fieldMap[field], clarity: data.clarity, message: data.clarity.score >= 80 ? '需求已足够明确，可以 lock 并开始执行' : `还有 ${data.clarity.gaps.length} 项待澄清` }, null, 2));
    return;
  }
  if (cmd === 'assess') {
    const data = loadGoal();
    if (!data) { console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' })); return; }
    data.clarity = assessClarity(data);
    saveGoalDoc(data);
    console.log(JSON.stringify({ ok: true, clarity: data.clarity }, null, 2));
    return;
  }
  if (cmd === 'show') {
    if (fs.existsSync(GOAL_FILE)) console.log(fs.readFileSync(GOAL_FILE, 'utf-8'));
    else console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' }));
    return;
  }
  if (cmd === 'lock') {
    const data = loadGoal();
    if (!data) { console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' })); return; }
    data.clarity = assessClarity(data);
    if (data.clarity.score < 50) { console.log(JSON.stringify({ ok: false, error: `需求明确程度过低 (${data.clarity.score}/100)` })); return; }
    data.locked = true;
    data.updatedAt = now();
    data.history.push({ at: now(), action: 'lock', detail: 'Goal 已锁定' });
    saveGoalDoc(data);
    console.log(JSON.stringify({ ok: true, locked: true, clarity: data.clarity }));
    return;
  }
  if (cmd === 'unlock') {
    const data = loadGoal();
    if (!data) { console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' })); return; }
    data.locked = false;
    data.updatedAt = now();
    data.history.push({ at: now(), action: 'unlock', detail: 'Goal 已解锁' });
    saveGoalDoc(data);
    console.log(JSON.stringify({ ok: true, locked: false }));
    return;
  }
  if (cmd === 'add-task') {
    const titleIdx = args.indexOf('--title');
    const acceptanceIdx = args.indexOf('--acceptance');
    const data = loadGoal();
    if (!data) { console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' })); return; }
    const task = { id: (data.tasks || []).length + 1, title: titleIdx !== -1 ? args[titleIdx + 1] : '未命名任务', acceptance: acceptanceIdx !== -1 ? args[acceptanceIdx + 1] : '', status: 'PENDING', evidence: null, createdAt: now() };
    data.tasks = data.tasks || [];
    data.tasks.push(task);
    data.updatedAt = now();
    data.history.push({ at: now(), action: 'add-task', detail: `添加任务: ${task.title}` });
    saveGoalDoc(data);
    console.log(JSON.stringify({ ok: true, task, total: data.tasks.length }));
    return;
  }
  if (cmd === 'complete-task') {
    const idIdx = args.indexOf('--id');
    const evidenceIdx = args.indexOf('--evidence');
    const data = loadGoal();
    if (!data) { console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' })); return; }
    const id = parseInt(args[idIdx + 1], 10);
    const task = (data.tasks || []).find(t => t.id === id);
    if (!task) { console.log(JSON.stringify({ ok: false, error: `任务 #${id} 不存在` })); return; }
    task.status = 'DONE';
    task.evidence = evidenceIdx !== -1 ? args[evidenceIdx + 1] : '';
    task.completedAt = now();
    data.updatedAt = now();
    data.history.push({ at: now(), action: 'complete-task', detail: `完成任务: ${task.title}` });
    saveGoalDoc(data);
    const done = data.tasks.filter(t => t.status === 'DONE').length;
    const total = data.tasks.length;
    console.log(JSON.stringify({ ok: true, task, progress: { done, total, allDone: done === total } }));
    return;
  }
  if (cmd === 'progress') {
    const data = loadGoal();
    if (!data) { console.log(JSON.stringify({ ok: false, error: 'Goal 文档不存在' })); return; }
    const done = (data.tasks || []).filter(t => t.status === 'DONE').length;
    const total = (data.tasks || []).length;
    console.log(JSON.stringify({ ok: true, title: data.title, locked: data.locked, clarity: data.clarity, progress: { done, total, allDone: done === total && total > 0 } }, null, 2));
    return;
  }
  console.log(JSON.stringify({ ok: false, error: '未知命令', usage: { init: 'init', refine: 'refine', assess: 'assess', show: 'show', lock: 'lock', unlock: 'unlock', 'add-task': 'add-task', 'complete-task': 'complete-task', progress: 'progress' } }, null, 2));
}

main();