/**
 * statemachine.test.js — isTransitionAllowed / checkBudget 纯函数测试
 */

const assert = require('assert');
const {
  STATES,
  isTransitionAllowed,
  checkBudget,
  BUDGET_STOP_STATES,
  TERMINAL_STATES,
} = require('../engine/statemachine.js');

let passed = 0;
let failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' — ' + e.message); }
}

console.log('statemachine / isTransitionAllowed');

t('正常向前跳（IDLE → ANALYZING）被允许', () => {
  assert.ok(isTransitionAllowed(STATES.IDLE, STATES.ANALYZING));
});

t('非法跳步（IDLE → EXECUTING）被拒绝', () => {
  assert.ok(!isTransitionAllowed(STATES.IDLE, STATES.EXECUTING));
});

t('BUDGET_STOP_STATES 中的状态允许跳到 BUDGET_EXCEEDED', () => {
  for (const s of BUDGET_STOP_STATES) {
    assert.ok(isTransitionAllowed(s, STATES.BUDGET_EXCEEDED), s + ' should allow BUDGET_EXCEEDED');
  }
});

t('非 BUDGET_STOP_STATES 状态（如 DONE）不允许跳 BUDGET_EXCEEDED', () => {
  assert.ok(!isTransitionAllowed(STATES.DONE, STATES.BUDGET_EXCEEDED));
});

t('VERIFYING → HANDLING_EXCEPTION 被允许', () => {
  assert.ok(isTransitionAllowed(STATES.VERIFYING, STATES.HANDLING_EXCEPTION));
});

console.log('\nstatemachine / checkBudget');

const base = {
  budget: { maxRounds: 10, maxSkillCalls: 20, maxMinutes: 120 },
  consumed: { rounds: 0, skillCalls: 0, startedAt: null },
};

t('未超预算 → exceeded=false', () => {
  const r = checkBudget(base);
  assert.strictEqual(r.exceeded, false);
});

t('轮数超限 → exceeded=true 带 reason', () => {
  const r = checkBudget({ ...base, consumed: { ...base.consumed, rounds: 10 } });
  assert.strictEqual(r.exceeded, true);
  assert.ok(r.reason.includes('轮数'));
});

t('Skill 调用超限 → exceeded=true', () => {
  const r = checkBudget({ ...base, consumed: { ...base.consumed, skillCalls: 20 } });
  assert.strictEqual(r.exceeded, true);
  assert.ok(r.reason.includes('Skill'));
});

t('maxRounds=0 表示不限制轮数', () => {
  const r = checkBudget({
    budget: { maxRounds: 0, maxSkillCalls: 20, maxMinutes: 120 },
    consumed: { rounds: 999, skillCalls: 0, startedAt: null },
  });
  assert.strictEqual(r.exceeded, false);
});

t('TERMINAL_STATES 集合包含 DONE/FAILED/BUDGET_EXCEEDED', () => {
  assert.deepStrictEqual(
    [...TERMINAL_STATES].sort(),
    [STATES.BUDGET_EXCEEDED, STATES.DONE, STATES.FAILED].sort(),
  );
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
