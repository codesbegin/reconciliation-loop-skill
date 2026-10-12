#!/usr/bin/env node
/**
 * guardrails.js — 步骤输出校验
 *
 * 参考 OpenAI Agents SDK 的 Guardrails 设计：在状态机每步转移前强制校验输出格式，
 * 防止 LLM 返回格式错误的 JSON / 非法状态值 / 缺失关键字段。
 *
 * 用法：
 *   node guardrails.js validate --step goal-defined --output '{...}'
 *
 * 退出码：0 = 通过，1 = 校验失败。失败时在 stdout 输出 { ok:false, errors:[...] }。
 */

// 每一步期望的输出 schema（宽松校验：关键字段必须存在且类型对）
const STEP_SCHEMAS = {
  'requirement-analyzed': {
    required: [
      { key: 'summary', type: 'string' },
      { key: 'ambiguities', type: 'array' },
    ],
  },
  'goal-defined': {
    required: [
      { key: 'goal', type: 'object' },
      { key: 'mustHave', type: 'array' },
    ],
  },
  'steps-decomposed': {
    required: [
      { key: 'subtasks', type: 'array' },
    ],
  },
  'skill-dispatched': {
    required: [
      { key: 'skillName', type: 'string' },
    ],
  },
  'step-verified': {
    required: [
      { key: 'result', type: 'string' }, // PASS | FAIL | UNKNOWN
    ],
    allowedValues: [
      { key: 'result', values: ['PASS', 'FAIL', 'UNKNOWN'] },
    ],
  },
  'exception-handled': {
    required: [
      { key: 'action', type: 'string' }, // retry | escalate | abort
    ],
  },
  'goal-converged': {
    required: [
      { key: 'converged', type: 'boolean' },
    ],
  },
};

function getType(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function validateOutput(step, output) {
  const errors = [];
  const schema = STEP_SCHEMAS[step];
  if (!schema) {
    // 未知步骤不强制校验，只警告
    return { ok: true, warnings: ['未知步骤 ' + step + '，跳过校验'] };
  }
  for (const field of schema.required || []) {
    if (!(field.key in output)) {
      errors.push('缺少字段: ' + field.key);
      continue;
    }
    const actual = getType(output[field.key]);
    if (actual !== field.type) {
      errors.push('字段 ' + field.key + ' 类型错误: 期望 ' + field.type + '，实际 ' + actual);
    }
  }
  for (const field of schema.allowedValues || []) {
    if (field.key in output && !field.values.includes(output[field.key])) {
      errors.push('字段 ' + field.key + ' 取值非法: ' + output[field.key] + '，允许 ' + field.values.join('/'));
    }
  }
  return { ok: errors.length === 0, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] !== 'validate') {
    console.log(JSON.stringify({ ok: false, error: '用法: node guardrails.js validate --step <step> --output <json>' }));
    process.exit(1);
  }
  const stepIdx = args.indexOf('--step');
  const outIdx = args.indexOf('--output');
  if (stepIdx === -1 || outIdx === -1) {
    console.log(JSON.stringify({ ok: false, error: '缺少 --step 或 --output 参数' }));
    process.exit(1);
  }
  const step = args[stepIdx + 1];
  let output;
  try { output = JSON.parse(args[outIdx + 1]); }
  catch (e) { console.log(JSON.stringify({ ok: false, errors: ['output 不是合法 JSON: ' + e.message] })); process.exit(1); }
  const result = validateOutput(step, output);
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();
module.exports = { validateOutput, STEP_SCHEMAS };
