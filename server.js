const path = require('path');
const fs = require('fs');
const Koa = require('koa');
const serve = require('koa-static');
const JSZip = require('jszip');
const koaBody = require('koa-body').koaBody;

const app = new Koa();

const PORT = process.env.PORT || 5000;
const ROOT = __dirname;
const DIY_FILE = path.join(ROOT, 'diy.json');
const PORTRAIT_DIR = path.join(ROOT, 'portraits');
if (!fs.existsSync(PORTRAIT_DIR)) {
  try { fs.mkdirSync(PORTRAIT_DIR, { recursive: true }); } catch (e) {}
}
const ALLOWED_PORTRAIT_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const MAX_PORTRAIT_SIZE = 5 * 1024 * 1024;

// ============================================================
// 工具函数：读写拓展数据（新格式 { extensions: [...] }）
// ============================================================

function readStore() {
  try {
    if (fs.existsSync(DIY_FILE)) {
      const raw = fs.readFileSync(DIY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      // 旧格式迁移：{ generals, skills } → 单个默认拓展
      if (!data.extensions && (Array.isArray(data.generals) || Array.isArray(data.skills))) {
        return migrateOldFormat(data);
      }
      if (Array.isArray(data.extensions)) return data;
    }
  } catch (e) {
    console.error('[diy] read failed:', e.message);
  }
  return { extensions: [] };
}

function migrateOldFormat(old) {
  const generals = Array.isArray(old.generals) ? old.generals : [];
  const skills   = Array.isArray(old.skills)   ? old.skills   : [];
  const store = { extensions: [] };
  if (generals.length || skills.length) {
    store.extensions.push({
      id: 'ext_default',
      name: '默认拓展',
      desc: '从旧数据自动迁移',
      enabled: true,
      generals,
      skills
    });
  }
  writeStore(store);
  console.log('[diy] 已将旧数据迁移到拓展格式');
  return store;
}

function writeStore(data) {
  try {
    fs.writeFileSync(DIY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[diy] write failed:', e.message);
    return false;
  }
}

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function validateRange(r, fallback) {
  if (!r || typeof r !== 'object') return fallback;
  const shape = String(r.shape || '+');
  const n = Math.max(1, Math.min(12, parseInt(r.n) || 1));
  if (!['+', 'square', 'r', 'x'].includes(shape)) return fallback;
  return { shape, n };
}

// ============================================================
// 静态资源 + 缓存策略
// ============================================================

app.use(koaBody({
  enableTypes: ['json', 'form', 'multipart'],
  multipart: true,
  jsonLimit: '10mb',
  formLimit: '10mb'
}));

const CACHE_LONG  = 60 * 60 * 24 * 30;
const CACHE_SHORT = 60 * 60;

const EXT_LONG  = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot',
                            '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
                            '.mp3', '.ogg', '.wav']);
const EXT_SHORT = new Set(['.js', '.css']);

