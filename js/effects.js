(function (global) {
  const SIZE = Range.BOARD_SIZE;

  // 工具：把拓展中的 soundId 解析为完整的 sd_xxx 格式
  // 拓展作者可写 "wusheng_cast" 或 "sd_wusheng_cast"，这里统一加前缀
  // owner 是技能或武将对象，含 _extId 时拼接（避免不同拓展同名冲突）
  function _resolveSoundId(rawId, owner) {
    if (!rawId) return null;
    const id = String(rawId);
    if (id.startsWith('sd_')) return id;
    // 拓展前缀（extId + 原id），保证唯一
    if (owner && owner._extId) {
      return 'sd_' + owner._extId + '_' + id;
    }
    return 'sd_' + id;
  }

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

    // 简化版添加标记（带持续回合数）
    addMark(actor, name, turns, opts) {
      opts = opts || {};
      turns = turns || 1;
      return Effect.mark(actor, name, {
        display: opts.display || name,
        data: Object.assign({}, opts.data || {}, { turns: turns }),
        modifiers: opts.modifiers || {}
      });
    },

    // 简化版移除标记
    removeMark(actor, name) {
      return Effect.unmark(actor, name);
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
      // 基础防御 + 防御 buff（从属性和标记中读取）
      let def = target.def + (target.defBuff || 0);
      for (const m of marks) {
        if (m.modifiers && typeof m.modifiers.defBuff === 'number') def += m.modifiers.defBuff;
      }
      // 地形加成（m=山+10, w=水+15, f=林+5）
      if (global.Game && global.Game.terrain) {
        const t = target.y >= 0 && global.Game.terrain[target.y]
          ? global.Game.terrain[target.y][target.x]
          : 'plain';
        if (t === 'm') def += 10;
        if (t === 'w') def += 15;
        if (t === 'f') def += 5;
      }
      // 城池占领加成：站在己方占领的城池上额外 +15 防御
      if (global.Game && typeof global.Game._getCastleDefenseBonus === 'function') {
        def += global.Game._getCastleDefenseBonus(target);
      }
      return Math.max(0, def);
    },

    getEffectiveAttackRange(actor) {
      if (!actor || !actor.attackRange) return { shape: '+', n: 1 };
      let n = actor.attackRange.n;
      const marks = this.getMarksOn(actor);
      for (const m of marks) {
        if (m.modifiers && typeof m.modifiers.attackRangeDelta === 'number') n += m.modifiers.attackRangeDelta;
      }
      return { shape: actor.attackRange.shape, n: Math.max(1, n) };
    },

    getEffectiveMoveRange(actor) {
      if (!actor || !actor.moveRange) return { shape: '+', n: 1 };
      let n = actor.moveRange.n;
      const marks = this.getMarksOn(actor);
      for (const m of marks) {
        if (m.modifiers && typeof m.modifiers.moveRangeDelta === 'number') n += m.modifiers.moveRangeDelta;
      }
      return { shape: actor.moveRange.shape, n: Math.max(1, n) };
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

    // 统一触发某个棋子的指定被动技能
    // actor: 棋子, eventName: 触发时机, context: 上下文
    triggerPassive(actor, eventName, context) {
      if (!actor || !actor.skills || !actor.alive) return;
      for (const sk of actor.skills) {
        if (sk.type === '被动' && sk.trigger === eventName) {
          if (!sk.filter || sk.filter(actor)) {
            try { sk.content(actor, context || {}); } catch (e) { console.error(e); }
          }
        }
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
        // 触发被治疗事件
        Effect.trigger('onHeal', { actor, amount: delta });
        Effect.triggerPassive(actor, 'onHeal', { healer: null, amount: delta });
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
        if (global.RNG.chance(maxChance)) {
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
        // 受伤音效：目标播放 hurt 语音
        Effect.playPieceVoice(target, 'hurt');
        // 伤害分摊：受伤时转移部分伤害给链接的友军
        if (!opts._isShared) {
          const shared = Effect._checkLinkDamage(target, final);
          if (shared > 0) target.hp += shared; // 分摊出去的部分回补
        }
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

        // 触发攻击者的 onAttack 被动技能（发起攻击时）
        if (actor && actor.alive) {
          Effect.triggerPassive(actor, 'onAttack', { target, damage: final });
        }

        // 触发目标的 onAttacked 被动技能
        Effect.triggerPassive(target, 'onAttacked', { attacker: actor, damage: final });

        // 荆棘反伤
        const thornMarks = marks.filter(m => m.modifiers && m.modifiers.thornsAmount);
        if (thornMarks.length > 0 && actor && actor.alive && final > 0) {
          let totalThorns = thornMarks.reduce((s, m) => s + (m.modifiers.thornsAmount || 0), 0);
          if (totalThorns > 0) {
            Effect.damage(target, actor, totalThorns, { ignoreDef: true });
            global.Game.log('【荆棘】反弹 ' + totalThorns + ' 伤害给 ' + actor.name + '。');
          }
        }

        // 不屈：致命伤害时锁 1 血
        if (target.hp <= 0) {
          const undyingMark = this.getMarksOn(target).find(m => m.modifiers && m.modifiers.undyingStacks);
          if (undyingMark && undyingMark.modifiers.undyingStacks > 0) {
            target.hp = 1;
            undyingMark.modifiers.undyingStacks -= 1;
            undyingMark.data.stacks -= 1;
            const remaining = undyingMark.data.stacks;
            if (remaining <= 0) {
              this.unmark(target, 'undying');
            }
            global.Game.log('【不屈】' + target.name + ' 残血生还！（剩余 ' + remaining + ' 层）');
            global.Game._showFloatText(target.x, target.y, '不屈!', 'shield');
            global.Game._render();
            return final;
          }

          // 复活：保留 revive 标记，死亡后供回合处理检查
          target.hp = 0;
          target.alive = false;
          // 阵亡音效：目标播放 death 语音，击杀者播放 kill 语音
          Effect.playPieceVoice(target, 'death');
          Effect.playPieceVoice(actor, 'kill');
          // 触发被击杀事件
          Effect.trigger('onKilled', { actor, victim: target, damage: final });
          Effect.triggerPassive(target, 'onKilled', { killer: actor, damage: final });
          // 检查是否有复活标记，有则保留
          const reviveMark = this.getMarksOn(target).find(m => m.modifiers && m.modifiers.reviveTurns);
          if (reviveMark) {
            const reviveData = reviveMark.data;
            const reviveMods = reviveMark.modifiers;
            this.unmarkAll(target);
            Effect.mark(target, 'revive', {
              display: '魂',
              modifiers: reviveMods,
              data: reviveData
            });
            global.Game.log(target.name + ' 被击败！但【复活】效果仍存在...');
          } else {
            this.unmarkAll(target);
          }
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

    // ========== AI 自动选择系统 ==========
    // 当处于 AI 模式时，chooseCell/chooseEnemy/chooseAlly 不进入交互等待，
    // 而是根据技能 aiHint 自动选择最优目标。
    // _aiContext = { mode: true, actor, skill, hint }
    _aiContext: null,

    // ========== 音效/语音系统接入 ==========
    // 播放技能释放音效（cast + voice）
    playSkillCastSound(actor, skill) {
      if (!skill || !skill.sound) return;
      const AM = global.AudioManager;
      if (!AM) return;
      // 1. 技能释放音效
      if (skill.sound.cast) {
        AM.play(_resolveSoundId(skill.sound.cast, skill));
      }
      // 2. 武将通用技能语音（兜底）
      if (actor && actor.voice && actor.voice.skill) {
        AM.play(_resolveSoundId(actor.voice.skill, actor));
      }
      // 3. 技能专属语音
      if (skill.sound.voice) {
        AM.play(_resolveSoundId(skill.sound.voice, skill));
      }
    },

    // 播放技能命中音效
    playSkillHitSound(skill) {
      if (!skill || !skill.sound || !skill.sound.hit) return;
      const AM = global.AudioManager;
      if (!AM) return;
      AM.play(_resolveSoundId(skill.sound.hit, skill));
    },

    // 播放武将事件语音（select/move/attack/hurt/death/kill/victory）
    playPieceVoice(piece, eventKey) {
      if (!piece || !piece.voice) return;
      const soundId = piece.voice[eventKey];
      if (!soundId) return;
      const AM = global.AudioManager;
      if (!AM) return;
      AM.play(_resolveSoundId(soundId, piece));
    },

    // ========== 联机技能同步系统 ==========
    // 回放远端技能时，把对方已选定的目标/选项按序注入：
    //  - _onlineTargetQueue: [{x,y}, ...]  供 chooseCell/chooseEnemy/chooseAlly 依次取用
    //  - _onlineOptionQueue: [idx, ...]     供 chooseOption 依次取用
    // 本地释放技能时，_onlineRecorded 累积玩家实际选择，用于发送给对方。
    _onlineTargetQueue: null,
    _onlineOptionQueue: null,
    _onlineRecorded: null,

    // 查询当前是否处于 AI 模式（content 代码可调用以分支处理）
    // 返回 _aiContext 对象（含 actor/skill/hint）或 null
    aiContext() {
      return Effect._aiContext;
    },

    // 查询当前 AI 模式下当前技能（便捷方法）
    currentAiSkill() {
      return Effect._aiContext ? Effect._aiContext.skill : null;
    },

    // AI 评估一个棋子的威胁度（用于选择攻击/技能目标）
    _aiThreat(piece) {
      if (!piece || !piece.alive) return 0;
      const hpFactor = piece.hp / (piece.maxHp || 200);
      const atk = Effect.getEffectiveAttack(piece);
      const def = Effect.getEffectiveDefense(piece);
      let threat = (atk * 2 + def) * (2 - hpFactor);
      if (piece.skills) {
        for (const sk of piece.skills) {
          if (sk.type === '被动') continue;
          // 通过 SkillAnalyzer 推断技能威力（自动分析或回退到 aiHint）
          const hint = (global.SkillAnalyzer && global.SkillAnalyzer.analyze(sk)) || sk.aiHint;
          if (hint) threat += (hint.power || 30) * 0.5;
        }
      }
      return threat;
    },

    _aiTeamThreat(side) {
      let total = 0;
      const pieces = global.Game ? global.Game.pieces : [];
      for (const p of pieces) {
        if (p.alive && p.side !== side) {
          total += Effect._aiThreat(p);
        }
      }
      return total;
    },

    _aiPositionThreat(piece) {
      if (!piece || !piece.alive || !global.Game) return 0;
      const g = global.Game;
      const side = piece.side;
      let threat = 0;
      const enemies = g.pieces.filter(p => p.alive && p.side !== side);
      for (const e of enemies) {
        const dist = Math.abs(e.x - piece.x) + Math.abs(e.y - piece.y);
        const eAtk = Effect.getEffectiveAttack(e);
        const range = Range.cellsInRangeWithBlock(e.attackRange.shape, e.attackRange.n, e.x, e.y, {
          pieceAt: (x, y) => { const p = g.pieceAt(x, y); return (p && p.alive) ? p : null; }
        });
        const inRange = range.some(c => c.x === piece.x && c.y === piece.y);
        if (inRange) {
          threat += eAtk * (1 - piece.hp / (piece.maxHp || 200)) * 2;
        } else if (dist <= e.moveRange.n + e.attackRange.n) {
          threat += eAtk * 0.5;
        }
      }
      return threat;
    },

    _aiSurvivalValue(piece) {
      if (!piece || !piece.alive) return 0;
      const hpRatio = piece.hp / (piece.maxHp || 200);
      const posThreat = Effect._aiPositionThreat(piece);
      const escapeScore = posThreat > 0 && hpRatio < 0.4 ? (1 - hpRatio) * 100 : 0;
      return escapeScore;
    },

    // AI 选择最优格子（核心逻辑）
    _aiChooseCell(actor, options) {
      if (!global.Game) return null;
      const g = global.Game;
      const cx = options.center ? options.center.x : actor.x;
      const cy = options.center ? options.center.y : actor.y;
      const range = options.range || { shape: 'square', n: 3 };
      const cells = Range.cellsInRangeWithBlock(
        range.shape, range.n, cx, cy, {
          pieceAt: (x, y) => {
            const p = g.pieceAt(x, y);
            if (!p || !p.alive) return null;
            if (options.passThrough) return null;
            return p;
          },
          includeSelf: !options.mustEmpty
        }
      );
      const valid = [];
      for (const c of cells) {
        const p = g.pieceAt(c.x, c.y);
        if (options.mustEmpty && p) continue;
        if (options.mustEnemy && (!p || p.alive === false || p.side === actor.side)) continue;
        if (options.mustAlly && (!p || p.alive === false || p.side !== actor.side)) continue;
        if (options.mustSelf && (c.x !== actor.x || c.y !== actor.y)) continue;
        // 隐身单位不可被选中（除非是自己）
        if (p && p.alive && p !== actor && Effect.isUntargetable(p) && !options.ignoreStealth) continue;
        if (typeof options.filter === 'function' && !options.filter({ x: c.x, y: c.y }, p)) continue;
        valid.push({ x: c.x, y: c.y, piece: p });
      }
      if (!valid.length) return null;

      const hint = (Effect._aiContext && Effect._aiContext.hint) || null;
      const targetType = hint ? hint.target : (options.mustEnemy ? 'enemy' : options.mustAlly ? 'ally' : 'cell');
      const prefer = hint ? (hint.preferTarget || '') : '';
      const avoidSelf = hint ? (hint.avoidSelf === true) : false;

      let best = null, bestScore = -Infinity;

      if (targetType === 'enemy' || targetType === 'aoe_enemy') {
        // 选威胁度最高/血量最低的敌人
        for (const v of valid) {
          if (!v.piece) continue;
          if (avoidSelf && v.piece === actor) continue;
          let score = Effect._aiThreat(v.piece);
          // 目标偏好策略
          if (prefer === 'low_hp') {
            score = (1 - v.piece.hp / (v.piece.maxHp || 200)) * 200;  // 血越低分越高
          } else if (prefer === 'high_threat') {
            score = Effect._aiThreat(v.piece) * 1.5;
          } else if (prefer === 'nearest') {
            const dist = Math.abs(v.piece.x - actor.x) + Math.abs(v.piece.y - actor.y);
            score = 1000 - dist * 10;  // 越近分越高
          } else if (prefer === 'caster') {
            // 优先攻击低防高攻的法师型单位
            score = (v.piece.atk || 0) * 3 - (v.piece.def || 0);
          }
          // 低血量补刀加成
          if (v.piece.hp <= Effect.getEffectiveAttack(actor)) score *= 2;
          if (score > bestScore) { bestScore = score; best = { x: v.x, y: v.y }; }
        }
      } else if (targetType === 'ally' || targetType === 'aoe_ally') {
        // 选血量百分比最低的友军（治疗/增益优先给低血）
        for (const v of valid) {
          if (!v.piece) continue;
          if (avoidSelf && v.piece === actor) continue;
          const hpPct = v.piece.hp / (v.piece.maxHp || 200);
          // 排除满血友军（治疗无用）
          if (hpPct >= 0.99 && hint && hint.type === 'heal') continue;
          let score;
          if (prefer === 'injured_ally') {
            score = (1 - hpPct) * 200;  // 残血友军优先
          } else if (prefer === 'high_threat' && hint && hint.type === 'buff') {
            score = Effect._aiThreat(v.piece);  // 增益给主力
          } else {
            score = (1 - hpPct) * 100;
          }
          if (score > bestScore) { bestScore = score; best = { x: v.x, y: v.y }; }
        }
        // 若都是满血，选威胁度最高的友军（增益给主力）
        if (!best && hint && hint.type === 'buff') {
          for (const v of valid) {
            if (!v.piece) continue;
            if (avoidSelf && v.piece === actor) continue;
            const score = Effect._aiThreat(v.piece);
            if (score > bestScore) { bestScore = score; best = { x: v.x, y: v.y }; }
          }
        }
      } else if (targetType === 'cell') {
        // 选能命中最多敌人的格子（AOE 伤害类）
        for (const v of valid) {
          // 估算以此为落点能波及的敌人数（用方形1范围近似爆炸范围）
          const aoeCells = Range.cellsInRange('r', 1, v.x, v.y, { includeSelf: true });
          let enemyHits = 0, allyHits = 0;
          for (const ac of aoeCells) {
            const ap = g.pieceAt(ac.x, ac.y);
            if (ap && ap.alive) {
              if (ap.side !== actor.side) enemyHits++;
              else if (ap.generalId !== actor.generalId) allyHits++;
            }
          }
          let score = enemyHits * 50 - allyHits * 30;  // 避免误伤友军
          if (score > bestScore) { bestScore = score; best = { x: v.x, y: v.y }; }
        }
        if (!best) best = { x: valid[0].x, y: valid[0].y };
      } else {
        // self/none 或无 hint：取第一个有效格
        best = { x: valid[0].x, y: valid[0].y };
      }

      // 兜底：如果没有选到（可能 all 满血被跳过），取第一个有效格
      if (!best && valid.length) best = { x: valid[0].x, y: valid[0].y };
      return best;
    },

    chooseCell(actor, options) {
      options = options || {};
      // 联机回放：直接返回远端已选定的目标格子，不进入交互
      if (Effect._onlineTargetQueue && Effect._onlineTargetQueue.length) {
        const t = Effect._onlineTargetQueue.shift();
        if (t === null) return Promise.resolve(null);
        return Promise.resolve({ x: t.x, y: t.y });
      }
      // 联机回放但目标队列已空（脱同步兜底）：不进入交互等待，直接返回 null
      if (global.Game && global.Game.onlineMode && global.Game._onlineSkillReplay) {
        return Promise.resolve(null);
      }
      // AI 模式：自动选择最优格子，不进入交互
      if (Effect._aiContext && Effect._aiContext.mode) {
        return Promise.resolve(Effect._aiChooseCell(actor, options));
      }
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
          // 隐身单位不可被选中（除非是自己）
          if (p && p.alive && p !== actor && Effect.isUntargetable(p) && !options.ignoreStealth) continue;
          if (typeof options.filter === 'function' && !options.filter({ x: c.x, y: c.y }, p)) continue;
          valid.push(c);
        }
        if (!valid.length) return resolve(null);
        global.Game.awaitingCell = (cell) => {
          // 联机本地操作：记录玩家选择的目标，用于同步给对方
          if (global.Game.onlineMode && !global.Game._onlineAction && !global.Game._onlineSkillReplay) {
            Effect._onlineRecorded = Effect._onlineRecorded || [];
            Effect._onlineRecorded.push(cell ? { x: cell.x, y: cell.y } : null);
          }
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
      const key = 'atk_' + (delta > 0 ? 'up' : 'down') + '_' + Math.abs(delta);
      Effect.mark(target, key, {
        display: (delta > 0 ? '攻+' : '攻') + delta,
        modifiers: { atkBuff: delta },
        data: { delta, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 攻击力 ' + (delta > 0 ? '+' : '') + delta + '（' + turns + '回合）。');
      return delta;
    },

    // 防御力增益/减益（带持续回合数）
    modifyDef(target, delta, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return 0;
      const key = 'def_' + (delta > 0 ? 'up' : 'down') + '_' + Math.abs(delta);
      Effect.mark(target, key, {
        display: (delta > 0 ? '防+' : '防') + delta,
        modifiers: { defBuff: delta },
        data: { delta, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 防御力 ' + (delta > 0 ? '+' : '') + delta + '（' + turns + '回合）。');
      return delta;
    },

    // 攻击范围增减（带持续回合数）
    modifyAttackRange(target, delta, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return false;
      const key = 'ar_' + (delta > 0 ? 'up' : 'down') + '_' + Math.abs(delta);
      Effect.mark(target, key, {
        display: (delta > 0 ? '攻距+' : '攻距') + delta,
        modifiers: { attackRangeDelta: delta, attackRangeTurns: turns },
        data: { delta, turns }
      });
      if (global.Game) global.Game.log(target.name + ' 攻击范围 ' + (delta > 0 ? '+' : '') + delta + '（' + turns + '回合）。');
      return true;
    },

    // 永久修改生命上限（当前hp按比例调整）
    modifyMaxHp(target, delta, opts) {
      opts = opts || {};
      if (!target || !target.alive) return 0;
      const oldMax = target.maxHp;
      target.maxHp = Math.max(1, target.maxHp + delta);
      if (opts.adjustCurrent !== false) {
        const ratio = target.maxHp / oldMax;
        target.hp = Math.max(1, Math.floor(target.hp * ratio));
      }
      if (global.Game) global.Game.log(target.name + ' 生命上限 ' + (delta > 0 ? '+' : '') + delta + '（当前生命' + (opts.adjustCurrent !== false ? '按比例调整' : '不变') + '）。');
      return delta;
    },

    // 批量修改属性
    // changes: { atk, def, maxHp, moveRange, attackRange }
    // 每个属性可以是数值（直接增减）或对象 { delta, turns }（带回合数的增益）
    modifyAllStats(target, changes) {
      if (!target || !target.alive || !changes) return false;
      let changed = false;
      if (changes.atk !== undefined) {
        if (typeof changes.atk === 'object') {
          Effect.modifyAttack(target, changes.atk.delta, changes.atk.turns);
        } else {
          Effect.modifyAttack(target, changes.atk, 1);
        }
        changed = true;
      }
      if (changes.def !== undefined) {
        if (typeof changes.def === 'object') {
          Effect.modifyDef(target, changes.def.delta, changes.def.turns);
        } else {
          Effect.modifyDef(target, changes.def, 1);
        }
        changed = true;
      }
      if (changes.maxHp !== undefined) {
        Effect.modifyMaxHp(target, changes.maxHp, changes.maxHpOpts);
        changed = true;
      }
      if (changes.moveRange !== undefined) {
        if (typeof changes.moveRange === 'object') {
          Effect.modifyMoveRange(target, changes.moveRange.delta, changes.moveRange.turns);
        } else {
          Effect.modifyMoveRange(target, changes.moveRange, 1);
        }
        changed = true;
      }
      if (changes.attackRange !== undefined) {
        if (typeof changes.attackRange === 'object') {
          Effect.modifyAttackRange(target, changes.attackRange.delta, changes.attackRange.turns);
        } else {
          Effect.modifyAttackRange(target, changes.attackRange, 1);
        }
        changed = true;
      }
      return changed;
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

    // ========== 通用选项选择模态框 ==========
    // 显示一个模态框，让玩家从多个选项中选择一个。
    // AI 模式下自动选择最优选项（按 aiScore 或自定义 aiPicker）。
    //
    // options: {
    //   title:    '标题',           // 模态框标题（必填）
    //   hintText: '战报提示',        // 显示在战报的提示文字（可选）
    //   options:  [                  // 选项数组（必填，至少 1 个）
    //     {
    //       label:      '选项1',     // 显示文本（必填）
    //       desc:       '描述',      // 描述说明（可选）
    //       value:      'opt1',      // 选项值（可选，默认用 label）
    //       aiScore:    50,          // AI 评分（可选，默认 0，越高越优先）
    //       aiCondition: function(actor) { return true; }  // AI 可用条件（可选）
    //     }, ...
    //   ],
    //   aiPicker: function(actor, options) { return options[0]; }  // 自定义 AI 选择函数（可选）
    // }
    // 返回选中的选项对象（含 label/desc/value 等）或 null（玩家取消）
    _optionModal: null,
    _optionResolve: null,

    _aiChooseOption(actor, opts) {
      const list = (opts.options || []).filter(o => typeof opts.filter !== 'function' || opts.filter(o));
      if (!list.length) return null;

      // 1. 自定义 aiPicker 优先
      if (typeof opts.aiPicker === 'function') {
        try {
          const picked = opts.aiPicker(actor, list);
          if (picked) return picked;
        } catch (e) { console.error('[aiPicker] 执行错误', e); }
      }

      // 2. 默认逻辑：过滤 aiCondition，按 aiScore 排序
      const valid = [];
      for (const opt of list) {
        if (typeof opt.aiCondition === 'function') {
          try { if (!opt.aiCondition(actor)) continue; }
          catch (e) { console.error('[aiCondition] 执行错误', e); continue; }
        }
        valid.push(opt);
      }
      if (!valid.length) return null;

      // 找最高分（同分随机）
      let maxScore = -Infinity;
      for (const o of valid) {
        const s = typeof o.aiScore === 'number' ? o.aiScore : 0;
        if (s > maxScore) maxScore = s;
      }
      const tops = valid.filter(o => (typeof o.aiScore === 'number' ? o.aiScore : 0) === maxScore);
      if (tops.length === 1) return tops[0];

      let best = null, bestDynamicScore = -Infinity;
      for (const opt of valid) {
        let score = typeof opt.aiScore === 'number' ? opt.aiScore : 0;

        if (opt.aiEval) {
          try {
            const evalScore = opt.aiEval(actor, opt);
            score += typeof evalScore === 'number' ? evalScore : 0;
          } catch (e) { console.error('[aiEval] 执行错误', e); }
        }

        if (opt.aiType === 'heal') {
          const hpRatio = actor.hp / (actor.maxHp || 200);
          const hpMissing = (actor.maxHp || 200) - actor.hp;
          const healAmount = opt.healAmount || 50;
          const healValue = Math.min(hpMissing, healAmount) * (1 - hpRatio) * 2;
          score += healValue;
        } else if (opt.aiType === 'buff_atk') {
          const atkBonus = opt.bonusAmount || 30;
          let enemiesNear = 0;
          if (global.Game) {
            const cells = Range.cellsInRange('square', 2, actor.x, actor.y);
            for (const c of cells) {
              const p = global.Game.pieceAt(c.x, c.y);
              if (p && p.alive && p.side !== actor.side) enemiesNear++;
            }
          }
          const atkValue = atkBonus * Math.max(1, enemiesNear * 0.5);
          score += atkValue;
        } else if (opt.aiType === 'buff_def') {
          const defBonus = opt.bonusAmount || 20;
          const posThreat = Effect._aiPositionThreat(actor);
          const defValue = defBonus * (posThreat > 0 ? 1.5 : 0.5);
          score += defValue;
        } else if (opt.aiType === 'damage') {
          const dmgAmount = opt.damageAmount || 30;
          let enemiesNear = 0;
          if (global.Game) {
            const cells = Range.cellsInRange('square', 2, actor.x, actor.y);
            for (const c of cells) {
              const p = global.Game.pieceAt(c.x, c.y);
              if (p && p.alive && p.side !== actor.side) enemiesNear++;
            }
          }
          const damageValue = dmgAmount * Math.max(1, enemiesNear * 0.3);
          score += damageValue;
        } else if (opt.aiType === 'control') {
          let highThreat = 0, enemiesNear = 0;
          if (global.Game) {
            const cells = Range.cellsInRange('square', 2, actor.x, actor.y);
            for (const c of cells) {
              const p = global.Game.pieceAt(c.x, c.y);
              if (p && p.alive && p.side !== actor.side) {
                enemiesNear++;
                if (Effect._aiThreat(p) > 50) highThreat++;
              }
            }
          }
          const controlValue = highThreat * 30 + enemiesNear * 10;
          score += controlValue;
        }

        if (score > bestDynamicScore) {
          bestDynamicScore = score;
          best = opt;
        }
      }

      return best || global.RNG.pick(tops);
    },

    chooseOption(actor, opts) {
      opts = opts || {};
      // 联机回放：直接返回远端已选定的选项（按下标重建）
      if (Effect._onlineOptionQueue && Effect._onlineOptionQueue.length) {
        const idx = Effect._onlineOptionQueue.shift();
        if (idx === null) return Promise.resolve(null);
        const displayOptions = (opts.options || []).filter(o => typeof opts.filter !== 'function' || opts.filter(o));
        const picked = displayOptions[idx] ? Object.assign({}, displayOptions[idx], { _index: idx }) : null;
        if (global.Game) global.Game.log(actor.name + ' 选择了：' + ((picked && picked.label) || ('选项 ' + (idx + 1))) + '。');
        return Promise.resolve(picked);
      }
      // 联机回放但选项队列已空（脱同步兜底）：不弹出模态框，直接返回 null
      if (global.Game && global.Game.onlineMode && global.Game._onlineSkillReplay) {
        return Promise.resolve(null);
      }
      // AI 模式：自动选择
      if (Effect._aiContext && Effect._aiContext.mode) {
        return Promise.resolve(Effect._aiChooseOption(actor, opts));
      }
      return new Promise(function (resolve) {
        if (!global.Game || !opts.options || !opts.options.length) {
          return resolve(null);
        }
        // 关闭已有模态框
        Effect._closeOptionModal();

        const g = global.Game;
        if (opts.hintText) g.log(opts.hintText);

        // 使用静态 HTML 模态框
        const modal = document.getElementById('option-modal');
        const titleEl = document.getElementById('option-title');
        const bodyEl = document.getElementById('option-body');
        const closeBtn = document.getElementById('option-close');
        if (!modal || !bodyEl) return resolve(null);

        titleEl.textContent = opts.title || '请选择';
        bodyEl.innerHTML = '';

        const displayOptions = (opts.options || []).filter(o => typeof opts.filter !== 'function' || opts.filter(o));
        if (!displayOptions.length) return resolve(null);
        displayOptions.forEach(function (opt, idx) {
          const item = document.createElement('div');
          item.className = 'option-item';
          item.innerHTML =
            '<div class="opt-label">' + (opt.label || ('选项 ' + (idx + 1))) + '</div>' +
            (opt.desc ? '<div class="opt-desc">' + opt.desc + '</div>' : '');
          item.addEventListener('click', function () {
            const picked = Object.assign({}, opt, { _index: idx });
            g.log(actor.name + ' 选择了：' + (opt.label || ('选项 ' + (idx + 1))) + '。');
            Effect._closeOptionModal();
            // 联机本地操作：记录所选选项下标，用于同步给对方
            if (g.onlineMode && !g._onlineAction && !g._onlineSkillReplay) {
              Effect._onlineRecorded = Effect._onlineRecorded || [];
              Effect._onlineRecorded.push({ opt: idx });
            }
            resolve(picked);
          });
          bodyEl.appendChild(item);
        });

        // 取消按钮
        function doCancel() {
          Effect._closeOptionModal();
          if (g.onlineMode && !g._onlineAction && !g._onlineSkillReplay) {
            Effect._onlineRecorded = Effect._onlineRecorded || [];
            Effect._onlineRecorded.push({ opt: null });
          }
          resolve(null);
        }
        closeBtn.onclick = doCancel;
        // 点击遮罩取消
        modal.onclick = function (e) {
          if (e.target === modal) doCancel();
        };

        modal.classList.remove('hidden');
        Effect._optionModal = modal;
        Effect._optionResolve = resolve;
      });
    },

    _closeOptionModal() {
      if (Effect._optionModal) {
        Effect._optionModal.classList.add('hidden');
      }
      Effect._optionModal = null;
      Effect._optionResolve = null;
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

    // 获取指定范围内的敌人
    getEnemiesInRange(actor, rangeDef) {
      if (!global.Game || !actor || !actor.alive) return [];
      const cells = Range.cellsInRange(rangeDef.shape || '+', rangeDef.n || 1, actor.x, actor.y, { includeSelf: false });
      const enemies = [];
      for (const c of cells) {
        const piece = global.Game.pieceAt(c.x, c.y);
        if (piece && piece.alive && piece.side !== actor.side) {
          enemies.push(piece);
        }
      }
      return enemies;
    },

    // 获取指定范围内的友军
    getAlliesInRange(actor, rangeDef) {
      if (!global.Game || !actor || !actor.alive) return [];
      const cells = Range.cellsInRange(rangeDef.shape || '+', rangeDef.n || 1, actor.x, actor.y, { includeSelf: false });
      const allies = [];
      for (const c of cells) {
        const piece = global.Game.pieceAt(c.x, c.y);
        if (piece && piece.alive && piece.side === actor.side) {
          allies.push(piece);
        }
      }
      return allies;
    },

    // 获取指定位置周围范围内的敌人
    getEnemiesAt(x, y, rangeDef) {
      if (!global.Game) return [];
      const cells = Range.cellsInRange(rangeDef.shape || '+', rangeDef.n || 1, x, y, { includeSelf: false });
      const enemies = [];
      for (const c of cells) {
        const piece = global.Game.pieceAt(c.x, c.y);
        if (piece && piece.alive) {
          enemies.push(piece);
        }
      }
      return enemies;
    },

    // 随机数工具（统一走可播种 RNG，联机对战下双端结果一致）
    random(min, max) {
      return global.RNG.randInt(min, max);
    },
    chance(p) {
      return global.RNG.chance(p);
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
      var dest = global.RNG.pick(empty);
      actor.x = dest.x; actor.y = dest.y;
      g.log(actor.name + ' 随机传送至 (' + dest.x + ',' + dest.y + ')！');
      return true;
    },

    // 召唤幻象：在指定格子放置一个虚假棋子（用标记实现，会被攻击但无 hp），
    // 返回创建的虚假棋子对象（放入 Game.pieces）
    // 注：幻象 hp 耗尽后自动消亡
    // opts 支持：
    //   - id: 武将ID前缀（默认 summon）
    //   - name: 召唤物名称
    //   - hp/atk/def: 数值
    //   - moveRange/attackRange: 范围
    //   - skills: 技能数组
    //   - portrait: 立绘文件名（portraits/ 目录下）
    //   - templateId: 模板武将ID，从 Generals.list 复制立绘和基础属性
    summonUnit(actor, x, y, opts) {
      if (!actor || !global.Game) return null;
      var g = global.Game;
      if (x < 0 || y < 0 || x >= Range.BOARD_SIZE || y >= Range.BOARD_SIZE) return null;
      if (g.pieceAt(x, y)) return null;

      opts = opts || {};

      var template = null;
      if (opts.templateId && global.Generals) {
        template = global.Generals.list.find(x2 => x2.id === opts.templateId);
      }

      var portraitFile = opts.portrait || (template && template.portrait) || null;

      var unit = {
        generalId: (opts.id || (template && template.id) || 'summon') + '_' + Date.now(),
        name:      opts.name || (template ? template.name : actor.name) + '·召',
        side:      actor.side,
        hp:        Math.max(1, parseInt(opts.hp) || (template && template.hp) || 60),
        maxHp:     Math.max(1, parseInt(opts.hp) || (template && template.hp) || 60),
        atk:       Math.max(0, parseInt(opts.atk) || (template && template.atk) || 0),
        def:       Math.max(0, parseInt(opts.def) || (template && template.def) || 0),
        x: x, y: y,
        alive: true,
        moved: opts.moved !== undefined ? opts.moved : true,
        attacked: opts.attacked !== undefined ? opts.attacked : true,
        skilled: opts.skilled !== undefined ? opts.skilled : true,
        skills: [],
        cdMap: {},
        moveRange: opts.moveRange || (template && template.moveRange) || { shape: '+', n: 0 },
        attackRange: opts.attackRange || (template && template.attackRange) || { shape: '+', n: 0 },
        isSummon: true,
        portrait: portraitFile
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
    },

    // ========== 小兵系统 API ==========
    // 召唤指定类型的小兵到指定位置
    summonMinion(actor, minionId, x, y) {
      if (!actor || !global.Game || !global.Minions) return null;
      const template = Minions.getById(minionId);
      if (!template) return null;

      return Effect.summonUnit(actor, x, y, {
        id: minionId,
        name: template.name,
        hp: template.hp,
        atk: template.atk,
        def: template.def,
        moveRange: template.moveRange,
        attackRange: template.attackRange,
        isSummon: true,
        isMinion: true,
        minionId: minionId,
        rarity: template.rarity
      });
    },

    // 检查某位置是否可以部署小兵
    canDeployMinion(actor, x, y) {
      if (!global.Game) return false;
      const g = global.Game;
      if (x < 0 || y < 0 || x >= Range.BOARD_SIZE || y >= Range.BOARD_SIZE) return false;
      if (g.pieceAt(x, y)) return false;

      const half = Range.BOARD_SIZE / 2;
      const isOwnHalf = actor.side === 'red' ? y >= half : y < half;
      return isOwnHalf;
    },

    // 获取可用的小兵模板列表
    getAvailableMinions() {
      return global.Minions ? Minions.list : [];
    },

    // 获取某方已部署的小兵数量
    getMinionCount(actor) {
      if (!global.Game) return 0;
      return global.Game.pieces.filter(p => p.alive && p.isMinion && p.side === actor.side).length;
    },

    // ========== 技能操作 API ==========
    // 获得技能
    gainSkill(actor, skillDef) {
      if (!actor || !skillDef) return false;
      actor.skills = actor.skills || [];
      // 支持三种形式：字符串ID、DIY定义对象(带contentCode)、已编译技能对象(带content函数)
      let skill = null;
      if (typeof skillDef === 'string') {
        skill = (global.Skills && global.Skills[skillDef]) || (global.SkillsAPI && global.SkillsAPI.getSkill(skillDef));
      } else if (typeof skillDef === 'object') {
        if (typeof skillDef.content === 'function') {
          skill = skillDef;
        } else if (typeof skillDef.contentCode === 'string' && global.SkillsAPI) {
          skill = global.SkillsAPI.registerSkill(skillDef);
        }
      }
      if (!skill) return false;
      // 避免重复添加
      if (actor.skills.some(s => s.id === skill.id)) return false;
      actor.skills.push(skill);
      return true;
    },

    // 失去技能
    loseSkill(actor, skillId) {
      if (!actor || !actor.skills) return false;
      const idx = actor.skills.findIndex(s => s.id === skillId);
      if (idx < 0) return false;
      actor.skills.splice(idx, 1);
      return true;
    },

    // 是否拥有技能
    hasSkill(actor, skillId) {
      if (!actor || !actor.skills) return false;
      return actor.skills.some(s => s.id === skillId);
    },

    // 获取技能对象
    getSkill(actor, skillId) {
      if (!actor || !actor.skills) return null;
      return actor.skills.find(s => s.id === skillId) || null;
    },

    // 设置技能冷却
    setSkillCooldown(actor, skillId, cd) {
      const sk = this.getSkill(actor, skillId);
      if (!sk) return false;
      actor.cdMap = actor.cdMap || {};
      actor.cdMap[skillId] = Math.max(0, parseInt(cd) || 0);
      return true;
    },

    // 重置技能冷却
    resetSkillCooldown(actor, skillId) {
      const sk = this.getSkill(actor, skillId);
      if (!sk) return false;
      actor.cdMap = actor.cdMap || {};
      actor.cdMap[skillId] = 0;
      return true;
    },

    // 修改技能属性
    modifySkill(actor, skillId, changes) {
      const sk = this.getSkill(actor, skillId);
      if (!sk) return false;
      Object.assign(sk, changes);
      return true;
    },

    // 减少所有技能冷却
    reduceAllCooldowns(actor, amount) {
      if (!actor || !actor.cdMap) return false;
      const amt = Math.max(0, parseInt(amount) || 0);
      for (const id in actor.cdMap) {
        actor.cdMap[id] = Math.max(0, (actor.cdMap[id] || 0) - amt);
      }
      return true;
    },

    // ========== 临时技能系统 ==========
    // 管理临时技能的生命周期（定时机/定回合数过期）
    // _tmpSkills: [{ actor, skill, tmpId, expiresAtTurn, expiresOnEvent, eventHandler, turnsRemaining }]
    _tmpSkills: [],

    // 获得临时技能
    // actor: 目标棋子
    // skillDef: 技能定义（字符串ID/DIY对象/已编译技能）
    // opts: {
    //   turns: 持续回合数（每回合结束时递减，为0时移除）
    //   turnsAtStart: 持续回合数（每回合开始时递减，为0时移除），例如 1 表示"到下回合开始"
    //   expiresOn: 过期触发时机（如 'onSkillCast', 'onMove', 'onAttacked', 'onKilled' 等）
    //   expiresAtTurn: 过期回合数（绝对回合数，到达时移除）
    //   name: 临时技能显示名称（可选，默认用原技能名）
    // }
    // 返回临时技能的唯一ID（用于手动移除）
    gainTmpSkill(actor, skillDef, opts) {
      if (!actor || !skillDef) return null;
      opts = opts || {};

      let skill = null;
      if (typeof skillDef === 'string') {
        skill = (global.Skills && global.Skills[skillDef]) || (global.SkillsAPI && global.SkillsAPI.getSkill(skillDef));
      } else if (typeof skillDef === 'object') {
        if (typeof skillDef.content === 'function') {
          skill = skillDef;
        } else if (typeof skillDef.contentCode === 'string' && global.SkillsAPI) {
          skill = global.SkillsAPI.registerSkill(skillDef);
        }
      }
      if (!skill) return null;

      const tmpId = 'tmp_' + skill.id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const tmpSkill = Object.assign({}, skill, {
        id: tmpId,
        _isTmpSkill: true,
        _originalId: skill.id
      });
      if (opts.name) tmpSkill.name = opts.name;

      actor.skills = actor.skills || [];
      actor.skills.push(tmpSkill);

      const entry = {
        actor,
        skill: tmpSkill,
        tmpId,
        originalId: skill.id,
        expiresAtTurn: opts.expiresAtTurn || null,
        expiresOnEvent: opts.expiresOn || null,
        eventHandler: null,
        turnsRemaining: opts.turns || null,
        turnsAtStartRemaining: opts.turnsAtStart || null
      };

      if (opts.expiresOn) {
        entry.eventHandler = (context) => {
          const evtActor = context.actor || context.target || context.victim;
          if (evtActor) {
            if (evtActor.generalId === actor.generalId) {
              Effect._removeTmpSkill(entry);
            }
          } else if (context.side !== undefined) {
            if (actor.side === context.side && actor.alive) {
              Effect._removeTmpSkill(entry);
            }
          }
        };
        Effect.on(opts.expiresOn, entry.eventHandler);
      }

      this._tmpSkills.push(entry);

      if (global.Game) {
        const expireInfo = [];
        if (opts.turns) expireInfo.push(opts.turns + '回合(末)');
        if (opts.turnsAtStart) expireInfo.push(opts.turnsAtStart + '回合(始)');
        if (opts.expiresOn) expireInfo.push('触发' + opts.expiresOn);
        if (opts.expiresAtTurn) expireInfo.push('第' + opts.expiresAtTurn + '回合');
        global.Game.log(actor.name + ' 获得临时技能【' + tmpSkill.name + '】' + (expireInfo.length ? '（' + expireInfo.join('，') + '后消失）' : '') + '。');
      }

      return tmpId;
    },

    // 移除临时技能
    loseTmpSkill(actor, tmpId) {
      if (!actor || !tmpId) return false;
      const entry = this._tmpSkills.find(e => e.tmpId === tmpId && e.actor.generalId === actor.generalId);
      if (entry) {
        this._removeTmpSkill(entry);
        return true;
      }
      return false;
    },

    // 移除所有临时技能
    loseAllTmpSkills(actor) {
      if (!actor) return;
      const entries = this._tmpSkills.filter(e => e.actor.generalId === actor.generalId);
      for (const entry of entries) {
        this._removeTmpSkill(entry);
      }
    },

    // 内部：移除临时技能
    _removeTmpSkill(entry) {
      if (entry.eventHandler) {
        Effect.off(entry.expiresOnEvent, entry.eventHandler);
      }

      const idx = entry.actor.skills.findIndex(s => s.id === entry.tmpId);
      if (idx >= 0) {
        entry.actor.skills.splice(idx, 1);
      }

      const tmpIdx = this._tmpSkills.findIndex(e => e.tmpId === entry.tmpId);
      if (tmpIdx >= 0) {
        this._tmpSkills.splice(tmpIdx, 1);
      }

      if (global.Game) {
        global.Game.log(entry.actor.name + ' 的临时技能【' + entry.skill.name + '】消失。');
        global.Game._render();
      }
    },

    // 检查并移除过期的临时技能
    // phase: 'turnEnd'（回合结束）或 'turnStart'（回合开始）
    // 计数器只在技能拥有者所属方的回合才递减，避免对手回合消耗计数
    _checkTmpSkillExpiry(context, phase) {
      const turn = context && context.turn ? context.turn : (global.Game && global.Game.turn ? global.Game.turn : 0);
      const side = context && context.side ? context.side : null;
      phase = phase || 'turnEnd';

      const expired = [];
      for (const entry of this._tmpSkills) {
        if (!entry.actor.alive) {
          expired.push(entry);
          continue;
        }

        if (entry.expiresAtTurn !== null && turn >= entry.expiresAtTurn) {
          expired.push(entry);
          continue;
        }

        // 只在技能拥有者所属方的回合才递减计数
        const ownerTurn = !side || side === entry.actor.side;

        if (phase === 'turnEnd' && entry.turnsRemaining !== null && ownerTurn) {
          entry.turnsRemaining--;
          if (entry.turnsRemaining <= 0) {
            expired.push(entry);
          }
        }

        if (phase === 'turnStart' && entry.turnsAtStartRemaining !== null && ownerTurn) {
          entry.turnsAtStartRemaining--;
          if (entry.turnsAtStartRemaining <= 0) {
            expired.push(entry);
          }
        }
      }

      for (const entry of expired) {
        this._removeTmpSkill(entry);
      }
    },

    // ========== 新效果扩展 ==========

    // 不屈：受到致命伤害时保留 1 点生命，消耗标记（一次性）
    // stacks: 可叠加次数，默认 1（能挡几次致命伤）
    undying(target, stacks) {
      stacks = Math.max(1, parseInt(stacks) || 1);
      if (!target || !target.alive) return false;
      const existing = this.getMarkData(target, 'undying');
      if (existing) {
        existing.stacks += stacks;
        const m = this._marks[target.generalId + '_undying'];
        if (m) { m.data.stacks = existing.stacks; m.modifiers.undyingStacks = existing.stacks; }
      } else {
        Effect.mark(target, 'undying', {
          display: '屈',
          modifiers: { undyingStacks: stacks },
          data: { stacks }
        });
      }
      if (global.Game) global.Game.log(target.name + ' 获得【不屈】（' + stacks + ' 层）！');
      return true;
    },

    // 复活：死亡后延迟 turns 回合以 ratio 比例血量复活
    revive(target, turns, ratio) {
      turns = turns || 1;
      ratio = ratio || 0.3;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'revive', {
        display: '魂',
        modifiers: { reviveTurns: turns, reviveRatio: ratio },
        data: { turns, ratio }
      });
      if (global.Game) global.Game.log(target.name + ' 获得【复活】（' + turns + ' 回合后复活）！');
      return true;
    },

    // 隐身：无法被选中为攻击/技能目标，持续 turns 回合
    stealth(target, turns) {
      turns = turns || 1;
      if (!target || !target.alive) return false;
      Effect.mark(target, 'stealth', {
        display: '隐',
        modifiers: { stealthTurns: turns, untargetable: true },
        data: { turns }
      });
      if (global.Game) global.Game.log(target.name + ' 进入【隐身】状态（' + turns + ' 回合）！');
      return true;
    },

    // 检查棋子是否不可被选中（隐身）
    isUntargetable(piece) {
      if (!piece || !piece.alive) return false;
      return this.hasMark(piece, 'stealth');
    },

    // 标记引爆：消耗目标身上的指定标记，触发回调效果
    // markName: 要引爆的标记名；callback(piece, markData): 引爆效果
    detonate(target, markName, callback) {
      if (!target || !target.alive) return false;
      const data = this.getMarkData(target, markName);
      if (!data) return false;
      if (typeof callback === 'function') {
        try { callback(target, data); } catch (e) { console.error(e); }
      }
      this.unmark(target, markName);
      if (global.Game) global.Game.log(target.name + ' 身上的【' + markName + '】被引爆！');
      return true;
    },

    // 属性偷取：永久从 target 偷取 amount 点属性给 actor
    // stat: 'atk' | 'def'
    stealStat(actor, target, stat, amount) {
      if (!actor || !target || !actor.alive || !target.alive) return 0;
      if (stat !== 'atk' && stat !== 'def') return 0;
      amount = Math.max(1, parseInt(amount) || 0);
      var stolen = 0;
      if (stat === 'atk') {
        var real = Math.max(0, Math.min(amount, target.atk));
        target.atk -= real;
        actor.atk += real;
        stolen = real;
      } else {
        var real = Math.max(0, Math.min(amount, target.def));
        target.def -= real;
        actor.def += real;
        stolen = real;
      }
      if (global.Game) global.Game.log(actor.name + ' 从 ' + target.name + ' 偷取 ' + stolen + ' 点' + (stat === 'atk' ? '攻击' : '防御') + '！');
      return stolen;
    },

    // 陷阱系统
    // _traps: [{ x, y, side, type, damage, owner, data }]
    _traps: [],

    // 放置陷阱
    // opts: { side: 敌方/友方触发, type: 'damage'|'stun'|'teleport', damage, turns, owner }
    placeTrap(x, y, opts) {
      opts = opts || {};
      if (!global.Game) return false;
      if (x < 0 || y < 0 || x >= Range.BOARD_SIZE || y >= Range.BOARD_SIZE) return false;
      // 同一格不能重复放
      if (this._traps.some(t => t.x === x && t.y === y)) return false;
      const trap = {
        x, y,
        side: opts.side || 'enemy',
        type: opts.type || 'damage',
        damage: opts.damage || 30,
        owner: opts.owner || null,
        turns: opts.turns || 3,
        data: opts.data || {}
      };
      this._traps.push(trap);
      if (global.Game) global.Game.log((opts.owner ? opts.owner.name + ' ' : '') + '在 (' + x + ',' + y + ') 布下陷阱！');
      return true;
    },

    // 检查并触发某格子的陷阱（棋子移动到该格时调用）
    _checkTraps(piece) {
      if (!piece || !piece.alive || !global.Game) return;
      for (let i = this._traps.length - 1; i >= 0; i--) {
        const t = this._traps[i];
        if (t.x !== piece.x || t.y !== piece.y) continue;
        // side='enemy' 表示敌方陷阱触发（放置者=owner，触发者应≠owner.side）
        // side='ally' 表示友方陷阱触发（触发者=owner同阵营）
        const shouldTrigger = (t.side === 'enemy')
          ? (!t.owner || t.owner.side !== piece.side)
          : (!t.owner || t.owner.side === piece.side);
        if (!shouldTrigger) continue;

        // 触发陷阱
        if (global.Game) global.Game.log(piece.name + ' 踩中了陷阱！', 'turn');
        // owner 已死亡则用 null 作为伤害来源
        const trapOwner = (t.owner && t.owner.alive) ? t.owner : null;
        if (t.type === 'damage') {
          Effect.damage(trapOwner, piece, t.damage, { ignoreDef: false });
        } else if (t.type === 'stun') {
          Effect.stun(piece, t.data.turns || 1);
        } else if (t.type === 'teleport') {
          Effect.randomTeleport(piece, t.data.range || 3);
        } else if (t.type === 'poison') {
          Effect.poison(piece, t.damage, t.data.turns || 2);
        }
        // 消耗陷阱
        this._traps.splice(i, 1);
        if (global.Game) global.Game._render();
        break; // 一次只触发一个
      }
    },

    // 清除指定格子或指定 owner 的陷阱
    clearTraps(opts) {
      opts = opts || {};
      if (opts.x !== undefined && opts.y !== undefined) {
        this._traps = this._traps.filter(t => !(t.x === opts.x && t.y === opts.y));
      } else if (opts.owner) {
        this._traps = this._traps.filter(t => !t.owner || t.owner.generalId !== opts.owner.generalId);
      } else {
        this._traps = [];
      }
    },

    // 伤害分摊：链接两个友军，任一方受伤时转移 ratio 比例给另一方
    // 持续 turns 回合
    linkDamage(allyA, allyB, turns, ratio) {
      turns = turns || 2;
      ratio = ratio !== undefined ? ratio : 0.5;
      if (!allyA || !allyB || !allyA.alive || !allyB.alive) return false;
      const linkId = 'link_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      Effect.mark(allyA, 'link', {
        display: '链',
        modifiers: { linkTurns: turns, linkPartner: allyB.generalId, linkRatio: ratio, linkId },
        data: { turns, ratio, partner: allyB.generalId, linkId }
      });
      Effect.mark(allyB, 'link', {
        display: '链',
        modifiers: { linkTurns: turns, linkPartner: allyA.generalId, linkRatio: ratio, linkId },
        data: { turns, ratio, partner: allyA.generalId, linkId }
      });
      if (global.Game) global.Game.log(allyA.name + ' 与 ' + allyB.name + ' 建立伤害分摊（' + Math.floor(ratio * 100) + '%）！');
      return true;
    },

    // 检查并执行伤害分摊（在 damage 内部调用）
    // 返回分摊出去的伤害量（用于回补目标）
    _checkLinkDamage(target, damage) {
      if (!target || !target.alive || damage <= 0) return 0;
      const linkMark = this.getMarksOn(target).find(m => m.modifiers && m.modifiers.linkPartner);
      if (!linkMark) return 0;
      const partnerId = linkMark.modifiers.linkPartner;
      const ratio = linkMark.modifiers.linkRatio || 0.5;
      // 找到分摊对象
      const partner = global.Game && global.Game.pieces.find(p => p.generalId === partnerId && p.alive);
      if (!partner) return 0;
      const shared = Math.floor(damage * ratio);
      if (shared <= 0) return 0;
      // 通过 Effect.damage 处理（自动处理不屈、护盾、死亡事件等）
      if (global.Game) global.Game.log('【分摊】' + partner.name + ' 承担 ' + shared + ' 点伤害。');
      Effect.damage(null, partner, shared, { ignoreDef: true, _isShared: true });
      return shared;
    },

    // ============================================================
    // 强力搜索 API
    // ============================================================

    // 判定一个值是否落在 [min,max] 区间内；range 可为 [min,max] / [n]（精确匹配）/ 单个数字 / null（不限）
    _inRange(val, range) {
      if (range === undefined || range === null) return true;
      if (Array.isArray(range)) {
        if (range.length === 1) return val === range[0];
        if (range.length >= 2) return val >= range[0] && val <= range[1];
        return true;
      }
      return val === range;
    },

    // 强力搜索棋子：返回符合条件的棋子数组
    // range: { shape, n, center:{x,y} } 或 null/省略（搜索全棋盘）
    // filter: {
    //   side: 'red'|'blue'|'enemy'|'ally' (相对 actor，需传 actor) ,
    //   hp:[min,max], maxHp:[min,max], atk:[min,max], def:[min,max],
    //   type:'武将'|'小兵',                // 棋子类型
    //   alive:true,                        // 是否仅存活
    //   name:'关键字',                      // 名称包含
    //   minionId:'xxx',                    // 小兵模板 id
    //   generalId:'xxx',                   // 武将/小兵实例 id
    //   rarity:'common'|'rare'|'epic',
    //   custom: function(piece){return true} // 自定义过滤函数
    // }
    // opts: { actor: 参考棋子（用于 side:'enemy'/'ally'）, includeSelf:true }
    searchPiece(range, filter, opts) {
      filter = filter || {};
      opts = opts || {};
      const g = global.Game;
      if (!g) return [];

      // 1) 圈定搜索范围：若给了 range 则取范围内格子上的棋子，否则全部棋子
      let candidates;
      if (range && (range.shape || range.n)) {
        const cx = (range.center && typeof range.center.x === 'number') ? range.center.x : (opts.actor ? opts.actor.x : 0);
        const cy = (range.center && typeof range.center.y === 'number') ? range.center.y : (opts.actor ? opts.actor.y : 0);
        const cells = Range.cellsInRange(range.shape || 'square', range.n || 1, cx, cy, { includeSelf: range.includeSelf !== false });
        candidates = [];
        const seen = new Set();
        for (const c of cells) {
          const p = g.pieceAt(c.x, c.y);
          if (p && !seen.has(p)) { seen.add(p); candidates.push(p); }
        }
      } else {
        candidates = g.pieces.slice();
      }

      // 2) 逐项过滤
      const actor = opts.actor;
      return candidates.filter(function (p) {
        if (!p) return false;
        if (filter.alive === true && !p.alive) return false;
        if (filter.alive === false && p.alive) return false;
        // 阵营
        if (filter.side !== undefined && filter.side !== null) {
          if (filter.side === 'enemy') {
            if (!actor || p.side === actor.side) return false;
          } else if (filter.side === 'ally') {
            if (!actor || p.side !== actor.side) return false;
          } else if (p.side !== filter.side) {
            return false;
          }
        }
        // 排除自身（可选）
        if (opts.includeSelf === false && actor && p === actor) return false;
        // 类型
        if (filter.type === '武将' && p.isMinion) return false;
        if (filter.type === '小兵' && !p.isMinion) return false;
        // 数值区间
        if (!Effect._inRange(p.hp, filter.hp)) return false;
        if (!Effect._inRange(p.maxHp, filter.maxHp)) return false;
        if (!Effect._inRange(p.atk, filter.atk)) return false;
        if (!Effect._inRange(p.def, filter.def)) return false;
        // 名称包含
        if (filter.name && typeof filter.name === 'string') {
          if (!p.name || p.name.indexOf(filter.name) === -1) return false;
        }
        if (filter.minionId && p.minionId !== filter.minionId) return false;
        if (filter.generalId && p.generalId !== filter.generalId) return false;
        if (filter.rarity && p.rarity !== filter.rarity) return false;
        // 自定义函数
        if (typeof filter.custom === 'function' && !filter.custom(p)) return false;
        return true;
      });
    },

    // 强力搜索棋盘格：返回符合条件的格子数组 [{x,y,piece}]
    // range: { shape, n, center:{x,y} } 或 null/省略（全棋盘）
    // filter: {
    //   empty:true,            // 仅空格
    //   occupied:true,         // 仅已被占据
    //   ownHalf:'red'|'blue',  // 仅指定方半场
    //   terrain:'r'|'m'|...,   // 仅指定地形
    //   piece: filterObj,      // 格上棋子需满足 searchPiece 的过滤条件
    //   custom: function(cell, piece){return true}
    // }
    searchCell(range, filter) {
      filter = filter || {};
      const g = global.Game;
      if (!g) return [];

      let cells;
      if (range && (range.shape || range.n)) {
        const cx = (range.center && typeof range.center.x === 'number') ? range.center.x : 0;
        const cy = (range.center && typeof range.center.y === 'number') ? range.center.y : 0;
        cells = Range.cellsInRange(range.shape || 'square', range.n || 1, cx, cy, { includeSelf: range.includeSelf !== false });
      } else {
        cells = [];
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) cells.push({ x: x, y: y });
        }
      }

      const half = SIZE / 2;
      return cells.filter(function (c) {
        const p = g.pieceAt(c.x, c.y);
        if (filter.empty === true && p) return false;
        if (filter.occupied === true && !p) return false;
        if (filter.ownHalf) {
          const inHalf = filter.ownHalf === 'red' ? c.y >= half : c.y < half;
          if (!inHalf) return false;
        }
        if (filter.terrain) {
          const t = (g.terrain && g.terrain[c.x] && g.terrain[c.x][c.y]) || 'plain';
          if (t !== filter.terrain) return false;
        }
        if (filter.piece && p) {
          const matched = Effect.searchPiece(null, filter.piece, {});
          if (matched.indexOf(p) === -1) return false;
        }
        if (typeof filter.custom === 'function' && !filter.custom(c, p)) return false;
        return true;
      }).map(function (c) {
        const p = g.pieceAt(c.x, c.y);
        return { x: c.x, y: c.y, piece: p || null };
      });
    },

    // 获取武将/小兵的详细信息定义（用于查询特定单位的属性、技能、描述等）
    // id: 武将 id（如 'diy_xxx'）/ 小兵 id（如 'minion_sword' / 'diyminion_xxx'）
    // 返回该定义对象的深拷贝（修改不会影响游戏数据），未找到返回 null
    getJson(id) {
      if (!id) return null;
      const sid = String(id);
      // 武将：内置 + DIY 注册
      if (global.Generals && global.Generals.getList) {
        const g = global.Generals.getList().find(function (x) { return x.id === sid; });
        if (g) return JSON.parse(JSON.stringify(g));
      }
      if (global.Generals && Array.isArray(global.Generals.list)) {
        const g = global.Generals.list.find(function (x) { return x.id === sid; });
        if (g) return JSON.parse(JSON.stringify(g));
      }
      // 小兵：内置 + DIY 注册
      if (global.Minions) {
        const m = global.Minions.getById ? global.Minions.getById(sid) : null;
        if (m) return JSON.parse(JSON.stringify(m));
      }
      return null;
    },

    // ============================================================
    // 小兵系统 API：抽卡 / 部署 / 删卡 / 加部署点
    // ============================================================

    // 抽卡：为指定方抽取 count 张小兵卡到手牌
    // side: 'red'|'blue'，缺省取 Game.currentSide
    // 返回新抽取的卡牌数组（已加入手牌）
    drawCard(side, count) {
      const g = global.Game;
      if (!g || typeof g._drawMinionCards !== 'function') return [];
      side = side || g.currentSide;
      count = Math.max(0, parseInt(count) || 1);
      const before = (g.minionHand[side] || []).length;
      g._drawMinionCards(side, count);
      const after = (g.minionHand[side] || []);
      const drawn = after.slice(before);
      if (g._renderMinionPanel) g._renderMinionPanel();
      if (drawn.length && g.log) g.log((side === 'red' ? '红方' : '蓝方') + ' 抽取了 ' + drawn.length + ' 张小兵卡。', 'turn');
      return drawn;
    },

    // 删卡：从指定方手牌中移除一张卡（按 instanceId 或下标）
    // side: 'red'|'blue'，缺省取 Game.currentSide
    // target: instanceId 字符串 / 卡牌对象 / 手牌下标
    // 返回被移除的卡牌，失败返回 null
    removeCard(side, target) {
      const g = global.Game;
      if (!g) return null;
      side = side || g.currentSide;
      const hand = g.minionHand[side] || [];
      let idx = -1;
      if (typeof target === 'number') {
        idx = target;
      } else if (typeof target === 'string') {
        idx = hand.findIndex(function (c) { return c.instanceId === target; });
      } else if (target && typeof target === 'object') {
        idx = hand.findIndex(function (c) { return c.instanceId === target.instanceId; });
      }
      if (idx < 0 || idx >= hand.length) return null;
      const removed = hand.splice(idx, 1)[0];
      if (g._renderMinionPanel) g._renderMinionPanel();
      if (g.log) g.log((side === 'red' ? '红方' : '蓝方') + ' 弃置了一张小兵卡。', 'turn');
      return removed;
    },

    // 加/减部署点：为指定方调整部署点数
    // amount 为正则增加，为负则扣除（不低于 0）
    // 返回调整后的部署点数
    addDeployPoint(side, amount) {
      const g = global.Game;
      if (!g) return 0;
      side = side || g.currentSide;
      amount = parseInt(amount) || 0;
      const cur = g.minionPoints[side] || 0;
      g.minionPoints[side] = Math.max(0, cur + amount);
      if (g._renderMinionPanel) g._renderMinionPanel();
      if (g.log && amount !== 0) {
        g.log((side === 'red' ? '红方' : '蓝方') + ' 部署点 ' + (amount > 0 ? '+' : '') + amount + '（当前 ' + g.minionPoints[side] + '）。', 'turn');
      }
      return g.minionPoints[side];
    },

    // 部署小兵到指定位置
    // card: 卡牌对象（手牌中的，含 instanceId）/ 小兵模板 id 字符串 / 通过 getJson 取到的定义
    // x, y: 部署坐标
    // opts: { side:'red'|'blue'(缺省 currentSide), ignoreCost:true(不扣部署点), ignoreLimit:true(不限同类型上限), ignoreHalf:true(不限己方半场) }
    // 返回部署成功与否（true/false）
    deployMinion(card, x, y, opts) {
      const g = global.Game;
      if (!g || !card) return false;
      opts = opts || {};
      const side = opts.side || g.currentSide;

      // 解析 card：字符串 id → 从模板取；对象 → 直接用
      let cardObj = card;
      if (typeof card === 'string') {
        cardObj = global.Minions ? (global.Minions.getById ? global.Minions.getById(card) : null) : null;
        if (!cardObj) {
          if (g.log) g.log('部署失败：找不到小兵 ' + card, 'turn');
          return false;
        }
        cardObj = Object.assign({}, cardObj);
        // 模板部署：分配一个 instanceId（不入手牌，直接召唤）
        if (!cardObj.instanceId) {
          cardObj.instanceId = side + '_api_' + (global.RNG ? global.RNG.randInt(0, 999999999).toString(36) : Date.now().toString(36));
        }
      }

      const half = SIZE / 2;
      // 校验己方半场
      if (!opts.ignoreHalf) {
        const isOwnHalf = side === 'red' ? y >= half : y < half;
        if (!isOwnHalf) {
          if (g.log) g.log('只能部署在己方半场！', 'turn');
          return false;
        }
      }
      // 校验空格
      if (g.pieceAt(x, y)) {
        if (g.log) g.log('该位置已有单位！', 'turn');
        return false;
      }
      // 校验部署点
      if (!opts.ignoreCost && (g.minionPoints[side] || 0) < (cardObj.cost || 0)) {
        if (g.log) g.log('部署点数不足！', 'turn');
        return false;
      }
      // 移除同类型上限限制

      // 解析技能
      const minionSkills = (typeof g._resolveMinionSkills === 'function') ? g._resolveMinionSkills(cardObj) : [];

      // 生成 generalId（与游戏内逻辑保持一致：可播种 RNG 保证联机双端一致）
      const minionGeneralId = cardObj.id + '_' + (global.RNG ? global.RNG.randInt(0, 999999999).toString(36) : '') + '_' + (global.RNG ? global.RNG.randInt(0, 999999999).toString(36) : '');
      const minion = {
        generalId: minionGeneralId,
        name: cardObj.name,
        side: side,
        hp: cardObj.hp,
        maxHp: cardObj.maxHp || cardObj.hp,
        atk: cardObj.atk,
        def: cardObj.def,
        x: x,
        y: y,
        alive: true,
        moved: true,
        attacked: true,
        skilled: true,
        skills: minionSkills,
        cdMap: {},
        moveRange: cardObj.moveRange,
        attackRange: cardObj.attackRange,
        isMinion: true,
        minionId: cardObj.id,
        rarity: cardObj.rarity
      };

      g.pieces.push(minion);
      if (!opts.ignoreCost) g.minionPoints[side] = Math.max(0, (g.minionPoints[side] || 0) - (cardObj.cost || 0));

      // 若卡牌来自手牌，则从手牌移除
      const hand = g.minionHand[side];
      if (hand) {
        const idx = hand.findIndex(function (c) { return c.instanceId === cardObj.instanceId; });
        if (idx >= 0) hand.splice(idx, 1);
      }

      if (g.log) g.log((side === 'red' ? '红方' : '蓝方') + ' 部署了 ' + cardObj.name + '！', 'turn');
      if (g._render) g._render();
      if (g._renderMinionPanel) g._renderMinionPanel();

      // 联机同步：本地玩家部署时通知对方
      if (g.onlineMode && side === g._onlineSide && !g._onlineAction && global.Online) {
        global.Online.sendAction({ type: 'deployMinion', cardId: cardObj.id, instanceId: cardObj.instanceId, x: x, y: y });
      }
      return true;
    }
  };

  global.Effect = Effect;
})(window);
