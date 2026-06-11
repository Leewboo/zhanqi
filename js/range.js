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

  function reachableCells(originX, originY, maxSteps, game) {
    const result = [];
    const visited = new Map();
    const queue = [{ x: originX, y: originY, steps: 0 }];
    visited.set(key(originX, originY), 0);
    while (queue.length) {
      const cur = queue.shift();
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!inBounds(nx, ny)) continue;
        const cost = game ? game.cellMoveCost(nx, ny) : 1;
        const ns = cur.steps + cost;
        if (ns > maxSteps) continue;
        if (game && game.pieceAt(nx, ny)) continue;
        const k = key(nx, ny);
        if (visited.has(k) && visited.get(k) <= ns) continue;
        visited.set(k, ns);
        result.push({ x: nx, y: ny, steps: ns });
        queue.push({ x: nx, y: ny, steps: ns });
      }
    }
    return result;
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
    lineBlocked(ax, ay, bx, by, pieceAt) {
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
      }
      return false;
    },
    cellsInRangeWithBlock(shape, n, originX, originY, options) {
      options = options || {};
      const raw = cellsInRange(shape, n, originX, originY, { includeSelf: false });
      const pieceAt = options.pieceAt;
      const list = [];
      for (const c of raw) {
        if (c.x === originX && c.y === originY) continue;
        if (pieceAt && this.lineBlocked(originX, originY, c.x, c.y, pieceAt)) continue;
        list.push(c);
      }
      if (options.includeSelf) list.push({ x: originX, y: originY });
      return list;
    },
    x: (n, x, y, opts) => cellsInRange('x', n, x, y, opts),
    plus: (n, x, y, opts) => cellsInRange('+', n, x, y, opts),
    cross: (n, x, y, opts) => cellsInRange('+', n, x, y, opts),
    circle: (n, x, y, opts) => cellsInRange('r', n, x, y, opts),
    square: (n, x, y, opts) => cellsInRange('square', n, x, y, opts)
  };

  global.Range = Range;
})(window);
