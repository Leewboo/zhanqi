(function (global) {
  const Minions = {
    list: [
      {
        id: 'minion_sword',
        name: '刀兵',
        hp: 80,
        maxHp: 80,
        atk: 25,
        def: 10,
        moveRange: { shape: '+', n: 2 },
        attackRange: { shape: '+', n: 1 },
        skills: [],
        rarity: 'common',
        cost: 1,
        description: '基础近战单位'
      },
      {
        id: 'minion_archer',
        name: '弓兵',
        hp: 60,
        maxHp: 60,
        atk: 35,
        def: 5,
        moveRange: { shape: '+', n: 1 },
        attackRange: { shape: '+', n: 3 },
        skills: [],
        rarity: 'common',
        cost: 1,
        description: '远程攻击单位'
      },
      {
        id: 'minion_shield',
        name: '盾兵',
        hp: 120,
        maxHp: 120,
        atk: 15,
        def: 25,
        moveRange: { shape: '+', n: 1 },
        attackRange: { shape: '+', n: 1 },
        skills: [],
        rarity: 'rare',
        cost: 2,
        description: '高防御单位'
      },
      {
        id: 'minion_mage',
        name: '术士',
        hp: 50,
        maxHp: 50,
        atk: 50,
        def: 3,
        moveRange: { shape: '+', n: 1 },
        attackRange: { shape: 'r', n: 2 },
        skills: [],
        rarity: 'epic',
        cost: 3,
        description: '范围伤害单位'
      },
      {
        id: 'minion_healer',
        name: '医者',
        hp: 70,
        maxHp: 70,
        atk: 10,
        def: 8,
        moveRange: { shape: '+', n: 2 },
        attackRange: { shape: '+', n: 2 },
        skills: [],
        rarity: 'rare',
        cost: 2,
        description: '治疗单位'
      },
      {
        id: 'minion_cavalry',
        name: '骑兵',
        hp: 90,
        maxHp: 90,
        atk: 30,
        def: 12,
        moveRange: { shape: '+', n: 3 },
        attackRange: { shape: '+', n: 1 },
        skills: [],
        rarity: 'rare',
        cost: 2,
        description: '高机动性单位'
      },
      {
        id: 'minion_assassin',
        name: '刺客',
        hp: 55,
        maxHp: 55,
        atk: 45,
        def: 4,
        moveRange: { shape: '+', n: 2 },
        attackRange: { shape: '+', n: 1 },
        skills: [],
        rarity: 'epic',
        cost: 3,
        description: '高爆发单位'
      }
    ],

    getById(id) {
      return this.list.find(m => m.id === id);
    },

    generateDraftPool() {
      const pool = [];
      const weights = { common: 6, rare: 3, epic: 1 };

      for (const minion of this.list) {
        const count = weights[minion.rarity] || 1;
        for (let i = 0; i < count; i++) {
          pool.push(Object.assign({}, minion));
        }
      }

      for (let i = pool.length - 1; i > 0; i--) {
        const j = global.RNG ? global.RNG.randInt(0, i) : Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      return pool;
    }
  };

  global.Minions = Minions;
})(window);