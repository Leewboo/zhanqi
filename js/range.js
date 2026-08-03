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
  //   blockFilter: (x, y, piece, terrain) => 'none' | 'half' | 'full' | false
  //     返回 'none'/'half'/'full' → 使用该模式（覆盖默认）
  //     返回 false/undefined/null → 回退到默认判定（blockMode）
  // ============================================================

  // 默认地形阻断判定：山地(mt)为阻断地形
  function defaultTerrainFn(x, y) {
    const g = typeof global !== 'undefined' ? global.Game : (typeof window !== 'undefined' ? window.Game : null);
    return !!(g && g.terrain && g.terrain[y] && g.terrain[y][x] === 'mt');
  }

  // 计算单个格子的阻断模式
  // 返回: 'none' | 'half' | 'full'
  function resolveBlockMode(x, y, pieceAt, terrainFn, defaultMode, blockFilter) {
    const piece = pieceAt ? pieceAt(x, y) : null;
    const terrain = terrainFn ? terrainFn(x, y) : false;

    // 条件阻断优先：blockFilter 的返回值覆盖默认
    if (typeof blockFilter === 'function') {
      const r = blockFilter(x, y, piece, terrain);
      if (r === 'full' || r === 'half' || r === 'none') return r;
      if (r === false) return 'none';  // 显式不阻断
      // undefined/null → 回退到默认
    }

    // 默认判定：有棋子或阻断地形 → 使用 defaultMode，否则不阻断
    if (piece || terrain) return defaultMode;
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
  // options（第6个参数，可选）:
  //   blockFilter:     (x, y, piece, terrain) => 'none'|'half'|'full'|false — 条件阻断
  //   pieceBlockMode:  棋子默认阻断模式（默认 'full'，即不可移动到棋子上）
  //   terrainBlockMode: 阻断地形默认模式（默认 'half'，即可到达但不可穿过，如山地）
  // ============================================================
  function reachableCells(originX, originY, maxSteps, game, shape, options) {
    shape = shape || '+';
    options = options || {};
    // 全局临时覆盖：Range.blockOverride = { pieceBlockMode, terrainBlockMode, blockFilter }
    // 一行设置后所有 Effect 内部移动范围计算自动套用，设 null 即恢复
    const OV = global.Range && global.Range.blockOverride;
    if (OV) {
      if (OV.pieceBlockMode  !== undefined) options.pieceBlockMode  = OV.pieceBlockMode;
      if (OV.terrainBlockMode!== undefined) options.terrainBlockMode= OV.terrainBlockMode;
      if (OV.blockFilter     !== undefined) options.blockFilter     = OV.blockFilter;
    }
    // 方形/圆形/斜角需要 8 方向才能走对角
    const dirs = (shape === 'square' || shape === 'r' || shape === 'x')
      ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
      : [[1,0],[-1,0],[0,1],[0,-1]];

    const pieceBlockMode = options.pieceBlockMode || 'full';
    const terrainBlockMode = options.terrainBlockMode || 'half';
    const blockFilter = options.blockFilter;

    // 判定格子是否被棋子占据
    const pieceAt = (x, y) => (game && game.pieceAt ? game.pieceAt(x, y) : null);
    // 判定格子是否为阻断地形
    const terrainFn = (x, y) => {
      if (game && game.terrain && game.terrain[y] && game.terrain[y][x] === 'mt') return true;
      return false;
    };

    // 计算格子的阻断模式（区分棋子和地形使用不同默认值）
    function getMode(x, y) {
      const piece = pieceAt(x, y);
      const terrain = terrainFn(x, y);
      if (typeof blockFilter === 'function') {
        const r = blockFilter(x, y, piece, terrain);
        if (r === 'full' || r === 'half' || r === 'none') return r;
        if (r === false) return 'none';
      }
      if (piece) return pieceBlockMode;
      if (terrain) return terrainBlockMode;
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
    // options:
    //   pieceAt:    (x, y) => piece | null — 棋子查询（用于检测阻断）
    //   terrainFn:  (x, y) => boolean — 阻断地形查询（默认：山地 mt）
    //   blockMode:  'full' | 'half' | 'none' — 默认阻断模式（默认 'half'）
    //                'full'  全阻断：阻断格本身不可达，更远处也不可达
    //                'half'  半阻断：阻断格本身可达，更远处不可达
    //                'none'  不阻断：不阻挡视线，所有格正常可达
    //   blockFilter: (x, y, piece, terrain) => 'full'|'half'|'none'|false — 条件阻断
    //                返回具体模式 → 覆盖默认；返回 false → 不阻断；返回 undefined → 回退默认
    //   passThrough: true — 旧版兼容，等价于 blockMode: 'none'（完全不阻断）
    //   includeSelf: boolean — 是否包含原点格（默认 false）
    // ============================================================
    cellsInRangeWithBlock(shape, n, originX, originY, options) {
      options = options || {};
      // 全局临时覆盖：Range.blockOverride = { blockMode, passThrough, blockFilter, terrainFn }
      // 一行设置后所有 Effect 内部范围计算（chooseEnemy/AI评估等）自动套用，设 null 即恢复
      const OV = global.Range && global.Range.blockOverride;
      if (OV) {
        if (OV.blockMode   !== undefined) options.blockMode    = OV.blockMode;
        if (OV.passThrough !== undefined) options.passThrough  = OV.passThrough;
        if (OV.blockFilter !== undefined) options.blockFilter  = OV.blockFilter;
        if (OV.terrainFn   !== undefined) options.terrainFn    = OV.terrainFn;
      }
      const raw = cellsInRange(shape, n, originX, originY, { includeSelf: false });
      const pieceAt = options.pieceAt;

      // 地形阻断函数：默认检测山地
      const terrainFn = options.terrainFn || defaultTerrainFn;

      // 默认阻断模式：passThrough=true → 'none'，否则使用 blockMode（默认 'half'）
      const defaultMode = options.passThrough ? 'none' : (options.blockMode || 'half');
      const blockFilter = options.blockFilter;

      const list = [];
      for (const c of raw) {
        if (c.x === originX && c.y === originY) continue;
        if (lineBlockedEx(originX, originY, c.x, c.y, pieceAt, terrainFn, defaultMode, blockFilter)) continue;
        list.push(c);
      }
      if (options.includeSelf) list.push({ x: originX, y: originY });
      return list;
    },

    // 暴露内部函数（供高级用户/测试使用）
    _resolveBlockMode: resolveBlockMode,
    _lineBlockedEx: lineBlockedEx,

    x: (n, x, y, opts) => cellsInRange('x', n, x, y, opts),
    plus: (n, x, y, opts) => cellsInRange('+', n, x, y, opts),
    cross: (n, x, y, opts) => cellsInRange('+', n, x, y, opts),
    circle: (n, x, y, opts) => cellsInRange('r', n, x, y, opts),
    square: (n, x, y, opts) => cellsInRange('square', n, x, y, opts)
  };

  global.Range = Range;
})(window);
