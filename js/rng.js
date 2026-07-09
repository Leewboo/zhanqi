// ============================================================
// 可播种随机数生成器（用于联机对战双端结果同步）
// 本机/人机对战使用随机种子；联机对战使用服务器下发的统一种子，
// 保证双方在回放同一套操作序列时，命中/闪避/暴击等随机结果完全一致。
// ============================================================
(function (global) {
  // mulberry32：简单快速、可复现的 32 位种子随机数算法
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let rand = Math.random;

  const RNG = {
    // 使用指定种子重置随机序列（联机对战开局时，双方使用同一种子）
    seed(n) {
      const s = (typeof n === 'number' && isFinite(n)) ? n : Date.now();
      rand = mulberry32(s);
      this._seedValue = s >>> 0;
      return this._seedValue;
    },
    // 生成一个不依赖种子同步的随机种子（本机/人机对战用）
    randomSeed() {
      return Math.floor(Math.random() * 4294967296);
    },
    random() {
      return rand();
    },
    randInt(min, max) {
      if (max === undefined) { max = min; min = 0; }
      return Math.floor(rand() * (max - min + 1)) + min;
    },
    chance(p) {
      return rand() < p;
    },
    pick(arr) {
      if (!arr || !arr.length) return undefined;
      return arr[Math.floor(rand() * arr.length)];
    }
  };

  RNG.seed(RNG.randomSeed());
  global.RNG = RNG;
})(window);