app.use(async (ctx, next) => {
  await next();
  if (ctx.path.startsWith('/api/')) return;
  const ext = path.extname(ctx.path).toLowerCase();
  if (EXT_LONG.has(ext)) {
    ctx.set('Cache-Control', `public, max-age=${CACHE_LONG}, immutable`);
  } else if (EXT_SHORT.has(ext)) {
    ctx.set('Cache-Control', `public, max-age=${CACHE_SHORT}`);
  } else {
    ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
});

app.use(serve(ROOT, { index: 'index.html', maxage: 0, hidden: false, defer: false, extensions: [] }));

// ============================================================
// 立绘接口  /api/portrait/*
// ============================================================
app.use(async (ctx, next) => {
  if (!ctx.path.startsWith('/api/portrait/')) return next();

  // POST /api/portrait/upload  上传立绘（multipart：字段名 file）
  if (ctx.path === '/api/portrait/upload' && ctx.method === 'POST') {
    const file = ctx.request.files?.file;
    if (!file) { ctx.status = 400; ctx.body = { ok: false, error: '未上传文件' }; return; }
    const originalName = String(file.originalFilename || file.name || '');
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_PORTRAIT_EXT.includes(ext)) {
      ctx.status = 400; ctx.body = { ok: false, error: '仅支持图片格式：' + ALLOWED_PORTRAIT_EXT.join(', ') }; return;
    }
    try {
      const stat = fs.statSync(file.filepath);
      if (stat.size > MAX_PORTRAIT_SIZE) {
        ctx.status = 400; ctx.body = { ok: false, error: '图片大小不能超过 5MB' }; return;
      }
    } catch (e) { ctx.status = 400; ctx.body = { ok: false, error: '读取文件失败' }; return; }
    const filename = 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ext;
    const dest = path.join(PORTRAIT_DIR, filename);
    try {
      const buf = fs.readFileSync(file.filepath);
      fs.writeFileSync(dest, buf);
    } catch (e) { ctx.status = 500; ctx.body = { ok: false, error: '保存立绘失败: ' + e.message }; return; }
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, portrait: filename };
    return;
  }

  // POST /api/portrait/delete  删除立绘
  if (ctx.path === '/api/portrait/delete' && ctx.method === 'POST') {
    const body = ctx.request.body || {};
    const filename = String(body.portrait || '').trim();
    if (!filename || !/^pt_[a-z0-9]+\.[a-z]+$/i.test(filename)) {
      ctx.status = 400; ctx.body = { ok: false, error: '无效的立绘文件名' }; return;
    }
    const full = path.join(PORTRAIT_DIR, filename);
    try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (e) {}
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true };
    return;
  }

  await next();
});

