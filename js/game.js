(function (global) {
  const SIZE = Range.BOARD_SIZE;
  const SUPPLY_MAX = 8;

  const TERRAIN_LABEL = {
    plain: '平',
    m: '林',
    f: '田',
    r: '河',
    w: '营'
  };

  function buildTerrain() {
    const map = [];
    for (let y = 0; y < SIZE; y++) {
      map[y] = [];
      for (let x = 0; x < SIZE; x++) {
        map[y][x] = 'plain';
      }
    }
    const set = (x, y, t) => { if (Range.inBounds(x, y)) map[y][x] = t; };
    [[4,4],[5,4],[4,5],[7,7],[8,7],[7,8]].forEach(p => set(p[0], p[1], 'm'));
    [[2,6],[3,6],[2,7]].forEach(p => set(p[0], p[1], 'f'));
    [[9,4],[9,5],[10,5]].forEach(p => set(p[0], p[1], 'f'));
    [[5,9],[6,9],[5,10],[6,10],[5,2],[6,2]].forEach(p => set(p[0], p[1], 'r'));
    [[0,0],[1,0],[0,1],[11,11],[10,11],[11,10]].forEach(p => set(p[0], p[1], 'w'));
    return map;
  }

  function terrainMoveCost(t) {
    switch (t) {
      case 'm': return 2;
      case 'f': return 1;
      case 'r': return 99;
      case 'w': return 1;
      default: return 1;
    }
  }

  function terrainDefBonus(t) {
    if (t === 'm') return 10;
    if (t === 'w') return 15;
    return 0;
  }

  const Game = {
    boardEl: null,
    turn: 1,
    currentSide: 'red',
    supply: { red: 1, blue: 1 },
    pieces: [],
    terrain: null,
    selected: null,
    mode: null,
    highlighted: [],
    awaitingCell: null,
    over: false,

    log(text, cls) {
      const box = document.getElementById('log');
      const p = document.createElement('p');
      if (cls) p.className = cls;
      p.textContent = text;
      box.appendChild(p);
      box.scrollTop = box.scrollHeight;
      while (box.children.length > 200) box.removeChild(box.firstChild);
    },

    init() {
      this.boardEl = document.getElementById('board');
      this.terrain = buildTerrain();
      this.pieces = [];
      this.turn = 1;
      this.currentSide = 'red';
      this.supply = { red: 1, blue: 1 };
      this.selected = null;
      this.mode = null;
      this.highlighted = [];
      this.over = false;
      this._deploy();
      this._buildDom();
      this._bind();
      this.log('战斗开始。红方先动。', 'turn');
      this._refreshUi();
    },

    _deploy() {
      const reds = Generals.list.filter(g => g.color === 'red');
      const blues = Generals.list.filter(g => g.color === 'blue');
      const positionsRed = [[1,1],[2,1],[1,2],[3,1],[2,2],[1,3]];
      const positionsBlue = [[10,10],[9,10],[10,9],[8,10],[9,9],[10,8]];
      reds.forEach((g, i) => {
        const [x, y] = positionsRed[i] || [i % 4, Math.floor(i / 4)];
        this.pieces.push(Generals.buildPiece(g, 'red', x, y));
      });
      blues.forEach((g, i) => {
        const [x, y] = positionsBlue[i] || [SIZE - 1 - (i % 4), SIZE - 1 - Math.floor(i / 4)];
        this.pieces.push(Generals.buildPiece(g, 'blue', x, y));
      });
    },

    _buildDom() {
      this.boardEl.innerHTML = '';
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const c = document.createElement('div');
          c.className = 'cell';
          if ((x + y) % 2) c.classList.add('alt');
          const t = this.terrain[y][x];
          if (t && t !== 'plain') c.classList.add('terrain-' + t);
          c.dataset.x = x;
          c.dataset.y = y;
          c.title = '(' + x + ',' + y + ') ' + (TERRAIN_LABEL[t] || '');
          this.boardEl.appendChild(c);
        }
      }
    },

    _bind() {
      this.boardEl.addEventListener('click', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const x = parseInt(cell.dataset.x, 10);
        const y = parseInt(cell.dataset.y, 10);
        this._onCellClick(x, y);
      });

      document.getElementById('btn-move').onclick = () => this._enterMode('move');
      document.getElementById('btn-attack').onclick = () => this._enterMode('attack');
      document.getElementById('btn-skill').onclick = () => this._enterMode('skill');
      document.getElementById('btn-wait').onclick = () => this._waitSelected();
      document.getElementById('btn-cancel').onclick = () => this._clearSelection();
      document.getElementById('btn-restart').onclick = () => {
        document.getElementById('banner').classList.add('hidden');
        document.getElementById('log').innerHTML = '';
        this.init();
      };
    },

    _onCellClick(x, y) {
      if (this.over) return;
      if (this.awaitingCell) {
        const valid = this.highlighted.find(h => h.x === x && h.y === y);
        if (valid) {
          const cb = this.awaitingCell;
          this.awaitingCell = null;
          this.highlighted = [];
          this._render();
          cb({ x, y });
        }
        return;
      }

      const target = this.pieceAt(x, y);

      if (this.selected && this.mode) {
        if (this.mode === 'move') this._tryMove(x, y);
        else if (this.mode === 'attack') this._tryAttack(x, y);
        return;
      }

      if (target && target.alive && target.side === this.currentSide && !target.acted) {
        this.selected = target;
        this.mode = null;
        this.highlighted = [];
        this._render();
        this._renderDetail();
        return;
      }

      this._clearSelection();
    },

    _enterMode(mode) {
      if (!this.selected || this.selected.acted) return;
      const actor = this.selected;
      this.mode = mode;
      this.highlighted = [];

      if (mode === 'move') {
        if (this.supply[actor.side] < 1) {
          this.log('我方粮草不足，无法移动。');
          this.mode = null;
          this._renderDetail();
          return;
        }
        const cells = Range.reachableCells(actor.x, actor.y, actor.moveRange, this);
        this.highlighted = cells.map(c => ({ x: c.x, y: c.y, kind: 'move' }));
      } else if (mode === 'attack') {
        if (this.supply[actor.side] < 1) {
          this.log('我方粮草不足，无法攻击。');
          this.mode = null;
          this._renderDetail();
          return;
        }
        const cells = Range.cellsInRange(actor.attackRange.shape, actor.attackRange.n, actor.x, actor.y, { includeSelf: false });
        for (const c of cells) {
          const t = this.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side) {
            this.highlighted.push({ x: c.x, y: c.y, kind: 'attack' });
          }
        }
        if (!this.highlighted.length) {
          this.log('攻击范围内没有敌人。');
          this.mode = null;
        }
      } else if (mode === 'skill') {
        if (!actor.skill) {
          this.log('该武将没有主动技能。');
          this.mode = null;
          this._renderDetail();
          return;
        }
        if (!actor.skill.filter(actor)) {
          this.log('技能条件未满足（冷却或粮草不足）。');
          this.mode = null;
          this._renderDetail();
          return;
        }
        this.supply[actor.side] -= actor.skill.cost || 0;
        if (actor.skill.cooldown) actor.cd = actor.skill.cooldown;
        this.log(actor.name + ' 发动技能：' + actor.skill.name);
        const promise = actor.skill.content(actor);
        this.mode = null;
        Promise.resolve(promise).then(() => {
          this._finishActorAction();
        });
        return;
      }
      this._render();
      this._renderDetail();
    },

    _tryMove(x, y) {
      const hit = this.highlighted.find(h => h.x === x && h.y === y && h.kind === 'move');
      if (!hit) {
        this.mode = null;
        this.highlighted = [];
        this._render();
        return;
      }
      const actor = this.selected;
      this.supply[actor.side] -= 1;
      actor.x = x;
      actor.y = y;
      this.log(actor.name + ' 移动到 (' + x + ',' + y + ')。');
      this.mode = null;
      this.highlighted = [];
      this._render();
      this._renderDetail();
    },

    _tryAttack(x, y) {
      const hit = this.highlighted.find(h => h.x === x && h.y === y && h.kind === 'attack');
      if (!hit) {
        this.mode = null;
        this.highlighted = [];
        this._render();
        return;
      }
      const actor = this.selected;
      const target = this.pieceAt(x, y);
      this.supply[actor.side] -= 1;
      const atkVal = actor.atk + (actor.atkBuff || 0);
      const defBonus = terrainDefBonus(this.terrain[target.y][target.x]);
      const origDef = target.def;
      target.def = origDef + (target.defBuff || 0) + defBonus;
      Effect.damage(actor, target, atkVal);
      target.def = origDef;
      this.mode = null;
      this.highlighted = [];
      this._finishActorAction();
    },

    _waitSelected() {
      if (!this.selected || this.selected.acted) return;
      this.log(this.selected.name + ' 待机。');
      this._finishActorAction();
    },

    _finishActorAction() {
      if (this.selected) this.selected.acted = true;
      this._clearSelection();
      this._checkWin();
      this._render();
      this._refreshUi();
    },

    _clearSelection() {
      this.selected = null;
      this.mode = null;
      this.highlighted = [];
      this._render();
      document.getElementById('detail').classList.add('hidden');
    },

    _checkWin() {
      const redAlive = this.pieces.some(p => p.side === 'red' && p.alive);
      const blueAlive = this.pieces.some(p => p.side === 'blue' && p.alive);
      if (!redAlive || !blueAlive) {
        this.over = true;
        const title = document.getElementById('banner-title');
        title.textContent = redAlive ? '红方胜利' : '蓝方胜利';
        document.getElementById('banner').classList.remove('hidden');
        this.log(title.textContent + '！', 'turn');
      }
    },

    endTurn() {
      const actor = this.selected;
      if (actor) {
        if (actor.atkBuffTurns) {
          actor.atkBuffTurns -= 1;
          if (actor.atkBuffTurns <= 0) { actor.atkBuff = 0; actor.atkBuffTurns = 0; }
        }
        if (actor.defBuffTurns) {
          actor.defBuffTurns -= 1;
          if (actor.defBuffTurns <= 0) { actor.defBuff = 0; actor.defBuffTurns = 0; }
        }
      }

      if (this.currentSide === 'red') {
        this.currentSide = 'blue';
        this.pieces.forEach(p => { if (p.side === 'blue') p.acted = false; });
        this.supply.blue = Math.min(SUPPLY_MAX, this.supply.blue + this.turn);
        this.pieces.forEach(p => { if (p.side === 'blue' && p.cd > 0) p.cd -= 1; });
        this.log('回合 ' + this.turn + ' · 蓝方行动（粮草 +' + this.turn + '）。', 'turn');
      } else {
        this.currentSide = 'red';
        this.turn += 1;
        this.pieces.forEach(p => { if (p.side === 'red') p.acted = false; });
        this.supply.red = Math.min(SUPPLY_MAX, this.supply.red + this.turn);
        this.pieces.forEach(p => { if (p.side === 'red' && p.cd > 0) p.cd -= 1; });
        this.log('回合 ' + this.turn + ' · 红方行动（粮草 +' + this.turn + '）。', 'turn');
      }
      this._clearSelection();
      this._refreshUi();
    },

    requestCell(actor, options, cb) {
      const range = options.range || { shape: 'square', n: 3 };
      const cells = Range.cellsInRange(range.shape, range.n, actor.x, actor.y, { includeSelf: !options.mustEmpty });
      const valid = [];
      for (const c of cells) {
        const t = this.pieceAt(c.x, c.y);
        if (options.mustEmpty && t) continue;
        if (options.mustEnemy && (!t || !t.alive || t.side === actor.side)) continue;
        if (options.mustAlly && (!t || t.side !== actor.side)) continue;
        valid.push({ x: c.x, y: c.y, kind: 'skill' });
      }
      if (!valid.length) {
        this.log('没有符合条件的目标，技能取消。');
        cb(null);
        return;
      }
      this.highlighted = valid;
      this.awaitingCell = (cell) => cb(cell);
      this._render();
    },

    pieceAt(x, y) {
      return this.pieces.find(p => p.alive && p.x === x && p.y === y) || null;
    },

    cellMoveCost(x, y) {
      return terrainMoveCost(this.terrain[y][x]);
    },

    _render() {
      const children = this.boardEl.children;
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        el.classList.remove('move', 'attack', 'skill', 'sel', 'hover');
      }
      for (const h of this.highlighted) {
        const idx = h.y * SIZE + h.x;
        const el = children[idx];
        if (el) el.classList.add(h.kind);
      }
      if (this.selected) {
        const idx = this.selected.y * SIZE + this.selected.x;
        const el = children[idx];
        if (el) el.classList.add('sel');
      }
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        const x = parseInt(el.dataset.x, 10);
        const y = parseInt(el.dataset.y, 10);
        const piece = this.pieceAt(x, y);
        const existing = el.querySelector('.piece');
        if (existing) existing.remove();
        if (piece) {
          const p = document.createElement('div');
          p.className = 'piece ' + piece.side + (piece.acted ? ' acted' : '');
          p.textContent = piece.name[0];
          const bar = document.createElement('div');
          bar.className = 'hp-bar';
          const inner = document.createElement('span');
          inner.style.width = Math.max(0, Math.min(100, (piece.hp / piece.maxHp) * 100)) + '%';
          bar.appendChild(inner);
          p.appendChild(bar);
          el.appendChild(p);
        }
      }
    },

    _renderDetail() {
      const a = this.selected;
      const box = document.getElementById('detail');
      if (!a) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      document.getElementById('d-name').textContent = a.name + '（' + (a.side === 'red' ? '红' : '蓝') + '）';
      const stats = document.getElementById('d-stats');
      stats.innerHTML = '';
      const add = (k, v) => {
        const d = document.createElement('div'); d.textContent = k + '：' + v; stats.appendChild(d);
      };
      add('生命', a.hp + ' / ' + a.maxHp);
      add('攻击', a.atk + (a.atkBuff ? ' +' + a.atkBuff : ''));
      add('防御', a.def + (a.defBuff ? ' +' + a.defBuff : ''));
      add('移动', a.moveRange);
      add('攻击范围', (a.attackRange.shape === '+' ? '+' : a.attackRange.shape === 'r' ? '圆' : a.attackRange.shape) + a.attackRange.n);
      add('本方粮草', this.supply[a.side] + ' / ' + SUPPLY_MAX);
      add('技能冷却', a.cd);
      const sk = document.getElementById('d-skill');
      if (a.skill) {
        sk.innerHTML = '<b>' + a.skill.name + '</b> ' + (a.skill.type || '') + '（' + (a.skill.cost || 0) + '粮草 / CD ' + (a.skill.cooldown || 0) + '）';
        const desc = document.createElement('div');
        desc.textContent = a.skill.desc || '';
        sk.appendChild(desc);
      } else {
        sk.textContent = '无主动技能';
      }

      const moveBtn = document.getElementById('btn-move');
      const atkBtn = document.getElementById('btn-attack');
      const skBtn = document.getElementById('btn-skill');
      const waitBtn = document.getElementById('btn-wait');
      moveBtn.disabled = !!(a.acted || this.supply[a.side] < 1);
      atkBtn.disabled = !!(a.acted || this.supply[a.side] < 1);
      skBtn.disabled = !!(a.acted || !a.skill || !a.skill.filter(a));
      waitBtn.disabled = !!a.acted;
    },

    _renderSideList() {
      const render = (side, elId, supplyId) => {
        const ul = document.getElementById(elId);
        ul.innerHTML = '';
        const items = this.pieces.filter(p => p.side === side);
        for (const p of items) {
          const li = document.createElement('li');
          if (!p.alive) li.classList.add('dead');
          else if (p.acted) li.classList.add('acted');
          const left = document.createElement('span');
          left.textContent = p.name;
          const right = document.createElement('span');
          right.textContent = p.alive ? p.hp : '亡';
          li.appendChild(left);
          li.appendChild(right);
          li.addEventListener('click', () => {
            if (!p.alive || p.acted) return;
            this.selected = p;
            this.mode = null;
            this.highlighted = [];
            this._render();
            this._renderDetail();
          });
          ul.appendChild(li);
        }
        document.getElementById(supplyId).textContent = '粮草：' + this.supply[side] + ' / ' + SUPPLY_MAX;
      };
      render('red', 'list-red', 'supply-red');
      render('blue', 'list-blue', 'supply-blue');
    },

    _refreshUi() {
      document.getElementById('turn-info').textContent =
        '回合 ' + this.turn + ' · ' + (this.currentSide === 'red' ? '红方' : '蓝方');
      this._render();
      this._renderSideList();
      if (this.selected) this._renderDetail();

      if (this.awaitingCell) return;
      const side = this.currentSide;
      const aliveActable = this.pieces.filter(p => p.side === side && p.alive);
      const allActed = aliveActable.length && aliveActable.every(p => p.acted);
      if (allActed) {
        setTimeout(() => this.endTurn(), 400);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    Game.init();
    const btn = document.createElement('button');
    btn.textContent = '结束回合';
    btn.style.cssText = 'position:fixed;left:16px;bottom:16px;border:1px solid #cfc8ba;background:#fff;padding:8px 14px;cursor:pointer;letter-spacing:4px;';
    btn.onclick = () => { if (!Game.over) Game.endTurn(); };
    document.body.appendChild(btn);
  });

  global.Game = Game;
})(window);
