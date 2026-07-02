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
        global.Game._showFloatText(actor.x, actor.y, '+' + delta, 'heal');
      }
      return delta;
    },

    damage(actor, target, amount, opts) {
      opts = opts || {};
      if (!target || !target.alive) return 0;

      // 闪避判定
      const dodgeMarks = this.getMarksOn(target).filter(m => m.modifiers && m.modifiers.dodgeChance);
      if (dodgeMarks.length > 0) {
        const maxChance = Math.max(...dodgeMarks.map(m => m.modifiers.dodgeChance));
        if (Math.random() < maxChance) {
          // 闪避成功，移除所有闪避标记
          dodgeMarks.forEach(m => Effect.unmark(target, m.name));
          if (global.Game) {
            global.Game._showFloatText(target.x, target.y, '闪避!', 'dodge');
            global.Game.log(target.name + ' 闪避了攻击！');
          }
          return 0;
        }
        // 闪避失败，移除闪避标记
        dodgeMarks.forEach(m => Effect.unmark(target, m.name));
      }

      let atk = amount;
      const marks = this.getMarksOn(target);
      const hasZeroDef = marks.some(m => m.modifiers && m.modifiers.zeroDef);
      const markNames = marks.map(m => m.display).join('、');

      if (!opts.ignoreDef) {
        const effDef = hasZeroDef ? 0 : this.getEffectiveDefense(target);
        atk = Math.max(1, amount - effDef);
      }
      let final = Math.max(1, Math.floor(atk * (opts.mul || 1)));

      // 先扣护盾
      let shieldAbsorbed = 0;
      if (target.shield && target.shield > 0 && !opts.ignoreShield) {
        shieldAbsorbed = Math.min(target.shield, final);
        target.shield -= shieldAbsorbed;
        final -= shieldAbsorbed;
        if (global.Game && shieldAbsorbed > 0) {
          global.Game._showFloatText(target.x, target.y, '护盾-' + shieldAbsorbed, 'shield');
        }
      }

      if (final > 0) {
        target.hp -= final;
      }
      
      if (global.Game) {
        global.Game._showHitEffect(target.x, target.y, final > 50);
        if (final > 0) {
          global.Game._showFloatText(target.x, target.y, '-' + final, 'damage');
        }
        
        const note = hasZeroDef ? '（' + markNames + '，防御归零）' : '';
        const shieldNote = shieldAbsorbed > 0 ? '（护盾吸收 ' + shieldAbsorbed + '）' : '';
        global.Game.log((actor ? actor.name : '') + ' 对 ' + target.name + ' 造成 ' + final + ' 伤害' + note + shieldNote + '。');

        // 触发被攻击事件
        Effect.trigger('onAttacked', { actor, target, damage: final });

        // 触发目标的 onAttacked 被动技能
        if (target.skills) {
          for (const sk of target.skills) {
            if (sk.type === '被动' && sk.trigger === 'onAttacked' && sk.filter && sk.filter(target)) {
              try {
                sk.content(target, { attacker: actor, damage: final });
              } catch (e) { console.error(e); }
            }
          }
        }

        // 荆棘反伤
        const thornMarks = marks.filter(m => m.modifiers && m.modifiers.thornsAmount);
        if (thornMarks.length > 0 && actor && actor.alive && final > 0) {
          let totalThorns = thornMarks.reduce((s, m) => s + (m.modifiers.thornsAmount || 0), 0);
          if (totalThorns > 0) {
            Effect.damage(target, actor, totalThorns, { ignoreDef: true });
            global.Game.log('【荆棘】反弹 ' + totalThorns + ' 伤害给 ' + actor.name + '。');
          }
        }

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
    },

    // ========== 进阶效果 API ==========

    // 拉拽：将目标向 actor 方向拉 n 格
    pull(actor, target, n) {
      if (!target || !global.Game) return 0;
      n = n || 1;
      const g = global.Game;
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const dx = Math.sign(actor.x - target.x);
        const dy = Math.sign(actor.y - target.y);
        if (dx === 0 && dy === 0) break;
        const nx = target.x + dx;
        const ny = target.y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break;
        if (g.pieceAt(nx, ny)) break;
        target.x = nx;
        target.y = ny;
        moved++;
      }
      if (moved > 0 && g) g.log(target.name + ' 被拉拽 ' + moved + ' 格。');
      return moved;
    },

    // 吸血伤害：造成伤害的同时回复对应比例的生命
    leech(actor, target, amount, opts) {
      opts = opts || {};
      if (!actor || !target) return 0;
      const dmg = Effect.damage(actor, target, amount, opts);
      const ratio = opts.leechRatio || 0.5;
      const healAmt = Math.floor(dmg * ratio);
      if (healAmt > 0) Effect.heal(actor, healAmt);
      return dmg;
    },

    // 范围爆炸：在指定坐标造成 aoe 伤害
    explode(actor, x, y, range, amount, opts) {
      opts = opts || {};
      if (!global.Game) return { hits: 0, cells: 0 };
      const g = global.Game;
      const shape = opts.shape || 'r';
      const n = range || 1;
      const cells = Range.cellsInRange(shape, n, x, y, { includeSelf: true });
      let hits = 0;
      for (const c of cells) {
        const t = g.pieceAt(c.x, c.y);
        if (t && t.alive && (opts.includeAllies || t.side !== actor.side)) {
          Effect.damage(actor, t, amount, opts);
          hits++;
        }
      }
      return { hits, cells: cells.length };
    },

    // 护盾：吸收固定伤害，被打破时消失
    shield(target, amount, opts) {
      opts = opts || {};
      if (!target || !target.alive) return 0;
      target.shield = (target.shield || 0) + amount;
      if (global.Game) {
        global.Game.log(target.name + ' 获得 ' + amount + ' 点护盾。');
        global.Game._showFloatText(target.x, target.y, '+' + amount + '盾', 'shield');
      }
      return amount;
    },

    // 眩晕：目标跳过下一次行动（moved/attacked/skilled 锁定）
    stun(target, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'stun', {
        display: '晕',
        modifiers: { stunTurns: turns },
        data: { turns }
      });
      if (global.Game) global.Game.log(target.name + ' 被眩晕 ' + turns + ' 回合！');
      return true;
    },

    // 魅惑/控制：目标下回合变为友方（临时换边）
    charm(actor, target, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'charm', {
        display: '魅',
        modifiers: { charmTurns: turns, originalSide: target.side },
        data: { turns, originalSide: target.side, charmedBy: actor.generalId }
      });
      target.side = actor.side;
      if (global.Game) global.Game.log(target.name + ' 被魅惑，加入 ' + (actor.side === 'red' ? '红方' : '蓝方') + '！');
      return true;
    },

    // 反伤盾：受到攻击时反弹部分伤害给攻击者
    thorns(target, amount, turns) {
      turns = turns || 2;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'thorns', {
        display: '棘',
        modifiers: { thornsTurns: turns, thornsAmount: amount },
        data: { amount, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 获得荆棘护甲（反伤 ' + amount + '）。');
      return true;
    },

    // 闪避标记：下一次受到的伤害有概率闪避
    dodge(target, chance) {
      chance = chance || 0.5;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'dodge', {
        display: '闪',
        modifiers: { dodgeChance: chance },
        data: { chance }
      });
      if (global.Game) global.Game.log(target.name + ' 获得闪避状态（' + Math.floor(chance * 100) + '%）。');
      return true;
    },

    // 移动力增益/减益
    modifyMoveRange(target, delta, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return false;
      const key = 'mov_' + (delta > 0 ? 'up' : 'down');
      const display = delta > 0 ? ('移+' + delta) : ('移' + delta);
      Effect.mark(target, key, {
        display: display,
        modifiers: { moveRangeDelta: delta, moveRangeTurns: turns },
        data: { delta, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 移动力 ' + (delta > 0 ? '+' : '') + delta + '。');
      return true;
    },

    // 攻击力增益/减益（带持续回合数）
    modifyAttack(target, delta, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return 0;
      target.atkBuff = (target.atkBuff || 0) + delta;
      const key = 'atk_' + (delta > 0 ? 'up' : 'down') + '_' + Math.abs(delta);
      Effect.mark(target, key, {
        display: (delta > 0 ? '攻+' : '攻') + delta,
        modifiers: { atkBuff: 0 },
        data: { delta, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 攻击力 ' + (delta > 0 ? '+' : '') + delta + '（' + turns + '回合）。');
      return delta;
    },

    // 直接对范围内所有友方治疗
    healArea(actor, shape, n, amount) {
      if (!global.Game) return 0;
      const cells = Range.cellsInRange(shape, n, actor.x, actor.y, { includeSelf: true });
      let count = 0;
      for (const c of cells) {
        const t = global.Game.pieceAt(c.x, c.y);
        if (t && t.alive && t.side === actor.side) {
          Effect.heal(t, amount);
          count++;
        }
      }
      return count;
    },

    // 选择友方单位
    chooseAlly(actor, options) {
      return Effect.chooseCell(actor, Object.assign({}, options, { mustAlly: true }))
        .then(function (cell) {
          if (!cell) return null;
          return global.Game.pieceAt(cell.x, cell.y);
        });
    },

    // 获取某方所有存活棋子
    getAllies(actor) {
      if (!global.Game) return [];
      return global.Game.pieces.filter(p => p.alive && p.side === actor.side);
    },
    getEnemies(actor) {
      if (!global.Game) return [];
      return global.Game.pieces.filter(p => p.alive && p.side !== actor.side);
    },

    // 随机数工具
    random(min, max) {
      if (max === undefined) { max = min; min = 0; }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    chance(p) {
      return Math.random() < p;
    },

    // ========== 单独恢复行动 ==========

    // 仅恢复移动权限
    resetMove(actor) {
      if (!actor || !actor.alive) return false;
      actor.moved = false;
      if (global.Game) global.Game.log(actor.name + ' 恢复了移动权限！', 'turn');
      return true;
    },

    // 仅恢复攻击权限
    resetAttack(actor) {
      if (!actor || !actor.alive) return false;
      actor.attacked = false;
      if (global.Game) global.Game.log(actor.name + ' 恢复了攻击权限！', 'turn');
      return true;
    },

    // 仅恢复技能权限（可选：同时清空指定技能的冷却）
    resetSkill(actor, skillId) {
      if (!actor || !actor.alive) return false;
      actor.skilled = false;
      if (skillId && actor.cdMap) actor.cdMap[skillId] = 0;
      if (global.Game) global.Game.log(actor.name + ' 恢复了技能权限！', 'turn');
      return true;
    },

    // ========== 新效果 ==========

    // 冻结：目标下回合无法移动（锁 moved），持续 turns 回合
    freeze(target, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'freeze', {
        display: '冻',
        modifiers: { freezeTurns: turns },
        data: { turns }
      });
      if (global.Game) global.Game.log(target.name + ' 被冻结 ' + turns + ' 回合，无法移动！');
      return true;
    },

    // 中毒：目标每回合受到固定伤害（无视防御），持续 turns 回合
    poison(target, dmgPerTurn, turns) {
      turns = turns || 2;
      dmgPerTurn = dmgPerTurn || 20;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'poison', {
        display: '毒',
        modifiers: { poisonDmg: dmgPerTurn, poisonTurns: turns },
        data: { dmgPerTurn, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 中毒（每回合 ' + dmgPerTurn + ' 点，共 ' + turns + ' 回合）！');
      return true;
    },

    // 再生：目标每回合回复固定生命，持续 turns 回合
    regen(target, healPerTurn, turns) {
      turns = turns || 2;
      healPerTurn = healPerTurn || 20;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'regen', {
        display: '生',
        modifiers: { regenHeal: healPerTurn, regenTurns: turns },
        data: { healPerTurn, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 获得再生（每回合 +' + healPerTurn + '，共 ' + turns + ' 回合）！');
      return true;
    },

    // 换位：与目标交换坐标
    swap(actor, target) {
      if (!actor || !target || !actor.alive || !target.alive) return false;
      var ax = actor.x, ay = actor.y;
      actor.x = target.x; actor.y = target.y;
      target.x = ax; target.y = ay;
      if (global.Game) global.Game.log(actor.name + ' 与 ' + target.name + ' 换位！');
      return true;
    },

    // 链式闪电：对 target 造成 amount 伤害，再弹射至最近的其他敌人，
    // 最多弹射 count 次，每次伤害衰减为 decay 倍（默认 0.6）
    chain(actor, target, amount, count, opts) {
      opts = opts || {};
      count = count === undefined ? 2 : count;
      var decay = opts.decay !== undefined ? opts.decay : 0.6;
      if (!actor || !target || !global.Game) return 0;
      var g = global.Game;
      var hit = [target];
      var dmg = amount;
      var totalHits = 0;
      Effect.damage(actor, target, dmg, opts);
      totalHits++;
      for (var i = 0; i < count; i++) {
        dmg = Math.floor(dmg * decay);
        if (dmg < 1) break;
        var last = hit[hit.length - 1];
        var candidates = g.pieces.filter(function (p) {
          return p.alive && p.side !== actor.side && hit.indexOf(p) < 0;
        });
        if (!candidates.length) break;
        candidates.sort(function (a, b) {
          return (Math.abs(a.x - last.x) + Math.abs(a.y - last.y)) -
                 (Math.abs(b.x - last.x) + Math.abs(b.y - last.y));
        });
        var next = candidates[0];
        if (!next) break;
        hit.push(next);
        Effect.damage(actor, next, dmg, opts);
        totalHits++;
      }
      if (global.Game) global.Game.log(actor.name + ' 【链式】弹射 ' + totalHits + ' 目标！');
      return totalHits;
    },

    // 嘲讽：标记自身（AI 会优先以带嘲讽标记的目标为攻击对象），持续 turns 回合
    taunt(actor, turns) {
      turns = turns || 2;
      if (!actor || !actor.alive) return false;
      Effect.mark(actor, 'taunt', {
        display: '讽',
        modifiers: { tauntTurns: turns },
        data: { turns }
      });
      if (global.Game) global.Game.log(actor.name + ' 发起嘲讽，吸引敌方注意！');
      return true;
    },

    // 随机传送：在以 actor 为中心的圆形 range 格内随机选一个空格传送
    randomTeleport(actor, range) {
      range = range || 3;
      if (!actor || !actor.alive || !global.Game) return false;
      var g = global.Game;
      var cells = Range.cellsInRange('r', range, actor.x, actor.y, { includeSelf: false });
      var empty = cells.filter(function (c) { return !g.pieceAt(c.x, c.y); });
      if (!empty.length) return false;
      var dest = empty[Math.floor(Math.random() * empty.length)];
      actor.x = dest.x; actor.y = dest.y;
      g.log(actor.name + ' 随机传送至 (' + dest.x + ',' + dest.y + ')！');
      return true;
    },

    // 召唤幻象：在指定格子放置一个虚假棋子（用标记实现，会被攻击但无 hp），
    // 返回创建的虚假棋子对象（放入 Game.pieces）
    // 注：幻象 hp 耗尽后自动消亡
    summonUnit(actor, x, y, opts) {
      if (!actor || !global.Game) return null;
      var g = global.Game;
      if (x < 0 || y < 0 || x >= Range.BOARD_SIZE || y >= Range.BOARD_SIZE) return null;
      if (g.pieceAt(x, y)) return null;

      opts = opts || {};
      var unit = {
        generalId: (opts.id || 'summon') + '_' + Date.now(),
        name:      opts.name || actor.name + '·召',
        side:      actor.side,
        hp:        Math.max(1, parseInt(opts.hp) || 60),
        maxHp:     Math.max(1, parseInt(opts.hp) || 60),
        atk:       Math.max(0, parseInt(opts.atk) || 0),
        def:       Math.max(0, parseInt(opts.def) || 0),
        x: x, y: y,
        alive: true,
        moved: opts.moved !== undefined ? opts.moved : true,
        attacked: opts.attacked !== undefined ? opts.attacked : true,
        skilled: opts.skilled !== undefined ? opts.skilled : true,
        skills: [],
        cdMap: {},
        moveRange: opts.moveRange || { shape: '+', n: 0 },
        attackRange: opts.attackRange || { shape: '+', n: 0 },
        isSummon: true
      };

      if (opts.skills && Array.isArray(opts.skills)) {
        for (const s of opts.skills) {
          if (typeof s === 'string') {
            const found = (global.Skills && global.Skills[s]) || (global.SkillsAPI && global.SkillsAPI.getSkill(s));
            if (found) unit.skills.push(found);
          } else if (typeof s === 'object') {
            if (typeof s.content === 'function') {
              unit.skills.push(s);
            } else if (s.contentCode && global.SkillsAPI) {
              const compiled = global.SkillsAPI.compileSkill(s);
              if (compiled) unit.skills.push(compiled);
            }
          }
        }
      }

      g.pieces.push(unit);
      g.log(actor.name + ' 在 (' + x + ',' + y + ') 召唤 ' + unit.name + '！');
      g._render();
      return unit;
    }
  };

  global.Effect = Effect;
})(window);
