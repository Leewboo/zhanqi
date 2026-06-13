(function (global) {
  const SIZE = Range.BOARD_SIZE;
  const Effect = {
    // ========== 标记系统 ==========
    // marks: { 'actorId_markName': { actor, name, display, data, modifiers } }
    //   display: 显示在棋子左上角的文字
    //   modifiers: { zeroDef: bool, defBuff: num, atkBuff: num }
    _marks: {},

    mark(actor, name, opts) {
      opts = opts || {};
      if (!actor || !actor.alive) return false;
      const key = actor.generalId + '_' + name;
      this._marks[key] = {
        actor,
        name,
        display: opts.display || name,
        data: opts.data || {},
        modifiers: opts.modifiers || {}
      };
      if (global.Game) global.Game._render();
      return true;
    },

    unmark(actor, name) {
      if (!actor) return false;
      const key = actor.generalId + '_' + name;
      delete this._marks[key];
      if (global.Game) global.Game._render();
      return true;
    },

    unmarkAll(actor) {
      if (!actor) return;
      const prefix = actor.generalId + '_';
      for (const key in this._marks) {
        if (key.startsWith(prefix)) delete this._marks[key];
      }
      if (global.Game) global.Game._render();
    },

    hasMark(actor, name) {
      const key = actor.generalId + '_' + name;
      return !!this._marks[key];
    },

    getMarkData(actor, name) {
      const key = actor.generalId + '_' + name;
      return this._marks[key] ? this._marks[key].data : undefined;
    },

    getMarksOn(actor) {
      if (!actor) return [];
      const list = [];
      for (const key in this._marks) {
        const m = this._marks[key];
        if (m.actor === actor) list.push(m);
      }
      return list;
    },

    // ========== 战斗数值辅助 ==========
    getEffectiveDefense(target) {
      if (!target) return 0;
      // 标记中若有 zeroDef => 防御归零
      const marks = this.getMarksOn(target);
      for (const m of marks) {
        if (m.modifiers && m.modifiers.zeroDef) return 0;
      }
      // 基础防御 + 防御 buff
      let def = target.def + (target.defBuff || 0);
      // 地形加成（m=山+10, w=水+15, f=林+5）
      if (global.Game && global.Game.terrain) {
        const t = target.y >= 0 && global.Game.terrain[target.y]
          ? global.Game.terrain[target.y][target.x]
          : 'plain';
        if (t === 'm') def += 10;
        if (t === 'w') def += 15;
        if (t === 'f') def += 5;
      }
      return Math.max(0, def);
    },

    getEffectiveAttack(actor) {
      if (!actor) return 0;
      let atk = actor.atk + (actor.atkBuff || 0);
      // 标记中若有 atkBuff 加成
      const marks = this.getMarksOn(actor);
      for (const m of marks) {
        if (m.modifiers && typeof m.modifiers.atkBuff === 'number') atk += m.modifiers.atkBuff;
      }
      return atk;
    },

    // ========== 事件系统 ==========
    _events: {},

    on(eventName, cb) {
      if (!this._events[eventName]) this._events[eventName] = [];
      this._events[eventName].push(cb);
    },

    off(eventName, cb) {
      if (!this._events[eventName]) return;
      this._events[eventName] = this._events[eventName].filter(f => f !== cb);
    },

    trigger(eventName, context) {
      const handlers = this._events[eventName] || [];
      for (const cb of handlers) {
        try { cb(context); } catch (e) { console.error(e); }
      }
    },

    // ========== 基础效果 ==========
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
      const marks = this.getMarksOn(target);
      const hasZeroDef = marks.some(m => m.modifiers && m.modifiers.zeroDef);
      const markNames = marks.map(m => m.display).join('、');

      if (!opts.ignoreDef) {
        const effDef = hasZeroDef ? 0 : this.getEffectiveDefense(target);
        atk = Math.max(1, amount - effDef);
      }
      const final = Math.max(1, Math.floor(atk * (opts.mul || 1)));
      target.hp -= final;
      if (global.Game) {
        const note = hasZeroDef ? '（' + markNames + '，防御归零）' : '';
        global.Game.log((actor ? actor.name : '') + ' 对 ' + target.name + ' 造成 ' + final + ' 伤害' + note + '。');
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          this.unmarkAll(target);
          global.Game.log(target.name + ' 被击败！');
          if (actor) global.Game._onKill(actor, target);
        }
      }
      return final;
    },

    basicAttack(actor, target) {
      return Effect.damage(actor, target, this.getEffectiveAttack(actor));
    },

    changeTerrain(x, y, terrain) {
      if (!global.Game) return false;
      const g = global.Game;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
      const old = g.terrain[y][x];
      if (old === terrain) return false;
      g._setCellTerrain(x, y, terrain);
      g.log('(' + x + ',' + y + ') 地形变为 ' + (terrain === 'r' ? '河' : terrain) + '。');
      return true;
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
      actor.skilled = false;
      if (global.Game) global.Game.log(actor.name + ' 恢复行动（可再次移动、攻击与使用技能）！', 'turn');
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
