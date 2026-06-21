const path = require('path');
const fs = require('fs');
const Koa = require('koa');
const serve = require('koa-static');

const app = new Koa();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DIY_FILE = path.join(ROOT, 'diy.json');
// 提交密码（默认 diy123，可通过环境变量覆盖）
const DIY_PASSWORD = process.env.DIY_PASSWORD || 'diy123';

// ============================================================
// 工具函数：读写 DIY 数据
// ============================================================
function readDiy() {
  try {
    if (fs.existsSync(DIY_FILE)) {
      const raw = fs.readFileSync(DIY_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[diy] read failed:', e.message);
  }
  return { generals: [], skills: [] };
}

function writeDiy(data) {
  try {
    fs.writeFileSync(DIY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[diy] write failed:', e.message);
    return false;
  }
}

// 安全地读取 JSON body
async function readJsonBody(ctx) {
  return new Promise((resolve, reject) => {
    let data = '';
    ctx.req.on('data', chunk => { data += chunk; });
    ctx.req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    ctx.req.on('error', reject);
  });
}

// ============================================================
// 静态资源
// ============================================================
app.use(
  serve(ROOT, {
    index: 'index.html',
    maxage: 0,
    hidden: false,
    defer: false,
    extensions: []
  })
);

// ============================================================
// DIY 接口（放在静态资源之前，因为路径以 /api/ 开头不会命中静态）
// ============================================================
app.use(async (ctx, next) => {
  if (!ctx.path.startsWith('/api/diy/')) return next();

  // POST /api/diy/submit  提交一个 DIY 武将（含其技能）
  if (ctx.path === '/api/diy/submit' && ctx.method === 'POST') {
    let body;
    try { body = await readJsonBody(ctx); }
    catch (e) { ctx.status = 400; ctx.body = { ok: false, error: '请求体格式错误' }; return; }

    const { general, skills, password } = body;

    // ---- 密码校验 ----
    if (!password || password !== DIY_PASSWORD) {
      ctx.status = 403;
      ctx.body = { ok: false, error: '密码错误' };
      return;
    }

    // ---- 武将必填字段校验 ----
    if (!general || typeof general !== 'object') {
      ctx.status = 400;
      ctx.body = { ok: false, error: '缺少武将定义' };
      return;
    }
    const gid = String(general.id || '').trim();
    const gname = String(general.name || '').trim();
    if (!gid || !gname) {
      ctx.status = 400;
      ctx.body = { ok: false, error: '武将 id 和 name 必填' };
      return;
    }
    if (!/^[a-zA-Z0-9_-]{2,20}$/.test(gid)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: '武将 id 需为 2-20 位字母/数字/下划线' };
      return;
    }

    // ---- 技能字段校验 ----
    const skillArr = Array.isArray(skills) ? skills : [];
    for (const s of skillArr) {
      const sid = String(s.id || '').trim();
      if (!sid) {
        ctx.status = 400;
        ctx.body = { ok: false, error: '每个技能都必须有 id' };
        return;
      }
      if (!/^[a-zA-Z0-9_-]{2,30}$/.test(sid)) {
        ctx.status = 400;
        ctx.body = { ok: false, error: '技能 id 需为 2-30 位字母/数字/下划线' };
        return;
      }
      if (!s.name || !String(s.name).trim()) {
        ctx.status = 400;
        ctx.body = { ok: false, error: '技能 name 必填' };
        return;
      }
      if (typeof s.filterCode !== 'string' || typeof s.contentCode !== 'string') {
        ctx.status = 400;
        ctx.body = { ok: false, error: '技能 filterCode / contentCode 必须是字符串' };
        return;
      }
    }

    // ---- 构造武将对象 ----
    const generalObj = {
      id: 'diy_' + gid,   // 统一加 diy_ 前缀避免与内置冲突
      name: gname,
      hp: Math.max(1, Math.min(10000, parseInt(general.hp) || 200)),
      atk: Math.max(0, Math.min(1000, parseInt(general.atk) || 50)),
      def: Math.max(0, Math.min(1000, parseInt(general.def) || 20)),
      moveRange: validateRange(general.moveRange, { shape: '+', n: 3 }),
      attackRange: validateRange(general.attackRange, { shape: '+', n: 1 }),
      skillIds: skillArr.map(s => 'diy_' + gid + '_' + String(s.id))
    };

    // ---- 构造技能对象 ----
    const skillObjs = skillArr.map(s => ({
      id: 'diy_' + gid + '_' + String(s.id),
      name: String(s.name),
      type: s.type === '被动' ? '被动' : '主动',
      cooldown: Math.max(0, Math.min(20, parseInt(s.cooldown) || 2)),
      trigger: s.trigger || null,
      desc: String(s.desc || ''),
      preview: s.preview ? validateRange(s.preview, null) : null,
      filterCode: String(s.filterCode || 'return actor && actor.alive && !actor.skilled;'),
      contentCode: String(s.contentCode || '')
    }));

    // ---- 保存 ----
    const all = readDiy();

    // 避免 id 冲突：先移除同名，再追加
    all.generals = all.generals.filter(g => g.id !== generalObj.id);
    all.generals.push(generalObj);

    const existingIds = new Set(skillObjs.map(s => s.id));
    all.skills = all.skills.filter(s => !existingIds.has(s.id));
    all.skills.push(...skillObjs);

    if (!writeDiy(all)) {
      ctx.status = 500;
      ctx.body = { ok: false, error: '写入文件失败' };
      return;
    }

    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, general: generalObj, skills: skillObjs };
    return;
  }

  // GET /api/diy/list   获取所有 DIY 武将和技能
  if (ctx.path === '/api/diy/list' && ctx.method === 'GET') {
    const all = readDiy();
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, generals: all.generals, skills: all.skills };
    return;
  }

  // POST /api/diy/delete  删除一个 DIY 武将（连同其技能一起）
  if (ctx.path === '/api/diy/delete' && ctx.method === 'POST') {
    let body;
    try { body = await readJsonBody(ctx); }
    catch (e) { ctx.status = 400; ctx.body = { ok: false, error: '请求体格式错误' }; return; }

    const { id, password } = body;
    if (!password || password !== DIY_PASSWORD) {
      ctx.status = 403;
      ctx.body = { ok: false, error: '密码错误' };
      return;
    }
    const fullId = String(id).startsWith('diy_') ? String(id) : 'diy_' + String(id);

    const all = readDiy();
    all.generals = all.generals.filter(g => g.id !== fullId);
    all.skills = all.skills.filter(s => !s.id.startsWith(fullId + '_'));
    writeDiy(all);

    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true };
    return;
  }

  await next();
});

