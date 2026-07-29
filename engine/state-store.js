#!/usr/bin/env node
/**
 * state-store.js — State 持久化读写
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');

function load() {
  if (!fs.existsSync(STATE_FILE)) {
    return { state: 'IDLE', goal: null, subtasks: [], history: [], retryCount: { current: 0, max: 2 }, budget: { maxRounds: 10, maxSkillCalls: 20, maxMinutes: 120 }, consumed: { rounds: 0, skillCalls: 0, startedAt: null } };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function save(data) { fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function now() { return new Date().toISOString(); }

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'get') { console.log(JSON.stringify(load(), null, 2)); return; }
  if (cmd === 'set-goal') {
    const s = load();
    const goalStr = args[1];
    if (!goalStr) { console.log(JSON.stringify({ ok: false, error: '缺少 goal JSON 参数' })); return; }
    try { s.goal = JSON.parse(goalStr); } catch { s.goal = { summary: goalStr }; }
    s.consumed.startedAt = s.consumed.startedAt || now();
    if (!s.goalDoc) s.goalDoc = { title: '未命名任务', tasks: [], history: [], locked: false, createdAt: now() };
    if (s.goal.Goal) s.goalDoc.goal = s.goal.Goal;
    if (s.goal['Must Have']) s.goalDoc.mustHave = s.goal['Must Have'];
    if (s.goal['Must Not Have']) s.goalDoc.mustNotHave = s.goal['Must Not Have'];
    if (s.goal['验收步骤']) s.goalDoc.acceptance = s.goal['验收步骤'];
    s.goalDoc.updatedAt = now();
    s.goalDoc.history.push({ at: now(), action: 'set-goal', detail: '通过 state-store 同步 Goal' });
    save(s);
    console.log(JSON.stringify({ ok: true, goal: s.goal, goalDocSynced: true }));
    return;
  }
  if (cmd === 'add-subtask') {
    const s = load();
    const titleIdx = args.indexOf('--title');
    const typeIdx = args.indexOf('--type');
    const mustHaveIdx = args.indexOf('--must-have');
    const dependsOnIdx = args.indexOf('--depends-on');
    const subtask = { id: s.subtasks.length + 1, title: titleIdx !== -1 ? args[titleIdx + 1] : '未命名子任务', type: typeIdx !== -1 ? args[typeIdx + 1] : 'other', status: 'PENDING', mustHave: mustHaveIdx !== -1 ? args[mustHaveIdx + 1] : '', dependsOn: dependsOnIdx !== -1 ? args[dependsOnIdx + 1].split(',').map(Number) : [], createdAt: now(), evidence: null };
    s.subtasks.push(subtask);
    save(s);
    console.log(JSON.stringify({ ok: true, subtask, total: s.subtasks.length }));
    return;
  }
  if (cmd === 'update-subtask') {
    const s = load();
    const idIdx = args.indexOf('--id');
    const statusIdx = args.indexOf('--status');
    const evidenceIdx = args.indexOf('--evidence');
    if (idIdx === -1) { console.log(JSON.stringify({ ok: false, error: '缺少 --id 参数' })); return; }
    const id = parseInt(args[idIdx + 1], 10);
    const subtask = s.subtasks.find(t => t.id === id);
    if (!subtask) { console.log(JSON.stringify({ ok: false, error: `子任务 #${id} 不存在` })); return; }
    if (statusIdx !== -1) { subtask.status = args[statusIdx + 1]; subtask.updatedAt = now(); }
    if (evidenceIdx !== -1) { subtask.evidence = args[evidenceIdx + 1]; }
    save(s);
    const done = s.subtasks.filter(t => t.status === 'DONE').length;
    const total = s.subtasks.length;
    console.log(JSON.stringify({ ok: true, subtask, progress: { done, total, allDone: done === total } }));
    return;
  }
  if (cmd === 'log-skill-call') { const s = load(); s.consumed.skillCalls += 1; save(s); console.log(JSON.stringify({ ok: true, skillCalls: s.consumed.skillCalls })); return; }
  if (cmd === 'archive') {
    const s = load();
    const toIdx = args.indexOf('--to');
    const dest = toIdx !== -1 ? args[toIdx + 1] : path.join(__dirname, '..', 'archive', `state-${Date.now()}.json`);
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(STATE_FILE, dest);
    console.log(JSON.stringify({ ok: true, archived: dest }));
    return;
  }
  console.log(JSON.stringify({ ok: false, error: '未知命令' }, null, 2));
}

main();