(function (global) {
  const base = {
    hp: 200, atk: 50, def: 20,
    moveRange: 4,
    attackRange: { shape: '+', n: 1 },
    skill: null,
    supplyPerTurn: 1
  };

  const generals = [
    { id: 'lb',  name: '刘备', hp: 220, atk: 45, def: 25, moveRange: 4, attackRange: { shape: '+', n: 1 }, skill: Skills.heal,    color: 'red' },
    { id: 'gy',  name: '关羽', hp: 260, atk: 75, def: 25, moveRange: 4, attackRange: { shape: '+', n: 1 }, skill: Skills.feint,   color: 'red' },
    { id: 'zf',  name: '张飞', hp: 280, atk: 80, def: 20, moveRange: 3, attackRange: { shape: '+', n: 1 }, skill: Skills.rage,    color: 'red' },
    { id: 'zy',  name: '赵云', hp: 240, atk: 70, def: 30, moveRange: 5, attackRange: { shape: '+', n: 1 }, skill: Skills.charge,  color: 'red' },
    { id: 'zm',  name: '诸葛亮', hp: 180, atk: 55, def: 20, moveRange: 3, attackRange: { shape: 'r', n: 3 }, skill: Skills.stratagem, color: 'red' },
    { id: 'hz',  name: '黄忠', hp: 200, atk: 70, def: 20, moveRange: 3, attackRange: { shape: '+', n: 3 }, skill: Skills.volly,   color: 'red' },

    { id: 'cc',  name: '曹操', hp: 240, atk: 60, def: 30, moveRange: 4, attackRange: { shape: '+', n: 1 }, skill: Skills.fortify, color: 'blue' },
    { id: 'xc',  name: '夏侯惇', hp: 270, atk: 75, def: 28, moveRange: 4, attackRange: { shape: '+', n: 1 }, skill: Skills.rage,  color: 'blue' },
    { id: 'dy',  name: '典韦', hp: 260, atk: 80, def: 25, moveRange: 3, attackRange: { shape: '+', n: 1 }, skill: Skills.charge,  color: 'blue' },
    { id: 'xc2', name: '许褚', hp: 280, atk: 78, def: 22, moveRange: 3, attackRange: { shape: '+', n: 1 }, skill: Skills.feint,   color: 'blue' },
    { id: 'sm',  name: '司马懿', hp: 190, atk: 55, def: 22, moveRange: 3, attackRange: { shape: 'r', n: 3 }, skill: Skills.stratagem, color: 'blue' },
    { id: 'zlj', name: '张辽', hp: 250, atk: 72, def: 28, moveRange: 4, attackRange: { shape: '+', n: 1 }, skill: Skills.volly,   color: 'blue' }
  ];

  function buildPiece(def, side, x, y) {
    const piece = Object.assign({}, base, def, {
      side,
      x, y,
      maxHp: def.hp,
      alive: true,
      acted: false,
      supply: 0,
      cd: 0,
      atkBuff: 0,
      defBuff: 0,
      buffs: []
    });
    return piece;
  }

  global.Generals = { list: generals, buildPiece };
})(window);
