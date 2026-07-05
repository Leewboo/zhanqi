(function (global) {
  const SIZE = Range.BOARD_SIZE;
  const DEFAULT_PICKS = 5;
  let PICKS_PER_SIDE = DEFAULT_PICKS;
  const DEFAULT_CELL_SIZE = 48;
  const DEFAULT_DRAFT_POOL_SIZE = 12;

  // 游戏设置（从 localStorage 读取）
  const GameSettings = {
    picksPerSide: DEFAULT_PICKS,
    gameMode: 'local', // local | ai
    aiSide: 'blue',    // AI 控制的阵营：'blue'（玩家先手）| 'red'（AI先手）
    cellSize: DEFAULT_CELL_SIZE,       // 棋盘格子大小（px）
    draftPoolSize: DEFAULT_DRAFT_POOL_SIZE, // 选将阶段最多显示武将数（0 = 全部）
    showPortraitInDraft: true,         // 选将时显示立绘

    load() {
      try {
        const saved = localStorage.getItem('zhanqi_settings');
        if (saved) {
          const obj = JSON.parse(saved);
          if (obj.picksPerSide) this.picksPerSide = parseInt(obj.picksPerSide) || DEFAULT_PICKS;
          if (obj.gameMode) this.gameMode = obj.gameMode;
          if (obj.aiSide) this.aiSide = obj.aiSide;
          if (obj.cellSize) this.cellSize = Math.max(32, Math.min(80, parseInt(obj.cellSize) || DEFAULT_CELL_SIZE));
          if (typeof obj.draftPoolSize !== 'undefined') this.draftPoolSize = Math.max(0, Math.min(40, parseInt(obj.draftPoolSize) || 0));
          if (typeof obj.showPortraitInDraft !== 'undefined') this.showPortraitInDraft = obj.showPortraitInDraft === true;
        }
      } catch (e) {}
      PICKS_PER_SIDE = this.picksPerSide;
      this._applyCellSize();
    },

    save() {
      try {
        localStorage.setItem('zhanqi_settings', JSON.stringify({
          picksPerSide: this.picksPerSide,
          gameMode: this.gameMode,
          aiSide: this.aiSide,
          cellSize: this.cellSize,
          draftPoolSize: this.draftPoolSize,
          showPortraitInDraft: this.showPortraitInDraft
        }));
      } catch (e) {}
    },

    _applyCellSize() {
      try {
        document.documentElement.style.setProperty('--cell-size', this.cellSize + 'px');
      } catch (e) {}
    },

    setPicks(n) {
      this.picksPerSide = Math.max(1, Math.min(10, parseInt(n) || DEFAULT_PICKS));
      PICKS_PER_SIDE = this.picksPerSide;
      this.save();
    },

    setMode(mode) {
      this.gameMode = mode === 'ai' ? 'ai' : 'local';
      this.save();
    },

    setAiSide(side) {
      this.aiSide = (side === 'red' || side === 'blue') ? side : 'blue';
      this.save();
    },

    setCellSize(px) {
      this.cellSize = Math.max(32, Math.min(80, parseInt(px) || DEFAULT_CELL_SIZE));
      this._applyCellSize();
      this.save();
    },

    setDraftPoolSize(n) {
      this.draftPoolSize = Math.max(0, Math.min(40, parseInt(n) || 0));
      this.save();
    },

    setShowPortraitInDraft(v) {
      this.showPortraitInDraft = v === true;
      this.save();
    }
  };

  // 启动时加载设置
  GameSettings.load();

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

    // ============ 中央河流：横贯 y=5, y=6 两排 ============
    for (let x = 1; x < SIZE - 1; x++) {
      set(x, 5, 'r');
      set(x, 6, 'r');
    }
    // 中央 2x2 渡口通道
    set(5, 5, 'plain'); set(6, 5, 'plain');
    set(5, 6, 'plain'); set(6, 6, 'plain');

    // ============ 林地（山丘）：左右对称，且180°旋转对称 ============
    // 左中林（蓝方左侧前哨）
    [[2, 3], [3, 3], [2, 4], [3, 4]].forEach(p => set(p[0], p[1], 'm'));
    // 右中林（蓝方右侧前哨）
    [[8, 3], [9, 3], [8, 4], [9, 4]].forEach(p => set(p[0], p[1], 'm'));
    // 左中林（红方左侧前哨）
    [[2, 7], [3, 7], [2, 8], [3, 8]].forEach(p => set(p[0], p[1], 'm'));
    // 右中林（红方右侧前哨）
    [[8, 7], [9, 7], [8, 8], [9, 8]].forEach(p => set(p[0], p[1], 'm'));
    // 中央散丘（前后对称）
    [[5, 3], [6, 3], [5, 8], [6, 8]].forEach(p => set(p[0], p[1], 'm'));

    // ============ 城池：四角 / 中翼桥头 180°对称 ============
    [[0, 0], [11, 0], [0, 11], [11, 11]].forEach(p => set(p[0], p[1], 'w')); // 四角
    [[0, 5], [0, 6], [11, 5], [11, 6]].forEach(p => set(p[0], p[1], 'w'));  // 东西桥头
    [[5, 2], [6, 2], [5, 9], [6, 9]].forEach(p => set(p[0], p[1], 'w'));   // 双方中场堡

    // ============ 前哨营地：双方对称小增益点 ============
    [[4, 1], [7, 1], [4, 10], [7, 10]].forEach(p => set(p[0], p[1], 'f'));

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
    pendingSkillId: null,  // 当前等待确认释放的技能 id（预览范围）
    highlighted: [],
    awaitingCell: null,
    over: false,
    aiMode: false,         // 是否人机对战
    aiSide: 'blue',        // AI 控制的一方
    _turnEnding: false,    // 防止 endTurn 重入
    _aiActing: false,      // AI 是否正在执行行动

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
      this.pendingSkillId = null;
      this.highlighted = [];
      this.over = false;
      this.aiMode = (mode === 'ai');
      this.aiSide = this.aiMode ? GameSettings.aiSide : 'blue';
      this._buildDom();
      this._bind();
      this._setupPassiveEvents();
      this._refreshUi();

      this.phase = 'draft';
      this._highlightDeployZones();
      const effectivePicks = Math.min(PICKS_PER_SIDE, Math.floor(Generals.list.length / 2));
      this.log('选将开始：双方轮流挑选武将，每方 ' + effectivePicks + ' 人。', 'turn');
      if (this.aiMode) {
        const playerSide = this.aiSide === 'blue' ? '红' : '蓝';
        const aiSideName = this.aiSide === 'blue' ? '蓝' : '红';
        this.log('人机对战：你执' + playerSide + '，AI 执' + aiSideName + '。', 'turn');
        if (this.aiSide === 'red') {
          this.log('AI 先手。', 'turn');
        } else {
          this.log('你先手。', 'turn');
        }
      }
      this.log('红方先选。', 'turn');
      this._maybeAiAct();

      // 启动时异步加载 DIY 武将（如已在 startGame 预加载则此调用只是获取最新）
      this._loadDiy(true);
    },

    // 异步加载 DIY 武将和技能，注入全局系统
    async _loadDiy(silent) {
      try {
        const res = await fetch('/api/diy/list');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok) return;

        let changed = false;

        // 1) 先注册技能（保证武将用到时已就绪）
        if (global.SkillsAPI && data.skills && data.skills.length) {
          const compiled = global.SkillsAPI.registerSkills(data.skills);
          if (compiled.some(Boolean)) changed = true;
          if (!silent) this.log('已加载 DIY 技能 ' + compiled.filter(Boolean).length + ' 个。');
        }

        // 2) 再注册武将，将 skillIds 映射到 skills，buildPiece 才能通过字符串 id 解析
        if (data.generals && data.generals.length && global.Generals) {
          data.generals.forEach(g => {
            const existed = Generals.list.find(x => x.id === g.id);
            if (!existed) changed = true;
            // skillIds 是服务端存储格式；skills 是 buildPiece 读取的字段
            const gDef = Object.assign({}, g, {
              skills: g.skillIds || g.skills || []
            });
            global.Generals.registerGeneral(gDef);
          });
          if (!silent) this.log('已加载 DIY 武将 ' + data.generals.length + ' 个。');
          // 预加载立绘
          this._preloadPortraits(data.generals);
        }

        // 3) 如果 draft 阶段，刷新卡片让 DIY 武将出现在选将池中
        if (changed && this.phase === 'draft') {
          this._refreshUi();
        }
      } catch (e) {
        // 静默失败：静态文件服务器没实现 DIY 接口不影响游戏
        console.info('[DIY 加载] 未连接到 DIY 后端（或接口不可用），跳过：', e.message);
      }
    },

    // 立绘缓存：{ generalId: HTMLImageElement }
    _portraitCache: null,

    // 预加载所有 DIY 武将的立绘到缓存
    _preloadPortraits(generals) {
      if (!this._portraitCache) this._portraitCache = {};
      for (const g of generals) {
        if (g.portrait && !this._portraitCache[g.id]) {
          const img = new Image();
          img.src = '/portraits/' + g.portrait;
          this._portraitCache[g.id] = img;
        }
      }
    },

    // 获取武将立绘 URL（无立绘返回 null）
    _getPortraitUrl(generalId) {
      if (!this._portraitCache) return null;
      const g = Generals.list.find(x => x.id === generalId);
      if (!g || !g.portrait) return null;
      return '/portraits/' + g.portrait;
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
      const half = SIZE / 2;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const c = document.createElement('div');
          c.className = 'cell';
          if ((x + y) % 2) c.classList.add('alt');
          // 上半区（蓝方）、下半区（红方）对称着色
          if (y < half) c.classList.add('zone-blue');
          else c.classList.add('zone-red');
          // 中线：y=5 行的底部、y=6 行的顶部加粗
          if (y === half - 1) c.classList.add('midline-bottom');
          if (y === half) c.classList.add('midline-top');
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
          this.boardEl.appendChild(c);
        }
      }
    },

    _setupPassiveEvents() {
      // 清空旧的事件绑定，重新注册所有被动技能
      const passiveHandlers = [];
      // 遍历所有技能，找到被动技能并注册
      const allSkills = Object.values(Skills || {});
      for (const sk of allSkills) {
        if (sk.type !== '被动' || !sk.trigger) continue;
        const handler = (context) => {
          // 如果事件携带触发者 actor，只对该棋子执行（避免触发其他持有同技能的棋子）
          // 如果没有 actor（全局事件），则遍历己方所有存活棋子
          const candidates = (context && context.actor)
            ? [context.actor]
            : this.pieces.filter(p => p.alive && p.side === this.currentSide);
          for (const p of candidates) {
            if (!p.alive) continue;
            const hasSkill = (p.skills || []).some(s => s.id === sk.id);
            if (hasSkill && (!sk.filter || sk.filter(p))) {
              const skill = (p.skills || []).find(s => s.id === sk.id);
              try { skill.content(p, context); } catch (e) { console.error(e); }
            }
          }
        };
        Effect.on(sk.trigger, handler);
        passiveHandlers.push({ event: sk.trigger, handler });
      }
      this._passiveHandlers = passiveHandlers;
    },

    _bind() {
      this.boardEl.addEventListener('click', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const x = parseInt(cell.dataset.x, 10);
        const y = parseInt(cell.dataset.y, 10);
        this._onCellClick(x, y);
      });

      const handlePointerMove = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = element ? element.closest('.cell') : null;
        
        if (!cell) {
          this._clearTargetLine();
          return;
        }
        
        const x = parseInt(cell.dataset.x, 10);
        const y = parseInt(cell.dataset.y, 10);
        
        if (this.selected && this.mode === 'attack') {
          const target = this.pieceAt(x, y);
          if (target && target.alive && target.side !== this.currentSide) {
            this._showTargetLine(this.selected.x, this.selected.y, x, y);
            return;
          }
        }
        
        if (this.awaitingCell) {
          const valid = this.highlighted.find(h => h.x === x && h.y === y);
          if (valid && this.selected) {
            this._showTargetLine(this.selected.x, this.selected.y, x, y);
            return;
          }
        }
        
        this._clearTargetLine();
      };

      this.boardEl.addEventListener('mousemove', handlePointerMove);
      this.boardEl.addEventListener('touchmove', handlePointerMove, { passive: false });

      const handlePointerLeave = () => {
        this._clearTargetLine();
      };

      this.boardEl.addEventListener('mouseleave', handlePointerLeave);
      this.boardEl.addEventListener('touchend', handlePointerLeave);

      document.addEventListener('scroll', () => {
        if (this.selected && this.mode === 'attack') {
          const line = document.getElementById('target-indicator-line');
          if (line) {
            this._clearTargetLine();
          }
        }
      });

      document.getElementById('btn-end').onclick = () => { if (!this.over) this.endTurn(); };
      document.getElementById('btn-restart').onclick = () => {
        document.getElementById('banner').classList.add('hidden');
        document.getElementById('log').innerHTML = '';
        this.init(this.aiMode ? 'ai' : 'local');
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
    },

    openDetail(piece) {
      const modal = document.getElementById('detail-modal');
      const title = document.getElementById('detail-title');
      const body = document.getElementById('detail-body');
      title.textContent = piece.name + '（' + (piece.side === 'red' ? '红方' : '蓝方') + '）';
      body.innerHTML = '';

      // 顶部显示立绘
      const portraitUrl = this._getPortraitUrl(piece.generalId);
      if (portraitUrl) {
        const portraitWrap = document.createElement('div');
        portraitWrap.className = 'detail-portrait';
        const img = document.createElement('img');
        img.src = portraitUrl;
        img.alt = piece.name + ' 立绘';
        img.onerror = function () { portraitWrap.style.display = 'none'; };
        portraitWrap.appendChild(img);
        body.appendChild(portraitWrap);
      }

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

      addRow('生命', piece.hp + ' / ' + piece.maxHp + (piece.shield ? '（护盾 +' + piece.shield + '）' : ''));
      const effAtk = Effect.getEffectiveAttack(piece);
      addRow('攻击', piece.atk + (effAtk !== piece.atk ? ' (+' + (effAtk - piece.atk) + ')' : ''));
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

      // 标记状态（护盾、眩晕、魅惑、闪避、荆棘等）
      const marks = Effect ? Effect.getMarksOn(piece) : [];
      if (marks.length > 0) {
        const block = document.createElement('div');
        block.className = 'block';
        const t = document.createElement('div');
        t.className = 'block-title';
        t.textContent = '状态效果（' + marks.length + '）';
        block.appendChild(t);

        for (const m of marks) {
          const row = document.createElement('div');
          row.className = 'row';
          const l = document.createElement('span');
          l.className = 'label';
          l.textContent = '【' + m.display + '】';
          const v = document.createElement('span');
          v.className = 'value';

          // 根据标记类型显示详细信息
          const mods = m.modifiers || {};
          const data = m.data || {};
          const parts = [];
          if (mods.stunTurns) parts.push('眩晕 ' + (data.turns !== undefined ? data.turns : mods.stunTurns) + ' 回合');
          if (mods.charmTurns) parts.push('魅惑 ' + (data.turns !== undefined ? data.turns : mods.charmTurns) + ' 回合' + (data.originalSide ? ' → ' + (data.originalSide === 'red' ? '红方' : '蓝方') : ''));
          if (mods.dodgeChance) parts.push('闪避 ' + Math.floor(mods.dodgeChance * 100) + '%');
          if (mods.thornsTurns) parts.push('荆棘 ' + mods.thornsAmount + ' 反伤' + (mods.thornsTurns > 1 ? '（' + (data.turns !== undefined ? data.turns : mods.thornsTurns) + ' 回合）' : ''));
          if (mods.zeroDef) parts.push('防御归零');
          if (mods.atkBuff && !mods.stunTurns && !mods.charmTurns && !mods.dodgeChance && !mods.thornsTurns) parts.push('攻击+' + mods.atkBuff);
          if (mods.moveRangeDelta) parts.push('移动力' + (mods.moveRangeDelta > 0 ? '+' : '') + mods.moveRangeDelta + (mods.moveRangeTurns > 1 ? '（' + (data.turns !== undefined ? data.turns : mods.moveRangeTurns) + ' 回合）' : ''));

          v.textContent = parts.length > 0 ? parts.join(' · ') : m.name;
          row.appendChild(l);
          row.appendChild(v);
          block.appendChild(row);
        }
        body.appendChild(block);
      }

      const skillList = piece.skills || (piece.skill ? [piece.skill] : []);
      if (skillList.length) {
        const block = document.createElement('div');
        block.className = 'block';
        const t = document.createElement('div');
        t.className = 'block-title';
        t.textContent = '技能（' + skillList.length + '）';
        block.appendChild(t);
        piece.cdMap = piece.cdMap || {};
        for (const sk of skillList) {
          const row = document.createElement('div');
          row.className = 'row';
          row.style.flexDirection = 'column';
          row.style.alignItems = 'flex-start';
          row.style.gap = '4px';
          const l = document.createElement('span');
          l.className = 'label';
          l.textContent = '【' + sk.name + '】' + (sk.type === '被动' ? '被动' : '主动') + (sk.cooldown ? ' · 冷却 ' + sk.cooldown + ' 回合' : '') + ((piece.cdMap[sk.id] || 0) > 0 ? '（剩余 ' + piece.cdMap[sk.id] + '）' : '');
          row.appendChild(l);
          if (sk.desc) {
            const d = document.createElement('span');
            d.style.fontSize = '11px';
            d.style.color = '#8b8b8b';
            d.textContent = sk.desc;
            row.appendChild(d);
          }
          block.appendChild(row);
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
        } else {
          const cb = this.awaitingCell;
          this.awaitingCell = null;
          this.highlighted = [];
          this._render();
          cb(null);
        }
        return;
      }

      const target = this.pieceAt(x, y);

      if (this.selected && this.mode) {
        if (this.mode === 'move') this._tryMove(x, y);
        else if (this.mode === 'attack') this._tryAttack(x, y);
        return;
      }

      if (target && target.alive && target.side === this.currentSide) {
        // 只有未完成所有行动的棋子才能被选中
        if (target.moved && target.attacked && target.skilled) {
          return;
        }
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

    _onKill(actor, target) {
      if (!actor || !actor.skills) return;
      for (const sk of actor.skills) {
        if (sk.type === '被动' && sk.trigger === 'onKill' && sk.filter && sk.filter(actor)) {
          this.log(actor.name + ' 触发被动【' + sk.name + '】！', 'turn');
          try { sk.content(actor, { target, victim: target }); } catch (e) {}
        }
      }
    },

    // ========== 特效系统 ==========
    _showAttackEffect(fromX, fromY, toX, toY) {
      const board = this.boardEl;
      if (!board) return;
      
      const fromCell = board.querySelector(`.cell[data-x="${fromX}"][data-y="${fromY}"]`);
      const toCell = board.querySelector(`.cell[data-x="${toX}"][data-y="${toY}"]`);
      if (!fromCell || !toCell) return;

      const fromRect = fromCell.getBoundingClientRect();
      const toRect = toCell.getBoundingClientRect();
      
      const line = document.createElement('div');
      line.className = 'attack-line';
      line.style.position = 'fixed';
      
      const startX = fromRect.left + fromRect.width / 2;
      const startY = fromRect.top + fromRect.height / 2;
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      
      const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
      
      line.style.left = startX + 'px';
      line.style.top = startY + 'px';
      line.style.width = length + 'px';
      line.style.transform = `rotate(${angle}deg)`;
      line.style.transformOrigin = '0 50%';
      
      document.body.appendChild(line);
      
      setTimeout(() => {
        line.remove();
      }, 300);
    },

    _showHitEffect(x, y, heavy) {
      const board = this.boardEl;
      if (!board) return;
      
      const cell = board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
      if (!cell) return;
      
      const piece = cell.querySelector('.piece');
      if (!piece) return;
      
      const hitClass = heavy ? 'hit-heavy' : 'hit';
      const flashClass = piece.classList.contains('red') ? 'flash-red' : 'flash-blue';
      
      piece.classList.add(hitClass, flashClass);
      
      setTimeout(() => {
        piece.classList.remove(hitClass, flashClass);
      }, 500);
    },

    _showFloatText(x, y, text, type) {
      const board = this.boardEl;
      if (!board) return;
      
      const cell = board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
      if (!cell) return;
      
      const rect = cell.getBoundingClientRect();
      const float = document.createElement('div');
      if (type === 'heal') float.className = 'heal-float';
      else if (type === 'shield') float.className = 'shield-float';
      else if (type === 'dodge') float.className = 'dodge-float';
      else float.className = 'damage-float';
      float.textContent = text;
      float.style.position = 'fixed';
      float.style.left = (rect.left + rect.width / 2) + 'px';
      float.style.top = rect.top + 'px';
      float.style.transform = 'translateX(-50%)';
      
      document.body.appendChild(float);
      
      setTimeout(() => {
        float.remove();
      }, 800);
    },

    _showTargetLine(fromX, fromY, toX, toY) {
      this._clearTargetLine();
      
      const board = this.boardEl;
      if (!board) return;
      
      const fromCell = board.querySelector(`.cell[data-x="${fromX}"][data-y="${fromY}"]`);
      const toCell = board.querySelector(`.cell[data-x="${toX}"][data-y="${toY}"]`);
      if (!fromCell || !toCell) return;

      const fromRect = fromCell.getBoundingClientRect();
      const toRect = toCell.getBoundingClientRect();
      
      const startX = fromRect.left + fromRect.width / 2;
      const startY = fromRect.top + fromRect.height / 2;
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.id = 'target-indicator-line';
      svg.style.position = 'fixed';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.width = '100vw';
      svg.style.height = '100vh';
      svg.style.pointerEvents = 'none';
      svg.style.zIndex = '50';
      
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', startX.toString());
      line.setAttribute('y1', startY.toString());
      line.setAttribute('x2', endX.toString());
      line.setAttribute('y2', endY.toString());
      line.setAttribute('stroke', 'rgba(58, 178, 120, 0.7)');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('stroke-linecap', 'round');
      
      const startCircle = document.createElementNS(svgNS, 'circle');
      startCircle.setAttribute('cx', startX.toString());
      startCircle.setAttribute('cy', startY.toString());
      startCircle.setAttribute('r', '5');
      startCircle.setAttribute('fill', 'rgba(58, 178, 120, 0.9)');
      
      const endCircle = document.createElementNS(svgNS, 'circle');
      endCircle.setAttribute('cx', endX.toString());
      endCircle.setAttribute('cy', endY.toString());
      endCircle.setAttribute('r', '6');
      endCircle.setAttribute('fill', 'rgba(58, 178, 120, 0.9)');
      
      svg.appendChild(line);
      svg.appendChild(startCircle);
      svg.appendChild(endCircle);
      
      document.body.appendChild(svg);
    },

    _clearTargetLine() {
      const existing = document.getElementById('target-indicator-line');
      if (existing) existing.remove();
    },

    _castSkill(skill) {
      if (this.phase !== 'battle') return;
      const actor = this.selected;
      if (!actor || actor.skilled) return;
      if (!skill || skill.type === '被动') return;
      actor.cdMap = actor.cdMap || {};
      if ((actor.cdMap[skill.id] || 0) > 0) {
        this.log('【' + skill.name + '】冷却中（剩余 ' + actor.cdMap[skill.id] + ' 回合）。');
        return;
      }
      if (skill.filter && !skill.filter(actor)) {
        this.log('【' + skill.name + '】条件未满足。');
        return;
      }
      this.pendingSkillId = null;
      const beforeSkilled = !!actor.skilled;
      const promise = skill.content(actor);
      this.mode = null;
      const self = this;
      const cooldown = skill.cooldown;
      Promise.resolve(promise).then(function (result) {
        const actuallyUsed = actor.skilled && !beforeSkilled;
        if (actuallyUsed) {
          self.log(actor.name + ' 发动技能：' + skill.name);
          Effect.trigger('onSkillCast', { actor, skill });
          Effect.triggerPassive(actor, 'onSkillCast', { skill });
          if (cooldown) actor.cdMap[skill.id] = cooldown;
          self._finishActorAction();
        } else {
          // 技能未真正发动（选择非法目标或中途取消）
          self.log('【' + skill.name + '】已取消。');
          self.pendingSkillId = null;
          self._render();
          self._renderBottom();
          self._checkWin();
        }
      }).catch(function (e) {
        console.error('[技能代码错误]', skill.name, e);
        const errMsg = (e && e.message) ? e.message : String(e);
        // 技能代码抛出异常时，若已标记 skilled 则仍应用冷却并结束行动
        if (actor.skilled && !beforeSkilled) {
          self.log(actor.name + ' 发动技能：' + skill.name + '（代码有误：' + errMsg + '）');
          if (cooldown) actor.cdMap[skill.id] = cooldown;
          self._finishActorAction();
        } else {
          self.log('【' + skill.name + '】执行出错：' + errMsg);
          self.pendingSkillId = null;
          self._render();
          self._renderBottom();
        }
      });
    },

    _onSkillButtonClick(skill) {
      if (this.phase !== 'battle') return;
      const a = this.selected;
      if (!a || !skill) return;
      if (!skill.preview) {
        // 没有预览范围的技能，直接释放
        this._castSkill(skill);
        return;
      }
      // 有 preview 的技能：若当前已在预览中，则真正释放
      if (this.pendingSkillId === skill.id) {
        this._castSkill(skill);
        return;
      }
      // 否则进入预览状态，显示技能范围
      this.pendingSkillId = skill.id;
      this.mode = null;
      this.highlighted = [];
      this._render();
      this._renderBottom();
    },

    _enterMode(mode) {
      if (this.phase !== 'battle') return;
      if (!this.selected || (this.selected.moved && this.selected.attacked && this.selected.skilled)) return;
      const actor = this.selected;
      this.mode = mode;
      this.pendingSkillId = null;
      this.highlighted = [];

      if (mode === 'move') {
        if (actor.moved) {
          this.log('本回合已移动。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        // 使用 reachableCells 考虑地形消耗（河流消耗2步）
        const cells = Range.reachableCells(actor.x, actor.y, actor.moveRange.n, this, actor.moveRange.shape);
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
        // 旧入口保留，直接触发第一个可用主动技能
        actor.cdMap = actor.cdMap || {};
        const list = (actor.skills || []).filter(s => s.type !== '被动' && !(actor.cdMap[s.id] > 0) && (!s.filter || s.filter(actor)));
        if (!list.length) {
          this.log('没有可用的主动技能。');
          this.mode = null;
          this._renderBottom();
          return;
        }
        this._castSkill(list[0]);
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
      Effect.trigger('onMove', { actor, x, y });
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
      // 攻击力由 Effect.getEffectiveAttack 计算（含 buff、标记）
      // 防御由 Effect.damage 内部处理（含 buff、地形、标记 zeroDef）
      const atkVal = Effect.getEffectiveAttack(actor);
      Effect.damage(actor, target, atkVal);
      this._finishActorAction();
    },

    _finishActorAction() {
      const actor = this.selected;
      if (actor && (!actor.moved || !actor.attacked || !actor.skilled)) {
        // 还有剩余行动点，保持选中状态，仅刷新 UI
        this.mode = null;
        this.highlighted = [];
        this._checkWin();
        this._render();
        this._renderBottom();
      } else {
        // 行动全部用完，清空选中，自动轮到下一枚棋子
        this._clearSelection();
        this._checkWin();
        this._render();
        this._refreshUi();
      }
    },

    _clearSelection() {
      if (this.awaitingCell) {
        const cb = this.awaitingCell;
        this.awaitingCell = null;
        try { cb(null); } catch (_) {}
      }
      this.selected = null;
      this.mode = null;
      this.pendingSkillId = null;
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
      // 防重入：正在切换回合时禁止再次调用
      if (this._turnEnding) return;
      // AI 正在行动时禁止玩家点击结束回合
      if (this._aiActing) return;
      this._turnEnding = true;
      const endBtn = document.getElementById('btn-end');
      if (endBtn) endBtn.disabled = true;

      // 回合结束时触发全局事件（如威震被动效果）
      Effect.trigger('turnEnd', { side: this.currentSide, turn: this.turn });

      if (this.currentSide === 'red') {
        this.currentSide = 'blue';
        this.pieces.forEach(p => {
          if (p.side === 'blue') { p.moved = false; p.attacked = false; p.skilled = false; p._aiSkippedSkills = []; }
          if (p.side === 'blue' && p.cdMap) {
            for (const k in p.cdMap) if (p.cdMap[k] > 0) p.cdMap[k] -= 1;
          }
        });
        this.log('回合 ' + this.turn + ' · 蓝方行动。', 'turn');
      } else {
        this.currentSide = 'red';
        this.turn += 1;
        this.pieces.forEach(p => {
          if (p.side === 'red') { p.moved = false; p.attacked = false; p.skilled = false; p._aiSkippedSkills = []; }
          if (p.side === 'red' && p.cdMap) {
            for (const k in p.cdMap) if (p.cdMap[k] > 0) p.cdMap[k] -= 1;
          }
        });
        this.log('回合 ' + this.turn + ' · 红方行动。', 'turn');
      }
      this._clearSelection();
      this._refreshUi();

      // 回合开始事件（处理状态递减（在刷新 UI 之后触发 turnStart 事件
      Effect.trigger('turnStart', { side: this.currentSide, turn: this.turn });

      // 处理眩晕：眩晕
      this._handleTurnStartBuffs();

      if (!this.aiMode) {
        this._turnEnding = false;
        const endBtn2 = document.getElementById('btn-end');
        if (endBtn2) endBtn2.disabled = false;
      }
      this._maybeAiAct();
    },

    _handleTurnStartBuffs() {
      const side = this.currentSide;
      const pieces = this.pieces.filter(p => p.alive && p.side === side);

      for (const p of pieces) {
        const marks = Effect.getMarksOn(p);

        // 眩晕：跳过本回合行动
        const stunMarks = marks.filter(m => m.modifiers && m.modifiers.stunTurns);
        if (stunMarks.length > 0) {
          p.moved = true;
          p.attacked = true;
          p.skilled = true;
          this.log(p.name + ' 处于眩晕状态，跳过行动。', 'turn');
          // 眩晕回合数 -1
          for (const m of stunMarks) {
            if (m.data && typeof m.data.turns === 'number') {
              m.data.turns -= 1;
              m.modifiers.stunTurns = m.data.turns;
              if (m.data.turns <= 0) Effect.unmark(p, m.name);
            }
          }
        }

        // 魅惑回合数递减
        const charmMarks = marks.filter(m => m.modifiers && m.modifiers.charmTurns);
        for (const m of charmMarks) {
          if (m.data && typeof m.data.turns === 'number') {
            m.data.turns -= 1;
            m.modifiers.charmTurns = m.data.turns;
            if (m.data.turns <= 0) {
              // 恢复原始阵营
              if (m.data.originalSide) p.side = m.data.originalSide;
              Effect.unmark(p, m.name);
              this.log(p.name + ' 的魅惑效果结束，恢复原阵营。', 'turn');
            }
          }
        }

        // 荆棘回合数递减
        const thornMarks = marks.filter(m => m.modifiers && m.modifiers.thornsTurns);
        for (const m of thornMarks) {
          if (m.data && typeof m.data.turns === 'number') {
            m.data.turns -= 1;
            m.modifiers.thornsTurns = m.data.turns;
            if (m.data.turns <= 0) Effect.unmark(p, m.name);
          }
        }

        // 攻击 buff 回合递减（标记系统管理）
        const atkBuffMarks = marks.filter(m => m.modifiers && m.modifiers.atkBuff !== undefined && m.data && typeof m.data.turns === 'number');
        for (const m of atkBuffMarks) {
          m.data.turns -= 1;
          if (m.data.turns <= 0) {
            Effect.unmark(p, m.name);
            this.log(p.name + ' 的攻击' + (m.data.delta > 0 ? '增益' : '减益') + '结束。', 'turn');
          }
        }

        // 防御 buff 回合递减
        if (p.defBuffTurns !== undefined && p.defBuffTurns > 0) {
          p.defBuffTurns -= 1;
          if (p.defBuffTurns <= 0) {
            p.defBuff = 0;
            p.defBuffTurns = 0;
          }
        }

        // 移动力buff回合递减
        const moveRangeMarks = marks.filter(m => m.modifiers && m.modifiers.moveRangeDelta);
        for (const m of moveRangeMarks) {
          if (m.data && typeof m.data.turns === 'number') {
            m.data.turns -= 1;
            m.modifiers.moveRangeTurns = m.data.turns;
            if (m.data.turns <= 0) Effect.unmark(p, m.name);
          }
        }

        // 冻结：锁定移动（移动权限不恢复）
        const freezeMarks = marks.filter(m => m.modifiers && m.modifiers.freezeTurns);
        if (freezeMarks.length > 0) {
          p.moved = true;
          this.log(p.name + ' 处于冻结状态，无法移动。', 'turn');
          for (const m of freezeMarks) {
            if (m.data && typeof m.data.turns === 'number') {
              m.data.turns -= 1;
              m.modifiers.freezeTurns = m.data.turns;
              if (m.data.turns <= 0) Effect.unmark(p, m.name);
            }
          }
        }

        // 中毒：每回合受到固定伤害（无视防御）
        if (p.alive) {
          const poisonMarks = marks.filter(m => m.modifiers && m.modifiers.poisonTurns);
          for (const m of poisonMarks) {
            if (!p.alive) break;
            const dmg = m.modifiers.poisonDmg || 20;
            Effect.damage(null, p, dmg, { ignoreDef: true });
            this.log('【毒】' + p.name + ' 受到 ' + dmg + ' 点中毒伤害。', 'turn');
            if (m.data && typeof m.data.turns === 'number') {
              m.data.turns -= 1;
              m.modifiers.poisonTurns = m.data.turns;
              if (m.data.turns <= 0) Effect.unmark(p, m.name);
            }
          }
        }

        // 再生：每回合回复生命
        if (p.alive) {
          const regenMarks = marks.filter(m => m.modifiers && m.modifiers.regenTurns);
          for (const m of regenMarks) {
            const heal = m.modifiers.regenHeal || 20;
            Effect.heal(p, heal);
            if (m.data && typeof m.data.turns === 'number') {
              m.data.turns -= 1;
              m.modifiers.regenTurns = m.data.turns;
              if (m.data.turns <= 0) Effect.unmark(p, m.name);
            }
          }
        }

        // 嘲讽回合数递减
        const tauntMarks = marks.filter(m => m.modifiers && m.modifiers.tauntTurns);
        for (const m of tauntMarks) {
          if (m.data && typeof m.data.turns === 'number') {
            m.data.turns -= 1;
            m.modifiers.tauntTurns = m.data.turns;
            if (m.data.turns <= 0) Effect.unmark(p, m.name);
          }
        }
      }

      this._render();
    },

    cellMoveCost(x, y) {
      if (!this.terrain) return 1;
      const t = this.terrain[y][x];
      // 河流(r)消耗2步，其他地形消耗1步
      if (t === 'r') return 2;
      return 1;
    },

    _setCellTerrain(x, y, terrain) {
      if (!this.terrain) return;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      this.terrain[y][x] = terrain;
      const idx = y * SIZE + x;
      const el = this.boardEl.children[idx];
      if (!el) return;
      el.className = el.className.replace(/terrain-\w+/g, '').trim();
      if (terrain && terrain !== 'plain') el.classList.add('terrain-' + terrain);
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
      // 决定高亮来源：mode 高亮 / pendingSkillId 预览 / 原有 highlighted
      let activeHighlight = this.highlighted;
      if (this.pendingSkillId && this.selected) {
        const a = this.selected;
        const skillList = a.skills || (a.skill ? [a.skill] : []);
        const sk = skillList.find(s => s.id === this.pendingSkillId);
        if (sk && sk.preview) {
          let previewCells;
          if (sk.preview.passThrough) {
            previewCells = Range.cellsInRange(
              sk.preview.shape, sk.preview.n, a.x, a.y, { includeSelf: true });
          } else {
            previewCells = Range.cellsInRangeWithBlock(
              sk.preview.shape, sk.preview.n, a.x, a.y,
              { pieceAt: (x, y) => this.pieceAt(x, y) });
          }
          activeHighlight = previewCells.map(c => ({ x: c.x, y: c.y, kind: 'skill' }));
        }
      }
      for (const h of activeHighlight || []) {
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
          const done = piece.moved && piece.attacked && piece.skilled;
          const lowHp = piece.hp / piece.maxHp <= 0.3;
          p.className = 'piece ' + piece.side + (done ? ' acted' : '') + (lowHp ? ' hp-low' : '');

          // 立绘（有则显示，覆盖棋子主体）
          const portraitUrl = this._getPortraitUrl(piece.generalId);
          if (portraitUrl) {
            p.classList.add('has-portrait');
            const img = document.createElement('img');
            img.className = 'p-portrait';
            img.src = portraitUrl;
            img.alt = '';
            img.draggable = false;
            img.onerror = function () {
              p.classList.remove('has-portrait');
              this.remove();
            };
            p.appendChild(img);
          }

          // 姓名
          const nameSpan = document.createElement('span');
          nameSpan.className = 'p-name';
          nameSpan.textContent = piece.name;
          p.appendChild(nameSpan);

          // 标记（右上角小角标）
          const marks = Effect.getMarksOn(piece);
          if (marks && marks.length) {
            const markWrap = document.createElement('span');
            markWrap.className = 'piece-marks';
            for (const m of marks) {
              const tag = document.createElement('span');
              tag.className = 'piece-mark';
              tag.textContent = m.display;
              markWrap.appendChild(tag);
            }
            p.appendChild(markWrap);
          }

          // 血条：数字直接嵌在血条上
          const hpBar = document.createElement('span');
          hpBar.className = 'hp-bar';
          const hpFill = document.createElement('span');
          hpFill.className = 'hp-fill';
          hpFill.style.width = Math.max(0, Math.min(100, (piece.hp / piece.maxHp) * 100)) + '%';
          const hpNum = document.createElement('span');
          hpNum.className = 'hp-num';
          hpNum.textContent = piece.hp;
          hpBar.appendChild(hpFill);
          hpBar.appendChild(hpNum);
          p.appendChild(hpBar);

          el.appendChild(p);
        }
      }
    },

    _renderBottom() {
      const actionsEl = document.getElementById('actions');
      const nameEl = document.querySelector('#selected-info .s-name');
      const statsEl = document.querySelector('#selected-info .s-stats');
      const detailBtn = document.getElementById('btn-detail');
      const endBtn = document.getElementById('btn-end');

      if (this.phase === 'draft') {
        const side = this.draftIndex % 2 === 0 ? '红' : '蓝';
        const effective = Math.min(PICKS_PER_SIDE, Math.floor(Generals.list.length / 2));
        nameEl.textContent = '选将阶段 · 第 ' + (this.draftIndex + 1) + ' 选 · 轮到' + side + '方';
        statsEl.textContent = '已选：红 ' + this.pickedRed.length + ' / 蓝 ' + this.pickedBlue.length + '（每方 ' + effective + ' 人）· 点击下方武将卡选择';
        actionsEl.innerHTML = '';
        if (detailBtn) detailBtn.disabled = true;
        endBtn.style.display = 'none';
        return;
      }

      if (this.phase === 'deploy') {
        const side = this.deploySide;
        const picked = side === 'red' ? this.pickedRed : this.pickedBlue;
        const placed = this.pieces.filter(p => p.side === side).length;
        nameEl.textContent = '布阵阶段 · ' + (side === 'red' ? '红' : '蓝') + '方';
        statsEl.textContent = '已布置 ' + placed + ' / ' + picked.length + ' · 点击下方武将卡选择后再点棋盘空格';
        actionsEl.innerHTML = '';
        if (detailBtn) detailBtn.disabled = true;
        endBtn.style.display = 'none';
        return;
      }

      endBtn.style.display = '';

      const a = this.selected;
      if (!a) {
        nameEl.textContent = '未选择棋子';
        statsEl.textContent = '点击己方棋子选择操作';
        actionsEl.innerHTML = '';
        if (detailBtn) detailBtn.disabled = true;
        return;
      }
      nameEl.textContent = a.name + '（' + (a.side === 'red' ? '红' : '蓝') + '）';
      const parts = [];
      parts.push('生命' + a.hp + '/' + a.maxHp + (a.shield ? ' 盾+' + a.shield : ''));
      const effAtkVal = Effect.getEffectiveAttack(a);
      parts.push('攻' + a.atk + (effAtkVal !== a.atk ? '+' + (effAtkVal - a.atk) : ''));
      parts.push('防' + a.def + (a.defBuff ? '+' + a.defBuff : ''));
      const stateParts = [];
      if (a.moved) stateParts.push('已移动');
      if (a.attacked) stateParts.push('已攻击');
      if (a.skilled) stateParts.push('已技能');
      // 关键标记显示
      const marks = Effect ? Effect.getMarksOn(a) : [];
      const markLabels = [];
      for (const m of marks) {
        const mods = m.modifiers || {};
        if (mods.stunTurns) markLabels.push('晕');
        else if (mods.charmTurns) markLabels.push('魅');
        else if (mods.dodgeChance) markLabels.push('闪');
        else if (mods.thornsTurns) markLabels.push('荆');
        else if (mods.zeroDef) markLabels.push('破防');
        else markLabels.push(m.display);
      }
      if (markLabels.length > 0) stateParts.push(markLabels.join('/'));
      parts.push(stateParts.length ? stateParts.join(' · ') : '可行动');
      statsEl.textContent = parts.join(' · ');
      if (detailBtn) detailBtn.disabled = false;

      // 横向按钮：移动 / 攻击 / 技能... / 取消
      actionsEl.innerHTML = '';
      const self = this;

      // 移动按钮
      const moveBtn = document.createElement('button');
      moveBtn.className = 'act-btn';
      moveBtn.textContent = '移动';
      moveBtn.disabled = !!a.moved;
      moveBtn.onclick = () => self._enterMode('move');
      actionsEl.appendChild(moveBtn);

      // 攻击按钮
      const atkBtn = document.createElement('button');
      atkBtn.className = 'act-btn';
      atkBtn.textContent = '攻击';
      atkBtn.disabled = !!a.attacked;
      atkBtn.onclick = () => self._enterMode('attack');
      actionsEl.appendChild(atkBtn);

      // 技能按钮
      const skillList = a.skills || (a.skill ? [a.skill] : []);
      a.cdMap = a.cdMap || {};
      for (const sk of skillList) {
        if (sk.type === '被动') continue;
        const btn = document.createElement('button');
        btn.className = 'act-btn skill-btn';
        const cdLeft = a.cdMap[sk.id] || 0;
        const usable = !a.skilled && cdLeft <= 0 && (!sk.filter || sk.filter(a));
        let label = sk.name;
        if (sk.cooldown && cdLeft > 0) label += '(' + cdLeft + ')';
        btn.textContent = label;
        btn.disabled = !usable;
        btn.title = '【' + sk.name + '】' + (sk.cooldown ? ' 冷却 ' + sk.cooldown + ' 回合' : '') + (sk.desc ? '\n' + sk.desc : '');
        if (this.pendingSkillId === sk.id) btn.classList.add('pending');
        btn.onclick = () => self._onSkillButtonClick(sk);
        actionsEl.appendChild(btn);
      }

      // 取消按钮
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'act-btn ghost';
      cancelBtn.textContent = '取消';
      cancelBtn.onclick = () => {
        self._clearSelection();
        self._refreshUi();
      };
      actionsEl.appendChild(cancelBtn);
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
            else if (p.moved && p.attacked && p.skilled) li.classList.add('acted');
          }
          const nameSpan = document.createElement('span');
          let txt = p.name;
          if (this.phase === 'battle') txt += ' ' + (p.alive ? p.hp : '亡');
          if (this.phase === 'battle' && (p.moved || p.attacked || p.skilled)) {
            txt += ' [' + (p.moved ? '移' : '') + (p.attacked ? '攻' : '') + (p.skilled ? '技' : '') + ']';
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
              if (!p.alive || (p.moved && p.attacked && p.skilled)) return;
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
          const gSkills = g.skills || (g.skill ? [g.skill] : []);
          right.textContent = '血' + g.hp + ' / 攻' + g.atk + ' / 防' + g.def + (gSkills.length ? ' · 技能：' + gSkills.map(s => s.name).join('、') : '');
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

      const buildDraftCard = function (g, onClick) {
        const card = document.createElement('div');
        card.className = 'draft-card';
        const showPortrait = GameSettings.showPortraitInDraft !== false;
        const portraitUrl = g.portrait ? '/portraits/' + g.portrait : null;

        if (showPortrait && portraitUrl) {
          const imgWrap = document.createElement('div');
          imgWrap.className = 'draft-card-portrait';
          const img = document.createElement('img');
          img.src = portraitUrl;
          img.alt = g.name;
          img.onerror = function () { imgWrap.style.display = 'none'; };
          imgWrap.appendChild(img);
          card.appendChild(imgWrap);
        }

        const head = document.createElement('div');
        head.className = 'draft-card-head';
        head.textContent = g.name;
        card.appendChild(head);

        const body = document.createElement('div');
        body.className = 'draft-card-body';
        const gSkills = (g.skills || (g.skill ? [g.skill] : [])).map(function(s) {
          if (typeof s === 'string') return (global.SkillsAPI && global.SkillsAPI.getSkill(s)) || { name: s };
          return s;
        }).filter(Boolean);
        body.innerHTML = '生命 ' + g.hp + ' · 攻 ' + g.atk + ' · 防 ' + g.def +
          '<br/>移动：' + shapeText(g.moveRange.shape) + ' ' + g.moveRange.n + ' · 攻击：' + shapeText(g.attackRange.shape) + ' ' + g.attackRange.n +
          (gSkills.length ? '<br/>技能：' + gSkills.map(s => s.name).join('、') : '');
        card.appendChild(body);

        if (onClick) {
          card.addEventListener('click', onClick);
        }
        return card;
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
        const poolLimit = GameSettings.draftPoolSize;
        const displayPool = (poolLimit > 0 && pool.length > poolLimit) ? pool.slice(0, poolLimit) : pool;
        const self = this;
        for (const g of displayPool) {
          const draftSide = this.draftIndex % 2 === 0 ? 'red' : 'blue';
          const canClick = !(this.aiMode && draftSide === this.aiSide);
          const card = buildDraftCard(g, canClick ? () => self._pickGeneral(g) : null);
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
          const card = buildDraftCard(g, () => self._selectForDeploy(g));
          if (this.deploySelected && this.deploySelected.id === g.id) {
            card.classList.add('selected');
            const headEl = card.querySelector('.draft-card-head');
            if (headEl) headEl.textContent = g.name + ' ★';
          }
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
      if (!aiShouldAct) {
        // 人操控 → 解锁回合切换，允许再次点击结束回合
        this._turnEnding = false;
        this._aiActing = false;
        const endBtn = document.getElementById('btn-end');
        if (endBtn) endBtn.disabled = false;
        return;
      }
      // AI 操控 → 保持 _turnEnding = true（防止玩家点击），标记 AI 正在执行
      this._aiActing = true;
      const self = this;
      setTimeout(() => self._aiStep(), 700);
    },

    _aiStep() {
      if (this.over) return;
      // 如果 AI 行动已结束，不再继续调度
      if (!this._aiActing) return;
      // 双重保险：只在 AI 回合时执行
      if (this.phase === 'battle' && this.currentSide !== this.aiSide) return;
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
      const cand = myAlive.find(p => !(p.moved && p.attacked && p.skilled));
      if (!cand) {
        // 所有人都已行动，解锁后调用 endTurn() 切换回合
        this._turnEnding = false;
        this._aiActing = false;
        this.endTurn();
        return;
      }
      const actor = cand;
      // 选出最佳行动（技能 > 攻击 > 移动）
      const action = this._aiPickBestAction(actor);
      if (!action) {
        // 没有可行行动，标记完成
        actor.moved = true; actor.attacked = true; actor.skilled = true;
        this._render(); this._renderBottom();
        this._scheduleNext();
        return;
      }
      if (action.type === 'skill') {
        this._aiExecuteSkill(actor, action.skill);
      } else if (action.type === 'attack') {
        this._executeAttack(actor, action.target);
        this._scheduleNext();
      } else if (action.type === 'move') {
        this._aiExecuteMoveAndAttack(actor, action.dest);
      } else {
        actor.moved = true; actor.attacked = true; actor.skilled = true;
        this._render(); this._renderBottom();
        this._scheduleNext();
      }
    },

    // ========== AI 决策核心：评估所有可选行动，返回得分最高的 ==========
    _aiPickBestAction(actor) {
      const side = actor.side;
      let best = { score: -Infinity, type: 'wait' };

      // 1) 评估所有可用主动技能（跳过本回合已放弃过的技能，防止死循环）
      if (!actor.skilled && actor.skills) {
        const skipped = actor._aiSkippedSkills || [];
        for (const skill of actor.skills) {
          if (skill.type === '被动') continue;
          if (skipped.includes(skill.id)) continue;
          actor.cdMap = actor.cdMap || {};
          if ((actor.cdMap[skill.id] || 0) > 0) continue;
          if (skill.filter && !skill.filter(actor)) continue;
          const score = this._aiScoreSkill(actor, skill);
          if (score > best.score) best = { score, type: 'skill', skill };
        }
      }

      // 2) 评估普通攻击
      if (!actor.attacked) {
        const atkTarget = this._aiBestAttackTarget(actor);
        if (atkTarget) {
          // 攻击得分：目标威胁度 + 致命加成
          let score = Effect._aiThreat(atkTarget);
          const dmg = Effect.getEffectiveAttack(actor);
          if (atkTarget.hp <= dmg) score *= 2;  // 能击杀
          score += 20;  // 攻击的基础分（保证有目标时优先攻击）
          if (score > best.score) best = { score, type: 'attack', target: atkTarget };
        }
      }

      // 3) 评估移动（若还没移动）
      if (!actor.moved) {
        const moveDest = this._aiBestMoveDest(actor);
        if (moveDest) {
          // 移动得分：基于移动后能攻击到敌人
          let score = moveDest.score;
          if (score > best.score) best = { score, type: 'move', dest: { x: moveDest.x, y: moveDest.y } };
        }
      }

      return best;
    },

    // 评估技能得分
    _aiScoreSkill(actor, skill) {
      const hint = skill.aiHint;
      if (!hint) {
        // 无 aiHint 的技能给保守低分（AI 会优先用有 hint 的技能和攻击）
        return 8;
      }
      const power = hint.power || 30;
      const priority = hint.priority || 5;
      const side = actor.side;

      // ===== 1. 使用条件检查（condition）=====
      const cond = hint.condition || 'always';
      const hpThresh = hint.hpThreshold || 0;
      if (cond === 'self_low_hp') {
        const threshold = hpThresh > 0 ? hpThresh / 100 : 0.4;
        if (actor.hp / actor.maxHp > threshold) return 0;
      } else if (cond === 'self_full_hp') {
        if (actor.hp < actor.maxHp * 0.99) return 0;
      } else if (cond === 'enemy_near') {
        let near = false;
        for (const e of this.pieces) {
          if (e.alive && e.side !== side && Math.abs(e.x - actor.x) + Math.abs(e.y - actor.y) <= 4) { near = true; break; }
        }
        if (!near) return 0;
      } else if (cond === 'enemy_in_range') {
        const inRange = this._countEnemiesInSkillRange(actor, skill);
        if (inRange === 0) return 0;
      } else if (cond === 'ally_injured') {
        const threshold = hpThresh > 0 ? hpThresh / 100 : 0.7;
        let injured = 0;
        for (const a of this.pieces) {
          if (a.alive && a.side === side && a.hp / a.maxHp < threshold) injured++;
        }
        if (injured === 0) return 0;
      } else if (cond === 'has_target') {
        const inRange = this._countEnemiesInSkillRange(actor, skill);
        if (inRange === 0) return 0;
      }

      // ===== 2. 基础得分 =====
      let score = power * (0.5 + priority / 10);

      // ===== 3. 计算范围内敌人数（用于多种判断）=====
      const enemiesInRange = this._countEnemiesInSkillRange(actor, skill);
      const alliesInRange = this._countAlliesInSkillRange(actor, skill);

      // ===== 4. 最少命中数限制（minTargets）=====
      if (hint.minTargets && hint.minTargets > 0) {
        const cnt = (hint.target === 'aoe_ally' || hint.target === 'ally') ? alliesInRange : enemiesInRange;
        if (cnt < hint.minTargets) return 0;
      }

      // ===== 5. 根据类型调整 =====
      if (hint.type === 'damage') {
        if (hint.target === 'aoe_enemy' || hint.target === 'cell') {
          score *= Math.max(1, enemiesInRange);  // 范围技多目标加成
        } else if (enemiesInRange === 0) {
          return 0;  // 单体伤害技没有目标则不使用
        }
        // 致命加成：若能击杀低血敌人
        if (hint.target === 'enemy' && skill.preview) {
          const cells = Range.cellsInRangeWithBlock(skill.preview.shape, skill.preview.n, actor.x, actor.y, {
            pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; }
          });
          for (const c of cells) {
            const p = this.pieceAt(c.x, c.y);
            if (p && p.alive && p.side !== side && p.hp <= power) {
              score *= 1.8;  // 能击杀加成
              break;
            }
          }
        }
      } else if (hint.type === 'heal') {
        const threshold = hpThresh > 0 ? hpThresh / 100 : 0.7;
        let needHeal = 0;
        for (const a of this.pieces) {
          if (a.alive && a.side === side && a.hp / a.maxHp < threshold) needHeal++;
        }
        if (needHeal === 0) return 0;
        score *= Math.max(1, needHeal);
      } else if (hint.type === 'buff') {
        let nearEnemy = false;
        for (const e of this.pieces) {
          if (e.alive && e.side !== side && Math.abs(e.x - actor.x) + Math.abs(e.y - actor.y) <= 4) { nearEnemy = true; break; }
        }
        if (!nearEnemy) return 0;
        score *= 0.7;
      } else if (hint.type === 'control') {
        if (enemiesInRange === 0) return 0;
      } else if (hint.type === 'debuff') {
        if (enemiesInRange === 0) return 0;
        score *= 0.8;
      } else if (hint.type === 'teleport') {
        // 位移类：附近有敌人或自身位置危险时才用
        let nearEnemy = false;
        for (const e of this.pieces) {
          if (e.alive && e.side !== side && Math.abs(e.x - actor.x) + Math.abs(e.y - actor.y) <= 2) { nearEnemy = true; break; }
        }
        if (!nearEnemy && actor.hp / actor.maxHp > 0.5) return 0;
      }

      return Math.max(0, score);
    },

    // 统计技能范围内敌人数（辅助函数）
    // preview 为空时（多步技能），以 actor 为中心估算附近 4 格
    _countEnemiesInSkillRange(actor, skill) {
      if (!skill || !skill.preview) {
        // 多步技能：以 actor 为中心 4 格估算
        const side = actor.side;
        let count = 0;
        for (const e of this.pieces) {
          if (e.alive && e.side !== side && Math.abs(e.x - actor.x) + Math.abs(e.y - actor.y) <= 4) count++;
        }
        return count;
      }
      const side = actor.side;
      const cells = Range.cellsInRangeWithBlock(skill.preview.shape, skill.preview.n, actor.x, actor.y, {
        pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; },
        passThrough: skill.preview.passThrough
      });
      let count = 0;
      for (const c of cells) {
        const p = this.pieceAt(c.x, c.y);
        if (p && p.alive && p.side !== side) count++;
      }
      return count;
    },

    // 统计技能范围内友军数（辅助函数）
    // preview 为空时（多步技能），以 actor 为中心估算附近 4 格
    _countAlliesInSkillRange(actor, skill) {
      if (!skill || !skill.preview) {
        const side = actor.side;
        let count = 0;
        for (const a of this.pieces) {
          if (a.alive && a.side === side && a !== actor && Math.abs(a.x - actor.x) + Math.abs(a.y - actor.y) <= 4) count++;
        }
        return count;
      }
      const side = actor.side;
      const cells = Range.cellsInRangeWithBlock(skill.preview.shape, skill.preview.n, actor.x, actor.y, {
        pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; },
        passThrough: skill.preview.passThrough
      });
      let count = 0;
      for (const c of cells) {
        const p = this.pieceAt(c.x, c.y);
        if (p && p.alive && p.side === side) count++;
      }
      return count;
    },

    // 找最佳攻击目标（威胁度最高/最易击杀）
    _aiBestAttackTarget(actor) {
      const side = actor.side;
      const cells = Range.cellsInRangeWithBlock(actor.attackRange.shape, actor.attackRange.n, actor.x, actor.y, {
        pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; }
      });
      let best = null, bestScore = -1;
      for (const c of cells) {
        const p = this.pieceAt(c.x, c.y);
        if (!p || !p.alive || p.side === side) continue;
        let score = Effect._aiThreat(p);
        if (p.hp <= Effect.getEffectiveAttack(actor)) score *= 2;  // 能击杀
        if (score > bestScore) { bestScore = score; best = p; }
      }
      return best;
    },

    // 找最佳移动落点（朝最近敌人靠近，且尽量能攻击到）
    _aiBestMoveDest(actor) {
      const side = actor.side;
      const moveCells = Range.reachableCells(actor.x, actor.y, actor.moveRange.n, this, actor.moveRange.shape);
      const enemies = this.pieces.filter(p => p.alive && p.side !== side);
      if (!enemies.length || !moveCells.length) return null;
      // 找最近的敌人
      enemies.sort((a, b) => {
        const da = Math.abs(a.x - actor.x) + Math.abs(a.y - actor.y);
        const db = Math.abs(b.x - actor.x) + Math.abs(b.y - actor.y);
        return da - db;
      });
      const nearest = enemies[0];
      const emptyMoves = moveCells.filter(c => !this.pieceAt(c.x, c.y));
      if (!emptyMoves.length) return null;
      let best = null, bestScore = -Infinity;
      for (const m of emptyMoves) {
        // 距离最近敌人的曼哈顿距离（落点越近越好）
        const dist = Math.abs(m.x - nearest.x) + Math.abs(m.y - nearest.y);
        // 基础分：始终为正，确保"向敌人靠近"永远优于"等待"
        // 最大距离约 22（12×12 棋盘），min 10 保证必胜过无目标等待
        let score = Math.max(10, 60 - dist * 3);
        // 若落点能攻击到敌人，大幅加分（反映移动后立即能出手的价值）
        const atkCells = Range.cellsInRangeWithBlock(actor.attackRange.shape, actor.attackRange.n, m.x, m.y, {
          pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; }
        });
        for (const ac of atkCells) {
          const p = this.pieceAt(ac.x, ac.y);
          if (p && p.alive && p.side !== side) {
            score += Effect._aiThreat(p) * 0.8;
            if (p.hp <= Effect.getEffectiveAttack(actor)) score += 60;  // 移动后能击杀
          }
        }
        if (score > bestScore) { bestScore = score; best = { x: m.x, y: m.y, score }; }
      }
      return best;
    },

    // AI 执行技能：设置 AI 上下文，调用 content，处理冷却
    // 多步技能支持：AI 上下文贯穿整个 content 的 async 执行，
    // 内部的 await Effect.chooseCell/chooseEnemy/chooseAlly/chooseOption
    // 会自动走 AI 分支，立即返回 AI 选择的结果（不阻塞）。
    _aiExecuteSkill(actor, skill) {
      Effect._aiContext = { mode: true, actor: actor, skill: skill, hint: skill.aiHint };
      const before = !!actor.skilled;
      const self = this;
      const promise = skill.content(actor);
      Promise.resolve(promise).then(function (result) {
        Effect._aiContext = null;
        // 多步技能：content 返回 false 表示技能未真正使用（AI 取消选择/无目标）
        const used = actor.skilled && !before;
        if (used) {
          self.log(actor.name + ' 发动技能：' + skill.name, 'turn');
          Effect.trigger('onSkillCast', { actor: actor, skill: skill });
          Effect.triggerPassive(actor, 'onSkillCast', { skill: skill });
          if (skill.cooldown) {
            actor.cdMap = actor.cdMap || {};
            actor.cdMap[skill.id] = skill.cooldown;
          }
          self._render(); self._renderBottom();
          self._checkWin();
        } else {
          // 技能未实际发动（无目标、返回 false、或未设置 skilled）
          // 将此技能加入本回合"已跳过"列表，防止 _aiPickBestAction 反复选同一技能造成死循环
          actor._aiSkippedSkills = actor._aiSkippedSkills || [];
          if (!actor._aiSkippedSkills.includes(skill.id)) {
            actor._aiSkippedSkills.push(skill.id);
          }
          self.log(actor.name + ' 放弃使用【' + skill.name + '】。');
        }
        self._scheduleNext();
      }).catch(function (e) {
        Effect._aiContext = null;
        console.error('[AI 技能错误]', skill.name, e);
        // 出错的技能同样加入跳过列表
        actor._aiSkippedSkills = actor._aiSkippedSkills || [];
        if (!actor._aiSkippedSkills.includes(skill.id)) {
          actor._aiSkippedSkills.push(skill.id);
        }
        self.log('【' + skill.name + '】AI 执行出错：' + e.message);
        self._scheduleNext();
      });
    },

    // AI 移动并尝试攻击
    _aiExecuteMoveAndAttack(actor, dest) {
      this._executeMove(actor, dest.x, dest.y);
      const self = this;
      setTimeout(function () {
        if (self.over) { return; }
        if (!actor.alive || actor.attacked) { self._scheduleNext(); return; }
        // 移动后再评估一次：可能有更好的技能可用
        if (!actor.skilled && actor.skills) {
          let bestSkill = null, bestScore = -1;
          const skipped = actor._aiSkippedSkills || [];
          for (const skill of actor.skills) {
            if (skill.type === '被动') continue;
            if (skipped.includes(skill.id)) continue;
            actor.cdMap = actor.cdMap || {};
            if ((actor.cdMap[skill.id] || 0) > 0) continue;
            if (skill.filter && !skill.filter(actor)) continue;
            const s = self._aiScoreSkill(actor, skill);
            if (s > bestScore) { bestScore = s; bestSkill = skill; }
          }
          // 移动后用技能得分要明显高于攻击才用（避免移动后不攻击）
          const atkTarget = self._aiBestAttackTarget(actor);
          const atkScore = atkTarget ? Effect._aiThreat(atkTarget) + 20 : 0;
          if (bestSkill && bestScore > atkScore + 10) {
            self._aiExecuteSkill(actor, bestSkill);
            return;
          }
        }
        // 否则尝试攻击
        const tgt = self._aiBestAttackTarget(actor);
        if (tgt) {
          self._executeAttack(actor, tgt);
        } else {
          actor.attacked = true;
        }
        self._scheduleNext();
      }, 400);
    },

    _scheduleNext() {
      const self = this;
      setTimeout(() => self._aiStep(), 500);
    },

    _executeMove(actor, x, y) {
      if (actor.side !== this.currentSide || actor.moved) return false;
      if (this.pieceAt(x, y)) return false;
      // 使用 reachableCells 考虑地形消耗（河流消耗2步）
      const cells = Range.reachableCells(actor.x, actor.y, actor.moveRange.n, this, actor.moveRange.shape);
      if (!cells.find(c => c.x === x && c.y === y)) return false;
      actor.x = x;
      actor.y = y;
      actor.moved = true;
      this.log(actor.name + ' 移动到 (' + x + ',' + y + ')。');
      Effect.trigger('onMove', { actor, x, y });
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
      const atkVal = Effect.getEffectiveAttack(actor);
      const dmg = Effect.damage(actor, target, atkVal);
      actor.attacked = true;
      this.highlighted = [];
      this.mode = null;
      this._render();
      this._renderBottom();
      this._checkWin();
      return true;
    }
  };

  // 页面启动时立即预拉取 DIY 武将，确保用户点击「开始游戏」时武将已注册
  (function preloadDiy() {
    fetch('/api/diy/list').then(function(r) { return r.json(); }).then(function(data) {
      if (!data.ok) return;
      if (window.SkillsAPI && data.skills && data.skills.length) {
        window.SkillsAPI.registerSkills(data.skills);
      }
      if (data.generals && data.generals.length && window.Generals) {
        data.generals.forEach(function(g) {
          var gDef = Object.assign({}, g, { skills: g.skillIds || g.skills || [] });
          window.Generals.registerGeneral(gDef);
        });
      }
    }).catch(function() {});
  })();

  document.addEventListener('DOMContentLoaded', () => {
    const loadingScreen = document.getElementById('loading-screen');
    const loadingBar = document.getElementById('loading-bar-fill');
    const loadingStatus = document.getElementById('loading-status');
    let loaded = 0;
    let total = 0;

    function updateProgress(delta, status) {
      loaded += delta;
      const pct = Math.min(100, Math.floor((loaded / total) * 100));
      if (loadingBar) loadingBar.style.width = pct + '%';
      if (loadingStatus && status) loadingStatus.textContent = status;
    }

    let _finished = false;
    function finishLoading() {
      if (_finished) return;
      _finished = true;
      updateProgress(999, '加载完成');
      setTimeout(() => {
        if (loadingScreen) loadingScreen.classList.add('hidden');
        // 页面加载时显示主页；点击「本机对战 / 人机对战」后再调用 init
        const home = document.getElementById('home-screen');
        const app = document.getElementById('app');
        if (home) home.classList.remove('hidden');
        if (app) app.classList.add('hidden');
      }, 200);
    }

    // 跳过按钮：隐藏加载页 + 写入持久标记，下次直接跳过
    const skipBtn = document.getElementById('btn-skip-loading');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        localStorage.setItem(CACHE_FLAG, '1');
        finishLoading();
      });
    }

    const assets = [];

    // 字体文件
    assets.push({ type: 'font', url: 'fonts/xiaozhuan.woff2', name: '小篆字体' });
    assets.push({ type: 'font', url: 'fonts/xingkai.woff2', name: '行楷字体' });

    // 音频文件
    assets.push({ type: 'audio', url: 'assets/bgm.mp3', name: '背景音乐' });

    total = assets.length;

    function loadFont(url, name) {
      return new Promise((resolve) => {
        const fontName = name.includes('小篆') ? 'XiaoZhuan' : 'XingKai';
        if (document.fonts && document.fonts.load) {
          document.fonts.load('16px "' + fontName + '"').then(() => {
            updateProgress(1, name + ' 已就绪');
            resolve();
          }).catch(() => {
            updateProgress(1, name + ' 已就绪');
            resolve();
          });
        } else {
          const img = new Image();
          img.onerror = img.onload = () => {
            updateProgress(1, name + ' 已就绪');
            resolve();
          };
          img.src = url;
        }
      });
    }

    function loadAudio(url, name) {
      return new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.oncanplaythrough = () => {
          updateProgress(1, name + ' 已就绪');
          resolve();
        };
        audio.onerror = () => {
          updateProgress(1, name + ' 加载跳过');
          resolve();
        };
        audio.src = url;
      });
    }

    // 用 localStorage 持久记住是否已成功加载或用户主动跳过
    const CACHE_FLAG = 'sgzq_assets_loaded';
    const alreadyLoaded = localStorage.getItem(CACHE_FLAG) === '1';

    function loadAll() {
      const promises = [];
      for (const a of assets) {
        if (a.type === 'font') promises.push(loadFont(a.url, a.name));
        else if (a.type === 'audio') promises.push(loadAudio(a.url, a.name));
      }
      Promise.all(promises).then(() => {
        localStorage.setItem(CACHE_FLAG, '1');
        finishLoading();
      });
    }

    // 先显示加载页面，然后开始加载
    if (loadingScreen) {
      if (alreadyLoaded) {
        // 已加载过或主动跳过 → 直接隐藏，不阻塞
        loadingScreen.classList.add('hidden');
        finishLoading();
      } else {
        loadingScreen.classList.remove('hidden');
        updateProgress(0, '准备资源');
        // 给一帧让 UI 渲染
        requestAnimationFrame(() => {
          setTimeout(loadAll, 50);
        });
      }
    } else {
      finishLoading();
    }

    // ========== 背景音乐控制（拖动 / 长按菜单 / 自动播放） ==========
    const bgm = document.getElementById('bgm');
    const musicBtn = document.getElementById('btn-music');
    const volSlider = document.getElementById('music-volume');
    const volVal = document.getElementById('music-volume-val');
    const autoPlayBox = document.getElementById('music-autoplay');

    // 默认设置 + localStorage 恢复
    let settings = { volume: 35, autoPlay: true };
    try {
      const saved = JSON.parse(localStorage.getItem('sanguosha_music') || '{}');
      if (typeof saved.volume === 'number') settings.volume = saved.volume;
      if (typeof saved.autoPlay === 'boolean') settings.autoPlay = saved.autoPlay;
    } catch (_) {}

    function saveSettings() {
      try { localStorage.setItem('sanguosha_music', JSON.stringify(settings)); } catch (_) {}
    }

    // 恢复按钮位置
    function restoreBtnPos() {
      if (!musicBtn) return;
      let pos = null;
      try { pos = JSON.parse(localStorage.getItem('sanguosha_btn_pos') || 'null'); } catch (_) {}
      if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
        musicBtn.style.left = pos.left + 'px';
        musicBtn.style.top = pos.top + 'px';
        musicBtn.style.right = 'auto';
      }
    }
    restoreBtnPos();

    // 应用音量
    if (bgm) bgm.volume = settings.volume / 100;
    if (volSlider) volSlider.value = String(settings.volume);
    if (volVal) volVal.textContent = String(settings.volume);
    if (autoPlayBox) autoPlayBox.checked = !!settings.autoPlay;

    function syncMusicBtn() {
      if (!musicBtn || !bgm) return;
      if (!bgm.paused) {
        musicBtn.classList.add('playing');
        musicBtn.textContent = '♪';
      } else {
        musicBtn.classList.remove('playing');
        musicBtn.textContent = '♫';
      }
    }

    // 自动播放：尝试在页面加载后直接播放；若被浏览器拦截，则等待首次用户手势触发
    let firstGestureDone = false;
    function tryPlayBgm(forceFromGesture) {
      if (!bgm) return;
      if (!bgm.paused) { syncMusicBtn(); return; }
      if (!settings.autoPlay && !forceFromGesture) return;
      const p = bgm.play();
      if (p && p.then) p.then(syncMusicBtn).catch(() => { syncMusicBtn(); });
      else syncMusicBtn();
    }
    if (bgm) {
      bgm.addEventListener('play', syncMusicBtn);
      bgm.addEventListener('pause', syncMusicBtn);
    }
    syncMusicBtn();

    // 首次加载尝试播放
    if (settings.autoPlay) tryPlayBgm(false);

    // 全局首次手势兜底：若自动播放被拦截，则在任意首次操作后开始播放
    function onFirstGesture() {
      if (firstGestureDone) return;
      firstGestureDone = true;
      if (settings.autoPlay && bgm && bgm.paused) tryPlayBgm(true);
      document.removeEventListener('pointerdown', onFirstGesture);
      document.removeEventListener('keydown', onFirstGesture);
    }
    document.addEventListener('pointerdown', onFirstGesture);
    document.addEventListener('keydown', onFirstGesture);

    // 音量滑块
    if (volSlider && bgm) {
      volSlider.addEventListener('input', () => {
        const v = parseInt(volSlider.value, 10) || 0;
        settings.volume = v;
        bgm.volume = v / 100;
        if (volVal) volVal.textContent = String(v);
        saveSettings();
      });
    }

    // 自动播放开关
    if (autoPlayBox) {
      autoPlayBox.addEventListener('change', () => {
        settings.autoPlay = autoPlayBox.checked;
        saveSettings();
        if (settings.autoPlay && bgm && bgm.paused) tryPlayBgm(true);
      });
    }

    // ========== 按钮：拖动 + 点击切换 + 长按弹菜单 ==========
    if (musicBtn) {
      let startX = 0, startY = 0;
      let moved = false;
      let dragStartLeft = 0, dragStartTop = 0;
      let isDragging = false;
      let longPressTimer = null;
      let longPressFired = false;
      const DRAG_THRESHOLD = 6;
      const LONG_PRESS_MS = 450;

      musicBtn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
        longPressFired = false;
        const rect = musicBtn.getBoundingClientRect();
        dragStartLeft = rect.left;
        dragStartTop = rect.top;
        try { musicBtn.setPointerCapture(e.pointerId); } catch (_) {}
        longPressTimer = setTimeout(() => {
          if (!moved) {
            longPressFired = true;
            openSettings();
            musicBtn.classList.add('long-press');
            setTimeout(() => musicBtn.classList.remove('long-press'), 300);
          }
        }, LONG_PRESS_MS);
      });

      musicBtn.addEventListener('pointermove', (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          moved = true;
          isDragging = true;
          musicBtn.classList.add('dragging');
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
          // 切换为 left/top 定位
          musicBtn.style.right = 'auto';
        }
        if (isDragging) {
          const maxLeft = window.innerWidth - musicBtn.offsetWidth - 4;
          const maxTop = window.innerHeight - musicBtn.offsetHeight - 4;
          let newLeft = Math.max(4, Math.min(maxLeft, dragStartLeft + dx));
          let newTop = Math.max(4, Math.min(maxTop, dragStartTop + dy));
          musicBtn.style.left = newLeft + 'px';
          musicBtn.style.top = newTop + 'px';
        }
      });

      function endDrag(e) {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        if (isDragging) {
          // 保存位置
          const rect = musicBtn.getBoundingClientRect();
          try { localStorage.setItem('sanguosha_btn_pos', JSON.stringify({ left: rect.left, top: rect.top })); } catch (_) {}
        }
        // 仅在没有拖动、没有长按且是一次点击时切换播放
        if (!moved && !longPressFired && bgm) {
          if (bgm.paused) {
            const p = bgm.play();
            if (p && p.then) p.then(syncMusicBtn).catch(() => {});
          } else {
            bgm.pause();
          }
          syncMusicBtn();
        }
        musicBtn.classList.remove('dragging');
        isDragging = false;
        try { musicBtn.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      musicBtn.addEventListener('pointerup', endDrag);
      musicBtn.addEventListener('pointercancel', endDrag);
    }



    // 主页按钮
    const localBtn = document.getElementById('btn-local');
    const aiBtn = document.getElementById('btn-ai');
    const diyBtn = document.getElementById('btn-diy');
    const homeBtn = document.getElementById('btn-home');
    if (localBtn) localBtn.addEventListener('click', () => { tryPlayBgm(true); Game.startGame('local'); });
    if (aiBtn) aiBtn.addEventListener('click', () => { tryPlayBgm(true); Game.startGame('ai'); });
    if (diyBtn) diyBtn.addEventListener('click', () => { window.location.href = 'diy.html'; });
    if (homeBtn) homeBtn.addEventListener('click', () => Game.goHome());

    // ========== 设置面板（含全屏）==========
    const settingsBtn = document.getElementById('btn-settings');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    const settingFullscreen = document.getElementById('setting-fullscreen');
    const settingHome = document.getElementById('setting-home');
    const settingRestart = document.getElementById('setting-restart');
    const settingDraftPortrait = document.getElementById('setting-draft-portrait');

    function updateFsLabel() {
      if (!settingFullscreen) return;
      const isFs = document.fullscreenElement || document.webkitFullscreenElement
        || document.mozFullScreenElement || document.msFullscreenElement
        || (window.innerHeight === screen.height && window.innerWidth === screen.width);
      if (isFs) {
        settingFullscreen.textContent = '退出全屏';
      } else {
        settingFullscreen.textContent = '进入全屏';
      }
    }
    function toggleFullscreen() {
      const doc = document;
      const el = doc.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen
        || el.mozRequestFullScreen || el.msRequestFullscreen;
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen
        || doc.mozCancelFullScreen || doc.msExitFullscreen;
      const cur = doc.fullscreenElement || doc.webkitFullscreenElement
        || doc.mozFullScreenElement || doc.msFullscreenElement;
      if (cur) {
        if (exit) exit.call(doc);
      } else {
        if (req) {
          req.call(el).catch(() => {
            if (document.body.requestFullscreen) return;
            alert('当前浏览器未开放全屏权限，可尝试双指放大或在浏览器菜单中选择「添加到主屏幕」。');
          });
        } else {
          alert('当前浏览器不支持全屏 API。');
        }
      }
      setTimeout(updateFsLabel, 250);
    }

    function openSettings() {
      if (!settingsPanel) return;
      settingsPanel.classList.remove('hidden');
      // 使用 musicBtn 定位设置面板
      if (musicBtn) {
        const btnRect = musicBtn.getBoundingClientRect();
        const panelRect = settingsPanel.getBoundingClientRect();
        const panelW = panelRect.width || 300;
        const panelH = panelRect.height || 400;
        let left = btnRect.left + btnRect.width / 2 - panelW / 2;
        let top = btnRect.bottom + 8;
        if (top + panelH > window.innerHeight - 6) top = btnRect.top - panelH - 8;
        if (left < 6) left = 6;
        if (left + panelW > window.innerWidth - 6) left = window.innerWidth - panelW - 6;
        if (top < 6) top = btnRect.bottom + 8;
        settingsPanel.style.left = left + 'px';
        settingsPanel.style.top = top + 'px';
        musicBtn.classList.add('active');
      }
      refreshSettingsUi();
    }
    function closeSettings() {
      if (!settingsPanel) return;
      settingsPanel.classList.add('hidden');
      if (musicBtn) musicBtn.classList.remove('active');
    }

    function refreshSettingsUi() {
      // 更新 chip 选中状态
      document.querySelectorAll('.settings-chip[data-picks]').forEach(chip => {
        const v = parseInt(chip.getAttribute('data-picks'));
        chip.classList.toggle('active', v === GameSettings.picksPerSide);
      });
      document.querySelectorAll('.settings-chip[data-mode]').forEach(chip => {
        const v = chip.getAttribute('data-mode');
        chip.classList.toggle('active', v === GameSettings.gameMode);
      });
      document.querySelectorAll('.settings-chip[data-ai-side]').forEach(chip => {
        const v = chip.getAttribute('data-ai-side');
        chip.classList.toggle('active', v === GameSettings.aiSide);
      });
      document.querySelectorAll('.settings-chip[data-cell-size]').forEach(chip => {
        const v = parseInt(chip.getAttribute('data-cell-size'));
        chip.classList.toggle('active', v === GameSettings.cellSize);
      });
      document.querySelectorAll('.settings-chip[data-draft-pool]').forEach(chip => {
        const v = parseInt(chip.getAttribute('data-draft-pool'));
        chip.classList.toggle('active', v === GameSettings.draftPoolSize);
      });
      if (settingDraftPortrait) {
        settingDraftPortrait.checked = !!GameSettings.showPortraitInDraft;
      }
      updateFsLabel();
    }


    if (settingsClose) {
      settingsClose.addEventListener('click', closeSettings);
    }
    if (settingFullscreen) {
      settingFullscreen.addEventListener('click', toggleFullscreen);
    }
    if (settingHome) {
      settingHome.addEventListener('click', () => {
        closeSettings();
        Game.goHome();
      });
    }
    if (settingRestart) {
      settingRestart.addEventListener('click', () => {
        closeSettings();
        Game.startGame(GameSettings.gameMode);
      });
    }

    // 选择对战人数
    document.querySelectorAll('.settings-chip[data-picks]').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = parseInt(chip.getAttribute('data-picks'));
        GameSettings.setPicks(v);
        refreshSettingsUi();
      });
    });

    // 选择对战模式
    document.querySelectorAll('.settings-chip[data-mode]').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = chip.getAttribute('data-mode');
        GameSettings.setMode(v);
        refreshSettingsUi();
      });
    });

    // 选择 AI 先手/后手
    document.querySelectorAll('.settings-chip[data-ai-side]').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = chip.getAttribute('data-ai-side');
        GameSettings.setAiSide(v);
        refreshSettingsUi();
      });
    });

    // 选择格子大小
    document.querySelectorAll('.settings-chip[data-cell-size]').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = parseInt(chip.getAttribute('data-cell-size'));
        GameSettings.setCellSize(v);
        refreshSettingsUi();
        if (Game && Game._render) Game._render();
      });
    });

    // 选择选将池大小
    document.querySelectorAll('.settings-chip[data-draft-pool]').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = parseInt(chip.getAttribute('data-draft-pool'));
        GameSettings.setDraftPoolSize(v);
        refreshSettingsUi();
        if (Game && Game.phase === 'draft' && Game._renderDraftCards) {
          Game._renderDraftCards();
        }
      });
    });

    // 选将显示立绘开关
    if (settingDraftPortrait) {
      settingDraftPortrait.addEventListener('change', () => {
        GameSettings.setShowPortraitInDraft(settingDraftPortrait.checked);
        refreshSettingsUi();
        if (Game && Game.phase === 'draft' && Game._renderDraftCards) {
          Game._renderDraftCards();
        }
      });
    }

    // 点击面板外关闭
    document.addEventListener('pointerdown', (e) => {
      if (!settingsPanel || settingsPanel.classList.contains('hidden')) return;
      if (settingsPanel.contains(e.target) || (musicBtn && musicBtn.contains(e.target))) return;
      closeSettings();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSettings();
    });

    // 全屏变化监听
    document.addEventListener('fullscreenchange', updateFsLabel);
    document.addEventListener('webkitfullscreenchange', updateFsLabel);
    window.addEventListener('resize', updateFsLabel);
    updateFsLabel();
  });

  global.Game = Game;
  global.GameSettings = GameSettings;
})(window);
