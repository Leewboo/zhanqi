(function (global) {
  const Effect = {
    heal(actor, amount) {
      if (!actor || !actor.alive) return amount;
      const before = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + amount);
      const delta = actor.hp - before;
      if (global.Game && delta !== 0) {
        global.Game.log(actor.name + ' 恢复 ' + delta + ' 生命。');
      }
      return delta;
    },

    damage(actor, target, amount, opts) {
      opts = opts || {};
      if (!target || !target.alive) return 0;
      let atk = amount;
      if (!opts.ignoreDef) atk = Math.max(1, amount - target.def);
      const final = Math.max(1, Math.floor(atk * (opts.mul || 1)));
      target.hp -= final;
      if (global.Game) {
        global.Game.log((actor ? actor.name : '') + ' 对 ' + target.name + ' 造成 ' + final + ' 伤害。');
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          global.Game.log(target.name + ' 被击败！');
          if (actor) global.Game._onKill(actor, target);
        }
      }
      return final;
    },

    basicAttack(actor, target) {
      return Effect.damage(actor, target, actor.atk);
    },

    addBuff(actor, target, buff) {
      if (!target || !target.alive) return;
      target.buffs = target.buffs || [];
      target.buffs.push(Object.assign({}, buff));
      if (global.Game) global.Game.log(target.name + ' 获得 [' + buff.name + ']。');
    },

    consumeBuff(actor, buffName) {
      if (!actor || !actor.buffs) return false;
      const idx = actor.buffs.findIndex(b => b.name === buffName);
      if (idx >= 0) {
        actor.buffs.splice(idx, 1);
        return true;
      }
      return false;
    },

    teleport(actor, x, y) {
      if (!actor || !actor.alive) return false;
      if (!global.Game) return false;
      const g = global.Game;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
      if (g.pieceAt(x, y)) return false;
      actor.x = x;
      actor.y = y;
      g.log(actor.name + ' 位移到 (' + x + ',' + y + ')。');
      return true;
    },

    resetAction(actor) {
      if (!actor || !actor.alive) return false;
      actor.moved = false;
      actor.attacked = false;
      if (global.Game) global.Game.log(actor.name + ' 恢复行动（可再次移动与攻击）！', 'turn');
      return true;
    },

    chooseCell(actor, options) {
      options = options || {};
      return new Promise(function (resolve) {
        if (!global.Game) return resolve(null);
        // 支持自定义中心点：options.center = {x,y}，默认以 actor 为中心
        const cx = options.center ? options.center.x : actor.x;
        const cy = options.center ? options.center.y : actor.y;
        const range = options.range || { shape: 'square', n: 3 };
        const cells = Range.cellsInRangeWithBlock(
          range.shape, range.n, cx, cy, {
            pieceAt: (x, y) => {
              const p = global.Game.pieceAt(x, y);
              if (!p || !p.alive) return null;
              if (options.passThrough) return null;
              return p;
            },
            includeSelf: !options.mustEmpty
          }
        );
        const valid = [];
        for (const c of cells) {
          const p = global.Game.pieceAt(c.x, c.y);
          if (options.mustEmpty && p) continue;
          if (options.mustEnemy && (!p || p.alive === false || p.side === actor.side)) continue;
          if (options.mustAlly && (!p || p.alive === false || p.side !== actor.side)) continue;
          if (options.mustSelf && (c.x !== actor.x || c.y !== actor.y)) continue;
          valid.push(c);
        }
        if (!valid.length) return resolve(null);
        global.Game.awaitingCell = (cell) => {
          resolve(cell);
        };
        global.Game.highlighted = valid.map(c => ({ x: c.x, y: c.y, kind: options.hint || 'skill' }));
        global.Game._render();
        if (options.hintText && global.Game) global.Game.log(options.hintText);
      });
    },

    chooseEnemy(actor, options) {
      return Effect.chooseCell(actor, Object.assign({}, options, { mustEnemy: true }))
        .then(function (cell) {
          if (!cell) return null;
          return global.Game.pieceAt(cell.x, cell.y);
        });
    },

    push(actor, target, dir, n) {
      if (!target || !global.Game) return;
      n = n || 1;
      const g = global.Game;
      for (let i = 0; i < n; i++) {
        const nx = target.x + dir[0];
        const ny = target.y + dir[1];
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break;
        if (g.pieceAt(nx, ny)) break;
        target.x = nx;
        target.y = ny;
      }
    },

    drawAoe(shape, n, originX, originY, options) {
      return Range.cellsInRange(shape, n, originX, originY, options);
    }
  };

  global.Effect = Effect;
})(window);
