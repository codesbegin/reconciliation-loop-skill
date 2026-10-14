const fs = require('fs');
const path = require('path');
const { validateOutput } = require('./guardrails.js');

const STATE_FILE = path.join(__dirname, 'state.json');
const MAX_RETRIES = 2;

const STATES = {
  IDLE: 'IDLE',
  ANALYZING: 'ANALYZING',
  REFINING_GOAL: 'REFINING_GOAL',
  GOAL_DEFINED: 'GOAL_DEFINED',
  DECOMPOSING: 'DECOMPOSING',
  EXECUTING: 'EXECUTING',
  VERIFYING: 'VERIFYING',
  HANDLING_EXCEPTION: 'HANDLING_EXCEPTION',
  CONVERGING: 'CONVERGING',
  DONE: 'DONE',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  FAILED: 'FAILED',
};

const TRANSITIONS = {
  [STATES.IDLE]: [STATES.ANALYZING],
  [STATES.ANALYZING]: [STATES.REFINING_GOAL],
  [STATES.REFINING_GOAL]: [STATES.GOAL_DEFINED, STATES.ANALYZING],
  [STATES.GOAL_DEFINED]: [STATES.DECOMPOSING, STATES.REFINING_GOAL],
  [STATES.DECOMPOSING]: [STATES.EXECUTING, STATES.GOAL_DEFINED],
  [STATES.EXECUTING]: [STATES.VERIFYING, STATES.HANDLING_EXCEPTION, STATES.CONVERGING],
  [STATES.VERIFYING]: [STATES.EXECUTING, STATES.HANDLING_EXCEPTION, STATES.CONVERGING],
  [STATES.HANDLING_EXCEPTION]: [STATES.EXECUTING, STATES.FAILED],
  [STATES.CONVERGING]: [STATES.DONE, STATES.EXECUTING],
  [STATES.DONE]: [STATES.IDLE],
  [STATES.FAILED]: [STATES.IDLE],
  [STATES.BUDGET_EXCEEDED]: [STATES.IDLE],
};

const BUDGET_STOP_STATES = [STATES.ANALYZING, STATES.REFINING_GOAL, STATES.EXECUTING, STATES.VERIFYING,
  STATES.HANDLING_EXCEPTION, STATES.CONVERGING, STATES.DECOMPOSING, STATES.GOAL_DEFINED];

const TERMINAL_STATES = [STATES.DONE, STATES.FAILED, STATES.BUDGET_EXCEEDED];

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { state: STATES.IDLE, goal: null, subtasks: [], history: [], retryCount: { current: 0, max: MAX_RETRIES }, budget: { maxRounds: 10, maxSkillCalls: 20, maxMinutes: 120 }, consumed: { rounds: 0, skillCalls: 0, startedAt: null } };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function now() {
  return new Date().toISOString();
}

function checkBudget(s) {
  if (s.budget.maxRounds > 0 && s.consumed.rounds >= s.budget.maxRounds) {
    return { exceeded: true, reason: `已用轮数 ${s.consumed.rounds}/${s.budget.maxRounds}，超出预算` };
  }
  if (s.budget.maxSkillCalls > 0 && s.consumed.skillCalls >= s.budget.maxSkillCalls) {
    return { exceeded: true, reason: `已用 Skill 调用次数 ${s.consumed.skillCalls}/${s.budget.maxSkillCalls}，超出预算` };
  }
  if (s.budget.maxMinutes > 0 && s.consumed.startedAt) {
    const elapsed = (Date.now() - new Date(s.consumed.startedAt).getTime()) / 60000;
    if (elapsed >= s.budget.maxMinutes) {
      return { exceeded: true, reason: `已用时间 ${elapsed.toFixed(1)}/${s.budget.maxMinutes} 分钟，超出预算` };
    }
  }
  return { exceeded: false };
}

