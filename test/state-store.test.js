/**
 * state-store.test.js — applyPatchToState 单元测试
 *
 * 覆盖：白名单允许 / 白名单拒绝 / 部分应用 / 不影响其他字段 / 输入不可变
 */

const assert = require('assert');
const { PATCHABLE_FIELDS, applyPatchToState } = require('../engine/state-store.js');

let passed = 0;
let failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' — ' + e.message); }
}

const baseState = {
  state: 'IDLE',
  goal: null,
  subtasks: [],
  history: [],
  retryCount: { current: 0, max: 2 },
  budget: { maxRounds: 10 },
  consumed: { rounds: 0, tokens: 0 },
  goalDoc: null,
};

console.log('state-store / applyPatchToState');

t('白名单字段被应用', () => {
  const { next, applied, rejected } = applyPatchToState(baseState, { state: 'RUNNING' });
  assert.strictEqual(next.state, 'RUNNING');
  assert.deepStrictEqual(applied, ['state']);
  assert.deepStrictEqual(rejected, []);
});

t('budget 不在白名单，被拒绝', () => {
  const { next, rejected } = applyPatchToState(baseState, { budget: { maxRounds: 999 } });
  assert.deepStrictEqual(next.budget, { maxRounds: 10 }); // 原样保留
  assert.deepStrictEqual(rejected, ['budget']);
});

t('混合 patch：部分应用，部分拒绝', () => {
  const { next, applied, rejected } = applyPatchToState(baseState, {
    state: 'RUNNING',
    goal: { summary: 'x' },
    budget: { maxRounds: 999 },
  });
  assert.strictEqual(next.state, 'RUNNING');
  assert.deepStrictEqual(next.goal, { summary: 'x' });
  assert.deepStrictEqual(next.budget, { maxRounds: 10 });
  assert.deepStrictEqual(applied.sort(), ['goal', 'state']);
  assert.deepStrictEqual(rejected, ['budget']);
});

t('不修改原 state（不可变）', () => {
  const snapshot = JSON.stringify(baseState);
  applyPatchToState(baseState, { state: 'RUNNING', goal: { summary: 'x' } });
  assert.strictEqual(JSON.stringify(baseState), snapshot);
});

t('白名单集合包含预期字段', () => {
  for (const k of ['state', 'goal', 'subtasks', 'history', 'retryCount', 'consumed', 'goalDoc']) {
    assert.ok(PATCHABLE_FIELDS.has(k), 'missing ' + k);
  }
  // 关键：budget 一定不能在白名单
  assert.ok(!PATCHABLE_FIELDS.has('budget'));
});

t('空 patch 返回空 applied/rejected', () => {
  const { next, applied, rejected } = applyPatchToState(baseState, {});
  assert.deepStrictEqual(applied, []);
  assert.deepStrictEqual(rejected, []);
  assert.deepStrictEqual(next, baseState);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
