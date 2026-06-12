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
      const raw = Math.max(1, amount - (opts.ignoreDef ? 0 : target.def));
      const final = Math.max(1, Math.floor(raw * (opts.mul || 1)));
      target.hp -= final;
      if (global.Game) {
        global.Game.log((actor ? actor.name : '') + ' 对 ' + target.name + ' 造成 ' + final + ' 伤害。');
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          global.Game.log(target.name + ' 被击败！');
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
      if (!actor || !global.Game) return false;
      const g = global.Game;
      if (!Range.inBounds(x, y)) return false;
      if (g.pieceAt(x, y)) return false;
      actor.x = x;
      actor.y = y;
      return true;
    },

    chooseCell(actor, options) {
      options = options || {};
      return new Promise(function (resolve) {
        if (!global.Game) return resolve(null);
        global.Game.requestCell(actor, options, resolve);
      });
    },

    push(actor, target, dir, n) {
      if (!target || !global.Game) return;
      n = n || 1;
      const g = global.Game;
      for (let i = 0; i < n; i++) {
        const nx = target.x + dir[0];
        const ny = target.y + dir[1];
        if (!Range.inBounds(nx, ny)) break;
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
