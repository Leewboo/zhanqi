(function (global) {
  'use strict';

  const MINION_RARITY = {
    common:    { label: '普通', color: '#aaa', weight: 60 },
    rare:      { label: '稀有', color: '#4fc3f7', weight: 28 },
    epic:      { label: '史诗', color: '#ab47bc', weight: 10 },
    legendary: { label: '传说', color: '#ffd54f', weight: 2 }
  };

  const MINION_POOL = [
    // ===== 普通 =====
    {
      id: 'minion_militia',
      name: '民兵',
      rarity: 'common',
      hp: 60, atk: 12, def: 5,
      moveRange: { shape: '+', n: 2 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_militia_skill',
        name: '列阵',
        type: '被动',
        trigger: 'onAttacked',
        desc: '被攻击时，防御+3 持续1回合',
        aiHint: null,
        contentCode: 'Effect.modifyDefense(actor, 3, 1); return true;'
      }
    },
    {
      id: 'minion_scout',
      name: '斥候',
      rarity: 'common',
      hp: 45, atk: 10, def: 3,
      moveRange: { shape: '+', n: 4 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_scout_skill',
        name: '游击',
        type: '被动',
        trigger: 'onMove',
        desc: '移动后攻击+5 持续1回合',
        aiHint: null,
        contentCode: 'Effect.modifyAttack(actor, 5, 1); return true;'
      }
    },
    {
      id: 'minion_archer',
      name: '弓手',
      rarity: 'common',
      hp: 40, atk: 15, def: 2,
      moveRange: { shape: '+', n: 2 },
      attackRange: { shape: '+', n: 3 },
      skill: {
        id: 'minion_archer_skill',
        name: '远射',
        type: '被动',
        trigger: 'onAttack',
        desc: '攻击时10%概率造成双倍伤害',
        aiHint: null,
        contentCode: 'if (Effect.chance(0.1)) { Effect.damage(actor, target, Effect.getEffectiveAttack(actor), { mul: 2 }); } return true;'
      }
    },
    {
      id: 'minion_shield',
      name: '盾兵',
      rarity: 'common',
      hp: 80, atk: 8, def: 12,
      moveRange: { shape: '+', n: 1 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_shield_skill',
        name: '坚守',
        type: '被动',
        trigger: 'turnStart',
        desc: '每回合开始获得10护盾',
        aiHint: null,
        contentCode: 'Effect.shield(actor, 10); return true;'
      }
    },
    {
      id: 'minion_bandit',
      name: '山贼',
      rarity: 'common',
      hp: 55, atk: 14, def: 4,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_bandit_skill',
        name: '掠夺',
        type: '被动',
        trigger: 'onKill',
        desc: '击杀敌人后回复20生命',
        aiHint: null,
        contentCode: 'Effect.heal(actor, 20); return true;'
      }
    },

    // ===== 稀有 =====
    {
      id: 'minion_fire_mage',
      name: '火法师',
      rarity: 'rare',
      hp: 50, atk: 20, def: 5,
      moveRange: { shape: '+', n: 2 },
      attackRange: { shape: '+', n: 2 },
      skill: {
        id: 'minion_fire_mage_skill',
        name: '火球',
        type: '主动',
        cooldown: 2,
        trigger: null,
        desc: '对目标周围1格造成15点AOE伤害',
        preview: { shape: 'square', n: 3 },
        aiHint: { type: 'damage', target: 'aoe_enemy', power: 15, priority: 7, condition: 'enemy_in_range', minTargets: 1 },
        contentCode: 'const cell = await Effect.chooseCell(actor, { range: { shape: "square", n: 3 }, mustEnemy: false, hintText: "选择火球目标" }); if (!cell) return false; const cells = Range.cellsInRange("square", 1, cell.x, cell.y, { includeSelf: true }); for (const c of cells) { const t = Game.pieceAt(c.x, c.y); if (t && t.alive && t.side !== actor.side) Effect.damage(actor, t, 15, { mul: 1 }); } actor.skilled = true; return true;'
      }
    },
    {
      id: 'minion_healer',
      name: '医者',
      rarity: 'rare',
      hp: 45, atk: 6, def: 5,
      moveRange: { shape: '+', n: 2 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_healer_skill',
        name: '治疗术',
        type: '主动',
        cooldown: 2,
        trigger: null,
        desc: '治疗己方一个单位40生命',
        preview: { shape: 'square', n: 3 },
        aiHint: { type: 'heal', target: 'ally', power: 40, priority: 8, condition: 'ally_injured', hpThreshold: 70 },
        contentCode: 'const cell = await Effect.chooseAlly(actor, { range: { shape: "square", n: 3 }, hintText: "选择治疗目标" }); if (!cell) return false; const t = Game.pieceAt(cell.x, cell.y); if (t && t.alive && t.side === actor.side) Effect.heal(t, 40); actor.skilled = true; return true;'
      }
    },
    {
      id: 'minion_cavalry',
      name: '骑兵',
      rarity: 'rare',
      hp: 70, atk: 18, def: 6,
      moveRange: { shape: '+', n: 4 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_cavalry_skill',
        name: '冲锋',
        type: '被动',
        trigger: 'onAttack',
        desc: '攻击时，每移动过1格额外+5伤害',
        aiHint: null,
        contentCode: 'const movedDist = Math.abs(actor.x - actor._lastTurnX || actor.x) + Math.abs(actor.y - actor._lastTurnY || actor.y); if (movedDist > 0) Effect.damage(actor, target, movedDist * 5, { ignoreDef: true, mul: 1 }); return true;'
      }
    },
    {
      id: 'minion_ice_mage',
      name: '冰法师',
      rarity: 'rare',
      hp: 50, atk: 16, def: 5,
      moveRange: { shape: '+', n: 2 },
      attackRange: { shape: '+', n: 2 },
      skill: {
        id: 'minion_ice_mage_skill',
        name: '冰冻',
        type: '主动',
        cooldown: 3,
        trigger: null,
        desc: '冻结一个敌方单位1回合',
        preview: { shape: 'square', n: 3 },
        aiHint: { type: 'control', target: 'enemy', power: 30, priority: 9, condition: 'enemy_in_range' },
        contentCode: 'const cell = await Effect.chooseEnemy(actor, { range: { shape: "square", n: 3 }, hintText: "选择冰冻目标" }); if (!cell) return false; const t = Game.pieceAt(cell.x, cell.y); if (t && t.alive && t.side !== actor.side) Effect.freeze(t, 1); actor.skilled = true; return true;'
      }
    },

    // ===== 史诗 =====
    {
      id: 'minion_general',
      name: '偏将',
      rarity: 'epic',
      hp: 100, atk: 22, def: 10,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_general_skill',
        name: '号令',
        type: '主动',
        cooldown: 3,
        trigger: null,
        desc: '周围2格友军攻击+10 持续1回合',
        preview: { shape: 'square', n: 3 },
        aiHint: { type: 'buff', target: 'aoe_ally', power: 10, priority: 8, condition: 'enemy_near', types: ['buff_atk'] },
        contentCode: 'const cells = Range.cellsInRange("square", 2, actor.x, actor.y, { includeSelf: false }); for (const c of cells) { const t = Game.pieceAt(c.x, c.y); if (t && t.alive && t.side === actor.side) Effect.modifyAttack(t, 10, 1); } actor.skilled = true; return true;'
      }
    },
    {
      id: 'minion_ninja',
      name: '忍者',
      rarity: 'epic',
      hp: 55, atk: 25, def: 3,
      moveRange: { shape: '+', n: 5 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_ninja_skill',
        name: '影遁',
        type: '被动',
        trigger: 'turnStart',
        desc: '每回合开始获得40%闪避 持续1回合',
        aiHint: null,
        contentCode: 'Effect.mark(actor, "dodge", { display: "闪", modifiers: { dodgeChance: 0.4 }, data: { turns: 1 } }); return true;'
      }
    },

    // ===== 传说 =====
    {
      id: 'minion_warlord',
      name: '军阀',
      rarity: 'legendary',
      hp: 120, atk: 28, def: 12,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 1 },
      skill: {
        id: 'minion_warlord_skill',
        name: '横扫',
        type: '主动',
        cooldown: 2,
        trigger: null,
        desc: '对周围1格所有敌人造成20点伤害',
        preview: { shape: 'square', n: 2 },
        aiHint: { type: 'damage', target: 'aoe_enemy', power: 20, priority: 10, condition: 'enemy_in_range', minTargets: 1 },
        contentCode: 'const cells = Range.cellsInRange("square", 1, actor.x, actor.y, { includeSelf: false }); for (const c of cells) { const t = Game.pieceAt(c.x, c.y); if (t && t.alive && t.side !== actor.side) Effect.damage(actor, t, 20, { mul: 1 }); } actor.skilled = true; return true;'
      }
    },
    {
      id: 'minion_phantom',
      name: '幻术师',
      rarity: 'legendary',
      hp: 60, atk: 18, def: 5,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 2 },
      skill: {
        id: 'minion_phantom_skill',
        name: '幻象',
        type: '主动',
        cooldown: 3,
        trigger: null,
        desc: '在指定位置召唤1个幻影（30血/10攻/3防，1回合后消失）',
        aiHint: { type: 'summon', power: 30, priority: 7 },
        contentCode: 'const cell = await Effect.chooseCell(actor, { range: { shape: "square", n: 2 }, mustEmpty: true, hintText: "选择召唤位置" }); if (!cell) return false; Effect.summonUnit(actor, cell.x, cell.y, { templateId: null, hp: 30, atk: 10, def: 3, moveRange: { shape: "+", n: 2 }, attackRange: { shape: "+", n: 1 }, name: "幻影", portrait: null, tmpTurns: 1 }); actor.skilled = true; return true;'
      }
    }
  ];

  function getPool() { return MINION_POOL; }

  function getRarityInfo(rarity) { return MINION_RARITY[rarity] || MINION_RARITY.common; }

  function rollMinion(turnNum, rng) {
    // 按权重随机抽取稀有度
    const entries = Object.entries(MINION_RARITY);
    let totalWeight = 0;
    for (const [, info] of entries) totalWeight += info.weight;

    let roll;
    if (rng && typeof rng.next === 'function') {
      roll = rng.next() * totalWeight;
    } else {
      roll = Math.random() * totalWeight;
    }

    let picked = 'common';
    let cumul = 0;
    for (const [key, info] of entries) {
      cumul += info.weight;
      if (roll < cumul) { picked = key; break; }
    }

    // 从该稀有度的池子里随机选一个
    const pool = MINION_POOL.filter(m => m.rarity === picked);
    if (!pool.length) return MINION_POOL[0];

    const idx = rng ? Math.floor(rng.next() * pool.length) : Math.floor(Math.random() * pool.length);
    const def = pool[idx % pool.length];

    // 根据回合数缩放数值
    const scale = 1 + (turnNum - 1) * 0.08;
    return Object.assign({}, def, {
      hp: Math.round(def.hp * scale),
      atk: Math.round(def.atk * scale),
      def: Math.round(def.def * scale),
      _baseScale: scale,
      _originalDef: def
    });
  }

  function buildMinionPiece(minionDef, side, x, y) {
    // 复用 Generals.buildPiece 的逻辑，但用小兵定义
    const pieceDef = {
      id: minionDef.id + '_' + side + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: minionDef.name,
      hp: minionDef.hp,
      atk: minionDef.atk,
      def: minionDef.def,
      moveRange: minionDef.moveRange,
      attackRange: minionDef.attackRange,
      skills: minionDef.skill ? [minionDef.skill] : [],
      isMinion: true,
      rarity: minionDef.rarity,
      _baseScale: minionDef._baseScale || 1
    };
    const piece = Generals.buildPiece(pieceDef, side, x, y);
    piece.isMinion = true;
    piece.rarity = minionDef.rarity || 'common';
    piece._baseScale = minionDef._baseScale || 1;
    piece.generalId = minionDef.id;
    return piece;
  }

  global.Minions = {
    pool: MINION_POOL,
    RARITY: MINION_RARITY,
    getPool: getPool,
    getRarityInfo: getRarityInfo,
    rollMinion: rollMinion,
    buildMinionPiece: buildMinionPiece
  };
})(window);
