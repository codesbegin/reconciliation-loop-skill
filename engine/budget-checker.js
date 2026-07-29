#!/usr/bin/env node
/**
 * budget-checker.js — 预算检查
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');

function load() {
  if (!fs.existsSync(STATE_FILE)) return { state: 'IDLE', budget: { maxRounds: 10, maxSkillCalls: 20, maxMinutes: 120 }, consumed: { rounds: 0, skillCalls: 0, startedAt: null } };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function save(data) { fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'check') {
    const s = load();
    const b = s.budget;
    const c = s.consumed;
    const result = { budget: b, consumed: c, remaining: { rounds: b.maxRounds > 0 ? b.maxRounds - c.rounds : Infinity, skillCalls: b.maxSkillCalls > 0 ? b.maxSkillCalls - c.skillCalls : Infinity, minutes: 'N/A' }, exceeded: false, warnings: [] };
    if (b.maxRounds > 0 && c.rounds >= b.maxRounds) { result.exceeded = true; result.warnings.push(`轮数已超：${c.rounds}/${b.maxRounds}`); }
    else if (b.maxRounds > 0 && c.rounds >= b.maxRounds * 0.8) result.warnings.push(`轮数接近上限：${c.rounds}/${b.maxRounds}`);
    if (b.maxSkillCalls > 0 && c.skillCalls >= b.maxSkillCalls) { result.exceeded = true; result.warnings.push(`Skill 调用次数已超：${c.skillCalls}/${b.maxSkillCalls}`); }
    else if (b.maxSkillCalls > 0 && c.skillCalls >= b.maxSkillCalls * 0.8) result.warnings.push(`Skill 调用次数接近上限：${c.skillCalls}/${b.maxSkillCalls}`);
    if (b.maxMinutes > 0 && c.startedAt) {
      const elapsed = (Date.now() - new Date(c.startedAt).getTime()) / 60000;
      result.remaining.minutes = Math.max(0, b.maxMinutes - elapsed).toFixed(1);
      if (elapsed >= b.maxMinutes) { result.exceeded = true; result.warnings.push(`时间已超：${elapsed.toFixed(1)}/${b.maxMinutes} 分钟`); }
      else if (elapsed >= b.maxMinutes * 0.8) result.warnings.push(`时间接近上限：${elapsed.toFixed(1)}/${b.maxMinutes} 分钟`);
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (cmd === 'set') {
    const s = load();
    const mrIdx = args.indexOf('--max-rounds');
    const msIdx = args.indexOf('--max-skill-calls');
    const mmIdx = args.indexOf('--max-minutes');
    if (mrIdx !== -1) s.budget.maxRounds = parseInt(args[mrIdx + 1], 10);
    if (msIdx !== -1) s.budget.maxSkillCalls = parseInt(args[msIdx + 1], 10);
    if (mmIdx !== -1) s.budget.maxMinutes = parseInt(args[mmIdx + 1], 10);
    save(s);
    console.log(JSON.stringify({ ok: true, budget: s.budget }));
    return;
  }
  if (cmd === 'add-round') { const s = load(); s.consumed.rounds += 1; save(s); console.log(JSON.stringify({ ok: true, rounds: s.consumed.rounds })); return; }
  if (cmd === 'add-skill-call') { const s = load(); s.consumed.skillCalls += 1; save(s); console.log(JSON.stringify({ ok: true, skillCalls: s.consumed.skillCalls })); return; }
  console.log(JSON.stringify({ ok: false, error: '未知命令' }, null, 2));
}

main();