// ============================================================
// DIY 武将接口  /api/diy/*
// ============================================================
app.use(async (ctx, next) => {
  if (!ctx.path.startsWith('/api/diy/')) return next();

  // ----------------------------------------------------------
  // GET /api/diy/list  游戏端：拉取所有「已启用」拓展的武将+技能（扁平）
  // ----------------------------------------------------------
  if (ctx.path === '/api/diy/list' && ctx.method === 'GET') {
    const store = readStore();
    const generals = [], skills = [];
    for (const ext of store.extensions) {
      if (!ext.enabled) continue;
      if (Array.isArray(ext.generals)) generals.push(...ext.generals);
      if (Array.isArray(ext.skills))   skills.push(...ext.skills);
    }
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, generals, skills };
    return;
  }

  // ----------------------------------------------------------
  // POST /api/diy/submit  提交一个武将（含技能）到指定拓展
  // ----------------------------------------------------------
  if (ctx.path === '/api/diy/submit' && ctx.method === 'POST') {
    const body = ctx.request.body;
    if (!body || typeof body !== 'object') {
      ctx.status = 400; ctx.body = { ok: false, error: '请求体格式错误' }; return;
    }
    const { general, skills, extId, extName } = body;

    // 武将校验
    if (!general || typeof general !== 'object') {
      ctx.status = 400; ctx.body = { ok: false, error: '缺少武将定义' }; return;
    }
    const gid   = String(general.id   || '').trim();
    const gname = String(general.name || '').trim();
    if (!gid || !gname) {
      ctx.status = 400; ctx.body = { ok: false, error: '武将 id 和 name 必填' }; return;
    }
    if (!/^[a-zA-Z0-9_-]{2,20}$/.test(gid)) {
      ctx.status = 400; ctx.body = { ok: false, error: '武将 id 需为 2-20 位字母/数字/下划线' }; return;
    }

    // 技能校验（在构造循环中按模式分别校验）
    const skillArr = Array.isArray(skills) ? skills : [];

    // 构造武将对象
    const fullGid = 'diy_' + gid;
    const skillIds = [];
    const skillObjs = [];

    for (const s of skillArr) {
      if (s.ref) {
        const refId = String(s.ref).trim();
        const fullRefId = refId.startsWith('skill_') ? refId : 'skill_' + refId;
        skillIds.push(fullRefId);
      } else {
        const sid = String(s.id || '').trim();
        if (!sid || !/^[a-zA-Z0-9_-]{2,30}$/.test(sid)) {
          ctx.status = 400; ctx.body = { ok: false, error: '技能 id 需为 2-30 位字母/数字/下划线' }; return;
        }
        if (!s.name || !String(s.name).trim()) {
          ctx.status = 400; ctx.body = { ok: false, error: '技能 name 必填' }; return;
        }
        if (typeof s.filterCode !== 'string' || typeof s.contentCode !== 'string') {
          ctx.status = 400; ctx.body = { ok: false, error: '技能 filterCode / contentCode 必须是字符串' }; return;
        }
        const fullSid = fullGid + '_' + sid;
        skillIds.push(fullSid);
        skillObjs.push({
          id:          fullSid,
          name:        String(s.name),
          type:        s.type === '被动' ? '被动' : '主动',
          cooldown:    Math.max(0, Math.min(20, parseInt(s.cooldown) || 2)),
          trigger:     s.trigger || null,
          desc:        String(s.desc || ''),
          preview:     s.preview ? validateRange(s.preview, null) : null,
          filterCode:  String(s.filterCode  || 'return actor && actor.alive && !actor.skilled;'),
          contentCode: String(s.contentCode || '')
        });
      }
    }

    const generalObj = {
      id: fullGid,
      name: gname,
      hp:  Math.max(1,   Math.min(10000, parseInt(general.hp)  || 200)),
      atk: Math.max(0,   Math.min(1000,  parseInt(general.atk) || 50)),
      def: Math.max(0,   Math.min(1000,  parseInt(general.def) || 20)),
      moveRange:   validateRange(general.moveRange,   { shape: '+', n: 3 }),
      attackRange: validateRange(general.attackRange, { shape: '+', n: 1 }),
      skillIds: skillIds,
      portrait: typeof general.portrait === 'string' && general.portrait ? String(general.portrait) : null
    };

    // 找到或创建拓展
    const store = readStore();
    let ext = null;
    if (extId) {
      ext = store.extensions.find(e => e.id === extId);
    }
    if (!ext && extName) {
      ext = store.extensions.find(e => e.name === extName);
    }
    if (!ext) {
      // 创建新拓展（名称 = extName 或「默认拓展」）
      ext = {
        id:       genId('ext'),
        name:     String(extName || '默认拓展').slice(0, 40),
        desc:     '',
        enabled:  true,
        generals: [],
        skills:   []
      };
      store.extensions.push(ext);
    }

    // 写入（覆盖同 id）
    const oldGeneral = ext.generals.find(g => g.id === fullGid);
    if (oldGeneral && oldGeneral.portrait && oldGeneral.portrait !== generalObj.portrait) {
      try {
        const oldPath = path.join(PORTRAIT_DIR, oldGeneral.portrait);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (e) {}
    }
    ext.generals = ext.generals.filter(g => g.id !== fullGid);
    ext.generals.push(generalObj);
    const existingSkillIds = new Set(skillObjs.map(s => s.id));
    ext.skills = ext.skills.filter(s => !existingSkillIds.has(s.id));
    ext.skills.push(...skillObjs);

    if (!writeStore(store)) {
      ctx.status = 500; ctx.body = { ok: false, error: '写入文件失败' }; return;
    }

    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, general: generalObj, skills: skillObjs, extId: ext.id, extName: ext.name };
    return;
  }

  // ----------------------------------------------------------
  // GET /api/diy/detail?id=xxx  获取单个武将+技能完整数据（供编辑表单回填）
  // ----------------------------------------------------------
  if (ctx.path === '/api/diy/detail' && ctx.method === 'GET') {
    const id = String(ctx.query.id || '').trim();
    if (!id) { ctx.status = 400; ctx.body = { ok: false, error: '缺少 id' }; return; }

    const store = readStore();
    let found = null, foundExt = null;
    for (const ext of store.extensions) {
      const g = (ext.generals || []).find(g => g.id === id);
      if (g) { found = g; foundExt = ext; break; }
    }
    if (!found) { ctx.status = 404; ctx.body = { ok: false, error: '武将不存在' }; return; }

    // 取武将关联技能
    const skillIds = new Set(found.skillIds || []);
    const skills = (foundExt.skills || []).filter(s => skillIds.has(s.id));

    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, general: found, skills, extId: foundExt.id, extName: foundExt.name };
    return;
  }

  // ----------------------------------------------------------
  // POST /api/diy/delete  删除一个武将（及其技能）
  // ----------------------------------------------------------
  if (ctx.path === '/api/diy/delete' && ctx.method === 'POST') {
    const body = ctx.request.body;
    const { id } = body || {};

    const fullId = String(id).startsWith('diy_') ? String(id) : 'diy_' + String(id);
    const store = readStore();
    for (const ext of store.extensions) {
      const removed = (ext.generals || []).filter(g => g.id === fullId);
      for (const rg of removed) {
        if (rg.portrait) {
          try {
            const pp = path.join(PORTRAIT_DIR, rg.portrait);
            if (fs.existsSync(pp)) fs.unlinkSync(pp);
          } catch (e) {}
        }
      }
      ext.generals = ext.generals.filter(g => g.id !== fullId);
      ext.skills   = ext.skills.filter(s => !s.id.startsWith(fullId + '_'));
    }
    writeStore(store);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true };
    return;
  }

  await next();
});

