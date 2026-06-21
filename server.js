const path = require('path');
const Koa = require('koa');
const serve = require('koa-static');

const app = new Koa();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// ---------- 静态资源 ----------
// koa-static 会按文件后缀自动设置 Content-Type
// 同时支持 "请求路径对应文件不存在时" 的下一步中间件
app.use(
  serve(ROOT, {
    index: 'index.html',          // 请求目录时默认返回 index.html
    maxage: 0,                    // 开发期不缓存，刷新浏览器即最新
    hidden: false,                // 不对外暴露隐藏文件（例如 .env）
    defer: false,                 // 先处理静态资源，再走后续中间件
    extensions: []                // 不自动补后缀，保持路径语义明确
  })
);

// ---------- 健康检查 ----------
app.use(async (ctx, next) => {
  if (ctx.path === '/health' && ctx.method === 'GET') {
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { status: 'ok', service: 'sanguo-zhanqi', time: new Date().toISOString() };
    return;
  }
  await next();
});

// ---------- 404 处理 ----------
// 静态资源没命中时走这里：HTML 请求回落到 index.html（单页应用式回退），
// 其余类型返回 404 JSON。
app.use(async (ctx) => {
  const accept = ctx.accepts('html', 'json');

  if (accept === 'html') {
    // 未知路径回到首页，避免刷新子路由时挂掉
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>三国战棋</title>
<meta http-equiv="refresh" content="0; url=/">
</head>
<body>
<p>路径不存在，正在跳回 <a href="/">首页</a>...</p>
</body>
</html>`;
    ctx.status = 404;
    return;
  }

  ctx.type = 'application/json; charset=utf-8';
  ctx.status = 404;
  ctx.body = { error: 'Not Found', path: ctx.path };
});

// ---------- 错误兜底 ----------
app.on('error', (err, ctx) => {
  console.error('[server]', err.message, ctx && ctx.path);
});

app.listen(PORT, () => {
  console.log(`\n  三国战棋 · Koa 服务已启动`);
  console.log(`  本地访问: http://localhost:${PORT}/`);
  console.log(`  工作目录: ${ROOT}\n`);
});
