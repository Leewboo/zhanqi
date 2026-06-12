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
  // }
  const Skills = {
    changSheng: {
      id: 'changSheng',
      name: '常胜',
      type: '被动',
      cooldown: 0,
      trigger: 'onKill',
      desc: '击杀一名敌人后，立即恢复本回合的移动与攻击权限。',
      filter(actor) {
        return actor && actor.alive;
      },
      async content(actor) {
        Effect.resetAction(actor);
      }
    },

    danYong: {
      id: 'danYong',
      name: '胆勇',
      type: '主动',
      cooldown: 2,
      desc: '在+4范围内选择一名敌人，再选择其r2范围内的空格作为落点，然后对目标造成40技能伤害。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        // 第一步：选择 +4 范围内的敌人
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: '+', n: 4 },
          hintText: '【胆勇·第一步】请选择 +4 范围内的敌人。'
        });
        if (!target) return;

        // 第二步：以敌人为中心，选择 r2 范围内的空格作为落点
        const cell = await Effect.chooseCell(actor, {
          center: { x: target.x, y: target.y },
          range: { shape: 'r', n: 2 },
          mustEmpty: true,
          hintText: '【胆勇·第二步】请选择 ' + target.name + ' 周围的空格作为落点。'
        });
        if (!cell) return;

        // 第三步：位移并造成伤害
        Effect.teleport(actor, cell.x, cell.y);
        Effect.damage(actor, target, 40, { ignoreDef: true });
      }
    },

    rage: {
      id: 'rage',
      name: '怒吼',
      type: '主动',
      cooldown: 2,
      desc: '本回合攻击力提升30，持续至本回合结束。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        actor.atkBuff = (actor.atkBuff || 0) + 30;
        actor.atkBuffTurns = 1;
        global.Game.log(actor.name + ' 发动【怒吼】，攻击 +30！');
      }
    },

    feint: {
      id: 'feint',
      name: '突袭',
      type: '主动',
      cooldown: 2,
      desc: '十字4格范围内选中一格并移动过去，再对邻格敌人造成1.5倍伤害。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        const cell = await Effect.chooseCell(actor, {
          range: { shape: '+', n: 4 },
          mustEmpty: true,
          hintText: '【突袭】请选择十字4格内的空格作为落点。'
        });
        if (!cell) return;
        actor.x = cell.x;
        actor.y = cell.y;
        const neighbors = Range.plus(1, actor.x, actor.y, { includeSelf: false });
        let hit = 0;
        for (const c of neighbors) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.damage(actor, t, actor.atk, { mul: 1.5 });
            hit++;
          }
        }
        global.Game.log(actor.name + ' 发动【突袭】，命中 ' + hit + ' 人。');
      }
    },

    heal: {
      id: 'heal',
      name: '疗伤',
      type: '主动',
      cooldown: 2,
      desc: '圆形3格范围内为己方单位回复80生命。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        const area = Range.circle(3, actor.x, actor.y, { includeSelf: true });
        let n = 0;
        for (const c of area) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side === actor.side) {
            Effect.heal(t, 80);
            n++;
          }
        }
        global.Game.log(actor.name + ' 发动【疗伤】，治疗 ' + n + ' 人。');
      }
    },

    volley: {
      id: 'volley',
      name: '齐射',
      type: '主动',
      cooldown: 3,
      desc: '圆形5格范围对所有敌人造成0.8倍攻击伤害。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        const area = Range.circle(5, actor.x, actor.y, { includeSelf: false });
        let n = 0;
        for (const c of area) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.damage(actor, t, actor.atk, { mul: 0.8 });
            n++;
          }
        }
        global.Game.log(actor.name + ' 发动【齐射】，命中 ' + n + ' 人。');
      }
    },

    fortify: {
      id: 'fortify',
      name: '坚守',
      type: '主动',
      cooldown: 2,
      desc: '防御提升25，持续2回合。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        actor.defBuff = (actor.defBuff || 0) + 25;
        actor.defBuffTurns = 2;
        global.Game.log(actor.name + ' 发动【坚守】，防御 +25。');
      }
    },

    stratagem: {
      id: 'stratagem',
      name: '妙计',
      type: '主动',
      cooldown: 3,
      desc: '十字3格范围内选择敌人，造成2倍攻击伤害。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: '+', n: 3 },
          hintText: '【妙计】请选择十字3格范围内的敌人。'
        });
        if (!target) return;
        Effect.damage(actor, target, actor.atk, { mul: 2 });
        global.Game.log(actor.name + ' 发动【妙计】！');
      }
    },

    charge: {
      id: 'charge',
      name: '强袭',
      type: '主动',
      cooldown: 3,
      desc: '方形2格范围内选择敌人，造成1.8倍伤害并击退2格。',
      filter(actor) {
        return actor.alive && !actor.attacked;
      },
      async content(actor) {
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: 'square', n: 2 },
          hintText: '【强袭】请选择方形2格范围内的敌人。'
        });
        if (!target) return;
        Effect.damage(actor, target, actor.atk, { mul: 1.8 });
        const dir = [Math.sign(target.x - actor.x) || 1, Math.sign(target.y - actor.y) || 0];
        Effect.push(actor, target, dir, 2);
        global.Game.log(actor.name + ' 发动【强袭】！');
      }
    }
  };

  global.Skills = Skills;
})(window);
