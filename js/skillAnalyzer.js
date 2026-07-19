// ============================================================
// SkillAnalyzer —— 技能语义自动分析模块
// 替代 aiHint：从技能 content 源码/preview/desc/cooldown 自动推断语义
// 返回与 aiHint 同结构的对象：{ type, target, power, priority, condition,
//   preferTarget, minTargets, avoidSelf, hpThreshold, source }
// ============================================================
(function (global) {
  'use strict';

  // 分析结果缓存（按技能对象引用缓存，技能重新编译时引用变化自动失效）
  const cache = new WeakMap();

  // 关键字 → 技能类型 映射（按优先级降序匹配）
  const TYPE_PATTERNS = [
    // control 必须在 damage 前判断（眩晕技能常带伤害）
    { type: 'control',  re: /眩晕|stun|沉默|silence|冻结|freeze|魅惑|charm|嘲讽|taunt|禁锢|束缚|定身|disable|cannotMove|cannotAttack|cannotSkill/i },
    { type: 'teleport', re: /teleport|传送|瞬移|闪现|moveTo|setPosition|jumpTo/i },
    { type: 'summon',   re: /summon|召唤|召唤物|summonMinion|spawnPiece/i },
    { type: 'heal',     re: /heal|治疗|回复|恢复生命|hp\s*\+=|hp\s*=\s*Math\.min\(\s*.*maxHp|restoreHp|cure/i },
    { type: 'buff',     re: /addMark.*atk|addMark.*def|atkBuff|defBuff|增益|攻击\+|防御\+|提升攻击|提升防御|buffAtk|buffDef/i },
    { type: 'debuff',   re: /addMark.*-atk|addMark.*-def|减益|攻击-|防御-|降低攻击|降低防御|poison|中毒|burn|燃烧|bleed|流血/i },
    { type: 'damage',   re: /damage|伤害|dealDamage|hp\s*-=|hp\s*-\s*\d|造成.*伤害|attack.*damage|magicDamage|physicalDamage/i },
  ];

  // 目标选择 API → 目标类型 映射
  const TARGET_PATTERNS = [
    { target: 'aoe_enemy', re: /chooseCell\s*\([^)]*mustEnemy|cellsInRange.*enemy|aoeEnemy|enemyAoE/i },
    { target: 'aoe_ally',  re: /chooseCell\s*\([^)]*mustAlly|cellsInRange.*ally|aoeAlly|allyAoE/i },
    { target: 'enemy',     re: /chooseEnemy|targetEnemy|pickEnemy|selectEnemy/i },
    { target: 'ally',      re: /chooseAlly|targetAlly|pickAlly|selectAlly/i },
    { target: 'cell',      re: /chooseCell\s*\(/i },
    { target: 'self',      re: /chooseSelf|Effect\.self|actor\.hp\s*-=|self.*damage|自伤/i },
  ];

  // 条件推断
  const CONDITION_PATTERNS = [
    { cond: 'self_low_hp',  re: /actor\.hp\s*<\s*actor\.maxHp\s*\*\s*0\.[3-5]|hp\s*\/\s*maxHp\s*<\s*0\.[3-5]|低血量|残血时/i },
    { cond: 'self_full_hp', re: /hp\s*>=\s*maxHp|满血时|hp\s*\/\s*maxHp\s*>=?\s*0\.9/i },
    { cond: 'ally_injured', re: /友军.*血量|allies.*filter.*hp|injured.*ally/i },
    { cond: 'enemy_near',   re: /附近.*敌人|nearby.*enemy|距离.*<=\s*[2-4]/i },
    { cond: 'enemy_in_range', re: /范围内.*敌人|inRange.*enemy|enemiesInRange/i },
  ];

  // preferTarget 推断
  const PREFER_PATTERNS = [
    { prefer: 'low_hp',       re: /最低血量|low.*hp|hp\s*<\s*\d+.*sort|最小生命/i },
    { prefer: 'high_threat',  re: /最高威胁|high.*threat|威胁度.*sort|_aiThreat.*sort/i },
    { prefer: 'injured_ally', re: /受伤.*友军|injured.*ally/i },
    { prefer: 'nearest',      re: /最近.*敌人|nearest|Math\.min.*dist/i },
    { prefer: 'caster',       re: /法师|caster|高攻低防/i },
  ];

  // ========== 工具：从技能对象提取源码字符串 ==========
  function getSource(skill) {
    if (!skill) return '';
    // 优先用 contentCode（DIY 技能保留源码）
    if (typeof skill.contentCode === 'string' && skill.contentCode.length) {
      return skill.contentCode;
    }
    // 内置技能：尝试函数 toString
    if (typeof skill.content === 'function') {
      try { return skill.content.toString(); } catch (e) { return ''; }
    }
    return '';
  }

  function getDesc(skill) {
    return (skill && skill.desc) || '';
  }

  // ========== 主分析函数 ==========
  function analyze(skill) {
    if (!skill) return defaultHint();

    // 命中缓存
    if (cache.has(skill)) return cache.get(skill);

    // 如果 DIY 作者显式提供了 aiHint，优先使用（向后兼容）
    if (skill.aiHint && typeof skill.aiHint === 'object' && skill.aiHint.type) {
      const fallback = Object.assign(defaultHint(), skill.aiHint, { source: 'manual' });
      cache.set(skill, fallback);
      return fallback;
    }

    const src = getSource(skill);
    const desc = getDesc(skill);
    const text = src + '\n' + desc;

    const result = {
      type:         inferType(text),
      target:       inferTarget(text, skill),
      power:        inferPower(text, skill),
      priority:     inferPriority(skill),
      condition:    inferCondition(text),
      preferTarget: inferPrefer(text),
      minTargets:   inferMinTargets(text),
      avoidSelf:    inferAvoidSelf(text),
      hpThreshold:  inferHpThreshold(text),
      source: 'auto'
    };

    cache.set(skill, result);
    return result;
  }

  function defaultHint() {
    return {
      type: 'mixed',
      target: 'enemy',
      power: 30,
      priority: 5,
      condition: 'always',
      preferTarget: '',
      minTargets: 0,
      avoidSelf: false,
      hpThreshold: 0,
      source: 'default'
    };
  }

  function inferType(text) {
    for (const p of TYPE_PATTERNS) {
      if (p.re.test(text)) return p.type;
    }
    return 'mixed';
  }

  function inferTarget(text, skill) {
    // 优先用 preview 形状推断
    if (skill && skill.preview) {
      // 大范围 + mustAlly 模式难以从 preview 单独判断，仍走文本匹配
    }
    for (const p of TARGET_PATTERNS) {
      if (p.re.test(text)) return p.target;
    }
    // 兜底：如果是伤害类，默认 enemy
    if (/damage|伤害/.test(text)) return 'enemy';
    if (/heal|治疗/.test(text)) return 'ally';
    return 'enemy';
  }

  function inferPower(text, skill) {
    // 1) 尝试从 contentCode 提取数字常量
    // 模式：dealDamage(target, X) 或 damage = X 或 hp -= X
    let m = text.match(/dealDamage\s*\([^,]+,\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    m = text.match(/damage\s*=\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    m = text.match(/hp\s*-=\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    // 模式：atk + X（增益量）
    m = text.match(/atkBuff\s*[:=]\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    m = text.match(/addMark\s*\([^,]+,\s*[^,]+,\s*\d+\s*,\s*\{[^}]*atkBuff\s*:\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    // 模式：heal(target, X) 或 hp += X
    m = text.match(/heal\s*\([^,]+,\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    m = text.match(/hp\s*\+=\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    // 2) 从 desc 提取"造成 X 伤害"
    m = text.match(/造成\s*(\d+)\s*点?\s*伤害/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    m = text.match(/回复\s*(\d+)\s*点?\s*生命/);
    if (m) return clampInt(parseInt(m[1]), 1, 200);

    // 3) 兜底：根据技能类型给默认值
    const type = inferType(text);
    if (type === 'heal') return 50;
    if (type === 'buff' || type === 'debuff') return 25;
    if (type === 'control') return 40;
    if (type === 'damage') return 40;
    return 30;
  }

  function inferPriority(skill) {
    // 1) 冷却越长 → 优先级越高（稀有技能）
    const cd = (skill && skill.cooldown) || 0;
    let p = 5;
    if (cd >= 4) p = 8;
    else if (cd >= 2) p = 6;
    else if (cd === 0) p = 4;
    // 2) limited（限定技）优先级最高
    if (skill && skill.limited) p = 10;
    return clampInt(p, 1, 10);
  }

  function inferCondition(text) {
    for (const p of CONDITION_PATTERNS) {
      if (p.re.test(text)) return p.cond;
    }
    return 'always';
  }

  function inferPrefer(text) {
    for (const p of PREFER_PATTERNS) {
      if (p.re.test(text)) return p.prefer;
    }
    return '';
  }

  function inferMinTargets(text) {
    // 包含 "至少命中 N" / "minTargets" 时返回对应值
    const m = text.match(/至少.*?(\d+)\s*个|minTargets\s*[:=]\s*(\d+)/);
    if (m) return clampInt(parseInt(m[1] || m[2]), 0, 10);
    // AOE 类技能默认要求至少 2 个目标
    if (/aoe|范围|所有敌人|allEnemies/.test(text)) return 2;
    return 0;
  }

  function inferAvoidSelf(text) {
    return /avoidSelf|不包含自己|排除自己|filter.*!==\s*actor|excludeSelf/i.test(text);
  }

  function inferHpThreshold(text) {
    // 模式：hp < maxHp * 0.4
    let m = text.match(/hp\s*\/\s*maxHp\s*<\s*0\.(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 0, 100);
    m = text.match(/hp\s*<\s*maxHp\s*\*\s*0\.(\d+)/);
    if (m) return clampInt(parseInt(m[1]), 0, 100);
    m = text.match(/血量.*?(\d+)%/);
    if (m) return clampInt(parseInt(m[1]), 0, 100);
    return 0;
  }

  function clampInt(v, min, max) {
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  // ========== 批量预热缓存 ==========
  function preload(skills) {
    if (!skills || !skills.length) return;
    for (const s of skills) {
      if (s && typeof s === 'object') analyze(s);
    }
  }

  // ========== 调试：打印某技能分析结果 ==========
  function debug(skill) {
    const r = analyze(skill);
    console.log('[SkillAnalyzer]', skill && skill.name, JSON.stringify(r, null, 2));
    return r;
  }

  global.SkillAnalyzer = {
    analyze,
    preload,
    debug,
    _invalidate: function (skill) { cache.delete(skill); }
  };
})(window);
