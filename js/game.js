(function (global) {
  const SIZE = Range.BOARD_SIZE;
  const PICKS_PER_SIDE = 5;

  const TERRAIN_NAMES = {
    plain: '',
    m: '林',
    f: '营',
    r: '河',
    w: '城'
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

    // 中央河流（横贯 y=5,6 —— 完全对称）
    for (let x = 1; x < 11; x++) {
      if (x !== 5 && x !== 6) set(x, 6, 'r');
      if (x !== 5 && x !== 6) set(x, 5, 'r');
    }
    // 河流中央的两处渡口（保留平地，让中段有通道）
    set(5, 5, 'plain'); set(6, 5, 'plain');
    set(5, 6, 'plain'); set(6, 6, 'plain');

    // 山丘林地：上半区（3,4）与下半区（7,8）完全对称
    // 左中林
    [[2,3],[2,4],[3,3],[3,4]].forEach(p => set(p[0], p[1], 'm'));
    [[2,7],[2,8],[3,7],[3,8]].forEach(p => set(p[0], p[1], 'm'));
    // 右中林
    [[8,3],[8,4],[9,3],[9,4]].forEach(p => set(p[0], p[1], 'm'));
    [[8,7],[8,8],[9,7],[9,8]].forEach(p => set(p[0], p[1], 'm'));
    // 散丘
    [[5,3],[6,3]].forEach(p => set(p[0], p[1], 'm'));
    [[5,8],[6,8]].forEach(p => set(p[0], p[1], 'm'));

    // 城池（战略要点，对称分布）
    [[0,0],[11,0],[0,11],[11,11]].forEach(p => set(p[0], p[1], 'w')); // 四角
    [[5,2],[6,2],[5,9],[6,9]].forEach(p => set(p[0], p[1], 'w'));     // 双方中场
    [[0,5],[11,5],[0,6],[11,6]].forEach(p => set(p[0], p[1], 'w'));     // 东西桥头

    // 前哨营地（对称小型增益点）
    [[4,1],[7,1],[4,10],[7,10]].forEach(p => set(p[0], p[1], 'f'));

    return map;
  }

  function terrainLabel(x, y) {
    return '';
  }

  function terrainDefBonus(t) {
    if (t === 'm') return 10;
    if (t === 'w') return 15;
    if (t === 'f') return 5;
    return 0;
  }

  // 对称部署坐标：按挑选顺序排列（第1个选→位置1）
  // 蓝方在上方（行0、行1），红方在下方（行11、行10），同列镜像
  const DEPLOY_ORDER = [
    [5, 0], // 蓝方第1选 · 中心后位
    [6, 0], // 蓝方第2选
    [4, 0], // 蓝方第3选
    [7, 0], // 蓝方第4选
    [3, 0], // 蓝方第5选
    [8, 0], // 蓝方第6选
    [5, 1], // 蓝方第7选 · 前排
    [6, 1], // 蓝方第8选
    [4, 1], // 蓝方第9选
    [7, 1], // 蓝方第10选
  ];

  function deployPositionFor(side, index) {
    const [x, y] = DEPLOY_ORDER[index] || [index, side === 'blue' ? 0 : SIZE - 1];
    if (side === 'red') return { x, y: SIZE - 1 - y };
    return { x, y };
  }

  const Game = {
    boardEl: null,
    phase: 'draft', // draft | deploy | battle
    turn: 1,
    currentSide: 'red',
    draftIndex: 0,
    deploySide: 'red',
    pickedRed: [],
    pickedBlue: [],
    pieces: [],
    terrain: null,
    selected: null,        // battle 阶段选中的己方阵中棋子
    deploySelected: null,  // deploy 阶段选中的待布阵武将
    mode: null,
    highlighted: [],
    awaitingCell: null,
    over: false,
    aiMode: false,         // 是否人机对战
    aiSide: 'blue',        // AI 控制的一方

    log(text, cls) {
      const box = document.getElementById('log');
      const p = document.createElement('p');
      if (cls) p.className = cls;
      p.textContent = text;
      box.appendChild(p);
      box.scrollTop = box.scrollHeight;
      while (box.children.length > 200) box.removeChild(box.firstChild);
    },

    init(mode) {
      this.boardEl = document.getElementById('board');
      this.terrain = buildTerrain();
      this.pieces = [];
      this.turn = 1;
      this.currentSide = 'red';
      this.draftIndex = 0;
      this.pickedRed = [];
      this.pickedBlue = [];
      this.selected = null;
      this.mode = null;
      this.highlighted = [];
      this.over = false;
      this.aiMode = (mode === 'ai');
      this.aiSide = 'blue';
      this.phase = 'draft';
      this._buildDom();
      this._bind();
      this._highlightDeployZones();
      this._refreshUi();
      const effectivePicks = Math.min(PICKS_PER_SIDE, Math.floor(Generals.list.length / 2));
      this.log('选将开始：双方轮流挑选武将，每方 ' + effectivePicks + ' 人。', 'turn');
      if (this.aiMode) {
        this.log('人机对战：你执红，AI 执蓝。', 'turn');
      }
      this.log('红方先选。', 'turn');
      this._maybeAiAct();
    },

    goHome() {
      document.getElementById('banner').classList.add('hidden');
      document.getElementById('report-modal').classList.add('hidden');
      document.getElementById('detail-modal').classList.add('hidden');
      document.getElementById('app').classList.add('hidden');
      document.getElementById('home-screen').classList.remove('hidden');
      document.getElementById('log').innerHTML = '';
    },

    startGame(mode) {
      document.getElementById('home-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      this.init(mode);
    },

    _highlightDeployZones(side) {
      // side: 'red' 高亮红方半场；'blue' 高亮蓝方；null 清除所有
      const children = this.boardEl.children;
      this._clearDeployZones();
      if (!side) return;
      const half = Math.floor(SIZE / 2);
      const yStart = side === 'red' ? half : 0;
      const yEnd = side === 'red' ? SIZE : half;
      for (let y = yStart; y < yEnd; y++) {
        for (let x = 0; x < SIZE; x++) {
          const idx = y * SIZE + x;
          if (children[idx]) children[idx].classList.add(side === 'red' ? 'zone-red' : 'zone-blue');
        }
      }
    },

    _clearDeployZones() {
      const children = this.boardEl.children;
      for (let i = 0; i < children.length; i++) {
        children[i].classList.remove('zone-red', 'zone-blue');
      }
    },

    _pickGeneral(generalDef) {
      if (this.phase !== 'draft') return;
      if (this.pickedRed.find(g => g.id === generalDef.id) ||
          this.pickedBlue.find(g => g.id === generalDef.id)) {
        this.log(generalDef.name + ' 已被选走。');
        return;
      }
      const side = this.draftIndex % 2 === 0 ? 'red' : 'blue';
      if (side === 'red') this.pickedRed.push(generalDef);
      else this.pickedBlue.push(generalDef);
      this.log((side === 'red' ? '红' : '蓝') + '方选走 ' + generalDef.name + '。');
      this.draftIndex += 1;

      const maxPerSide = Math.floor(Generals.list.length / 2);
      const effective = Math.min(PICKS_PER_SIDE, maxPerSide);
      if (this.pickedRed.length >= effective && this.pickedBlue.length >= effective) {
        this._startDeploy();
        return;
      }

      const need = this.draftIndex % 2 === 0 ? 'red' : 'blue';
      const sideFull = (need === 'red' ? this.pickedRed : this.pickedBlue).length >= effective;
      if (sideFull) {
        this.draftIndex += 1;
        if (this.pickedRed.length >= effective && this.pickedBlue.length >= effective) {
          this._startDeploy();
          return;
        }
      }
      this._refreshUi();
      this._maybeAiAct();
    },

    _startDeploy() {
      this.phase = 'deploy';
      this.deploySide = 'red';
      this.deploySelected = null;
      this.highlighted = [];
      this._highlightDeployZones('red');
      this.log('布阵开始：红方先将武将放到己方（底部）半场。', 'turn');
      this._renderDraftCards();
      this._refreshUi();
      this._maybeAiAct();
    },

    _switchDeploySide() {
      if (this.deploySide === 'red') {
        this.deploySide = 'blue';
        this.log('红方布阵完成，蓝方开始布阵。', 'turn');
      } else {
        this._startBattle();
        return;
      }
      this.deploySelected = null;
      this.highlighted = [];
      this._highlightDeployZones(this.deploySide);
      this._renderDraftCards();
      this._refreshUi();
      this._maybeAiAct();
    },

    _startBattle() {
      this.phase = 'battle';
      this._clearDeployZones();
      this.turn = 1;
      this.currentSide = 'red';
      this.selected = null;
      this.mode = null;
      this.highlighted = [];
      this.log('阵容已就位。战斗开始，红方先动。', 'turn');
      this._renderDraftCards();
      this._refreshUi();
      this._maybeAiAct();
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
          if (t && TERRAIN_NAMES[t]) {
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
        this.init(this.aiMode ? 'ai' : 'local');
      };
      document.getElementById('btn-home').onclick = () => this.goHome();
      document.getElementById('btn-local').onclick = () => this.startGame('local');
      document.getElementById('btn-ai').onclick = () => this.startGame('ai');
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
      function rangeText(r) {
        const map = { '+': '十字 ', 'r': '圆形 ', 'square': '方形 ', 'x': '斜角 ' };
        return (map[r.shape] || r.shape + ' ') + r.n + ' 格';
      }
      addRow('移动范围', rangeText(piece.moveRange));
      addRow('攻击范围', rangeText(piece.attackRange));
      if (this.phase === 'battle') {
        const state = [];
        if (piece.moved) state.push('已移动');
        if (piece.attacked) state.push('已攻击');
        addRow('本回合状态', state.length ? state.join(' / ') : '可行动');
        const tHere = this.terrain[piece.y][piece.x];
        const tName = tHere === 'plain' ? '平原' : TERRAIN_NAMES[tHere] || '—';
        let tInfo = tName;
        if (terrainDefBonus(tHere)) tInfo += ' · 防御+' + terrainDefBonus(tHere);
        addRow('当前位置', tInfo);
      }
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
        l2.textContent = '冷却';
        const v2 = document.createElement('span');
        v2.className = 'value';
        v2.textContent = (sk.cooldown || 0) + ' 回合' + (piece.cd > 0 ? '（剩余 ' + piece.cd + '）' : '');
        row2.appendChild(l2); row2.appendChild(v2);
        block.appendChild(row2);
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

      // 选将阶段提供“选走此将”按钮
      if (this.phase === 'draft') {
        const btn = document.createElement('button');
        btn.className = 'act-btn';
        btn.style.marginTop = '12px';
        const side = this.draftIndex % 2 === 0 ? '红' : '蓝';
        const alreadyTaken = this.pickedRed.find(g => g.id === piece.id) ||
                             this.pickedBlue.find(g => g.id === piece.id);
        if (alreadyTaken) {
          btn.textContent = '已被选走';
          btn.disabled = true;
        } else {
          btn.textContent = side + '方 · 选择 ' + piece.name;
          btn.onclick = () => {
            document.getElementById('detail-modal').classList.add('hidden');
            this._pickGeneral(piece);
          };
        }
        body.appendChild(btn);
      }

      modal.classList.remove('hidden');
    },

    _onCellClick(x, y) {
      if (this.phase === 'draft') {
        // 选将阶段：点击棋盘不操作；武将通过详情弹窗或武将卡选择
        return;
      }
      if (this.phase === 'deploy') {
        this._tryPlacePiece(x, y);
        return;
      }
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

      if (target && target.alive && target.side === this.currentSide && !(target.moved && target.attacked)) {
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

    _selectForDeploy(generalDef) {
      if (this.phase !== 'deploy') return;
      const picked = this.deploySide === 'red' ? this.pickedRed : this.pickedBlue;
      if (!picked.find(g => g.id === generalDef.id)) return;
      if (this.pieces.find(p => p.generalId === generalDef.id && p.side === this.deploySide)) {
        this.log(generalDef.name + ' 已经布置好了。');
        return;
      }
      this.deploySelected = generalDef;
      this._highlightDeployZones(this.deploySide);
      this.highlighted = [];
      const half = Math.floor(SIZE / 2);
      const yStart = this.deploySide === 'red' ? half : 0;
      const yEnd = this.deploySide === 'red' ? SIZE : half;
      for (let y = yStart; y < yEnd; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (!this.pieceAt(x, y)) {
            this.highlighted.push({ x, y, kind: 'skill' });
          }
        }
      }
      this.log('选中【' + generalDef.name + '】' + ' · 点击 ' + (this.deploySide === 'red' ? '底部' : '顶部') + ' 半场空格放置。');
      this._render();
      this._renderBottom();
    },

    _tryPlacePiece(x, y) {
      if (!this.deploySelected) {
        this.log('请先点击下方武将卡选择要布阵的将领。');
        return;
      }
      const half = Math.floor(SIZE / 2);
      const inRed = y >= half;
      const inBlue = y < half;
      if (this.deploySide === 'red' && !inRed) {
        this.log('只能在底部（己方）半场布阵。');
        return;
      }
      if (this.deploySide === 'blue' && !inBlue) {
        this.log('只能在顶部（己方）半场布阵。');
        return;
      }
      if (this.pieceAt(x, y)) {
        this.log('该位置已有棋子。');
        return;
      }
      const piece = Generals.buildPiece(this.deploySelected, this.deploySide, x, y);
      piece.generalId = this.deploySelected.id;
      this.pieces.push(piece);
      this.log((this.deploySide === 'red' ? '红方' : '蓝方') + ' ' + this.deploySelected.name + ' 部署到 (' + x + ',' + y + ')。');
      this.deploySelected = null;
      this.highlighted = [];

      // 检查当前方是否全布完
      const picked = this.deploySide === 'red' ? this.pickedRed : this.pickedBlue;
      const placed = this.pieces.filter(p => p.side === this.deploySide);
      if (placed.length >= picked.length) {
        this._switchDeploySide();
        return;
      }
      this._render();
      this._renderDraftCards();
      this._renderBottom();
    },

    _enterMode(mode) {
      if (this.phase !== 'battle') return;
      if (!this.selected || (this.selected.moved && this.selected.attacked)) return;
      const actor = this.selected;
      this.mode = mode;
      this.highlighted = [];

      if (mode === 'move') {
        if (actor.moved) {
          this.log('本回合已移动。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        const cells = Range.cellsInRangeWithBlock(actor.moveRange.shape, actor.moveRange.n, actor.x, actor.y, {
          pieceAt: (x, y) => this.pieceAt(x, y)
        });
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
        if (actor.attacked) {
          this.log('本回合已攻击。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        const cells = Range.cellsInRangeWithBlock(actor.attackRange.shape, actor.attackRange.n, actor.x, actor.y, {
          pieceAt: (x, y) => {
            const p = this.pieceAt(x, y);
            return p && p.alive ? p : null;
          }
        });
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
        if (actor.attacked) {
          this.log('本回合已行动，无法再使用技能。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        if (!actor.skill) {
          this.log('该武将没有主动技能。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        if (!actor.skill.filter(actor)) {
          this.log('技能条件未满足（冷却中）。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        if (actor.skill.cooldown) actor.cd = actor.skill.cooldown;
        this.log(actor.name + ' 发动技能：' + actor.skill.name);
        const promise = actor.skill.content(actor);
        this.mode = null;
        Promise.resolve(promise).then(() => {
          this._finishActorAction('skill');
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
      actor.x = x;
      actor.y = y;
      actor.moved = true;
      this.log(actor.name + ' 移动到 (' + x + ',' + y + ')。');
      this.mode = null;
      this.highlighted = [];
      if (actor.attacked) {
        this._finishActorAction();
      } else {
        this._render();
        this._renderBottom();
      }
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
      actor.attacked = true;
      const atkVal = actor.atk + (actor.atkBuff || 0);
      const origDef = target.def;
      target.def = origDef + (target.defBuff || 0) + terrainDefBonus(this.terrain[target.y][target.x]);
      Effect.damage(actor, target, atkVal);
      target.def = origDef;
      this._finishActorAction();
    },

    _finishActorAction() {
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
      if (this.currentSide === 'red') {
        this.currentSide = 'blue';
        this.pieces.forEach(p => { if (p.side === 'blue') { p.moved = false; p.attacked = false; } });
        this.pieces.forEach(p => { if (p.side === 'blue' && p.cd > 0) p.cd -= 1; });
        this.log('回合 ' + this.turn + ' · 蓝方行动。', 'turn');
      } else {
        this.currentSide = 'red';
        this.turn += 1;
        this.pieces.forEach(p => { if (p.side === 'red') { p.moved = false; p.attacked = false; } });
        this.pieces.forEach(p => { if (p.side === 'red' && p.cd > 0) p.cd -= 1; });
        this.log('回合 ' + this.turn + ' · 红方行动。', 'turn');
      }
      this._clearSelection();
      this._refreshUi();
      this._maybeAiAct();
    },

    requestCell(actor, options, cb) {
      const range = options.range || { shape: 'square', n: 3 };
      const cells = Range.cellsInRangeWithBlock(range.shape, range.n, actor.x, actor.y, {
        pieceAt: (x, y) => {
          const p = this.pieceAt(x, y);
          if (!p || !p.alive) return null;
          if (options.passThrough) return null;
          return p;
        },
        includeSelf: !options.mustEmpty
      });
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
          const done = piece.moved && piece.attacked;
          p.className = 'piece ' + piece.side + (done ? ' acted' : '');
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
      const endBtn = document.getElementById('btn-end');

      if (this.phase === 'draft') {
        const side = this.draftIndex % 2 === 0 ? '红' : '蓝';
        const effective = Math.min(PICKS_PER_SIDE, Math.floor(Generals.list.length / 2));
        nameEl.textContent = '选将阶段 · 第 ' + (this.draftIndex + 1) + ' 选 · 轮到' + side + '方';
        statsEl.textContent = '已选：红 ' + this.pickedRed.length + ' / 蓝 ' + this.pickedBlue.length + '（每方 ' + effective + ' 人）· 点击下方武将卡选择';
        moveBtn.disabled = true;
        atkBtn.disabled = true;
        skBtn.disabled = true;
        if (detailBtn) detailBtn.disabled = true;
        endBtn.style.display = 'none';
        return;
      }
      endBtn.style.display = '';

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
      const moveShapeMap = { '+': '十字', 'r': '圆', 'square': '方', 'x': '斜' };
      parts.push('移动' + moveShapeMap[a.moveRange.shape] + a.moveRange.n);
      if (a.skill) parts.push('技能' + (a.cd > 0 ? '(' + a.cd + ')' : ''));
      const stateParts = [];
      if (a.moved) stateParts.push('已移动');
      if (a.attacked) stateParts.push('已攻击');
      parts.push(stateParts.length ? stateParts.join('/') : '可行动');
      statsEl.textContent = parts.join(' · ');

      moveBtn.disabled = !!a.moved;
      atkBtn.disabled = !!a.attacked;
      skBtn.disabled = !!(a.attacked || !a.skill || !a.skill.filter(a));
      if (detailBtn) detailBtn.disabled = false;
    },

    _renderSideList() {
      const render = (side, ulId) => {
        const ul = document.getElementById(ulId);
        ul.innerHTML = '';
        const items = this.phase === 'draft'
          ? (side === 'red' ? this.pickedRed : this.pickedBlue).map(def => Generals.buildPiece(def, side, -1, -1))
          : this.pieces.filter(p => p.side === side);
        const self = this;
        for (const p of items) {
          const li = document.createElement('li');
          if (this.phase === 'battle') {
            if (!p.alive) li.classList.add('dead');
            else if (p.moved && p.attacked) li.classList.add('acted');
          }
          const nameSpan = document.createElement('span');
          let txt = p.name;
          if (this.phase === 'battle') txt += ' ' + (p.alive ? p.hp : '亡');
          if (this.phase === 'battle' && (p.moved || p.attacked)) {
            txt += ' [' + (p.moved ? '移' : '') + (p.attacked ? '攻' : '') + ']';
          }
          nameSpan.textContent = txt;
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

          if (this.phase === 'battle') {
            li.addEventListener('click', () => {
              if (!p.alive || (p.moved && p.attacked)) return;
              this.selected = p;
              this.mode = null;
              this.highlighted = [];
              document.getElementById('report-modal').classList.add('hidden');
              this._render();
              this._renderBottom();
            });
          }
          ul.appendChild(li);
        }
      };
      render('red', 'list-red');
      render('blue', 'list-blue');

      // 选将阶段：展示可选择的武将列表（战报浮窗中）
      const draftBlock = document.getElementById('draft-pool');
      if (this.phase === 'draft' && draftBlock) {
        draftBlock.style.display = 'block';
        draftBlock.innerHTML = '';
        const title = document.createElement('div');
        const side = this.draftIndex % 2 === 0 ? '红' : '蓝';
        title.className = 'block-title';
        title.textContent = '武将池 · 轮到 ' + side + '方 选择';
        draftBlock.appendChild(title);
        const pool = Generals.list.filter(g =>
          !this.pickedRed.find(p => p.id === g.id) &&
          !this.pickedBlue.find(p => p.id === g.id)
        );
        const self = this;
        for (const g of pool) {
          const row = document.createElement('div');
          row.className = 'row draft-row';
          row.style.padding = '4px 0';
          row.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
          const left = document.createElement('span');
          left.className = 'label';
          left.textContent = g.name;
          const right = document.createElement('span');
          right.className = 'value';
          right.textContent = '血' + g.hp + ' / 攻' + g.atk + ' / 防' + g.def + (g.skill ? ' · 技能：' + g.skill.name : '');
          row.appendChild(left);
          row.appendChild(right);
          row.addEventListener('click', () => {
            document.getElementById('report-modal').classList.add('hidden');
            self._pickGeneral(g);
          });
          draftBlock.appendChild(row);
        }
      } else if (draftBlock) {
        draftBlock.style.display = 'none';
      }
    },

    _renderDraftCards() {
      const panel = document.getElementById('draft-panel');
      const cards = document.getElementById('draft-cards');
      const status = document.getElementById('draft-status');
      if (!panel || !cards) return;

      const shapeText = function (shape) {
        if (shape === '+') return '十字';
        if (shape === 'x') return '斜角';
        if (shape === 'r') return '圆形';
        if (shape === 'square') return '方形';
        return shape;
      };

      // 顶部：双方已选清单
      const summary = document.getElementById('draft-summary');
      if (summary) {
        let redNames = this.pickedRed.map(g => g.name).join(' · ');
        let blueNames = this.pickedBlue.map(g => g.name).join(' · ');
        const redLine = '红方（' + this.pickedRed.length + '）：' + (redNames || '—');
        const blueLine = '蓝方（' + this.pickedBlue.length + '）：' + (blueNames || '—');
        summary.innerHTML = '<span style="color:#b23a3a;font-weight:700;">' + redLine + '</span>' +
          '<span style="margin:0 8px;">|</span>' +
          '<span style="color:#3a6bb2;font-weight:700;">' + blueLine + '</span>';
      }

      if (this.phase === 'draft') {
        panel.style.display = 'block';
        const side = this.draftIndex % 2 === 0 ? 'red' : 'blue';
        status.innerHTML = '选将 · 第 ' + (this.draftIndex + 1) + ' 选 · <b>' + (side === 'red' ? '红' : '蓝') + '方</b> · 点击武将卡挑选';
        cards.innerHTML = '';
        const pool = Generals.list.filter(g =>
          !this.pickedRed.find(p => p.id === g.id) &&
          !this.pickedBlue.find(p => p.id === g.id)
        );
        const self = this;
        for (const g of pool) {
          const card = document.createElement('div');
          card.className = 'draft-card';
          const head = document.createElement('div');
          head.className = 'draft-card-head';
          head.textContent = g.name;
          const body = document.createElement('div');
          body.className = 'draft-card-body';
          body.innerHTML = '生命 ' + g.hp + ' · 攻 ' + g.atk + ' · 防 ' + g.def +
            '<br/>移动：' + shapeText(g.moveRange.shape) + ' ' + g.moveRange.n + ' · 攻击：' + shapeText(g.attackRange.shape) + ' ' + g.attackRange.n +
            (g.skill ? '<br/>技能：' + g.skill.name : '');
          card.appendChild(head);
          card.appendChild(body);
          card.addEventListener('click', () => self._pickGeneral(g));
          cards.appendChild(card);
        }
        return;
      }

      if (this.phase === 'deploy') {
        panel.style.display = 'block';
        const side = this.deploySide;
        const picked = side === 'red' ? this.pickedRed : this.pickedBlue;
        const placedIds = this.pieces.filter(p => p.side === side).map(p => p.generalId);
        const pending = picked.filter(g => !placedIds.includes(g.id));
        let tip = '';
        if (this.deploySelected) tip = ' · 已选中【' + this.deploySelected.name + '】，点棋盘空格放置';
        status.innerHTML = '布阵 · <b>' + (side === 'red' ? '红' : '蓝') + '方</b> · 剩余 ' + pending.length + ' 将' + tip;
        cards.innerHTML = '';
        const self = this;
        for (const g of pending) {
          const card = document.createElement('div');
          card.className = 'draft-card';
          if (this.deploySelected && this.deploySelected.id === g.id) card.classList.add('selected');
          const head = document.createElement('div');
          head.className = 'draft-card-head';
          head.textContent = g.name + (this.deploySelected && this.deploySelected.id === g.id ? ' ★' : '');
          const body = document.createElement('div');
          body.className = 'draft-card-body';
          body.innerHTML = '生命 ' + g.hp + ' · 攻 ' + g.atk + ' · 防 ' + g.def +
            '<br/>移动：' + shapeText(g.moveRange.shape) + ' ' + g.moveRange.n + ' · 攻击：' + shapeText(g.attackRange.shape) + ' ' + g.attackRange.n +
            (g.skill ? '<br/>技能：' + g.skill.name : '');
          card.appendChild(head);
          card.appendChild(body);
          card.addEventListener('click', () => self._selectForDeploy(g));
          cards.appendChild(card);
        }
        const placed = picked.filter(g => placedIds.includes(g.id));
        if (placed.length) {
          const label = document.createElement('div');
          label.className = 'draft-hint';
          label.style.marginTop = '8px';
          label.style.fontSize = '11px';
          label.style.color = '#6b6b6b';
          label.textContent = '已布阵：' + placed.map(g => g.name).join(' · ');
          cards.appendChild(label);
        }
        return;
      }

      panel.style.display = 'none';
      if (summary) summary.innerHTML = '';
    },

    _refreshUi() {
      const el = document.getElementById('turn-info');
      if (this.phase === 'draft') {
        el.textContent = '选将阶段 · 第 ' + (this.draftIndex + 1) + ' 选 · ' + (this.draftIndex % 2 === 0 ? '红' : '蓝') + '方';
      } else if (this.phase === 'deploy') {
        const side = this.deploySide;
        const picked = side === 'red' ? this.pickedRed : this.pickedBlue;
        const placed = this.pieces.filter(p => p.side === side).length;
        el.textContent = '布阵阶段 · ' + (side === 'red' ? '红' : '蓝') + '方 · ' + placed + ' / ' + picked.length;
      } else {
        el.textContent = '回合 ' + this.turn + ' · ' + (this.currentSide === 'red' ? '红方' : '蓝方');
      }
      this._renderDraftCards();
      this._render();
      this._renderBottom();
    },

    _maybeAiAct() {
      if (!this.aiMode || this.over) return;
      let aiShouldAct = false;
      if (this.phase === 'draft') {
        const side = this.draftIndex % 2 === 0 ? 'red' : 'blue';
        if (side === this.aiSide) aiShouldAct = true;
      } else if (this.phase === 'deploy') {
        if (this.deploySide === this.aiSide) aiShouldAct = true;
      } else if (this.phase === 'battle') {
        if (this.currentSide === this.aiSide) aiShouldAct = true;
      }
      if (!aiShouldAct) return;
      const self = this;
      setTimeout(() => self._aiStep(), 700);
    },

    _aiStep() {
      if (this.over) return;
      if (this.phase === 'draft') this._aiPickGeneral();
      else if (this.phase === 'deploy') this._aiPlaceOne();
      else if (this.phase === 'battle') this._aiBattleStep();
    },

    _aiPickGeneral() {
      const pool = Generals.list.filter(g =>
        !this.pickedRed.find(p => p.id === g.id) &&
        !this.pickedBlue.find(p => p.id === g.id)
      );
      if (!pool.length) return;
      // 按综合数值（hp+atk+def+moveRange.n*5）排序，选前三中随机一个，保留变化
      const scored = pool.map(g => ({
        g,
        score: g.hp * 0.5 + g.atk * 2 + g.def * 1.2 + g.moveRange.n * 8 +
          (g.skill ? 20 : 0)
      }));
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, Math.min(3, scored.length));
      const pick = top[Math.floor(Math.random() * top.length)];
      this._pickGeneral(pick.g);
    },

    _aiPlaceOne() {
      const side = this.deploySide;
      const picked = side === 'red' ? this.pickedRed : this.pickedBlue;
      const placedIds = this.pieces.filter(p => p.side === side).map(p => p.generalId);
      const pending = picked.filter(g => !placedIds.includes(g.id));
      if (!pending.length) {
        this._switchDeploySide();
        return;
      }
      // 选一个尚未布置的武将（按列表顺序）
      const gDef = pending[0];
      // 找己方半场的空位：高数值武将尽量靠前（靠近中线），低数值靠后
      const half = Math.floor(SIZE / 2);
      const yStart = side === 'red' ? half : 0;
      const yEnd = side === 'red' ? SIZE : half;
      const empty = [];
      for (let y = yStart; y < yEnd; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
          if (!this.pieceAt(x, y)) empty.push({ x, y });
        }
      }
      if (!empty.length) return;
      // 进攻型（高 atk/move）靠前，其它中间
      const offensive = gDef.atk >= 60 || gDef.moveRange.n >= 4;
      empty.sort((a, b) => {
        const da = side === 'red' ? (SIZE - 1 - a.y) : a.y;
        const db = side === 'red' ? (SIZE - 1 - b.y) : b.y;
        return offensive ? da - db : db - da;
      });
      const spot = empty[0];
      // 模拟：选中 + 放置
      this.deploySelected = gDef;
      this._tryPlacePiece(spot.x, spot.y);
      // 放完后继续排队下一个
      if (!this.over && this.phase === 'deploy' && this.deploySide === this.aiSide) {
        const self = this;
        setTimeout(() => self._aiStep(), 500);
      }
    },

    _aiBattleStep() {
      const side = this.currentSide;
      const myAlive = this.pieces.filter(p => p.side === side && p.alive);
      // 每个未完成行动的棋子依次行动
      const cand = myAlive.find(p => !(p.moved && p.attacked));
      if (!cand) {
        // 所有人都已行动，自动结束回合
        this.endTurn();
        return;
      }
      const actor = cand;
      // 1) 尝试攻击当前攻击范围内的敌人
      if (!actor.attacked) {
        const atkCells = Range.cellsInRangeWithBlock(actor.attackRange.shape, actor.attackRange.n, actor.x, actor.y, {
          pieceAt: (x, y) => {
            const p = this.pieceAt(x, y);
            if (!p || !p.alive) return null;
            return p;
          }
        });
        const target = atkCells
          .map(c => this.pieceAt(c.x, c.y))
          .find(p => p && p.alive && p.side !== side);
        if (target) {
          this._executeAttack(actor, target);
          this._scheduleNext();
          return;
        }
      }
      // 2) 否则移动：朝最近敌人移动
      if (!actor.moved) {
        const moveCells = Range.cellsInRangeWithBlock(actor.moveRange.shape, actor.moveRange.n, actor.x, actor.y, {
          pieceAt: (x, y) => {
            const p = this.pieceAt(x, y);
            if (!p || !p.alive) return null;
            return p;
          }
        });
        const enemies = this.pieces.filter(p => p.side !== side && p.alive);
        if (!enemies.length) { this._scheduleNext(); return; }
        // 找一个最近的敌人作为目标
        enemies.sort((a, b) => {
          const da = Math.abs(a.x - actor.x) + Math.abs(a.y - actor.y);
          const db = Math.abs(b.x - actor.x) + Math.abs(b.y - actor.y);
          return da - db;
        });
        const nearest = enemies[0];
        // 在可移动的空格中，选离 nearest 最近的一格
        const emptyMoves = moveCells.filter(c => !this.pieceAt(c.x, c.y));
        if (emptyMoves.length) {
          emptyMoves.sort((a, b) => {
            const da = Math.abs(a.x - nearest.x) + Math.abs(a.y - nearest.y);
            const db = Math.abs(b.x - nearest.x) + Math.abs(b.y - nearest.y);
            return da - db;
          });
          const target = emptyMoves[0];
          this._executeMove(actor, target.x, target.y);
          // 移动后再尝试攻击一次
          const self = this;
          setTimeout(() => {
            if (self.over) return;
            if (!actor.alive || actor.attacked) {
              self._scheduleNext();
              return;
            }
            const atkCells2 = Range.cellsInRangeWithBlock(actor.attackRange.shape, actor.attackRange.n, actor.x, actor.y, {
              pieceAt: (x, y) => {
                const p = self.pieceAt(x, y);
                if (!p || !p.alive) return null;
                return p;
              }
            });
            const tgt = atkCells2
              .map(c => self.pieceAt(c.x, c.y))
              .find(p => p && p.alive && p.side !== side);
            if (tgt) {
              self._executeAttack(actor, tgt);
            } else {
              // 没敌人则标记攻击已用（以免死循环）
              actor.attacked = true;
            }
            self._scheduleNext();
          }, 500);
          return;
        }
      }
      // 不能移动也不能攻击，标记完成这枚棋子
      actor.moved = true;
      actor.attacked = true;
      this._render();
      this._renderBottom();
      this._scheduleNext();
    },

    _scheduleNext() {
      const self = this;
      setTimeout(() => self._aiStep(), 500);
    },

    _executeMove(actor, x, y) {
      if (actor.side !== this.currentSide || actor.moved) return false;
      if (this.pieceAt(x, y)) return false;
      const cells = Range.cellsInRangeWithBlock(actor.moveRange.shape, actor.moveRange.n, actor.x, actor.y, {
        pieceAt: (px, py) => {
          const p = this.pieceAt(px, py);
          if (!p || !p.alive) return null;
          return p;
        }
      });
      if (!cells.find(c => c.x === x && c.y === y)) return false;
      actor.x = x;
      actor.y = y;
      actor.moved = true;
      this.log(actor.name + ' 移动到 (' + x + ',' + y + ')。');
      this.highlighted = [];
      this.mode = null;
      this._render();
      this._renderBottom();
      return true;
    },

    _executeAttack(actor, target) {
      if (actor.side !== this.currentSide || actor.attacked) return false;
      if (!target || !target.alive) return false;
      const cells = Range.cellsInRangeWithBlock(actor.attackRange.shape, actor.attackRange.n, actor.x, actor.y, {
        pieceAt: (px, py) => {
          const p = this.pieceAt(px, py);
          if (!p || !p.alive) return null;
          return p;
        }
      });
      if (!cells.find(c => c.x === target.x && c.y === target.y)) return false;
      const tBonus = terrainDefBonus(this.terrain[target.y][target.x]) || 0;
      const defVal = target.def + target.defBuff + tBonus;
      let dmg = Math.max(5, actor.atk + actor.atkBuff - defVal);
      target.hp -= dmg;
      this.log(actor.name + ' 攻击 ' + target.name + '，造成 ' + dmg + ' 伤害。');
      actor.attacked = true;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        this.log(target.name + ' 阵亡！', 'turn');
        this._checkWin();
      }
      this.highlighted = [];
      this.mode = null;
      this._render();
      this._renderBottom();
      return true;
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    // 页面加载时显示主页；点击「本机对战 / 人机对战」后再调用 init
    const home = document.getElementById('home-screen');
    const app = document.getElementById('app');
    if (home) home.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    // 主页按钮：提前绑定，无需先 init 游戏
    const localBtn = document.getElementById('btn-local');
    const aiBtn = document.getElementById('btn-ai');
    const homeBtn = document.getElementById('btn-home');
    if (localBtn) localBtn.addEventListener('click', () => Game.startGame('local'));
    if (aiBtn) aiBtn.addEventListener('click', () => Game.startGame('ai'));
    if (homeBtn) homeBtn.addEventListener('click', () => Game.goHome());
  });

  global.Game = Game;
})(window);
