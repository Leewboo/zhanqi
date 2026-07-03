(function (global) {
  const base = {
    hp: 200, atk: 50, def: 20,
    moveRange: { shape: '+', n: 4 },
    attackRange: { shape: '+', n: 1 },
    skills: []
  };

  const generals = [];

  function buildPiece(def, side, x, y) {
    // 解析技能：支持 Skills.xxx 对象 / 字符串 id / 自定义技能对象
    function resolveSkills(skills) {
      if (!skills || !skills.length) return [];
      const resolved = [];
      for (let i = 0; i < skills.length; i++) {
        const s = skills[i];
        if (typeof s === 'string') {
          // 通过字符串 id 查找（DIY 场景）
          const found = (global.Skills && global.Skills[s]) || (global.SkillsAPI && global.SkillsAPI.getSkill(s));
          if (found) resolved.push(found);
        } else if (typeof s === 'object' && typeof s.content === 'function') {
          // 已经是完整技能对象（内置场景，形如 Skills.weiZhen）
          resolved.push(s);
        } else if (typeof s === 'object' && typeof s.contentCode === 'string') {
          // DIY 原始定义，需要编译
          if (global.SkillsAPI) {
            const compiled = global.SkillsAPI.registerSkill(s);
            if (compiled) resolved.push(compiled);
          }
        }
      }
      return resolved;
    }

    // def.skills 可能是 [Skills.xxx]（内置）或 ['diy_xxx', ...]（DIY）或 [skillObj]
    const rawSkills = (def.skills && def.skills.length) ? def.skills : (def.skill ? [def.skill] : []);
    const resolvedSkills = resolveSkills(rawSkills);

    const piece = Object.assign({}, base, def, {
      side,
      x, y,
      maxHp: def.hp,
      alive: true,
      moved: false,
      attacked: false,
      skilled: false,
      cd: 0,
      cdMap: {},
      atkBuff: 0,
      defBuff: 0,
      buffs: [],
      skills: resolvedSkills,
      generalId: def.id
    });
    return piece;
  }

  function registerGeneral(def) {
    if (!def || !def.id) return null;
    // 避免重复：先移除已有的同 id
    const existing = generals.findIndex(g => g.id === def.id);
    if (existing >= 0) generals.splice(existing, 1, def);
    else generals.push(def);
    return def;
  }

  function registerGenerals(list) {
    if (!list || !list.length) return [];
    return list.map(d => {
      // DIY 武将的 skills 字段是 skillIds 数组（字符串），buildPiece 会解析
      return registerGeneral(d);
    });
  }

  function getList() { return generals; }

  global.Generals = {
    list: generals,
    buildPiece,
    registerGeneral,
    registerGenerals,
    getList
  };
})(window);
