  console.log(JSON.stringify({ ok: false, error: '未知命令' }, null, 2));
}

// 导出纯函数给测试用（不影响 CLI 行为）
module.exports = { checkDimension, DEFAULT_BUDGET };

main();