function validateRange(r, fallback) {
  if (!r || typeof r !== 'object') return fallback;
  const shape = String(r.shape || '+');
  const n = Math.max(1, Math.min(12, parseInt(r.n) || 1));
  if (!['+', 'square', 'r', 'x'].includes(shape)) return fallback;
  return { shape, n };
}

// ============================================================
// 健康检查
// ============================================================
app.use(async (ctx, next) => {
  if (ctx.path === '/health' && ctx.method === 'GET') {
    const all = readDiy();
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = {
      status: 'ok',
      service: 'sanguo-zhanqi',
      diyCount: all.generals.length,
      time: new Date().toISOString()
    };
    return;
  }
  await next();
});

// ============================================================
// 404
// ============================================================
app.use(async (ctx) => {
  const accept = ctx.accepts('html', 'json');
  if (accept === 'html') {
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

app.on('error', (err, ctx) => {
  console.error('[server]', err.message, ctx && ctx.path);
});

app.listen(PORT, () => {
  console.log(`\n  三国战棋 · Koa 服务已启动`);
  console.log(`  本地访问: http://localhost:${PORT}/`);
  console.log(`  DIY 提交: http://localhost:${PORT}/diy.html`);
  console.log(`  DIY 密码: ${DIY_PASSWORD}${process.env.DIY_PASSWORD ? '' : ' （可通过环境变量 DIY_PASSWORD 覆盖）'}`);
  console.log(`  工作目录: ${ROOT}\n`);
});
