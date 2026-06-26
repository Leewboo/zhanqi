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
      desc: '回合结束时，对己身方片1范围内所有敌方武将施加「威」标记，其他敌方武将的「威」标记移除。带「威」标记的角色被攻击时防御归零。',
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
      preview: { shape: 'square', n: 2, passThrough: true },
      desc: '选择方形2范围内的一个格子，以此格为中心方形1范围内所有格子改为河，并对敌方单位造成40点伤害。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const g = global.Game;
        const target = await Effect.chooseCell(actor, {
          range: { shape: 'square', n: 2 },
          passThrough: true,
          hintText: '【水淹】请选择方形2范围内的目标位置。'
        });
        if (!target) return false;
        actor.skilled = true;
        // 以落点为中心，方形1范围内所有格子
        const cells = Range.cellsInRange('square', 1, target.x, target.y, { includeSelf: true });
        let hit = 0;
        for (const c of cells) {
          // 改变地形为河
          Effect.changeTerrain(c.x, c.y, 'r');
          // 对格子上敌方单位造成40伤害
          const t = g.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.damage(actor, t, 40, { ignoreDef: true });
            hit++;
          }
        }
        g.log(actor.name + ' 发动【水淹】，影响 ' + cells.length + ' 格，命中 ' + hit + ' 人。');
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
    },

    // ========== 吕布 ==========
    wuShuang: {
      id: 'wuShuang',
      name: '无双',
      type: '主动',
      cooldown: 3,
      preview: { shape: 'square', n: 1, passThrough: true },
      desc: '对周围方形1格内所有敌人造成2倍伤害，并击退2格。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        actor.skilled = true;
        const cells = Range.cellsInRange('square', 1, actor.x, actor.y, { includeSelf: false });
        let hits = 0;
        for (const c of cells) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.damage(actor, t, Effect.getEffectiveAttack(actor), { mul: 2 });
            const dir = [Math.sign(c.x - actor.x) || 0, Math.sign(c.y - actor.y) || 0];
            Effect.push(actor, t, dir, 2);
            hits++;
          }
        }
        global.Game.log(actor.name + ' 发动【无双】，横扫 ' + hits + ' 人！');
        return hits > 0;
      }
    },
    feiJiang: {
      id: 'feiJiang',
      name: '飞将',
      type: '被动',
      cooldown: 0,
      trigger: 'turnStart',
      desc: '回合开始时，若周围方形2格内没有友军，则攻击力提升40并获得30护盾，持续1回合。',
      filter(actor) {
        return actor && actor.alive;
      },
      content(actor) {
        if (!global.Game) return;
        const cells = Range.cellsInRange('square', 2, actor.x, actor.y, { includeSelf: false });
        let hasAlly = false;
        for (const c of cells) {
          const p = global.Game.pieceAt(c.x, c.y);
          if (p && p.alive && p.side === actor.side && p.generalId !== actor.generalId) {
            hasAlly = true;
            break;
          }
        }
        if (!hasAlly) {
          actor.atkBuff = (actor.atkBuff || 0) + 40;
          actor.atkBuffTurns = 1;
          Effect.shield(actor, 30);
          global.Game.log('【飞将】' + actor.name + ' 孤军奋战，攻击+40，获得30护盾！', 'turn');
        }
      }
    },

    // ========== 诸葛亮 ==========
    huoGong: {
      id: 'huoGong',
      name: '火攻',
      type: '主动',
      cooldown: 3,
      preview: { shape: 'square', n: 3, passThrough: true },
      desc: '选择方形3格内的一个格子，在该位置引爆圆形1范围的火焰，造成60点无视防御伤害。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const cell = await Effect.chooseCell(actor, {
          range: { shape: 'square', n: 3 },
          passThrough: true,
          hintText: '【火攻】请选择方形3格内的目标位置。'
        });
        if (!cell) return false;
        actor.skilled = true;
        const result = Effect.explode(actor, cell.x, cell.y, 1, 60, { ignoreDef: true, shape: 'r' });
        global.Game.log(actor.name + ' 发动【火攻】，命中 ' + result.hits + ' 人！');
        return true;
      }
    },
    kongCheng: {
      id: 'kongCheng',
      name: '空城',
      type: '被动',
      cooldown: 0,
      trigger: 'turnStart',
      desc: '回合开始时，获得40%闪避率，持续到本回合结束。',
      filter(actor) {
        return actor && actor.alive;
      },
      content(actor) {
        Effect.dodge(actor, 0.4);
      }
    },

    // ========== 张飞 ==========
    paoXiao: {
      id: 'paoXiao',
      name: '咆哮',
      type: '主动',
      cooldown: 3,
      preview: { shape: '+', n: 2, passThrough: true },
      desc: '对十字2格范围内敌人造成1.5倍伤害，并眩晕1回合。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        actor.skilled = true;
        const cells = Range.cellsInRange('+', 2, actor.x, actor.y, { includeSelf: false });
        let hits = 0;
        for (const c of cells) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            Effect.damage(actor, t, Effect.getEffectiveAttack(actor), { mul: 1.5 });
            if (t.alive) Effect.stun(t, 1);
            hits++;
          }
        }
        global.Game.log(actor.name + ' 发动【咆哮】，命中 ' + hits + ' 人！');
        return hits > 0;
      }
    },
    yanRen: {
      id: 'yanRen',
      name: '燕人',
      type: '被动',
      cooldown: 0,
      trigger: 'onAttacked',
      desc: '被攻击后，若血量低于50%，本回合攻击力提升30（一回合内可叠加）。',
      filter(actor) {
        return actor && actor.alive;
      },
      content(actor, context) {
        if (!actor || !actor.maxHp) return;
        const ratio = actor.hp / actor.maxHp;
        if (ratio < 0.5) {
          actor.atkBuff = (actor.atkBuff || 0) + 30;
          if (actor.atkBuffTurns === undefined || actor.atkBuffTurns < 1) {
            actor.atkBuffTurns = 1;
          }
          if (global.Game) global.Game.log('【燕人】' + actor.name + ' 怒气上升，攻击+30！');
        }
      }
    },

    // ========== 貂蝉 ==========
    liJian: {
      id: 'liJian',
      name: '离间',
      type: '主动',
      cooldown: 4,
      preview: { shape: 'square', n: 2, passThrough: true },
      desc: '选择方形2格内一名敌人，使其魅惑2回合（临时加入己方）。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: 'square', n: 2 },
          passThrough: true,
          hintText: '【离间】请选择方形2格内的敌人，使其倒戈。'
        });
        if (!target) return false;
        actor.skilled = true;
        Effect.charm(actor, target, 2);
        return true;
      }
    },
    qingGuo: {
      id: 'qingGuo',
      name: '倾国',
      type: '被动',
      cooldown: 0,
      trigger: 'turnEnd',
      desc: '回合结束时，周围方形1格内所有敌人有35%概率被眩晕1回合。',
      filter(actor) {
        return actor && actor.alive;
      },
      content(actor) {
        if (!global.Game) return;
        const cells = Range.cellsInRange('square', 1, actor.x, actor.y, { includeSelf: false });
        let stunned = 0;
        for (const c of cells) {
          const t = global.Game.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            if (Effect.chance(0.35)) {
              Effect.stun(t, 1);
              stunned++;
            }
          }
        }
        if (stunned > 0) {
          global.Game.log('【倾国】' + actor.name + ' 魅惑了 ' + stunned + ' 名敌人！', 'turn');
        }
      }
    },

    // ========== 周瑜 ==========
    fengHuo: {
      id: 'fengHuo',
      name: '烽火',
      type: '主动',
      cooldown: 3,
      preview: { shape: '+', n: 3, passThrough: true },
      desc: '选择十字3格内的一名敌人，对其造成80点伤害，并将其拉向自己2格，同时回复40生命。',
      filter(actor) {
        return actor.alive && !actor.skilled;
      },
      async content(actor) {
        const target = await Effect.chooseEnemy(actor, {
          range: { shape: '+', n: 3 },
          passThrough: true,
          hintText: '【烽火】请选择十字3格内的敌人。'
        });
        if (!target) return false;
        actor.skilled = true;
        Effect.leech(actor, target, 80, { ignoreDef: true, leechRatio: 0.5 });
        if (target.alive) Effect.pull(actor, target, 2);
        global.Game.log(actor.name + ' 发动【烽火】！');
        return true;
      }
    },
    yingZi: {
      id: 'yingZi',
      name: '英姿',
      type: '被动',
      cooldown: 0,
      trigger: 'turnStart',
      desc: '回合开始时恢复25生命，并获得20点护盾。',
      filter(actor) {
        return actor && actor.alive;
      },
      content(actor) {
        Effect.heal(actor, 25);
        Effect.shield(actor, 20);
      }
    }
  };

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