// ============================================================
// 独立技能接口  /api/skill/*
// ============================================================
app.use(async (ctx, next) => {
  if (!ctx.path.startsWith('/api/skill/')) return next();

  // ----------------------------------------------------------
  // POST /api/skill/create  创建独立技能（不属于某个武将）
  // ----------------------------------------------------------
  if (ctx.path === '/api/skill/create' && ctx.method === 'POST') {
    const body = ctx.request.body;
    if (!body || typeof body !== 'object') {
      ctx.status = 400; ctx.body = { ok: false, error: '请求体格式错误' }; return;
    }
    const { skill, extId, extName } = body;

    if (!skill || typeof skill !== 'object') {
      ctx.status = 400; ctx.body = { ok: false, error: '缺少技能定义' }; return;
    }
    const sid = String(skill.id || '').trim();
    const sname = String(skill.name || '').trim();
    if (!sid || !/^[a-zA-Z0-9_-]{2,30}$/.test(sid)) {
      ctx.status = 400; ctx.body = { ok: false, error: '技能 id 需为 2-30 位字母/数字/下划线' }; return;
    }
    if (!sname) {
      ctx.status = 400; ctx.body = { ok: false, error: '技能 name 必填' }; return;
    }
    if (typeof skill.filterCode !== 'string' || typeof skill.contentCode !== 'string') {
      ctx.status = 400; ctx.body = { ok: false, error: '技能 filterCode / contentCode 必须是字符串' }; return;
    }

    const fullSid = 'skill_' + sid;
    const skillObj = {
      id:          fullSid,
      name:        sname,
      type:        skill.type === '被动' ? '被动' : '主动',
      cooldown:    Math.max(0, Math.min(20, parseInt(skill.cooldown) || 2)),
      trigger:     skill.trigger || null,
      desc:        String(skill.desc || ''),
      preview:     skill.preview ? validateRange(skill.preview, null) : null,
      filterCode:  String(skill.filterCode  || 'return actor && actor.alive && !actor.skilled;'),
      contentCode: String(skill.contentCode || '')
    };

    const store = readStore();
    let ext = null;
    if (extId) {
      ext = store.extensions.find(e => e.id === extId);
    }
    if (!ext && extName) {
      ext = store.extensions.find(e => e.name === extName);
    }
    if (!ext) {
      ext = {
        id:       genId('ext'),
        name:     String(extName || '默认拓展').slice(0, 40),
        desc:     '',
        enabled:  true,
        generals: [],
        skills:   []
      };
      store.extensions.push(ext);
    }

    ext.skills = ext.skills.filter(s => s.id !== fullSid);
    ext.skills.push(skillObj);

    if (!writeStore(store)) {
      ctx.status = 500; ctx.body = { ok: false, error: '写入文件失败' }; return;
    }

    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, skill: skillObj, extId: ext.id, extName: ext.name };
    return;
  }

  // ----------------------------------------------------------
  // POST /api/skill/delete  删除独立技能
  // ----------------------------------------------------------
  if (ctx.path === '/api/skill/delete' && ctx.method === 'POST') {
    const body = ctx.request.body;
    const { id } = body || {};

    const fullId = String(id).startsWith('skill_') ? String(id) : 'skill_' + String(id);
    const store = readStore();
    for (const ext of store.extensions) {
      ext.skills = ext.skills.filter(s => s.id !== fullId);
    }
    writeStore(store);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true };
    return;
  }

  // ----------------------------------------------------------
  // GET /api/skill/list  获取所有独立技能（供选择）
  // ----------------------------------------------------------
  if (ctx.path === '/api/skill/list' && ctx.method === 'GET') {
    const store = readStore();
    const allSkills = [];
    for (const ext of store.extensions) {
      if (!ext.enabled) continue;
      if (ext.skills) {
        for (const s of ext.skills) {
          if (s.id.startsWith('skill_')) {
            allSkills.push({
              id:       s.id,
              name:     s.name,
              type:     s.type,
              desc:     s.desc,
              extId:    ext.id,
              extName:  ext.name
            });
          }
        }
      }
    }
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, skills: allSkills };
    return;
  }

  // ----------------------------------------------------------
  // GET /api/skill/detail?id=xxx  获取单个技能详情（供编辑）
  // ----------------------------------------------------------
  if (ctx.path === '/api/skill/detail' && ctx.method === 'GET') {
    const id = String(ctx.query.id || '').trim();
    if (!id) { ctx.status = 400; ctx.body = { ok: false, error: '缺少 id' }; return; }

    const fullId = id.startsWith('skill_') ? id : 'skill_' + id;
    const store = readStore();
    let found = null, foundExt = null;
    for (const ext of store.extensions) {
      const s = (ext.skills || []).find(skill => skill.id === fullId);
      if (s) { found = s; foundExt = ext; break; }
    }
    if (!found) { ctx.status = 404; ctx.body = { ok: false, error: '技能不存在' }; return; }

    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, skill: found, extId: foundExt.id, extName: foundExt.name };
    return;
  }

  await next();
});

