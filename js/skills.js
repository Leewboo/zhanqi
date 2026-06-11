(function (global) {
  const Skills = {
    rage: {
      name: '怒吼',
      type: '主动',
      cost: 3,
      cooldown: 2,
      desc: '本回合攻击力提升 30，持续至本回合结束。',
      filter(actor) {
        return actor.alive && actor.cd <= 0 && global.Game.supply[actor.side] >= this.cost;
      },
      async content(actor) {
        actor.atkBuff = (actor.atkBuff || 0) + 30;
        actor.atkBuffTurns = 1;
        global.Game.log(actor.name + ' 发动【怒吼】，攻击 +30！');
      }
    },

    feint: {
      name: '突袭',
      type: '主动',
      cost: 2,
      cooldown: 2,
      desc: '十字 4 格范围内选中一格，移动到该位置并对邻格敌人造成 1.5 倍伤害。',
      rangeShape: '+',
      rangeN: 4,
      filter(actor) {
        return actor.alive && actor.cd <= 0 && global.Game.supply[actor.side] >= this.cost;
      },
      async content(actor) {
        const cell = await Effect.chooseCell(actor, {
          range: { shape: '+', n: 4 },
          mustEmpty: true
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
      name: '疗伤',
      type: '主动',
      cost: 2,
      cooldown: 2,
      desc: '圆形 3 格范围内为己方单位回复 80 生命。',
      filter(actor) {
        return actor.alive && actor.cd <= 0 && global.Game.supply[actor.side] >= this.cost;
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

    volly: {
      name: '齐射',
      type: '主动',
      cost: 3,
      cooldown: 3,
      desc: '圆形 5 格范围对所有敌人造成 0.8 倍攻击伤害。',
      filter(actor) {
        return actor.alive && actor.cd <= 0 && global.Game.supply[actor.side] >= this.cost;
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
      name: '坚守',
      type: '主动',
      cost: 2,
      cooldown: 2,
      desc: '防御提升 25，持续 2 回合。',
      filter(actor) {
        return actor.alive && actor.cd <= 0 && global.Game.supply[actor.side] >= this.cost;
      },
      async content(actor) {
        actor.defBuff = (actor.defBuff || 0) + 25;
        actor.defBuffTurns = 2;
        global.Game.log(actor.name + ' 发动【坚守】，防御 +25。');
      }
    },

    stratagem: {
      name: '妙计',
      type: '主动',
      cost: 3,
      cooldown: 3,
      desc: '十字 3 格范围内选中敌人造成 2 倍攻击伤害。',
      filter(actor) {
        return actor.alive && actor.cd <= 0 && global.Game.supply[actor.side] >= this.cost;
      },
      async content(actor) {
        const cell = await Effect.chooseCell(actor, {
          range: { shape: '+', n: 3 },
          mustEnemy: true
        });
        if (!cell) return;
        const t = global.Game.pieceAt(cell.x, cell.y);
        if (t) Effect.damage(actor, t, actor.atk, { mul: 2 });
        global.Game.log(actor.name + ' 发动【妙计】！');
      }
    },

    charge: {
      name: '强袭',
      type: '主动',
      cost: 4,
      cooldown: 3,
      desc: '方形 2 格范围选中敌人，造成 1.8 倍攻击伤害并击退。',
      filter(actor) {
        return actor.alive && actor.cd <= 0 && global.Game.supply[actor.side] >= this.cost;
      },
      async content(actor) {
        const cell = await Effect.chooseCell(actor, {
          range: { shape: 'square', n: 2 },
          mustEnemy: true
        });
        if (!cell) return;
        const t = global.Game.pieceAt(cell.x, cell.y);
        if (!t) return;
        Effect.damage(actor, t, actor.atk, { mul: 1.8 });
        const dir = [Math.sign(t.x - actor.x) || 1, Math.sign(t.y - actor.y) || 0];
        Effect.push(actor, t, dir, 2);
        global.Game.log(actor.name + ' 发动【强袭】！');
      }
    }
  };

  global.Skills = Skills;
})(window);
