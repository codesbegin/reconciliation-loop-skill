/**
 * goal-manager.test.js — assessClarity / goalTemplate 单元测试
 *
 * 人介入点（needsApproval / approve-task / reject-task）走 state.json IO，
 * 等后续把状态机抽成纯函数再补；当前先覆盖纯函数部分。
 */

const assert = require('assert');
const { goalTemplate, assessClarity } = require('../engine/goal-manager.js');

let passed = 0;
let failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' — ' + e.message); }
}

console.log('goal-manager / assessClarity');

t('空数据 → 低分、gaps 列出所有缺失项', () => {
  const r = assessClarity({});
  assert.ok(r.score <= 20, 'score should be low, got ' + r.score);
  assert.ok(r.gaps.length >= 4, 'should list multiple gaps, got ' + r.gaps.length);
  assert.ok(r.level.includes('🔴') || r.level.includes('🟠'));
});

t('Goal 太短 → 部分分 + 提示', () => {
  const r = assessClarity({ goal: '短' });
  assert.ok(r.score >= 10);
  assert.ok(r.gaps.some(g => g.includes('Goal')));
});

t('完整数据 → 高分、🟢 明确', () => {
  const r = assessClarity({
    goal: '这是一段足够长的 Goal 描述，超过二十个字才算数',
    mustHave: '第一行\n第二行',
    mustNotHave: '禁止做 X',
    acceptance: '步骤一\n步骤二',
    budget: '最多 10 美元',
  });
  assert.strictEqual(r.score, 100);
  assert.ok(r.level.includes('🟢'));
  assert.deepStrictEqual(r.gaps, []);
});

console.log('\ngoal-manager / goalTemplate');

t('模板包含 PENDING_APPROVAL 任务的 ⏸️ 图标和审批标记', () => {
  const md = goalTemplate({
    title: '测试',
    locked: true,
    tasks: [
      { title: '普通任务', status: 'PENDING', acceptance: '验收', needsApproval: false },
      { title: '需审批任务', status: 'PENDING_APPROVAL', acceptance: '验收', needsApproval: true },
      { title: '已完成任务', status: 'DONE', acceptance: '验收', needsApproval: true, evidence: '已交付' },
    ],
    clarity: { score: 80, level: '🟢 明确', gaps: [] },
  });
  assert.ok(md.includes('⬜ 普通任务'));
  assert.ok(md.includes('⏸️ 需审批任务') && md.includes('[需审批]'));
  assert.ok(md.includes('✅ 已完成任务') && md.includes('[审批过]') && md.includes('已交付'));
});

t('模板在无 gaps 时显示「所有关键字段已明确」', () => {
  const md = goalTemplate({ clarity: { score: 100, level: '🟢', gaps: [] } });
  assert.ok(md.includes('所有关键字段已明确'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
