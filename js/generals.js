(function (global) {
  const base = {
    hp: 200, atk: 50, def: 20,
    moveRange: { shape: '+', n: 4 },
    attackRange: { shape: '+', n: 1 },
    skill: null
  };

  const generals = [
    { id: 't1', name: '甲', hp: 200, atk: 50, def: 20, moveRange: { shape: '+', n: 4 }, attackRange: { shape: '+', n: 1 }, skill: null },
    { id: 't2', name: '乙', hp: 240, atk: 60, def: 25, moveRange: { shape: '+', n: 3 }, attackRange: { shape: '+', n: 2 }, skill: null },
    { id: 't3', name: '丙', hp: 180, atk: 70, def: 15, moveRange: { shape: 'r', n: 3 }, attackRange: { shape: 'r', n: 3 }, skill: null },
    { id: 't4', name: '丁', hp: 300, atk: 40, def: 35, moveRange: { shape: 'square', n: 2 }, attackRange: { shape: '+', n: 1 }, skill: null }
  ];

  function buildPiece(def, side, x, y) {
    const piece = Object.assign({}, base, def, {
      side,
      x, y,
      maxHp: def.hp,
      alive: true,
      moved: false,
      attacked: false,
      cd: 0,
      atkBuff: 0,
      defBuff: 0,
      buffs: [],
      generalId: def.id
    });
    return piece;
  }

  global.Generals = { list: generals, buildPiece };
})(window);
