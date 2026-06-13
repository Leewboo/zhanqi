(function (global) {
  const base = {
    hp: 200, atk: 50, def: 20,
    moveRange: { shape: '+', n: 4 },
    attackRange: { shape: '+', n: 1 },
    skills: []
  };

  const generals = [
    {
      id: 'gy',
      name: '关羽',
      hp: 200, atk: 90, def: 20,
      moveRange: { shape: '+', n: 2 },
      attackRange: { shape: 'square', n: 1 },
      skills: [Skills.weiZhen, Skills.shuiYan]
    },
    {
      id: 'zy',
      name: '赵云',
      hp: 150, atk: 60, def: 20,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 1 },
      skills: [Skills.changSheng, Skills.danYong]
    },
    {
      id: 't1',
      name: '甲',
      hp: 200, atk: 50, def: 20,
      moveRange: { shape: '+', n: 4 },
      attackRange: { shape: '+', n: 1 },
      skills: []
    },
    {
      id: 't2',
      name: '乙',
      hp: 240, atk: 60, def: 25,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 2 },
      skills: [Skills.rage]
    },
    {
      id: 't3',
      name: '丙',
      hp: 180, atk: 70, def: 15,
      moveRange: { shape: 'r', n: 3 },
      attackRange: { shape: 'r', n: 3 },
      skills: [Skills.volley]
    },
    {
      id: 't4',
      name: '丁',
      hp: 300, atk: 40, def: 35,
      moveRange: { shape: 'square', n: 2 },
      attackRange: { shape: '+', n: 1 },
      skills: [Skills.fortify]
    },
    {
      id: 't5',
      name: '戊',
      hp: 220, atk: 55, def: 22,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 1 },
      skills: [Skills.feint]
    },
    {
      id: 't6',
      name: '己',
      hp: 200, atk: 45, def: 30,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: '+', n: 1 },
      skills: [Skills.heal]
    },
    {
      id: 't7',
      name: '庚',
      hp: 190, atk: 65, def: 18,
      moveRange: { shape: '+', n: 4 },
      attackRange: { shape: '+', n: 1 },
      skills: [Skills.stratagem]
    },
    {
      id: 't8',
      name: '辛',
      hp: 210, atk: 60, def: 20,
      moveRange: { shape: '+', n: 3 },
      attackRange: { shape: 'square', n: 2 },
      skills: [Skills.charge]
    }
  ];

  function buildPiece(def, side, x, y) {
    const piece = Object.assign({}, base, def, {
      side,
      x, y,
      maxHp: def.hp,
      alive: true,
      moved: false,
      attacked: false,
      skilled: false,
      cd: 0,
      cdMap: {},
      atkBuff: 0,
      defBuff: 0,
      buffs: [],
      skills: (def.skills && def.skills.length) ? def.skills.slice() : (def.skill ? [def.skill] : []),
      generalId: def.id
    });
    return piece;
  }

  global.Generals = { list: generals, buildPiece };
})(window);
