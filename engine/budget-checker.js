#!/usr/bin/env node
/**
 * budget-checker.js — 预算检查
 *
 * 预算维度（5 维）：rounds / skillCalls / minutes / tokens / costUsd。
 * 后两维是 2026-10-12 新增，参考 BearAgent 的预算模型。
 * 软上限：任意维度到 80% 时 warning；到 100% 时 exceeded。
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');

const DEFAULT_BUDGET = {
  maxRounds: 10,
  maxSkillCalls: 20,
  maxMinutes: 120,
  maxTokens: 200000,
  maxCostUsd: 1.0,
};

function load() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      budget: { ...DEFAULT_BUDGET },
      consumed: { rounds: 0, skillCalls: 0, startedAt: null, tokens: 0, costUsd: 0 },
    };
  }
  const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  s.budget = { ...DEFAULT_BUDGET, ...s.budget };
  s.consumed = { rounds: 0, skillCalls: 0, startedAt: null, tokens: 0, costUsd: 0, ...s.consumed };
  return s;
}

function save(data) { fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function checkDimension(name, used, limit, unit) {
  const r = { name, used, limit, unit, ratio: limit > 0 ? used / limit : 0, exceeded: false, warning: null };
  if (limit > 0 && used >= limit) { r.exceeded = true; r.warning = name + '已超：' + used + '/' + limit + ' ' + unit; }
  else if (limit > 0 && used >= limit * 0.8) { r.warning = name + '接近上限：' + used + '/' + limit + ' ' + unit; }
  return r;
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'check') {
    const s = load();
    const b = s.budget;
    const c = s.consumed;

    const dims = [
      checkDimension('轮数', c.rounds, b.maxRounds, ''),
      checkDimension('Skill调用', c.skillCalls, b.maxSkillCalls, ''),
      checkDimension('Token', c.tokens, b.maxTokens, ''),
      checkDimension('成本', c.costUsd, b.maxCostUsd, 'USD'),
    ];

    let minutesResult = { name: '时间', used: 0, limit: b.maxMinutes, unit: '分钟', ratio: 0, exceeded: false, warning: null };
    if (b.maxMinutes > 0 && c.startedAt) {
      const elapsed = (Date.now() - new Date(c.startedAt).getTime()) / 60000;
      minutesResult.used = parseFloat(elapsed.toFixed(1));
      minutesResult.ratio = elapsed / b.maxMinutes;
      if (elapsed >= b.maxMinutes) { minutesResult.exceeded = true; minutesResult.warning = '时间已超：' + elapsed.toFixed(1) + '/' + b.maxMinutes + ' 分钟'; }
      else if (elapsed >= b.maxMinutes * 0.8) minutesResult.warning = '时间接近上限：' + elapsed.toFixed(1) + '/' + b.maxMinutes + ' 分钟';
    }
    dims.push(minutesResult);

    const result = {
      budget: b,
      consumed: c,
      dimensions: dims,
      exceeded: dims.some(d => d.exceeded),
      warnings: dims.filter(d => d.warning).map(d => d.warning),
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'set') {
    const s = load();
    const map = {
      '--max-rounds': 'maxRounds',
      '--max-skill-calls': 'maxSkillCalls',
      '--max-minutes': 'maxMinutes',
      '--max-tokens': 'maxTokens',
      '--max-cost-usd': 'maxCostUsd',
    };
    for (const [flag, field] of Object.entries(map)) {
      const idx = args.indexOf(flag);
      if (idx !== -1) s.budget[field] = parseFloat(args[idx + 1]);
    }
    save(s);
    console.log(JSON.stringify({ ok: true, budget: s.budget }));
    return;
  }

  if (cmd === 'add-round') { const s = load(); s.consumed.rounds += 1; save(s); console.log(JSON.stringify({ ok: true, rounds: s.consumed.rounds })); return; }
  if (cmd === 'add-skill-call') { const s = load(); s.consumed.skillCalls += 1; save(s); console.log(JSON.stringify({ ok: true, skillCalls: s.consumed.skillCalls })); return; }

  // 用法：node budget-checker.js add-tokens --prompt 1200 --completion 300 [--cost 0.002]
  if (cmd === 'add-tokens') {
    const s = load();
    const pIdx = args.indexOf('--prompt');
    const cIdx = args.indexOf('--completion');
    const costIdx = args.indexOf('--cost');
    const prompt = pIdx !== -1 ? parseInt(args[pIdx + 1], 10) : 0;
    const completion = cIdx !== -1 ? parseInt(args[cIdx + 1], 10) : 0;
    s.consumed.tokens += prompt + completion;
    if (costIdx !== -1) s.consumed.costUsd += parseFloat(args[costIdx + 1]);
    save(s);
    console.log(JSON.stringify({ ok: true, tokens: s.consumed.tokens, costUsd: s.consumed.costUsd }));
    return;
  }

  console.log(JSON.stringify({ ok: false, error: '未知命令' }, null, 2));
}

// 导出纯函数给测试用（不影响 CLI 行为）
module.exports = { checkDimension, DEFAULT_BUDGET };

if (require.main === module) main();