// ============================================================
// 拓展管理接口  /api/ext/*
// ============================================================
app.use(async (ctx, next) => {
  if (!ctx.path.startsWith('/api/ext/')) return next();

  // ----------------------------------------------------------
  // GET /api/ext/list  获取所有拓展（含武将/技能数量）
  // ----------------------------------------------------------
  if (ctx.path === '/api/ext/list' && ctx.method === 'GET') {
    const store = readStore();
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = {
      ok: true,
      extensions: store.extensions.map(e => ({
        id:            e.id,
        name:          e.name,
        desc:          e.desc || '',
        enabled:       !!e.enabled,
        generalsCount: Array.isArray(e.generals) ? e.generals.length : 0,
        skillsCount:   Array.isArray(e.skills)   ? e.skills.length   : 0,
        generals:      Array.isArray(e.generals) ? e.generals : []
      }))
    };
    return;
  }

  // ----------------------------------------------------------
  // POST /api/ext/create  新建拓展
  // ----------------------------------------------------------
  if (ctx.path === '/api/ext/create' && ctx.method === 'POST') {
    const body = ctx.request.body || {};

    const name = String(body.name || '未命名拓展').trim().slice(0, 40);
    const desc = String(body.desc || '').slice(0, 200);
    const store = readStore();
    const ext = { id: genId('ext'), name, desc, enabled: true, generals: [], skills: [] };
    store.extensions.push(ext);
    writeStore(store);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, ext: { id: ext.id, name: ext.name, desc: ext.desc, enabled: ext.enabled, generalsCount: 0, skillsCount: 0 } };
    return;
  }

  // ----------------------------------------------------------
  // POST /api/ext/toggle  启用/禁用拓展
  // ----------------------------------------------------------
  if (ctx.path === '/api/ext/toggle' && ctx.method === 'POST') {
    const body = ctx.request.body || {};

    const store = readStore();
    const ext = store.extensions.find(e => e.id === body.extId);
    if (!ext) { ctx.status = 404; ctx.body = { ok: false, error: '拓展不存在' }; return; }
    ext.enabled = body.enabled !== undefined ? !!body.enabled : !ext.enabled;
    writeStore(store);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true, enabled: ext.enabled };
    return;
  }

  // ----------------------------------------------------------
  // POST /api/ext/delete  删除整个拓展
  // ----------------------------------------------------------
  if (ctx.path === '/api/ext/delete' && ctx.method === 'POST') {
    const body = ctx.request.body || {};

    const store = readStore();
    const before = store.extensions.length;
    store.extensions = store.extensions.filter(e => e.id !== body.extId);
    if (store.extensions.length === before) {
      ctx.status = 404; ctx.body = { ok: false, error: '拓展不存在' }; return;
    }
    writeStore(store);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true };
    return;
  }

  // ----------------------------------------------------------
  // POST /api/ext/rename  重命名拓展
  // ----------------------------------------------------------
  if (ctx.path === '/api/ext/rename' && ctx.method === 'POST') {
    const body = ctx.request.body || {};

    const store = readStore();
    const ext = store.extensions.find(e => e.id === body.extId);
    if (!ext) { ctx.status = 404; ctx.body = { ok: false, error: '拓展不存在' }; return; }
    if (body.name) ext.name = String(body.name).trim().slice(0, 40);
    if (body.desc !== undefined) ext.desc = String(body.desc).slice(0, 200);
    writeStore(store);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = { ok: true };
    return;
  }

  await next();
});