function transition(from, to, extra = {}) {
  const s = loadState();
  if (s.state !== from) {
    return { ok: false, error: `当前状态是 ${s.state}，不是 ${from}。请先运行 'node engine/statemachine.js current' 确认。` };
  }
  const allowed = [...(TRANSITIONS[from] || [])];
  if (BUDGET_STOP_STATES.includes(from) && to !== STATES.BUDGET_EXCEEDED) {
    allowed.push(STATES.BUDGET_EXCEEDED);
  }
  if (!allowed.includes(to)) {
    return { ok: false, error: `非法跳步：${from} → ${to} 不被允许。`, allowedTransitions: allowed };
  }
  // 守卫：如果调用方带了 --validate-step，先校验输出再跳
  if (extra.validateStep && extra.validateOutput) {
    const vr = validateOutput(extra.validateStep, extra.validateOutput);
    if (!vr.ok) {
      return { ok: false, error: '步骤输出未通过 guardrails 校验', guardrails: vr };
    }
  }
  if (to !== STATES.BUDGET_EXCEEDED && to !== STATES.IDLE && to !== STATES.FAILED) {
    const budget = checkBudget(s);
    if (budget.exceeded) {
      s.state = STATES.BUDGET_EXCEEDED;
      s.history.push({ from: s.state, to: STATES.BUDGET_EXCEEDED, at: now(), reason: budget.reason, auto: true });
      saveState(s);
      return { ok: false, state: STATES.BUDGET_EXCEEDED, error: budget.reason, autoTransitioned: true };
    }
  }
  if (from === STATES.HANDLING_EXCEPTION && to === STATES.EXECUTING) {
    s.retryCount.current += 1;
    if (s.retryCount.current > s.retryCount.max) {
      s.state = STATES.FAILED;
      s.history.push({ from: STATES.HANDLING_EXCEPTION, to: STATES.FAILED, at: now(), reason: `重试次数 ${s.retryCount.current}/${s.retryCount.max}，已达上限`, auto: true });
      saveState(s);
      return { ok: false, state: STATES.FAILED, error: `重试次数已达上限（${s.retryCount.max} 次），任务失败。`, autoTransitioned: true };
    }
  }
  if (to === STATES.EXECUTING) {
    s.consumed.rounds += 1;
  }
  const prevState = s.state;
  s.state = to;
  s.history.push({ from: prevState, to, at: now(), step: extra.step, auto: false, guardrails: extra.validateStep ? 'passed' : undefined });
  if (extra.goal) { s.goal = extra.goal; s.consumed.startedAt = s.consumed.startedAt || now(); }
  if (extra.subtasks) { s.subtasks = extra.subtasks; }
  if (extra.skillCall) { s.consumed.skillCalls += 1; }
  saveState(s);
  return { ok: true, state: s.state, prevState, retryCount: { current: s.retryCount.current, max: s.retryCount.max, remaining: s.retryCount.max - s.retryCount.current }, consumed: { ...s.consumed }, budget: { ...s.budget } };
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'current') {
    const s = loadState();
    const budget = checkBudget(s);
    console.log(JSON.stringify({ state: s.state, goal: s.goal ? { summary: s.goal.Goal || s.goal.summary } : null, subtasks: { total: s.subtasks.length, done: s.subtasks.filter(t => t.status === 'DONE').length, pending: s.subtasks.filter(t => t.status !== 'DONE').length }, retryCount: s.retryCount, consumed: s.consumed, budget: s.budget, budgetExceeded: budget.exceeded, history: s.history.slice(-5), terminalState: TERMINAL_STATES.includes(s.state) }, null, 2));
    return;
  }
  if (cmd === 'reset') {
    saveState({ state: STATES.IDLE, goal: null, subtasks: [], history: [], retryCount: { current: 0, max: MAX_RETRIES }, budget: { maxRounds: 10, maxSkillCalls: 20, maxMinutes: 120 }, consumed: { rounds: 0, skillCalls: 0, startedAt: null } });
    console.log(JSON.stringify({ ok: true, state: STATES.IDLE, message: '状态已重置' }));
    return;
  }
  if (cmd === 'transition') {
    const toIdx = args.indexOf('--to');
    const goalIdx = args.indexOf('--goal');
    const stepIdx = args.indexOf('--step');
    const subtaskIdx = args.indexOf('--subtasks');
    const skillCallIdx = args.indexOf('--skill-call');
    const validateStepIdx = args.indexOf('--validate-step');
    const validateOutIdx = args.indexOf('--validate-output');
    if (toIdx === -1) { console.log(JSON.stringify({ ok: false, error: '缺少 --to 参数' })); return; }
    const to = args[toIdx + 1];
    const s = loadState();
    const extra = {};
    if (stepIdx !== -1) extra.step = parseInt(args[stepIdx + 1], 10);
    if (goalIdx !== -1) { try { extra.goal = JSON.parse(args[goalIdx + 1]); } catch { extra.goal = { summary: args[goalIdx + 1] }; } }
    if (subtaskIdx !== -1) { try { extra.subtasks = JSON.parse(args[subtaskIdx + 1]); } catch { extra.subtasks = []; } }
    if (skillCallIdx !== -1) extra.skillCall = true;
    if (validateStepIdx !== -1) {
      extra.validateStep = args[validateStepIdx + 1];
      if (validateOutIdx !== -1) {
        try { extra.validateOutput = JSON.parse(args[validateOutIdx + 1]); }
        catch (e) { console.log(JSON.stringify({ ok: false, error: '--validate-output 不是合法 JSON: ' + e.message })); return; }
      }
    }
    console.log(JSON.stringify(transition(s.state, to, extra), null, 2));
    return;
  }
  console.log(JSON.stringify({ ok: false, error: '未知命令', usage: { current: '查看当前状态', reset: '重置状态机', transition: 'transition', 'transition --validate-step <step> --validate-output <json>': '跳步前先过 guardrails 校验' } }, null, 2));
}

main();
