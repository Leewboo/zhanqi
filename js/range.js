(function (global) {
  const BOARD_SIZE = 12;

  function inBounds(x, y) {
    return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
  }

  function key(x, y) { return x + ',' + y; }

  function manhattan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function chebyshev(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  function king(ax, ay, bx, by) { return chebyshev(ax, ay, bx, by); }

  // ============================================================
  // 阻断模式（Block Mode）
  // ============================================================
  // 'none'  — 不阻断：格子不阻挡拓展，路径正常穿过，格本身可达
  // 'half'  — 半阻断：拓展到此格结束，包含此格（此格可达，但不可继续穿过）
  // 'full'  — 全阻断：拓展到此格结束，不包含此格（此格不可达，也不可穿过）
  //
  // 条件阻断：通过 blockFilter 回调按条件返回不同阻断模式
  //   blockFilter: (x, y, piece, terrain, ctx) => 'none' | 'half' | 'full' | false
  //     返回 'none'/'half'/'full' → 使用该模式（覆盖默认）
  //     返回 false/undefined/null → 回退到默认判定
  //
  // 默认规则（不写 blockFilter 时）：
  //   山地(mt)   → 'full' 全阻断（不可达，也不可穿过）
  //   河流(r)    → 'half' 半阻断（可达，但不可继续穿过）
  //   敌方棋子    → 'full' 全阻断
  //   友方棋子    → 'full' 全阻断（棋子占位，不能走上去；旧版友方half已取消）
  // ============================================================

  // 获取地形代码（plain/m/f/r/w/mt）或 null
  function _terrainAt(x, y) {
    const g = typeof global !== 'undefined' ? global.Game : (typeof window !== 'undefined' ? window.Game : null);
    return (g && g.terrain && g.terrain[y]) ? g.terrain[y][x] : null;
  }

  // 默认地形阻断判定：山地(mt)和河流(r)都视为阻断地形（用于 cellsInRangeWithBlock）
  function defaultTerrainFn(x, y) {
    const t = _terrainAt(x, y);
    return t === 'mt' || t === 'r';
  }

  // 按阵营判断 piece 所属方：返回 'enemy' / 'ally' / null
  // pieceAtSide：调用方（actor 或当前方）的 side，没传则从 Game.currentSide 猜
  function _pieceSide(piece, pieceAtSide) {
    if (!piece || !piece.side) return null;
    const mySide = pieceAtSide || _currentSide();
    if (!mySide) return null;
    return piece.side === mySide ? 'ally' : 'enemy';
  }

  function _currentSide() {
    const g = typeof global !== 'undefined' ? global.Game : (typeof window !== 'undefined' ? window.Game : null);
    return g && g.currentSide ? g.currentSide : null;
  }

  // 计算单个格子的默认阻断模式（不考虑 blockFilter 覆盖）
  // terrain: 地形代码字符串（如 'mt'/'r'/'plain'...），true 则视为通用阻断
  // pieceAtSide: 可选，actor/发起方的 side，没有则从 Game.currentSide 推断
  function defaultBlockFor(x, y, piece, terrain, pieceAtSide) {
    // 地形优先：mt 全阻断，r 半阻断
    const tCode = (typeof terrain === 'string') ? terrain
      : (terrain === true ? (_terrainAt(x, y) || 'block') : null);
    if (tCode === 'mt') return 'full';
    if (tCode === 'r')  return 'half';

    // 棋子：敌方和友方都是全阻断（占位，不能走上去也不能穿过去）
    if (piece) return 'full';
    return 'none';
  }

  // 计算单个格子的阻断模式
  // 返回: 'none' | 'half' | 'full'
  function resolveBlockMode(x, y, pieceAt, terrainFn, defaultMode, blockFilter, pieceAtSide) {
    const piece = pieceAt ? pieceAt(x, y) : null;
    // terrainFn 以前返回 bool，现在也可以是地形代码字符串；统一规范化
    let terrain = terrainFn ? terrainFn(x, y) : null;
    let terrainCode = (typeof terrain === 'string') ? terrain : null;
    if (!terrainCode && terrain === true) {
      terrainCode = _terrainAt(x, y) || 'block';
    }

    // 条件阻断优先：blockFilter 的返回值覆盖默认
    if (typeof blockFilter === 'function') {
      const r = blockFilter(x, y, piece, terrainCode || terrain);
      if (r === 'full' || r === 'half' || r === 'none') return r;
      if (r === false) return 'none';
      // undefined/null → 回退到默认
    }

    // 新默认规则
    const dm = defaultBlockFor(x, y, piece, terrainCode, pieceAtSide);
    if (dm) return dm;

    // 兼容旧逻辑：无法判定阵营时，用传入的 defaultMode
    if (piece || (terrain && terrain !== false)) return defaultMode || 'half';
    return 'none';
  }

  function cellsInRange(shape, n, originX, originY, options) {
    options = options || {};
    const includeSelf = options.includeSelf !== false;
    const list = [];
    const seen = new Set();
    const start = -n;
    const end = n;
    for (let dx = start; dx <= end; dx++) {
      for (let dy = start; dy <= end; dy++) {
        const x = originX + dx;
        const y = originY + dy;
        if (!inBounds(x, y)) continue;
        if (dx === 0 && dy === 0 && !includeSelf) continue;
        let ok = false;
        switch (shape) {
          case 'x':
            if (Math.abs(dx) === Math.abs(dy) && (dx !== 0 || dy !== 0)) {
              if (Math.abs(dx) <= n) ok = true;
            }
            if (includeSelf && dx === 0 && dy === 0) ok = true;
            break;
          case '+':
            if ((dx === 0 || dy === 0) && (Math.abs(dx) + Math.abs(dy) <= n)) ok = true;
            break;
          case 'r':
            if (Math.sqrt(dx * dx + dy * dy) <= n) ok = true;
            break;
          case 'square':
            if (Math.max(Math.abs(dx), Math.abs(dy)) <= n) ok = true;
            break;
        }
        if (ok) {
          const k = key(x, y);
          if (!seen.has(k)) {
            seen.add(k);
            list.push({ x, y });
          }
        }
      }
    }
    return list;
  }

  // ============================================================
  // 可达格子计算（BFS，用于移动范围）
  // ============================================================
  // shape: '+' 十字（4向BFS）| 'square'/'r'/'x' 方形/圆形/斜角（8向BFS）
  // 默认规则（不写 blockFilter 时）：
  //   山地(mt)    → full 全阻断（进不去）
  //   河流(r)     → half 半阻断（能站上去，但不能从河里继续走出去/过河后就停在河上）
  //   棋子（敌+友）→ full 全阻断（不能站上去，不能穿过去）
  //
  // options（第6个参数，可选）:
  //   blockFilter:      (x, y, piece, terrain) => 'none'|'half'|'full'|false — 条件阻断（覆盖默认）
  //   pieceBlockMode:   棋子兜底模式（兼容旧代码，推荐用 blockFilter 代替）
  //   terrainBlockMode: 地形兜底模式（兼容旧代码，推荐用 blockFilter 代替）
  // ============================================================
  function reachableCells(originX, originY, maxSteps, game, shape, options) {
    shape = shape || '+';
    options = options || {};
    // 全局临时覆盖
    const OV = global.Range && global.Range.blockOverride;
    if (OV) {
      if (OV.blockFilter     !== undefined) options.blockFilter     = OV.blockFilter;
      if (OV.pieceBlockMode  !== undefined) options.pieceBlockMode  = OV.pieceBlockMode;
      if (OV.terrainBlockMode!== undefined) options.terrainBlockMode= OV.terrainBlockMode;
    }
    // 方形/圆形/斜角需要 8 方向才能走对角
    const dirs = (shape === 'square' || shape === 'r' || shape === 'x')
      ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
      : [[1,0],[-1,0],[0,1],[0,-1]];

    const blockFilter = options.blockFilter;

    // 判定格子是否被棋子占据
    const pieceAt = (x, y) => (game && game.pieceAt ? game.pieceAt(x, y) : null);
    // 返回地形代码字符串（plain/m/f/r/w/mt）
    const terrainCodeFn = (x, y) => {
      if (game && game.terrain && game.terrain[y]) return game.terrain[y][x];
      return 'plain';
    };

    // 计算格子的阻断模式（用新的统一默认规则）
    function getMode(x, y) {
      const piece = pieceAt(x, y);
      const tCode = terrainCodeFn(x, y);

      if (typeof blockFilter === 'function') {
        const r = blockFilter(x, y, piece, tCode);
        if (r === 'full' || r === 'half' || r === 'none') return r;
        if (r === false) return 'none';
      }

      const dm = defaultBlockFor(x, y, piece, tCode);
      if (dm) return dm;

      // 兼容兜底
      if (piece) return options.pieceBlockMode || 'full';
      if (tCode === 'mt' || tCode === 'r') return options.terrainBlockMode || 'half';
      return 'none';
    }

    const result = [];
    const visited = new Map();
    const queue = [{ x: originX, y: originY, steps: 0 }];
    visited.set(key(originX, originY), 0);
    while (queue.length) {
      const cur = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!inBounds(nx, ny)) continue;
        const cost = game ? game.cellMoveCost(nx, ny) : 1;
        const ns = cur.steps + cost;
        if (ns > maxSteps) continue;

        const mode = getMode(nx, ny);
        // 全阻断：不可到达，不可穿过
        if (mode === 'full') continue;

        const k = key(nx, ny);
        if (visited.has(k) && visited.get(k) <= ns) continue;
        visited.set(k, ns);

        // 不阻断 / 半阻断：格子可达，加入结果
        result.push({ x: nx, y: ny, steps: ns });

        // 半阻断：可达但不可继续穿过；不阻断：继续拓展
        if (mode === 'half') continue;
        // mode === 'none' → 继续拓展
        queue.push({ x: nx, y: ny, steps: ns });
      }
    }

    // 用几何形状过滤：确保只返回落在 shape 内的格子
    const shapeSet = new Set(
      cellsInRange(shape, maxSteps, originX, originY, { includeSelf: false })
        .map(c => key(c.x, c.y))
    );
    return result.filter(c => shapeSet.has(key(c.x, c.y)));
  }

  // ============================================================
  // 直线视线检测（用于攻击/技能范围）
  // ============================================================
  // 检查从 (ax,ay) 到 (bx,by) 的直线是否被阻断
  // 返回: true = 被阻断（目标不可达）| false = 未阻断（目标可达）
  //
  // 阻断逻辑：
  //   中间格（非目标）: 'half' 或 'full' → 阻断视线，目标不可达
  //   目标格本身:       'half' → 可达 | 'full' → 不可达 | 'none' → 可达
  // ============================================================
  function lineBlockedEx(ax, ay, bx, by, pieceAt, terrainFn, defaultMode, blockFilter) {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return false;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    const sx = dx === 0 ? 0 : dx / Math.abs(dx);
    const sy = dy === 0 ? 0 : dy / Math.abs(dy);
    for (let i = 1; i <= steps; i++) {
      const cx = ax + Math.round(sx * i);
      const cy = ay + Math.round(sy * i);
      if (!inBounds(cx, cy)) return true;  // 出界 = 全阻断
      const isTarget = (i === steps);
      const mode = resolveBlockMode(cx, cy, pieceAt, terrainFn, defaultMode, blockFilter);
      if (mode === 'none') continue;  // 不阻断：继续
      // 'half' 或 'full' → 拓展到此格结束
      if (isTarget) {
        // 目标格本身：半阻断可达，全阻断不可达
        return mode === 'full';
      }
      // 中间格阻断 → 目标（在更远处）不可达
      return true;
    }
    return false;
  }

  // 用自定义 resolve 函数做直线视线检测（cellsInRangeWithBlock 内部使用）
  // resolveFn(x, y) => 'none'|'half'|'full'
  function _lineBlockedWithResolve(ax, ay, bx, by, resolveFn) {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return false;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    const sx = dx === 0 ? 0 : dx / Math.abs(dx);
    const sy = dy === 0 ? 0 : dy / Math.abs(dy);
    for (let i = 1; i <= steps; i++) {
      const cx = ax + Math.round(sx * i);
      const cy = ay + Math.round(sy * i);
      if (!inBounds(cx, cy)) return true;
      const isTarget = (i === steps);
      const mode = resolveFn(cx, cy);
      if (mode === 'none') continue;
      if (isTarget) return mode === 'full';
      return true;
    }
    return false;
  }

  const Range = {
    BOARD_SIZE,
    inBounds,
    key,
    manhattan,
    chebyshev,
    king,
    cellsInRange,
    reachableCells,

    // 旧版 lineBlocked（兼容保留）：中间格有棋子或阻断地形则返回 true
    // 新代码请使用 cellsInRangeWithBlock + blockMode/blockFilter
    lineBlocked(ax, ay, bx, by, pieceAt, terrainFn) {
      const dx = bx - ax;
      const dy = by - ay;
      if (dx === 0 && dy === 0) return false;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      const sx = dx === 0 ? 0 : dx / Math.abs(dx);
      const sy = dy === 0 ? 0 : dy / Math.abs(dy);
      for (let i = 1; i < steps; i++) {
        const cx = ax + Math.round(sx * i);
        const cy = ay + Math.round(sy * i);
        if (!inBounds(cx, cy)) return true;
        if (pieceAt && pieceAt(cx, cy)) return true;
        if (terrainFn && terrainFn(cx, cy)) return true;
      }
      return false;
    },

    // ============================================================
    // 带阻断的范围查询（用于攻击/技能范围）
    // ============================================================
    // 默认规则（不写 blockFilter 时）：
    //   山地(mt)   → full 全阻断（打不到山头上，也打不到山后面）
    //   河流(r)    → half 半阻断（打得到河上单位，但打不到河对岸远处的）
    //   敌方棋子    → full 全阻断（挡视线）
    //   友方棋子    → half 半阻断（挡视线但能打到友军本人，不挡视线则用 passThrough:true）
    //
    // options:
    //   pieceAt:      (x, y) => piece | null — 棋子查询
    //   terrainFn:    (x, y) => string|bool — 地形代码（默认读 Game.terrain）
    //   blockMode:    'full'|'half'|'none' — 兼容兜底：仅在默认规则无法判定时用
    //   blockFilter:  (x, y, piece, terrain) => 'full'|'half'|'none'|false — 条件阻断（覆盖默认）
    //   passThrough:  true — 完全不阻断（穿透所有），等价 blockMode 'none'
    //   actorSide:    'red'|'blue' — 指定发起方阵营（推断友/敌需要，不传自动从 origin 棋子猜）
    //   includeSelf:  boolean — 是否包含原点格（默认 false）
    // ============================================================
    cellsInRangeWithBlock(shape, n, originX, originY, options) {
      options = options || {};
      // 全局临时覆盖
      const OV = global.Range && global.Range.blockOverride;
      if (OV) {
        if (OV.blockMode    !== undefined) options.blockMode     = OV.blockMode;
        if (OV.passThrough  !== undefined) options.passThrough   = OV.passThrough;
        if (OV.blockFilter  !== undefined) options.blockFilter   = OV.blockFilter;
        if (OV.terrainFn    !== undefined) options.terrainFn     = OV.terrainFn;
        if (OV.actorSide    !== undefined) options.actorSide     = OV.actorSide;
      }
      const raw = cellsInRange(shape, n, originX, originY, { includeSelf: false });
      const pieceAt = options.pieceAt;

      // 地形代码函数（返回 'mt'/'r'/'plain'/... 字符串，老函数返回 bool 时也兼容）
      const userTerrainFn = options.terrainFn;
      const terrainFn = userTerrainFn ? function (x, y) {
        const v = userTerrainFn(x, y);
        if (typeof v === 'string') return v;
        if (v === true) return _terrainAt(x, y) || 'block';
        return null;
      } : function (x, y) { return _terrainAt(x, y) || 'plain'; };

      // passThrough=true → 全穿透（跳过默认规则，统一 none）
      let actualDefaultMode = options.passThrough ? 'none' : (options.blockMode || 'half');

      // 推断发起方阵营（actorSide > origin 棋子 > Game.currentSide）
      let actorSide = options.actorSide;
      if (!actorSide && pieceAt) {
        const op = pieceAt(originX, originY);
        if (op && op.side) actorSide = op.side;
      }
      if (!actorSide) actorSide = _currentSide();

      const blockFilter = options.blockFilter;
      // 如果没有 blockFilter，包装一层默认规则（用 resolveBlockMode 内部的统一默认）
      const mergedFilter = (blockFilter && typeof blockFilter === 'function') ? blockFilter : null;

      // lineBlockedEx 调用 resolveBlockMode，它已经走新默认规则，
      // 但我们要把 actorSide 传进去 → 通过闭包重写一次 resolve
      function resolveEx(x, y) {
        const piece = pieceAt ? pieceAt(x, y) : null;
        let tVal = terrainFn(x, y);
        let tCode = (typeof tVal === 'string') ? tVal : null;
        if (!tCode && tVal === true) tCode = _terrainAt(x, y) || 'block';

        if (typeof mergedFilter === 'function') {
          const r = mergedFilter(x, y, piece, tCode || tVal);
          if (r === 'full' || r === 'half' || r === 'none') return r;
          if (r === false) return 'none';
        }
        const dm = defaultBlockFor(x, y, piece, tCode, actorSide);
        if (dm) return dm;
        return (piece || (tVal && tVal !== false)) ? actualDefaultMode : 'none';
      }

      const list = [];
      for (const c of raw) {
        if (c.x === originX && c.y === originY) continue;
        // 用手动 resolve，复用 lineBlockedEx 的"中间格/目标格"分支逻辑
        const blocked = _lineBlockedWithResolve(originX, originY, c.x, c.y, resolveEx);
        if (blocked) continue;
        list.push(c);
      }
      if (options.includeSelf) list.push({ x: originX, y: originY });
      return list;
    },

    // 暴露内部函数（供高级用户/测试使用）
    _resolveBlockMode: resolveBlockMode,
    _lineBlockedEx: lineBlockedEx,
    _lineBlockedWithResolve: _lineBlockedWithResolve,
    _defaultBlockFor: defaultBlockFor,
    _terrainAt: _terrainAt,

    // ============================================================
    // blockOverride：临时覆盖默认阻断模式 + 安全恢复
    // ============================================================
    // 例：Range.setBlockOverride({ blockMode: 'none' })
    // 用完：Range.resetBlockOverride()
    //
    // 支持作用域化（推荐，不会漏恢复）：
    //   Range.withBlockOverride({ blockMode: 'none' }, () => {
    //     // 这里所有 Range 调用都用穿透模式
    //     const t = await Effect.chooseEnemy(actor, { range: {...} });
    //   });
    //   // 自动恢复
    blockOverride: null,

    setBlockOverride(obj) {
      Range.blockOverride = obj || null;
      return Range.blockOverride;
    },

    resetBlockOverride() {
      const prev = Range.blockOverride;
      Range.blockOverride = null;
      return prev;
    },

    // 作用域化调用：同步或异步回调内生效，返回 Promise（可 await）
    async withBlockOverride(obj, fn) {
      const saved = Range.blockOverride;
      try {
        Range.blockOverride = obj || null;
        return await fn();
      } finally {
        Range.blockOverride = saved;
      }
    },

    x: (n, x, y, opts) => cellsInRange('x', n, x, y, opts),
    plus: (n, x, y, opts) => cellsInRange('+', n, x, y, opts),
    cross: (n, x, y, opts) => cellsInRange('+', n, x, y, opts),
    circle: (n, x, y, opts) => cellsInRange('r', n, x, y, opts),
    square: (n, x, y, opts) => cellsInRange('square', n, x, y, opts)
  };

  global.Range = Range;
})(window);
