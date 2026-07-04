(function (global) {
  // 每个技能对象的结构：
  // {
  //   id: 'xxx',                // 唯一id，用于冷却独立管理
  //   name: '技能名',
  //   type: '主动' | '被动',
  //   cooldown: 2,              // 主动技能冷却回合数
  //   trigger: 'onKill'|null,   // 被动技能触发时机
  //   desc: '说明文字',
  //   filter(actor) { ... },    // 是否满足释放条件
  //   async content(actor, context) { ... }  // 技能主逻辑，可多步 await 选格
  //   aiHint: { type, target, power, priority }  // AI 评估提示（可选）
  // }

  // 内置技能已全部移除，所有技能均通过 DIY 系统动态注册。
  const Skills = {};

  // =============== DIY 动态技能注册 ===============
  // 把字符串形式的 filterCode / contentCode 用 new Function 编译成可执行函数
  // 为安全起见，整个函数只接收 (actor) 参数，内部可用 global / Effect / Range / Math 等
  function compileSkill(def) {
    if (!def || !def.id) return null;

    const filterFn = new Function(
      'actor',
      (def.filterCode || 'return actor && actor.alive;')
    );

    // content 需要 async，因为里面可以 await Effect.chooseEnemy 等
    const contentFn = new Function(
      'actor',
      'return (async () => { ' + (def.contentCode || '') + ' \n})();'
    );

    const compiled = {
      id: def.id,
      name: def.name || def.id,
      type: def.type === '被动' ? '被动' : '主动',
      cooldown: Math.max(0, parseInt(def.cooldown) || 0),
      trigger: def.trigger || null,
      desc: def.desc || '',
      preview: def.preview || null,
      aiHint: def.aiHint || null,
      filter: filterFn,
      content: function (actor) {
        try {
          return contentFn(actor);
        } catch (e) {
          console.error('[DIY 技能执行错误] ' + def.id, e);
          if (global.Game) global.Game.log('【' + (def.name || def.id) + '】脚本执行错误：' + e.message);
          return false;
        }
      }
    };
    return compiled;
  }

  function registerSkill(def) {
    const compiled = compileSkill(def);
    if (compiled) {
      Skills[def.id] = compiled;
      return compiled;
    }
    return null;
  }

  // 将一堆技能定义批量注册（用于从服务器加载 DIY 数据）
  function registerSkills(defs) {
    if (!defs || !defs.length) return [];
    return defs.map(d => registerSkill(d));
  }

  function getSkill(idOrRef) {
    // 兼容：如果传入的已经是对象（含 content/filter），直接返回
    if (idOrRef && typeof idOrRef === 'object') return idOrRef;
    return Skills[idOrRef];
  }

  global.Skills = Skills;
  global.SkillsAPI = { registerSkill, registerSkills, compileSkill, getSkill };
})(window);
