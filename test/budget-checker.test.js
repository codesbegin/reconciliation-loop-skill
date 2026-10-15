#!/usr/bin/env node
/**
 * budget-checker 单元测试
 * 运行：node test/budget-checker.test.js
 *
 * 只测纯函数 checkDimension 和 DEFAULT_BUDGET，
 * 不碰 state.json / 不跑 CLI。
 */

const assert = require('node:assert/strict');
const { checkDimension, DEFAULT_BUDGET } = require('../engine/budget-checker.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { console.error('  ❌ ' + name + ' — ' + e.message); process.exitCode = 1; }
}

console.log('budget-checker 测试：');

test('DEFAULT_BUDGET 含 5 个维度', () => {
  assert.deepEqual(
    Object.keys(DEFAULT_BUDGET).sort(),
    ['maxCostUsd', 'maxMinutes', 'maxRounds', 'maxSkillCalls', 'maxTokens'].sort(),
  );
});

test('低于 80% 既不 warning 也不 exceeded', () => {
  const r = checkDimension('轮数', 5, 10, '');
  assert.equal(r.exceeded, false);
  assert.equal(r.warning, null);
  assert.equal(r.ratio, 0.5);
});

test('刚好 80% 触发 warning 但不 exceeded', () => {
  const r = checkDimension('Token', 160000, 200000, '');
  assert.equal(r.warning, 'Token接近上限：160000/200000 ');
  assert.equal(r.exceeded, false);
});

test('99% 仍然是 warning', () => {
  const r = checkDimension('成本', 0.99, 1.0, 'USD');
  assert.equal(r.exceeded, false);
  assert.match(r.warning, /^成本接近上限/);
});

test('100% 触发 exceeded', () => {
  const r = checkDimension('轮数', 10, 10, '');
  assert.equal(r.exceeded, true);
  assert.match(r.warning, /已超/);
});

test('超过 100% 也是 exceeded（不漏报）', () => {
  const r = checkDimension('Skill调用', 25, 20, '');
  assert.equal(r.exceeded, true);
  assert.equal(r.ratio, 1.25);
});

test('limit = 0 表示不限制，永远不触发', () => {
  const r = checkDimension('轮数', 999, 0, '');
  assert.equal(r.exceeded, false);
  assert.equal(r.warning, null);
  assert.equal(r.ratio, 0);
});

test('unit 原样保留', () => {
  const r = checkDimension('成本', 1.0, 1.0, 'USD');
  assert.equal(r.unit, 'USD');
});

console.log('\n' + passed + ' 个测试通过');
