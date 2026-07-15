(function (global) {
  // 内置小兵模板（基础池）：已清空，所有小兵均通过 DIY 拓展系统管理
  const builtinList = [];

  // 动态列表：内置 + DIY 注册的小兵
  const dynamicList = builtinList.slice();

  const Minions = {
    // 兼容旧引用：list 为动态数组的只读视图（通过 getList 获取）
    get list() { return dynamicList; },

    getById(id) {
      if (!id) return null;
      const found = dynamicList.find(m => m.id === id);
      if (found) return found;
      // 兼容 DIY 小兵：服务端存储时会加前缀 diyminion_，但技能代码引用的是原始 id
      if (!id.startsWith('diyminion_')) {
        return dynamicList.find(m => m.id === 'diyminion_' + id);
      }
      return null;
    },

    getList() {
      return dynamicList;
    },

    // 注册 DIY 小兵（同 id 覆盖）
    registerMinion(def) {
      if (!def || !def.id) return null;
      const idx = dynamicList.findIndex(m => m.id === def.id);
      if (idx >= 0) dynamicList.splice(idx, 1, def);
      else dynamicList.push(def);
      return def;
    },

    registerMinions(list) {
      if (!list || !list.length) return [];
      return list.map(d => this.registerMinion(d));
    },

    generateDraftPool() {
      const pool = [];
      const weights = { common: 6, rare: 3, epic: 1 };

      for (const minion of dynamicList) {
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