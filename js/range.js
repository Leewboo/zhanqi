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
  //   山地(mt)   → 'half' 半阻断（能站上去，但不可继续穿过）
  //   河流(r)    → 'half' 半阻断（能站上去，但不可继续穿过）
  //   敌方棋子    → 'full' 全阻断
  //   友方棋子    → 'full' 全阻断（棋子占位，不能走上去）
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
    // 地形优先：mt 和 r 都是半阻断（能站上去，不能继续穿过去）
    const tCode = (typeof terrain === 'string') ? terrain
      : (terrain === true ? (_terrainAt(x, y) || 'block') : null);
    if (tCode === 'mt' || tCode === 'r') return 'half';

    // 棋子默认是半阻断：
    //   - 攻击/视线：目标格可达（half=包含此格），但中间的棋子挡住后面的
    //   - 移动：reachableCells 内会额外强制棋子为全阻断（不能踩上去）
    if (piece) return 'half';
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
      // undefined/null → 回退
    }

    // ★ setBlockOverride 的 blockMode / passThrough 优先级高于一切（地形、棋子默认）
    const OV = global.Range && global.Range.blockOverride;
    if (OV) {
      if (OV.passThrough === true) return 'none';
      if (OV.blockMode !== undefined) return OV.blockMode;
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
  //   山地(mt)    → half 半阻断（能站上去，但不能继续穿过去/走出来）
  //   河流(r)     → half 半阻断（能站上去，但不能继续穿过去/过河）
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
    // 全局临时覆盖（优先级最高，覆盖一切默认规则）
    const OV = global.Range && global.Range.blockOverride;
    // OV 里的 blockMode / passThrough：如果存在 → 优先级高于 defaultBlockFor（地形 + 棋子默认）
    let ovForceBlockMode = null;
    if (OV) {
      if (OV.blockFilter     !== undefined) options.blockFilter     = OV.blockFilter;
      if (OV.pieceBlockMode  !== undefined) options.pieceBlockMode  = OV.pieceBlockMode;
      if (OV.terrainBlockMode!== undefined) options.terrainBlockMode= OV.terrainBlockMode;
      if (OV.passThrough === true) ovForceBlockMode = 'none';
      else if (OV.blockMode !== undefined) ovForceBlockMode = OV.blockMode;
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

    // 计算格子的阻断模式（优先级：blockFilter > blockOverride.blockMode/passThrough > 默认规则 > 兜底）
    // ★ 移动范围特殊：棋子占位一律 full 全阻断（不能踩到棋子身上）
    function getMode(x, y) {
      const piece = pieceAt(x, y);
      const tCode = terrainCodeFn(x, y);

      if (typeof blockFilter === 'function') {
        const r = blockFilter(x, y, piece, tCode);
        if (r === 'full' || r === 'half' || r === 'none') {
          // 移动范围：如果有棋子，除非 blockFilter 明确不是 full，否则强制 full
          if (piece && r !== 'none' && r !== 'half') return 'full';
          return r;
        }
        if (r === false) {
          // 显式不阻断：棋子仍不能踩
          if (piece) return 'full';
          return 'none';
        }
      }

      // ★ setBlockOverride 设置的 blockMode / passThrough 优先级高于一切（除了移动不能踩棋子）
      if (ovForceBlockMode !== null) {
        if (piece && ovForceBlockMode === 'none') {
          // 就算是穿透模式，移动范围也不能踩棋子
          if (options.pieceBlockMode === 'none') return 'none'; // 只有显式指定才允许
          return 'full';
        }
        return ovForceBlockMode;
      }

      // ★ 移动范围：任何棋子 → full（不能走上去），除非常量 pieceBlockMode 被显式改掉
      if (piece) return options.pieceBlockMode || 'full';

      const dm = defaultBlockFor(x, y, null, tCode);
      if (dm) return dm;

      // 兼容兜底
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

        const k = key(nx, ny);
        // ★ 已访问过的格子：如果之前以更少或相等步数到达过，跳过
        //   （包括 full 阻断格——也标记 visited 防止重复检测）
        if (visited.has(k) && visited.get(k) <= ns) continue;

        const mode = getMode(nx, ny);
        // 全阻断：不可到达，不可穿过——但仍标记 visited 防止其他路径重复尝试
        if (mode === 'full') {
          visited.set(k, ns);
          continue;
        }

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
  // Bresenham 直线遍历
  // ============================================================
  // 返回从 (ax,ay) 到 (bx,by) 直线上的所有格子（不含起点，含终点）
  // 适用于任意斜率（包括非45度的斜线如 (0,0)→(2,1)），是方形/圆形范围视线检测的关键
  function _bresenhamLine(ax, ay, bx, by) {
    const points = [];
    let x = ax, y = ay;
    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx - dy;
    // 安全上限：dx+dy 足够覆盖所有情况
    const limit = dx + dy + 1;
    for (let i = 0; i < limit + 2; i++) {
      if (x === bx && y === by) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx)  { err += dx; y += sy; }
      points.push({ x, y });
    }
    return points;
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
    if (ax === bx && ay === by) return false;
    // ★ 用 Bresenham 直线算法遍历，正确处理任意斜率（方形/圆形范围的关键）
    const points = _bresenhamLine(ax, ay, bx, by);
    const last = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      const cx = points[i].x;
      const cy = points[i].y;
      if (!inBounds(cx, cy)) return true;
      const isTarget = (i === last);
      const mode = resolveBlockMode(cx, cy, pieceAt, terrainFn, defaultMode, blockFilter);
      if (mode === 'none') continue;
      if (isTarget) return mode === 'full';
      return true; // 中间格 half/full → 阻断
    }
    return false;
  }

  // 用自定义 resolve 函数做直线视线检测（cellsInRangeWithBlock 内部使用）
  // resolveFn(x, y) => 'none'|'half'|'full'
  function _lineBlockedWithResolve(ax, ay, bx, by, resolveFn) {
    if (ax === bx && ay === by) return false;
    // ★ 用 Bresenham 直线算法遍历，正确处理任意斜率（方形/圆形范围的关键）
    const points = _bresenhamLine(ax, ay, bx, by);
    const last = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      const cx = points[i].x;
      const cy = points[i].y;
      if (!inBounds(cx, cy)) return true;
      const isTarget = (i === last);
      const mode = resolveFn(cx, cy);
      if (mode === 'none') continue;
      if (isTarget) return mode === 'full';
      return true; // 中间格 half/full → 阻断
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
      if (ax === bx && ay === by) return false;
      // ★ 用 Bresenham 直线算法遍历中间格（不含起点和终点）
      const points = _bresenhamLine(ax, ay, bx, by);
      for (let i = 0; i < points.length - 1; i++) {
        const cx = points[i].x;
        const cy = points[i].y;
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
    //   山地(mt)   → half 半阻断（能打到山头上本人，但打不到山后面）
    //   河流(r)    → half 半阻断（能打到河上单位，但打不到河对岸远处的）
    //   敌方棋子    → full 全阻断（挡视线，本人也打不到）
    //   友方棋子    → full 全阻断（挡视线，本人也打不到）
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
      // 全局临时覆盖（优先级最高，覆盖一切默认规则）
      const OV = global.Range && global.Range.blockOverride;
      let ovForceBlockMode = null;
      if (OV) {
        if (OV.blockFilter  !== undefined) options.blockFilter   = OV.blockFilter;
        if (OV.terrainFn    !== undefined) options.terrainFn     = OV.terrainFn;
        if (OV.actorSide    !== undefined) options.actorSide     = OV.actorSide;
        // ★ setBlockOverride 的 blockMode / passThrough 优先级高于一切（包括调用参数里的）
        if (OV.passThrough === true) ovForceBlockMode = 'none';
        else if (OV.blockMode !== undefined) ovForceBlockMode = OV.blockMode;
      }
      // ★ 调用级 passThrough/blockMode（来自技能声明）：优先级仅次于全局 OV，高于地形/棋子默认
      //   例：技能里写 range: {shape:'cross', n:4, passThrough:true}  → 穿透所有
      const raw = cellsInRange(shape, n, originX, originY, { includeSelf: false });
      const pieceAt = options.pieceAt;
      let callForceBlockMode = null;
      if (ovForceBlockMode === null) {
        if (options.passThrough === true) callForceBlockMode = 'none';
        else if (options.blockMode !== undefined) callForceBlockMode = options.blockMode;
      }

      // 地形代码函数（返回 'mt'/'r'/'plain'/... 字符串，老函数返回 bool 时也兼容）
      const userTerrainFn = options.terrainFn;
      const terrainFn = userTerrainFn ? function (x, y) {
        const v = userTerrainFn(x, y);
        if (typeof v === 'string') return v;
        if (v === true) return _terrainAt(x, y) || 'block';
        return null;
      } : function (x, y) { return _terrainAt(x, y) || 'plain'; };

      // 兜底模式（piece/terrain 都没命中时）：只有当没有任何 override 的情况下才用 half 兜底
      let actualDefaultMode = (ovForceBlockMode !== null || callForceBlockMode !== null) ? 'none' : 'half';

      // 推断发起方阵营（actorSide > origin 棋子 > Game.currentSide）
      let actorSide = options.actorSide;
      if (!actorSide && pieceAt) {
        const op = pieceAt(originX, originY);
        if (op && op.side) actorSide = op.side;
      }
      if (!actorSide) actorSide = _currentSide();

      const blockFilter = options.blockFilter;
      const mergedFilter = (blockFilter && typeof blockFilter === 'function') ? blockFilter : null;

      // 优先级：blockFilter > OV.blockMode/passThrough > 调用级 passThrough/blockMode > defaultBlockFor > actualDefaultMode
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
        // ★ setBlockOverride 设置的 blockMode / passThrough 优先级高于一切（地形、棋子默认 + 调用级）
        if (ovForceBlockMode !== null) return ovForceBlockMode;
        // ★ 调用级 passThrough / blockMode（来自技能声明）：高于地形/棋子默认规则
        if (callForceBlockMode !== null) return callForceBlockMode;

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