// ============================================================
// 工程导入/导出  /api/project/*
// ============================================================
app.use(async (ctx, next) => {
  // ----------------------------------------------------------
  // POST /api/project/export  导出一个拓展为 ZIP
  // ----------------------------------------------------------
  if (ctx.path === '/api/project/export' && ctx.method === 'POST') {
    const body = ctx.request.body || {};

    const store  = readStore();
    const extId  = body.extId;
    const ext    = extId ? store.extensions.find(e => e.id === extId) : store.extensions[0];

    if (!ext) {
      ctx.status = 404; ctx.body = { ok: false, error: '找不到拓展' }; return;
    }

    const asciiName = String(ext.name || 'extension')
      .replace(/[\u4e00-\u9fa5]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^_+|_+$/g, '') || 'extension';
    const fullName = String(ext.name || 'extension').replace(/[^\w\u4e00-\u9fa5\-. ]/g, '_') + '.zip';

    try {
      const zip = new JSZip();
      zip.file('project.json', JSON.stringify({
        name:        ext.name,
        id:          ext.id,
        desc:        ext.desc || '',
        version:     '2.0.0',
        createdAt:   new Date().toISOString(),
        gameVersion: '1.0.0'
      }, null, 2));
      zip.file('generals.json', JSON.stringify(Array.isArray(ext.generals) ? ext.generals : [], null, 2));
      zip.file('skills.json',   JSON.stringify(Array.isArray(ext.skills)   ? ext.skills   : [], null, 2));

      // 打包武将引用的立绘文件到 portraits/ 目录
      const portraitFolder = zip.folder('portraits');
      const generalsList = Array.isArray(ext.generals) ? ext.generals : [];
      const packedPortraits = [];
      for (const g of generalsList) {
        if (!g.portrait || packedPortraits.includes(g.portrait)) continue;
        if (!/^pt_[a-z0-9]+\.[a-z]+$/i.test(g.portrait)) continue;
        const portraitPath = path.join(PORTRAIT_DIR, g.portrait);
        try {
          if (fs.existsSync(portraitPath)) {
            const imgBuf = fs.readFileSync(portraitPath);
            portraitFolder.file(g.portrait, imgBuf);
            packedPortraits.push(g.portrait);
          }
        } catch (e) { console.warn('[project/export] 立绘读取失败:', g.portrait, e.message); }
      }

      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      ctx.type = 'application/zip';
      ctx.set('Content-Disposition',
        `attachment; filename="${asciiName}.zip"; filename*=UTF-8''${encodeURIComponent(fullName)}`
      );
      ctx.body = buf;
    } catch (e) {
      console.error('[project/export]', e.message);
      ctx.status = 500; ctx.body = { ok: false, error: '导出失败: ' + e.message };
    }
    return;
  }

  // ----------------------------------------------------------
  // POST /api/project/import  导入 ZIP 为新拓展（FormData）
  // ----------------------------------------------------------
  if (ctx.path === '/api/project/import' && ctx.method === 'POST') {
    const zipFile  = ctx.request.files?.zip;

    if (!zipFile) { ctx.status = 400; ctx.body = { ok: false, error: '未上传文件' }; return; }

    try {
      const buf = fs.readFileSync(zipFile.filepath);
      if (!buf || !buf.length) { ctx.status = 400; ctx.body = { ok: false, error: '文件为空' }; return; }

      const zip = await JSZip.loadAsync(buf);
      const projectJson  = await zip.file('project.json')?.async('string');
      const generalsJson = await zip.file('generals.json')?.async('string');
      const skillsJson   = await zip.file('skills.json')?.async('string');

      if (!generalsJson || !skillsJson) {
        ctx.status = 400; ctx.body = { ok: false, error: 'ZIP 内缺少 generals.json 或 skills.json' }; return;
      }

      const generals    = JSON.parse(generalsJson);
      const skills      = JSON.parse(skillsJson);
      const projectMeta = projectJson ? JSON.parse(projectJson) : {};

      const store = readStore();

      // 如果 ZIP 带有 ext id 且已存在，直接覆盖；否则创建新拓展
      let ext = projectMeta.id ? store.extensions.find(e => e.id === projectMeta.id) : null;
      if (ext) {
        ext.name     = projectMeta.name || ext.name;
        ext.desc     = projectMeta.desc || ext.desc;
        ext.generals = Array.isArray(generals) ? generals : [];
        ext.skills   = Array.isArray(skills)   ? skills   : [];
      } else {
        ext = {
          id:       projectMeta.id || genId('ext'),
          name:     projectMeta.name || '导入拓展',
          desc:     projectMeta.desc || '',
          enabled:  true,
          generals: Array.isArray(generals) ? generals : [],
          skills:   Array.isArray(skills)   ? skills   : []
        };
        store.extensions.push(ext);
      }

      // 从 ZIP 中恢复立绘文件，统一重命名避免冲突
      const restoredPortraits = [];
      const portraitFiles = Object.keys(zip.files).filter(function (p) {
        return p.startsWith('portraits/') && !zip.files[p].dir;
      });
      for (const portraitPath of portraitFiles) {
        const originalName = path.basename(portraitPath);
        if (!/^pt_[a-z0-9]+\.[a-z]+$/i.test(originalName)) continue;
        try {
          const imgBuf = await zip.files[portraitPath].async('nodebuffer');
          const ext2 = path.extname(originalName).toLowerCase();
          const newName = 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ext2;
          fs.writeFileSync(path.join(PORTRAIT_DIR, newName), imgBuf);
          restoredPortraits.push({ original: originalName, newName: newName });
        } catch (e) { console.warn('[project/import] 立绘恢复失败:', originalName, e.message); }
      }
      if (restoredPortraits.length > 0) {
        for (const g of ext.generals) {
          if (!g.portrait) continue;
          const mapping = restoredPortraits.find(function (r) { return r.original === g.portrait; });
          if (mapping) g.portrait = mapping.newName;
        }
      }

      if (!writeStore(store)) {
        for (const r of restoredPortraits) {
          try { fs.unlinkSync(path.join(PORTRAIT_DIR, r.newName)); } catch (e) {}
        }
        ctx.status = 500; ctx.body = { ok: false, error: '写入文件失败' }; return;
      }

      ctx.type = 'application/json; charset=utf-8';
      ctx.body = {
        ok:            true,
        extId:         ext.id,
        projectName:   ext.name,
        generalsCount: ext.generals.length,
        skillsCount:   ext.skills.length,
        portraitsCount: restoredPortraits.length
      };
    } catch (e) {
      console.error('[project/import]', e.message);
      ctx.status = 400; ctx.body = { ok: false, error: '解析 ZIP 失败: ' + e.message };
    }
    return;
  }

  await next();
});

// ============================================================
// 健康检查
// ============================================================
app.use(async (ctx, next) => {
  if (ctx.path === '/health' && ctx.method === 'GET') {
    const store = readStore();
    const total = store.extensions.reduce((n, e) => n + (e.generals ? e.generals.length : 0), 0);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = {
      status:     'ok',
      service:    'sanguo-zhanqi',
      extensions: store.extensions.length,
      diyCount:   total,
      time:       new Date().toISOString()
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
    ctx.status = 404;
    ctx.body = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>三国战棋</title>
<meta http-equiv="refresh" content="0; url=/"></head>
<body><p>路径不存在，正在跳回 <a href="/">首页</a>...</p></body></html>`;
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
  console.log(`  工作目录: ${ROOT}\n`);
});
