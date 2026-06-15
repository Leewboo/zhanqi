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
      content(actor) {
        Effect.resetAction(actor);
      }
    },

    danYong: {
      id: 'danYong',
      name: '胆勇',
      type: '主动',
      cooldown: 2,
      preview: { shape: '+', n: 4, passThrough: true },
      desc: '在+4范围内选择一名敌人，再选择其r2范围内的空格作为落点，然后对目标造成40技能伤害。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        // 第一步：选择 +4 范围内的敌人
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: '+', n: 4 },
          passThrough: true,
          hintText: '【胆勇·第一步】请选择 +4 范围内的敌人。'
        });
        if (!target) return false;

        // 第二步：以敌人为中心，选择 r2 范围内的空格作为落点
        const cell = await Effect.chooseCell(actor, {
          center: { x: target.x, y: target.y },
          range: { shape: 'r', n: 2 },
          mustEmpty: true,
          passThrough: true,
          hintText: '【胆勇·第二步】请选择 ' + target.name + ' 周围的空格作为落点。'
        });
        if (!cell) return false;

        actor.skilled = true;
        Effect.teleport(actor, cell.x, cell.y);
        Effect.damage(actor, target, 40, { ignoreDef: true });
        return true;
      }
    },

    rage: {
      id: 'rage',
      name: '怒吼',
      type: '主动',
      cooldown: 2,
      desc: '本回合攻击力提升30，持续至本回合结束。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        actor.skilled = true;
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
      preview: { shape: '+', n: 4, passThrough: true },
      desc: '十字4格范围内选中一格并移动过去，再对邻格敌人造成1.5倍伤害。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const cell = await Effect.chooseCell(actor, {
          range: { shape: '+', n: 4 },
          mustEmpty: true,
          passThrough: true,
          hintText: '【突袭】请选择十字4格内的空格作为落点。'
        });
        if (!cell) return false;
        actor.skilled = true;
        actor.x = cell.x;
        actor.y = cell.y;
        const neighbors = Range.plus(1, actor.x, actor.y, { includeSelf: false });
        let hit = 0;
        for (const c of neighbors) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.damage(actor, t, Effect.getEffectiveAttack(actor), { mul: 1.5 });
            hit++;
          }
        }
        global.Game.log(actor.name + ' 发动【突袭】，命中 ' + hit + ' 人。');
        return true;
      }
    },

    heal: {
      id: 'heal',
      name: '疗伤',
      type: '主动',
      cooldown: 2,
      preview: { shape: 'r', n: 3, passThrough: true },
      desc: '圆形3格范围内为己方单位回复80生命。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        actor.skilled = true;
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
      preview: { shape: 'r', n: 5, passThrough: true },
      desc: '圆形5格范围对所有敌人造成0.8倍攻击伤害。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        actor.skilled = true;
        const area = Range.circle(5, actor.x, actor.y, { includeSelf: false });
        let n = 0;
        for (const c of area) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.damage(actor, t, Effect.getEffectiveAttack(actor), { mul: 0.8 });
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
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        actor.skilled = true;
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
      preview: { shape: '+', n: 3, passThrough: true },
      desc: '十字3格范围内选择敌人，造成2倍攻击伤害。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: '+', n: 3 },
          passThrough: true,
          hintText: '【妙计】请选择十字3格范围内的敌人。'
        });
        if (!target) return false;
        actor.skilled = true;
        Effect.damage(actor, target, Effect.getEffectiveAttack(actor), { mul: 2 });
        global.Game.log(actor.name + ' 发动【妙计】！');
        return true;
      }
    },

    charge: {
      id: 'charge',
      name: '强袭',
      type: '主动',
      cooldown: 3,
      preview: { shape: 'square', n: 2, passThrough: true },
      desc: '方形2格范围内选择敌人，造成1.8倍伤害并击退2格。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: 'square', n: 2 },
          passThrough: true,
          hintText: '【强袭】请选择方形2格范围内的敌人。'
        });
        if (!target) return false;
        actor.skilled = true;
        Effect.damage(actor, target, Effect.getEffectiveAttack(actor), { mul: 1.8 });
        const dir = [Math.sign(target.x - actor.x) || 1, Math.sign(target.y - actor.y) || 0];
        Effect.push(actor, target, dir, 2);
        global.Game.log(actor.name + ' 发动【强袭】！');
        return true;
      }
    },

    weiZhen: {
      id: 'weiZhen',
      name: '威震',
      type: '被动',
      cooldown: 0,
      trigger: 'turnEnd',
      desc: '回合结束时，对己身方形1范围内所有敌方武将施加「威」标记，其他敌方武将的「威」标记移除。带「威」标记的角色被攻击时防御归零。',
      filter(actor) {
        return actor && actor.alive;
      },
      content(actor) {
        if (!global.Game) return;
        const g = global.Game;
        const enemies = g.pieces.filter(p => p.alive && p.side !== actor.side);
        // 先移除所有敌人的「威」标记
        enemies.forEach(e => Effect.unmark(e, 'wei'));
        // 再对范围内敌人施加「威」标记
        const inRange = Range.cellsInRange('square', 1, actor.x, actor.y, { includeSelf: false });
        let marked = 0;
        for (const c of inRange) {
          const t = g.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.mark(t, 'wei', { display: '威', modifiers: { zeroDef: true }, data: { from: actor.name } });
            marked++;
          }
        }
        if (marked > 0) {
          g.log('【威震】' + actor.name + ' 标记 ' + marked + ' 名敌人「威」！', 'turn');
        }
      }
    },

    shuiYan: {
      id: 'shuiYan',
      name: '水淹',
      type: '主动',
      cooldown: 3,
      preview: { shape: 'r', n: 2, passThrough: true },
      desc: '圆形2格范围内：若目标所在地形不为河，则改为河；若已是河，则造成50点伤害。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const g = global.Game;
        const area = await Effect.chooseCell(actor, {
          range: { shape: 'r', n: 2 },
          passThrough: true,
          hintText: '【水淹】请选择圆形2格范围内的目标位置。'
        });
        if (!area) return false;
        actor.skilled = true;
        // 以落点为中心，r2范围内所有敌方武将
        const cells = Range.cellsInRange('r', 2, area.x, area.y, { includeSelf: true });
        let hit = 0;
        for (const c of cells) {
          const t = g.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            const curTerrain = g.terrain[t.y][t.x];
            if (curTerrain === 'r') {
              // 已是河，直接造成50伤害
              Effect.damage(actor, t, 50, { ignoreDef: true });
              hit++;
            } else {
              // 改变地形为河
              Effect.changeTerrain(t.x, t.y, 'r');
              hit++;
            }
          }
        }
        g.log(actor.name + ' 发动【水淹】，影响 ' + hit + ' 人。');
        return true;
      }
    },

    laoDangYiZhuang: {
      id: 'laoDangYiZhuang',
      name: '老当益壮',
      type: '被动',
      cooldown: 0,
      trigger: 'turnEnd',
      desc: '回合结束时，根据损失血量提升攻击力：每损失 50 生命，本回合攻击力 +20（通过标记 modifiers 实现）。',
      filter(actor) {
        return actor && actor.alive;
      },
      content(actor) {
        if (!global.Game) return;
        // 先移除之前的「壮」标记
        Effect.unmark(actor, 'lao');
        // 根据损失血量计算攻击加成（软编码：通过 modifiers.atkBuff 声明）
        const lost = actor.maxHp - actor.hp;
        if (lost > 0) {
          const buff = Math.floor(lost / 50) * 20;  // 每损失50血+20攻
          if (buff > 0) {
            Effect.mark(actor, 'lao', {
              display: '壮',
              modifiers: { atkBuff: buff },
              data: { lostHp: lost, atkBonus: buff }
            });
          }
        }
      }
    },

    baiBuChuanYang: {
      id: 'baiBuChuanYang',
      name: '百步穿杨',
      type: '主动',
      cooldown: 2,
      preview: { shape: 'square', n: 3, passThrough: true },
      desc: '方形 3 格范围内选择一名敌人，造成 1.6 倍攻击力伤害并 无视防御。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: 'square', n: 3 },
          passThrough: true,
          hintText: '【百步穿杨】请选择方形 3 格范围内的敌人。'
        });
        if (!target) return false;
        actor.skilled = true;
        const baseAtk = Effect.getEffectiveAttack(actor);
        Effect.damage(actor, target, Math.floor(baseAtk * 1.6), { ignoreDef: true });
        return true;
      }
    }
  };

  global.Skills = Skills;
})(window);
