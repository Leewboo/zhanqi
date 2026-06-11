(function (global) {
  const SIZE = Range.BOARD_SIZE;
  const SUPPLY_MAX = 8;

  const TERRAIN_NAMES = {
    plain: '',
    m: '林',
    f: '田',
    r: '江',
    w: '城'
  };

  const LANDMARK_NAMES = {};

  function _registerLandmarks() {
    // 历史地名：魏（北/东）、蜀（南/西）
    const mark = (x, y, name) => { LANDMARK_NAMES[y + ',' + x] = name; };
    // 魏国（蓝方）
    mark(0, 0, '长安'); mark(1, 0, '长安'); mark(0, 1, '长安');
    mark(7, 0, '洛阳'); mark(8, 0, '洛阳');
    mark(10, 0, '许都'); mark(11, 0, '许都'); mark(10, 1, '许都'); mark(11, 1, '许都');
    mark(9, 5, '荆州');
    // 蜀国（红方）
    mark(0, 4, '汉中'); mark(1, 4, '汉中');
    mark(4, 10, '江州');
    mark(0, 11, '成都'); mark(1, 11, '成都'); mark(2, 11, '成都'); mark(0, 10, '成都');
    mark(5, 11, '永安'); mark(6, 11, '永安');
    // 地形提示
    mark(5, 2, '秦岭'); mark(6, 2, '秦岭'); mark(4, 3, '秦岭'); mark(5, 3, '秦岭');
    mark(5, 6, '长江'); mark(6, 6, '长江'); mark(7, 6, '长江'); mark(4, 7, '长江');
  }
  _registerLandmarks();

  function buildTerrain() {
    const map = [];
    for (let y = 0; y < SIZE; y++) {
      map[y] = [];
      for (let x = 0; x < SIZE; x++) {
        map[y][x] = 'plain';
      }
    }
    const set = (x, y, t) => { if (Range.inBounds(x, y)) map[y][x] = t; };
    // 城池 w（魏：长安 / 洛阳 / 许都 / 荆州）（蜀：汉中 / 成都 / 永安 / 江州）
    [[0,0],[1,0],[0,1]].forEach(p => set(p[0], p[1], 'w'));
    [[7,0],[8,0]].forEach(p => set(p[0], p[1], 'w'));
    [[10,0],[11,0],[10,1],[11,1]].forEach(p => set(p[0], p[1], 'w'));
    [[9,5]].forEach(p => set(p[0], p[1], 'w'));
    [[0,4],[1,4]].forEach(p => set(p[0], p[1], 'w'));
    [[4,10]].forEach(p => set(p[0], p[1], 'w'));
    [[0,11],[1,11],[2,11],[0,10]].forEach(p => set(p[0], p[1], 'w'));
    [[5,11],[6,11]].forEach(p => set(p[0], p[1], 'w'));
    // 山地森林 m（秦岭山脉 + 若干零散山林）
    [[4,0],[5,0],[4,1],[5,2],[6,2],[3,3],[4,3],[5,3],[7,3],[8,3],[9,3]].forEach(p => set(p[0], p[1], 'm'));
    [[2,4],[3,4],[7,4],[8,4],[9,4],[2,5],[8,5]].forEach(p => set(p[0], p[1], 'm'));
    [[3,9],[4,9],[7,9],[8,9],[7,10]].forEach(p => set(p[0], p[1], 'm'));
    // 河流 r（长江横贯中部偏南）
    [[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[8,7]].forEach(p => set(p[0], p[1], 'r'));
    // 农田 f（南方富饶地区）
    [[2,8],[3,8],[2,9],[7,8],[8,8],[9,8],[3,10],[5,10],[6,10]].forEach(p => set(p[0], p[1], 'f'));
    return map;
  }

  function terrainLabel(x, y) {
    const key = y + ',' + x;
    if (LANDMARK_NAMES[key]) return LANDMARK_NAMES[key];
    return '';
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
      this._refreshUi();
      this.log('战斗开始。红方先动。', 'turn');
    },

    _deploy() {
      const reds = Generals.list.filter(g => g.color === 'red');
      const blues = Generals.list.filter(g => g.color === 'blue');
      // 蜀（红）方：围绕成都/汉中/永安部署（棋盘下方/左下方）
      const positionsRed = [
        [1, 10], // 刘备 成都
        [2, 10], // 关羽 江州前线
        [1, 11], // 张飞 成都
        [0, 9],  // 赵云 汉中前线
        [3, 11], // 诸葛亮 成都附近
        [4, 11]  // 黄忠 江州
      ];
      // 魏（蓝）方：围绕许都/洛阳/长安部署（棋盘上方/右上方）
      const positionsBlue = [
        [11, 1], // 曹操 许都
        [10, 1], // 夏侯惇 许都
        [9, 1],  // 典韦 洛阳前线
        [8, 1],  // 许褚 洛阳
        [11, 2], // 司马懿 许都前
        [10, 2]  // 张辽 荆州方向
      ];
      reds.forEach((g, i) => {
        const [x, y] = positionsRed[i] || [i % 4, 11 - Math.floor(i / 4)];
        this.pieces.push(Generals.buildPiece(g, 'red', x, y));
      });
      blues.forEach((g, i) => {
        const [x, y] = positionsBlue[i] || [SIZE - 1 - (i % 4), Math.floor(i / 4)];
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
          const landmark = terrainLabel(x, y);
          if (landmark) {
            const lb = document.createElement('span');
            lb.className = 'terrain-label';
            lb.textContent = landmark;
            c.appendChild(lb);
          } else if (t && TERRAIN_NAMES[t]) {
            const lb = document.createElement('span');
            lb.className = 'terrain-label';
            lb.textContent = TERRAIN_NAMES[t];
            c.appendChild(lb);
          }
          const coord = document.createElement('span');
          coord.className = 'coord-label';
          coord.textContent = x + ',' + y;
          c.appendChild(coord);
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
      document.getElementById('btn-cancel').onclick = () => {
        this._clearSelection();
        this._refreshUi();
      };
      document.getElementById('btn-end').onclick = () => { if (!this.over) this.endTurn(); };
      document.getElementById('btn-restart').onclick = () => {
        document.getElementById('banner').classList.add('hidden');
        document.getElementById('log').innerHTML = '';
        this.init();
      };
      document.getElementById('detail-close').onclick = () => {
        document.getElementById('detail-modal').classList.add('hidden');
      };
      document.getElementById('btn-detail').onclick = () => {
        if (this.selected) this.openDetail(this.selected);
      };
      document.getElementById('btn-report').onclick = () => {
        this._renderSideList();
        document.getElementById('report-modal').classList.remove('hidden');
        const logEl = document.getElementById('log');
        logEl.scrollTop = logEl.scrollHeight;
      };
      document.getElementById('report-close').onclick = () => {
        document.getElementById('report-modal').classList.add('hidden');
      };
      document.getElementById('btn-supply').onclick = () => {
        document.getElementById('btn-report').click();
      };
    },

    openDetail(piece) {
      const modal = document.getElementById('detail-modal');
      const title = document.getElementById('detail-title');
      const body = document.getElementById('detail-body');
      title.textContent = piece.name + '（' + (piece.side === 'red' ? '红方' : '蓝方') + '）';
      body.innerHTML = '';

      const addRow = (label, value) => {
        const row = document.createElement('div');
        row.className = 'row';
        const l = document.createElement('span');
        l.className = 'label';
        l.textContent = label;
        const v = document.createElement('span');
        v.className = 'value';
        v.textContent = value;
        row.appendChild(l);
        row.appendChild(v);
        body.appendChild(row);
      };

      addRow('生命', piece.hp + ' / ' + piece.maxHp);
      addRow('攻击', piece.atk + (piece.atkBuff ? ' (+' + piece.atkBuff + ')' : ''));
      addRow('防御', piece.def + (piece.defBuff ? ' (+' + piece.defBuff + ')' : ''));
      addRow('移动范围', (piece.moveRange.shape === '+' ? '十字 ' : piece.moveRange.shape === 'r' ? '圆形 ' : piece.moveRange.shape === 'square' ? '方形 ' : piece.moveRange.shape + ' ') + piece.moveRange.n + ' 格');
      const rangeShape = piece.attackRange.shape;
      const rangeText = (rangeShape === '+' ? '十字 ' : rangeShape === 'r' ? '圆形 ' : rangeShape === 'square' ? '方形 ' : rangeShape + ' ') + piece.attackRange.n + ' 格';
      addRow('攻击范围', rangeText);
      addRow('粮草占用', '共用（本方粮草 ' + this.supply[piece.side] + ' / 8）');
      addRow('本回合状态', piece.acted ? '已行动' : '可行动');
      const tHere = this.terrain[piece.y][piece.x];
      const tName = tHere === 'plain' ? '平原' : TERRAIN_NAMES[tHere] || '—';
      const landmark = terrainLabel(piece.x, piece.y);
      let tInfo = tName;
      if (landmark && landmark !== tName) tInfo += '（' + landmark + '）';
      if (terrainDefBonus(tHere)) tInfo += ' · 防御+' + terrainDefBonus(tHere);
      addRow('当前位置', tInfo);
      if (piece.skill) {
        const sk = piece.skill;
        const block = document.createElement('div');
        block.className = 'block';
        const t = document.createElement('div');
        t.className = 'block-title';
        t.textContent = '技能';
        block.appendChild(t);
        const row1 = document.createElement('div');
        row1.className = 'row';
        const l1 = document.createElement('span');
        l1.className = 'label';
        l1.textContent = '名称';
        const v1 = document.createElement('span');
        v1.className = 'value';
        v1.textContent = sk.name || '—';
        row1.appendChild(l1); row1.appendChild(v1);
        block.appendChild(row1);
        const row2 = document.createElement('div');
        row2.className = 'row';
        const l2 = document.createElement('span');
        l2.className = 'label';
        l2.textContent = '类型';
        const v2 = document.createElement('span');
        v2.className = 'value';
        v2.textContent = sk.type || '主动';
        row2.appendChild(l2); row2.appendChild(v2);
        block.appendChild(row2);
        const row3 = document.createElement('div');
        row3.className = 'row';
        const l3 = document.createElement('span');
        l3.className = 'label';
        l3.textContent = '消耗 / 冷却';
        const v3 = document.createElement('span');
        v3.className = 'value';
        v3.textContent = (sk.cost || 0) + ' 粮草 / ' + (sk.cooldown || 0) + ' 回合' + (piece.cd > 0 ? '（剩余 ' + piece.cd + '）' : '');
        row3.appendChild(l3); row3.appendChild(v3);
        block.appendChild(row3);
        if (sk.desc) {
          const desc = document.createElement('div');
          desc.style.marginTop = '6px';
          desc.textContent = sk.desc;
          block.appendChild(desc);
        }
        body.appendChild(block);
      } else {
        addRow('技能', '无');
      }

      modal.classList.remove('hidden');
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
        this._renderBottom();
        return;
      }

      this._clearSelection();
      this._renderBottom();
    },

    _enterMode(mode) {
      if (!this.selected || this.selected.acted) return;
      const actor = this.selected;
      this.mode = mode;
      this.highlighted = [];

      if (mode === 'move') {
        if (this.supply[actor.side] < 1) {
          this.log('粮草不足，无法移动。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        const cells = Range.cellsInRange(actor.moveRange.shape, actor.moveRange.n, actor.x, actor.y, { includeSelf: false });
        this.highlighted = [];
        for (const c of cells) {
          if (this.pieceAt(c.x, c.y)) continue;
          this.highlighted.push({ x: c.x, y: c.y, kind: 'move' });
        }
        if (!this.highlighted.length) {
          this.log('移动范围内没有空位。');
          this.mode = null;
        }
      } else if (mode === 'attack') {
        if (this.supply[actor.side] < 1) {
          this.log('粮草不足，无法攻击。');
          this.mode = null;
          this._renderBottom();
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
          this._renderBottom();
          return;
        }
        if (!actor.skill.filter(actor)) {
          this.log('技能条件未满足（冷却或粮草不足）。');
          this.mode = null;
          this._renderBottom();
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
      this._renderBottom();
    },

    _tryMove(x, y) {
      const hit = this.highlighted.find(h => h.x === x && h.y === y && h.kind === 'move');
      if (!hit) {
        this.mode = null;
        this.highlighted = [];
        this._render();
        this._renderBottom();
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
      this._renderBottom();
    },

    _tryAttack(x, y) {
      const hit = this.highlighted.find(h => h.x === x && h.y === y && h.kind === 'attack');
      if (!hit) {
        this.mode = null;
        this.highlighted = [];
        this._render();
        this._renderBottom();
        return;
      }
      const actor = this.selected;
      const target = this.pieceAt(x, y);
      this.supply[actor.side] -= 1;
      const atkVal = actor.atk + (actor.atkBuff || 0);
      const origDef = target.def;
      target.def = origDef + (target.defBuff || 0) + terrainDefBonus(this.terrain[target.y][target.x]);
      Effect.damage(actor, target, atkVal);
      target.def = origDef;
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
      const cur = this.currentSide;
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
      this._renderBottom();
    },

    pieceAt(x, y) {
      return this.pieces.find(p => p.alive && p.x === x && p.y === y) || null;
    },

    _render() {
      const children = this.boardEl.children;
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        el.classList.remove('move', 'attack', 'skill', 'sel');
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
          const nameSpan = document.createElement('span');
          nameSpan.className = 'p-name';
          nameSpan.textContent = piece.name[0];
          p.appendChild(nameSpan);
          const hpNum = document.createElement('span');
          hpNum.className = 'hp-num';
          hpNum.textContent = piece.hp;
          p.appendChild(hpNum);
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

    _renderBottom() {
      const nameEl = document.querySelector('#selected-info .s-name');
      const statsEl = document.querySelector('#selected-info .s-stats');
      const moveBtn = document.getElementById('btn-move');
      const atkBtn = document.getElementById('btn-attack');
      const skBtn = document.getElementById('btn-skill');
      const detailBtn = document.getElementById('btn-detail');
      const a = this.selected;
      if (!a) {
        nameEl.textContent = '未选择棋子';
        statsEl.textContent = '';
        moveBtn.disabled = atkBtn.disabled = skBtn.disabled = true;
        if (detailBtn) detailBtn.disabled = true;
        return;
      }
      nameEl.textContent = a.name + '（' + (a.side === 'red' ? '红' : '蓝') + '）';
      const parts = [];
      parts.push('生命' + a.hp + '/' + a.maxHp);
      parts.push('攻' + a.atk + (a.atkBuff ? '+' + a.atkBuff : ''));
      parts.push('防' + a.def + (a.defBuff ? '+' + a.defBuff : ''));
      parts.push('移动' + (a.moveRange.shape === 'square' ? '' : a.moveRange.shape) + a.moveRange.n);
      if (a.skill) parts.push('技能' + (a.cd > 0 ? '(' + a.cd + ')' : ''));
      parts.push('本方粮草' + this.supply[a.side]);
      statsEl.textContent = parts.join(' · ');

      const acted = !!a.acted;
      const lowSupply = this.supply[a.side] < 1;
      moveBtn.disabled = !!(acted || lowSupply);
      atkBtn.disabled = !!(acted || lowSupply);
      skBtn.disabled = !!(acted || !a.skill || !a.skill.filter(a));
      if (detailBtn) detailBtn.disabled = false;
    },

    _renderSideList() {
      const render = (side, ulId, supplyId) => {
        const ul = document.getElementById(ulId);
        ul.innerHTML = '';
        const items = this.pieces.filter(p => p.side === side);
        const self = this;
        for (const p of items) {
          const li = document.createElement('li');
          if (!p.alive) li.classList.add('dead');
          else if (p.acted) li.classList.add('acted');
          const nameSpan = document.createElement('span');
          nameSpan.textContent = p.name + ' ' + (p.alive ? p.hp : '亡');
          nameSpan.style.marginRight = '4px';
          li.appendChild(nameSpan);
          const dot = document.createElement('span');
          dot.className = 'chip-info';
          dot.textContent = 'i';
          dot.title = '查看详情';
          dot.addEventListener('click', function (ev) {
            ev.stopPropagation();
            self.openDetail(p);
          });
          li.appendChild(dot);

          li.addEventListener('click', () => {
            if (!p.alive || p.acted) return;
            this.selected = p;
            this.mode = null;
            this.highlighted = [];
            document.getElementById('report-modal').classList.add('hidden');
            this._render();
            this._renderBottom();
          });
          ul.appendChild(li);
        }
        document.getElementById(supplyId).textContent = '粮草 ' + this.supply[side] + '/' + SUPPLY_MAX;
      };
      render('red', 'list-red', 'supply-red');
      render('blue', 'list-blue', 'supply-blue');
    },

    _refreshUi() {
      document.getElementById('turn-info').textContent =
        '回合 ' + this.turn + ' · ' + (this.currentSide === 'red' ? '红方' : '蓝方');
      const sb = document.getElementById('btn-supply');
      if (sb) sb.textContent = '红 ' + this.supply.red + '/8 · 蓝 ' + this.supply.blue + '/8';
      this._render();
      this._renderBottom();

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
  });

  global.Game = Game;
})(window);
