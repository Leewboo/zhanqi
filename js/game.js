(function (global) {
  const SIZE = Range.BOARD_SIZE;
  const DEFAULT_PICKS = 5;
  let PICKS_PER_SIDE = DEFAULT_PICKS;
  const DEFAULT_CELL_SIZE = 48;
  const DEFAULT_DRAFT_POOL_SIZE = 12;

  // 游戏设置（从 localStorage 读取）
  const GameSettings = {
    picksPerSide: DEFAULT_PICKS,
    gameMode: 'local', // local | ai | online
    aiSide: 'blue',    // AI 控制的阵营：'blue'（玩家先手）| 'red'（AI先手）
    cellSize: DEFAULT_CELL_SIZE,       // 棋盘格子大小（px）
    draftPoolSize: DEFAULT_DRAFT_POOL_SIZE, // 选将阶段最多显示武将数（0 = 全部）
    showPortraitInDraft: true,         // 选将时显示立绘
    onlineMode: null,   // 联机模式：'3v3' | '5v5'
    onlineSide: null,   // 联机执方：'red' | 'blue'

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

    init(mode, opts) {
      opts = opts || {};
      this.boardEl = document.getElementById('board');
      this.terrain = buildTerrain();
      this.pieces = [];
      Effect._tmpSkills = [];
      this._limitedUsed = {};  // 限定技使用记录：{ skillId: true }
      this.turn = 1;
      this.currentSide = 'red';
      this.draftIndex = 0;
      this.deploySide = 'red';
      this.deploySelected = null;
      this.pickedRed = [];
      this.pickedBlue = [];
      this.draftPool = null;  // 本局将池（随机刷新的武将子集）
      // 小兵抽卡系统
      this.minionDraftPool = [];       // 当前抽卡池
      this.minionHand = { red: [], blue: [] };  // 双方手牌
      this.minionPoints = { red: 3, blue: 3 };  // 双方部署点数
      this.minionDeployPhase = false;  // 是否处于小兵部署阶段
      this.minionDeploySide = 'red';   // 当前部署方
      this.minionSelected = null;      // 当前选中的小兵卡牌
      this.minionMaxHandSize = 3;      // 最大手牌数
      this.minionMaxPerType = 2;       // 每种小兵最多部署数量
      this.minionDeployRound = 1;      // 当前部署轮数
      this.selected = null;
      this.mode = null;
      this.pendingSkillId = null;
      this.highlighted = [];
      this.over = false;
      this.aiMode = (mode === 'ai');
      this.onlineMode = (mode === 'online');
      this._onlineSide = this.onlineMode ? GameSettings.onlineSide : null;
      this._onlineAction = false;  // 标记正在回放远端操作，避免重复发送
      this._onlineSkillReplay = false;  // 标记正在异步回放远端技能（贯穿 content 的 await）
      this.aiSide = this.aiMode ? GameSettings.aiSide : 'blue';
      // 统一同步模块级 PICKS_PER_SIDE：联机 gameStart/rejoined 只更新了 GameSettings.picksPerSide，
      // 此处同步确保选将人数与服务端 playerCount 一致（3v3=3，5v5=5），避免客户端按旧值
      // （如本地默认 5）多选导致第 4 选起被服务端拒绝、双方选将阶段不同步。
      PICKS_PER_SIDE = GameSettings.picksPerSide;
      // 随机数种子：联机对战使用服务器下发的统一种子，保证双端结果一致；
      // 本机/人机对战使用本地随机种子即可
      RNG.seed(this.onlineMode ? opts.seed : RNG.randomSeed());
      this._generateDraftPool();
      this._buildDom();
      this._bind();
      this._setupPassiveEvents();
      this._refreshUi();

      this.phase = 'draft';
      this._highlightDeployZones();
      const effectivePicks = Math.min(PICKS_PER_SIDE, Math.floor(this.draftPool.length / 2));
      this.log('选将开始：将池 ' + this.draftPool.length + ' 将，双方轮流挑选，每方 ' + effectivePicks + ' 人。', 'turn');
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
      if (this.onlineMode) {
        const mySideName = this._onlineSide === 'red' ? '红' : '蓝';
        this.log('联机对战：你执' + mySideName + '方。', 'turn');
      }
      this.log('红方先选。', 'turn');
      this._maybeAiAct();

      // 启动时异步加载 DIY 武将（如已在 startGame 预加载则此调用只是获取最新）
      this._loadDiy(true);
    },

    // 生成本局将池：从全部武将中用 RNG 随机抽取 draftPoolSize 个
    // 联机模式下双方使用同一种子，保证将池一致
    _generateDraftPool() {
      const poolSize = GameSettings.draftPoolSize;
      const all = Generals.list.slice();
      // Fisher-Yates 洗牌（使用可播种 RNG，保证联机双端一致）
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(RNG.random() * (i + 1));
        const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
      }
      this.draftPool = (poolSize > 0 && poolSize < all.length) ? all.slice(0, poolSize) : all;
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

        // 3) 如果 draft 阶段且尚未选将，重新生成将池（包含新加载的 DIY 武将）
        if (changed && this.phase === 'draft') {
          if (this.draftIndex === 0) {
            this._generateDraftPool();
          }
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
    _getPortraitUrl(piece) {
      if (!piece) return null;
      if (piece.portrait) return '/portraits/' + piece.portrait;
      if (!this._portraitCache) return null;
      const g = Generals.list.find(x => x.id === piece.generalId);
      if (!g || !g.portrait) return null;
      return '/portraits/' + g.portrait;
    },

    startGame(mode) {
      document.getElementById('home-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      this.init(mode);
    },

    goHome() {
      document.getElementById('banner').classList.add('hidden');
      document.getElementById('report-modal').classList.add('hidden');
      document.getElementById('detail-modal').classList.add('hidden');
      document.getElementById('app').classList.add('hidden');
      document.getElementById('online-screen').classList.add('hidden');
      document.getElementById('room-screen').classList.add('hidden');
      document.getElementById('home-screen').classList.remove('hidden');
      document.getElementById('log').innerHTML = '';
      Online.disconnect();
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

    // 联机模式下判断当前操作方是否为本地玩家，用于在各阶段拦截"抢操作"
    // isRemoteApply 为 true 时表示这是在回放/接收对方广播的动作，必须放行
    _onlineCanAct(side, isRemoteApply) {
      if (!this.onlineMode) return true;
      if (isRemoteApply) return true;
      return side === this._onlineSide;
    },

    _pickGeneral(generalDef) {
      if (this.phase !== 'draft') return;
      const side = this.draftIndex % 2 === 0 ? 'red' : 'blue';
      if (!this._onlineCanAct(side, this._onlineAction)) {
        this.log('还没轮到你选择武将。');
        return;
      }
      if (this.pickedRed.find(g => g.id === generalDef.id) ||
          this.pickedBlue.find(g => g.id === generalDef.id)) {
        this.log(generalDef.name + ' 已被选走。');
        return;
      }
      if (side === 'red') this.pickedRed.push(generalDef);
      else this.pickedBlue.push(generalDef);
      this.log((side === 'red' ? '红' : '蓝') + '方选走 ' + generalDef.name + '。');
      this.draftIndex += 1;

      // 联机同步：本地操作发送给对方
      if (this.onlineMode && side === this._onlineSide && !this._onlineAction) {
        Online.sendAction({ type: 'pick', generalId: generalDef.id });
      }

      const maxPerSide = Math.floor(this.draftPool.length / 2);
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
      this._startMinionDraft();
    },

    _startMinionDraft() {
      this.minionDraftPool = global.Minions ? Minions.generateDraftPool() : [];
      this.minionHand = { red: [], blue: [] };
      this.minionPoints = { red: 3, blue: 3 };
      this.minionDeployPhase = true;
      this.minionDeploySide = 'red';
      this.minionDeployRound = 1;
      this.minionSelected = null;

      this._drawMinionCards('red', this.minionMaxHandSize);
      this._drawMinionCards('blue', this.minionMaxHandSize);

      this.log('=== 小兵抽卡阶段 ===', 'turn');
      this.log('红方获得 ' + this.minionHand.red.length + ' 张小兵卡牌。', 'turn');
      this.log('蓝方获得 ' + this.minionHand.blue.length + ' 张小兵卡牌。', 'turn');
      this.log('部署点数：双方各 3 点。', 'turn');
      this.log('红方先部署。', 'turn');

      this.phase = 'minion_deploy';
      this._clearDeployZones();
      this._renderMinionHand();
      this._refreshUi();
      this._maybeAiAct();
    },

    _drawMinionCards(side, count) {
      const hand = this.minionHand[side] || [];
      for (let i = 0; i < count && this.minionDraftPool.length > 0; i++) {
        const card = this.minionDraftPool.shift();
        card.instanceId = side + '_' + Date.now() + '_' + global.RNG.randInt(0, 999999999).toString(36);
        hand.push(card);
      }
      this.minionHand[side] = hand;
    },

    _deployMinion(card, x, y) {
      const side = this.minionDeploySide;

      if (this.minionPoints[side] < card.cost) {
        this.log('部署点数不足！', 'turn');
        return false;
      }

      const half = SIZE / 2;
      const isOwnHalf = side === 'red' ? y >= half : y < half;
      if (!isOwnHalf) {
        this.log('只能部署在己方半场！', 'turn');
        return false;
      }

      if (this.pieceAt(x, y)) {
        this.log('该位置已有单位！', 'turn');
        return false;
      }

      const sameTypeCount = this.pieces.filter(p =>
        p.isMinion && p.minionId === card.id && p.side === side
      ).length;
      if (sameTypeCount >= this.minionMaxPerType) {
        this.log('该类型小兵已达上限！', 'turn');
        return false;
      }

      const minion = {
        generalId: card.id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: card.name,
        side: side,
        hp: card.hp,
        maxHp: card.maxHp,
        atk: card.atk,
        def: card.def,
        x: x,
        y: y,
        alive: true,
        moved: true,
        attacked: true,
        skilled: true,
        skills: [],
        cdMap: {},
        moveRange: card.moveRange,
        attackRange: card.attackRange,
        isMinion: true,
        minionId: card.id,
        rarity: card.rarity
      };

      this.pieces.push(minion);
      this.minionPoints[side] -= card.cost;

      const hand = this.minionHand[side];
      const idx = hand.findIndex(c => c.instanceId === card.instanceId);
      if (idx >= 0) hand.splice(idx, 1);

      this.log((side === 'red' ? '红方' : '蓝方') + ' 部署了 ' + card.name + '！', 'turn');
      this.minionSelected = null;
      this._render();
      this._renderMinionHand();
      return true;
    },

    _endMinionDeploy() {
      const side = this.minionDeploySide;
      const otherSide = side === 'red' ? 'blue' : 'red';

      if (side === 'red') {
        this.minionDeploySide = 'blue';
        this.log('红方结束部署，蓝方部署。', 'turn');
        this._renderMinionHand();
        this._refreshUi();
        this._maybeAiAct();
      } else {
        this.minionDeployRound++;
        if (this.minionDeployRound <= 3) {
          this.minionPoints.red += 1;
          this.minionPoints.blue += 1;

          this.log('=== 第 ' + this.minionDeployRound + ' 轮部署 ===', 'turn');
          this.log('双方各获得 1 点部署点。', 'turn');
          this.log('当前点数：红方 ' + this.minionPoints.red + '，蓝方 ' + this.minionPoints.blue + '。', 'turn');

          this.minionDeploySide = 'red';
          this.log('红方先部署。', 'turn');
          this._renderMinionHand();
          this._refreshUi();
          this._maybeAiAct();
        } else {
          this._finishMinionDeploy();
        }
      }
    },

    _finishMinionDeploy() {
      this.minionDeployPhase = false;
      this.minionSelected = null;

      this.log('=== 小兵部署阶段结束 ===', 'turn');

      this.phase = 'battle';
      this._clearDeployZones();
      this.turn = 1;
      this.currentSide = 'red';
      this.selected = null;
      this.mode = null;
      this.highlighted = [];
      this._aiActing = false;

      this.log('阵容已就位。战斗开始，红方先动。', 'turn');
      this._renderMinionHand();
      this._refreshUi();
      this._maybeAiAct();
    },

    _renderMinionHand() {
      const handEl = document.getElementById('minion-hand');
      if (!handEl) return;

      if (!this.minionDeployPhase) {
        handEl.classList.add('hidden');
        return;
      }

      handEl.classList.remove('hidden');
      const side = this.minionDeploySide;
      const hand = this.minionHand[side] || [];
      const points = this.minionPoints[side];

      let html = '<div class="minion-hand-header">';
      html += '<span class="minion-side">' + (side === 'red' ? '红方' : '蓝方') + '部署阶段</span>';
      html += '<span class="minion-points">部署点数: ' + points + '</span>';
      html += '<button class="minion-end-btn" onclick="Game._endMinionDeploy()">结束部署</button>';
      html += '</div>';

      html += '<div class="minion-cards">';
      if (hand.length === 0) {
        html += '<div class="minion-empty">手牌已空</div>';
      } else {
        for (const card of hand) {
          const isSelected = this.minionSelected && this.minionSelected.instanceId === card.instanceId;
          html += '<div class="minion-card ' + card.rarity + (isSelected ? ' selected' : '') + '"';
          html += ' onclick="Game._selectMinionCard(\'' + card.instanceId + '\')">';
          html += '<div class="minion-card-name">' + card.name + '</div>';
          html += '<div class="minion-card-stats">';
          html += '<span>H:' + card.hp + '</span>';
          html += '<span>A:' + card.atk + '</span>';
          html += '<span>D:' + card.def + '</span>';
          html += '</div>';
          html += '<div class="minion-card-cost">消耗: ' + card.cost + '</div>';
          html += '<div class="minion-card-desc">' + card.description + '</div>';
          html += '</div>';
        }
      }
      html += '</div>';

      handEl.innerHTML = html;
    },

    _selectMinionCard(instanceId) {
      if (!this.minionDeployPhase) return;

      const side = this.minionDeploySide;
      const hand = this.minionHand[side] || [];
      const card = hand.find(c => c.instanceId === instanceId);

      if (this.minionSelected && this.minionSelected.instanceId === instanceId) {
        this.minionSelected = null;
      } else {
        this.minionSelected = card;
      }

      this._renderMinionHand();
      this._highlightDeployableCells();
    },

    _highlightDeployableCells() {
      this.highlighted = [];
      if (!this.minionSelected) return;

      const side = this.minionDeploySide;
      const half = SIZE / 2;

      for (let x = 0; x < SIZE; x++) {
        for (let y = 0; y < SIZE; y++) {
          const isOwnHalf = side === 'red' ? y >= half : y < half;
          if (isOwnHalf && !this.pieceAt(x, y)) {
            this.highlighted.push({ x, y, kind: 'deploy' });
          }
        }
      }

      this._render();
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
      if (this._passiveHandlers && this._passiveHandlers.length) {
        for (const entry of this._passiveHandlers) {
          Effect.off(entry.event, entry.handler);
        }
      }
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
      const portraitUrl = this._getPortraitUrl(piece);
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
          if (mods.undyingStacks) parts.push('不屈 ' + mods.undyingStacks + ' 层');
          if (mods.reviveTurns) parts.push('复活 ' + mods.reviveTurns + ' 回合后');
          if (mods.stealthTurns) parts.push('隐身 ' + (data.turns !== undefined ? data.turns : mods.stealthTurns) + ' 回合');
          if (mods.linkPartner) parts.push('伤害分摊 ' + Math.floor((mods.linkRatio || 0.5) * 100) + '%（' + (data.turns !== undefined ? data.turns : mods.linkTurns) + ' 回合）');

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
          l.textContent = '【' + sk.name + '】' + (sk.type === '被动' ? '被动' : '主动') + (sk.limited ? ' · 限定技' : '') + (sk.cooldown ? ' · 冷却 ' + sk.cooldown + ' 回合' : '') + ((piece.cdMap[sk.id] || 0) > 0 ? '（剩余 ' + piece.cdMap[sk.id] + '）' : '') + (sk.limited && global.Game && global.Game._limitedUsed && global.Game._limitedUsed[sk.id] ? '（已用）' : '');
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
      if (this.phase === 'minion_deploy') {
        if (this.minionSelected) {
          const side = this.minionDeploySide;
          const half = SIZE / 2;
          const isOwnHalf = side === 'red' ? y >= half : y < half;
          if (isOwnHalf && !this.pieceAt(x, y)) {
            this._deployMinion(this.minionSelected, x, y);
          }
        }
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
        if (!this._onlineCanAct(this.currentSide, this._onlineAction)) return;
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
      if (!this._onlineCanAct(this.deploySide, this._onlineAction)) {
        this.log('还没轮到你布阵。');
        return;
      }
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
      if (!this._onlineCanAct(this.deploySide, this._onlineAction)) {
        this.log('还没轮到你布阵。');
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

      // 联机同步：本地布阵发送给对方
      if (this.onlineMode && this.deploySide === this._onlineSide && !this._onlineAction) {
        Online.sendAction({ type: 'place', generalId: this.deploySelected.id, x, y });
      }

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
      if (!this._onlineCanAct(actor.side, this._onlineAction)) return;
      actor.cdMap = actor.cdMap || {};
      if (skill.limited && this._limitedUsed && this._limitedUsed[skill.id]) {
        this.log('【' + skill.name + '】为限定技，本局已使用过。');
        return;
      }
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
      // 记录技能发动前的位置：技能可能移动施法者，接收方需据此定位棋子
      const actorStartX = actor.x;
      const actorStartY = actor.y;
      // 联机技能同步：本地释放时累积目标/选项选择；回放时注入对方已选定的目标
      const isOnlineReplay = !!this._onlineAction;
      if (this.onlineMode) {
        this._onlineSkillReplay = isOnlineReplay;
        if (!isOnlineReplay) Effect._onlineRecorded = [];
      }
      const promise = skill.content(actor);
      this.mode = null;
      const self = this;
      const cooldown = skill.cooldown;
      return Promise.resolve(promise).then(function (result) {
        const actuallyUsed = actor.skilled && !beforeSkilled;
        if (actuallyUsed) {
          self.log(actor.name + ' 发动技能：' + skill.name);
          Effect.trigger('onSkillCast', { actor, skill });
          Effect.triggerPassive(actor, 'onSkillCast', { skill });
          if (cooldown) actor.cdMap[skill.id] = cooldown;
          if (skill.limited) {
            self._limitedUsed = self._limitedUsed || {};
            self._limitedUsed[skill.id] = true;
          }
          // 联机同步：本地玩家技能真正发动后，把技能动作 + 目标序列发给对方
          if (self.onlineMode && actor.side === self._onlineSide && !isOnlineReplay) {
            const recorded = Effect._onlineRecorded || [];
            try {
              Online.sendAction({
                type: 'skill',
                actorX: actorStartX,
                actorY: actorStartY,
                skillId: skill.id,
                targets: JSON.stringify(recorded)
              });
            } catch (e) { console.error('[online] 技能同步发送失败:', e); }
          }
          self._finishActorAction();
        } else {
          // 技能未真正发动（选择非法目标或中途取消）
          self.log('【' + skill.name + '】已取消。');
          self.pendingSkillId = null;
          self._render();
          self._renderBottom();
          self._checkWin();
        }
        self._cleanupOnlineSkillState();
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
        self._cleanupOnlineSkillState();
      });
    },

    // 清理联机技能回放/记录状态（技能执行结束——成功、取消或出错——后调用）
    _cleanupOnlineSkillState() {
      this._onlineSkillReplay = false;
      this._onlineAction = false;  // 异步技能回放结束，解除"回放中"标记
      if (typeof Effect !== 'undefined') {
        Effect._onlineRecorded = null;
        Effect._onlineTargetQueue = null;
        Effect._onlineOptionQueue = null;
      }
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
      if (!this._onlineCanAct(actor.side, this._onlineAction)) return;
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
        const moveRange = Effect.getEffectiveMoveRange(actor);
        const cells = Range.reachableCells(actor.x, actor.y, moveRange.n, this, moveRange.shape);
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
        const atkRange = Effect.getEffectiveAttackRange(actor);
        const cells = Range.cellsInRangeWithBlock(atkRange.shape, atkRange.n, actor.x, actor.y, {
          pieceAt: (x, y) => {
            const p = this.pieceAt(x, y);
            return p && p.alive ? p : null;
          }
        });
        for (const c of cells) {
          const t = this.pieceAt(c.x, c.y);
          if (t && t.alive && t.side !== actor.side && !Effect.isUntargetable(t)) {
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
      // 联机回放时跳过 highlighted 校验：目标坐标已由远端权威确认，
      // 本地无需再校验可达性（此时 highlighted 通常为空，不跳过会导致回放静默失败、双方棋盘不同步）
      if (!this._onlineAction) {
        const hit = this.highlighted.find(h => h.x === x && h.y === y && h.kind === 'move');
        if (!hit) {
          this.mode = null;
          this.highlighted = [];
          this._render();
          this._renderBottom();
          return;
        }
      }
      const actor = this.selected;
      if (!this._onlineCanAct(actor.side, this._onlineAction)) return;
      const fromX = actor.x;
      const fromY = actor.y;
      actor.x = x;
      actor.y = y;
      actor.moved = true;
      this.log(actor.name + ' 移动到 (' + x + ',' + y + ')。');
      Effect.trigger('onMove', { actor, x, y });
      Effect._checkTraps(actor); // 陷阱触发

      // 联机同步
      if (this.onlineMode && actor.side === this._onlineSide && !this._onlineAction) {
        Online.sendAction({ type: 'move', fromX, fromY, toX: x, toY: y });
      }

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
      // 联机回放时跳过 highlighted 校验：目标坐标已由远端权威确认（同 _tryMove）
      if (!this._onlineAction) {
        const hit = this.highlighted.find(h => h.x === x && h.y === y && h.kind === 'attack');
        if (!hit) {
          this.mode = null;
          this.highlighted = [];
          this._render();
          this._renderBottom();
          return;
        }
      }
      const actor = this.selected;
      if (!this._onlineCanAct(actor.side, this._onlineAction)) return;
      const target = this.pieceAt(x, y);
      actor.attacked = true;

      // 联机同步
      if (this.onlineMode && actor.side === this._onlineSide && !this._onlineAction) {
        Online.sendAction({ type: 'attack', actorX: actor.x, actorY: actor.y, targetX: x, targetY: y });
      }

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
        // 对局已分出胜负：清除联机重连会话，避免刷新页面后误重连到已结束的对局
        if (this.onlineMode && global.Online) global.Online.clearFinishedSession && global.Online.clearFinishedSession();
      }
    },

    endTurn() {
      // 防重入：正在切换回合时禁止再次调用
      if (this._turnEnding) return;
      // AI 正在行动时禁止玩家点击结束回合
      if (this._aiActing) return;
      // 联机模式下不是本地玩家的回合时禁止结束回合（即使按钮意外可点）
      if (!this._onlineCanAct(this.currentSide, this._onlineAction)) return;
      this._turnEnding = true;
      const endBtn = document.getElementById('btn-end');
      if (endBtn) endBtn.disabled = true;

      const prevSide = this.currentSide;

      // 回合结束时触发全局事件（如威震被动效果）
      Effect.trigger('turnEnd', { side: this.currentSide, turn: this.turn });
      const endingSide = this.currentSide;
      this.pieces.forEach(p => {
        if (p.side === endingSide && p.alive) Effect.triggerPassive(p, 'turnEnd', { turn: this.turn });
      });
      Effect._checkTmpSkillExpiry({ turn: this.turn, side: this.currentSide });

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
      const startingSide = this.currentSide;
      this.pieces.forEach(p => {
        if (p.side === startingSide && p.alive) Effect.triggerPassive(p, 'turnStart', { turn: this.turn });
      });
      Effect._checkTmpSkillExpiry({ turn: this.turn, side: this.currentSide }, 'turnStart');

      // 处理眩晕：眩晕
      this._handleTurnStartBuffs();

      // 联机同步：只有本地玩家主动结束时才发送
      if (this.onlineMode && prevSide === this._onlineSide && !this._onlineAction) {
        Online.sendAction({ type: 'endTurn' });
      }

      if (!this.aiMode && !this.onlineMode) {
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

        // 防御buff回合递减（标记系统管理）
        const defBuffMarks = marks.filter(m => m.modifiers && m.modifiers.defBuff !== undefined && m.data && typeof m.data.turns === 'number');
        for (const m of defBuffMarks) {
          m.data.turns -= 1;
          if (m.data.turns <= 0) {
            Effect.unmark(p, m.name);
            this.log(p.name + ' 的防御' + (m.data.delta > 0 ? '增益' : '减益') + '结束。', 'turn');
          }
        }

        // 攻击范围buff回合递减（标记系统管理）
        const atkRangeMarks = marks.filter(m => m.modifiers && m.modifiers.attackRangeDelta);
        for (const m of atkRangeMarks) {
          if (m.data && typeof m.data.turns === 'number') {
            m.data.turns -= 1;
            m.modifiers.attackRangeTurns = m.data.turns;
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

        // 隐身回合数递减
        const stealthMarks = marks.filter(m => m.modifiers && m.modifiers.stealthTurns);
        for (const m of stealthMarks) {
          if (m.data && typeof m.data.turns === 'number') {
            m.data.turns -= 1;
            m.modifiers.stealthTurns = m.data.turns;
            if (m.data.turns <= 0) {
              Effect.unmark(p, m.name);
              this.log(p.name + ' 的隐身效果结束。', 'turn');
            }
          }
        }

        // 伤害分摊回合数递减
        const linkMarks = marks.filter(m => m.modifiers && m.modifiers.linkTurns);
        for (const m of linkMarks) {
          if (m.data && typeof m.data.turns === 'number') {
            m.data.turns -= 1;
            m.modifiers.linkTurns = m.data.turns;
            if (m.data.turns <= 0) Effect.unmark(p, m.name);
          }
        }
      }

      // 复活检查：遍历所有已死亡的棋子，若有 revive 标记且倒计时归零则复活
      const deadPieces = this.pieces.filter(p => !p.alive);
      for (const p of deadPieces) {
        const reviveMark = Effect.getMarksOn(p).find(m => m.modifiers && m.modifiers.reviveTurns);
        if (!reviveMark) continue;
        reviveMark.data.turns -= 1;
        reviveMark.modifiers.reviveTurns = reviveMark.data.turns;
        if (reviveMark.data.turns <= 0) {
          // 复活：若原位置被占，找最近的空位
          if (this.pieceAt(p.x, p.y)) {
            const SIZE = Range.BOARD_SIZE;
            let found = false;
            for (let r = 1; r <= 3 && !found; r++) {
              for (let dy = -r; dy <= r && !found; dy++) {
                for (let dx = -r; dx <= r && !found; dx++) {
                  const nx = p.x + dx, ny = p.y + dy;
                  if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && !this.pieceAt(nx, ny)) {
                    p.x = nx; p.y = ny;
                    found = true;
                  }
                }
              }
            }
          }
          p.alive = true;
          p.hp = Math.max(1, Math.floor(p.maxHp * (reviveMark.data.ratio || 0.3)));
          p.moved = false;
          p.attacked = false;
          p.skilled = false;
          Effect.unmark(p, 'revive');
          this.log('【复活】' + p.name + ' 以 ' + p.hp + ' 点生命重返战场！', 'turn');
          this._showFloatText(p.x, p.y, '复活!', 'heal');
        }
      }

      // 陷阱回合数递减（在双方回合结束时统一处理）
      if (Effect._traps && Effect._traps.length) {
        for (let i = Effect._traps.length - 1; i >= 0; i--) {
          const t = Effect._traps[i];
          t.turns -= 1;
          if (t.turns <= 0) {
            Effect._traps.splice(i, 1);
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
          p.className = 'piece ' + piece.side + (done ? ' acted' : '') + (lowHp ? ' hp-low' : '') + (piece.isMinion ? ' minion ' + piece.rarity : '');
          // 隐身棋子半透明
          if (Effect.isUntargetable(piece)) p.style.opacity = '0.45';

          // 立绘（有则显示，覆盖棋子主体）
          const portraitUrl = this._getPortraitUrl(piece);
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
        else if (mods.undyingStacks) markLabels.push('屈');
        else if (mods.reviveTurns) markLabels.push('魂');
        else if (mods.stealthTurns) markLabels.push('隐');
        else if (mods.linkPartner) markLabels.push('链');
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
        const limitedUsed = sk.limited && this._limitedUsed && this._limitedUsed[sk.id];
        const usable = !a.skilled && cdLeft <= 0 && !limitedUsed && (!sk.filter || sk.filter(a));
        let label = sk.name;
        if (sk.limited) label = '限·' + label;
        if (sk.cooldown && cdLeft > 0) label += '(' + cdLeft + ')';
        if (limitedUsed) label += '(已用)';
        btn.textContent = label;
        btn.disabled = !usable;
        btn.title = '【' + sk.name + '】' + (sk.limited ? ' 限定技（本局仅一次）' : '') + (sk.cooldown ? ' 冷却 ' + sk.cooldown + ' 回合' : '') + (sk.desc ? '\n' + sk.desc : '');
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
              if (p.side !== this.currentSide) return;
              if (!this._onlineCanAct(this.currentSide, this._onlineAction)) return;
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
        const pool = this.draftPool.filter(g =>
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
        const sideName = side === 'red' ? '红' : '蓝';
        // 联机模式下，未轮到自己时提示"等待对方选将"，避免误导玩家点击
        let suffix = ' · 点击武将卡挑选';
        if (this.onlineMode && side !== this._onlineSide) {
          suffix = ' · 等待对方选将...';
        } else if (this.aiMode && side === this.aiSide) {
          suffix = ' · AI 思考中...';
        }
        status.innerHTML = '选将 · 第 ' + (this.draftIndex + 1) + ' 选 · <b>' + sideName + '方</b>' + suffix;
        cards.innerHTML = '';
        const pool = this.draftPool.filter(g =>
          !this.pickedRed.find(p => p.id === g.id) &&
          !this.pickedBlue.find(p => p.id === g.id)
        );
        const self = this;
        for (const g of pool) {
          const draftSide = this.draftIndex % 2 === 0 ? 'red' : 'blue';
          const canClick = !(this.aiMode && draftSide === this.aiSide) && this._onlineCanAct(draftSide);
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
        // 联机模式下未轮到自己布阵时提示等待
        if (this.onlineMode && side !== this._onlineSide) {
          tip = ' · 等待对方布阵...';
        } else if (this.aiMode && side === this.aiSide) {
          tip = ' · AI 布阵中...';
        }
        status.innerHTML = '布阵 · <b>' + (side === 'red' ? '红' : '蓝') + '方</b> · 剩余 ' + pending.length + ' 将' + tip;
        cards.innerHTML = '';
        const self = this;
        const canDeployClick = this._onlineCanAct(side);
        for (const g of pending) {
          const card = buildDraftCard(g, canDeployClick ? () => self._selectForDeploy(g) : null);
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
      if (this.over) return;

      // 联机模式：控制本地玩家的操作权限
      if (this.onlineMode) {
        let myTurn = false;
        if (this.phase === 'draft') {
          const side = this.draftIndex % 2 === 0 ? 'red' : 'blue';
          if (side === this._onlineSide) myTurn = true;
        } else if (this.phase === 'deploy') {
          if (this.deploySide === this._onlineSide) myTurn = true;
        } else if (this.phase === 'minion_deploy') {
          if (this.minionDeploySide === this._onlineSide) myTurn = true;
        } else if (this.phase === 'battle') {
          if (this.currentSide === this._onlineSide) myTurn = true;
        }
        this._turnEnding = false;
        this._aiActing = false;
        const endBtn = document.getElementById('btn-end');
        if (endBtn) endBtn.disabled = !myTurn;
        return;
      }

      if (!this.aiMode) return;
      let aiShouldAct = false;
      if (this.phase === 'draft') {
        const side = this.draftIndex % 2 === 0 ? 'red' : 'blue';
        if (side === this.aiSide) aiShouldAct = true;
      } else if (this.phase === 'deploy') {
        if (this.deploySide === this.aiSide) aiShouldAct = true;
      } else if (this.phase === 'minion_deploy') {
        if (this.minionDeploySide === this.aiSide) aiShouldAct = true;
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
      else if (this.phase === 'minion_deploy') this._aiDeployMinion();
      else if (this.phase === 'battle') this._aiBattleStep();
    },

    _aiDeployMinion() {
      const side = this.minionDeploySide;
      const hand = this.minionHand[side] || [];
      const points = this.minionPoints[side];

      const deployable = hand.filter(c => c.cost <= points);
      if (!deployable.length) {
        this._endMinionDeploy();
        return;
      }

      deployable.sort((a, b) => {
        const valA = (a.atk + a.def) / a.cost;
        const valB = (b.atk + b.def) / b.cost;
        return valB - valA;
      });

      const card = deployable[0];

      const half = SIZE / 2;
      const candidates = [];

      for (let x = 0; x < SIZE; x++) {
        for (let y = 0; y < SIZE; y++) {
          const isOwnHalf = side === 'red' ? y >= half : y < half;
          if (isOwnHalf && !this.pieceAt(x, y)) {
            candidates.push({ x, y });
          }
        }
      }

      if (!candidates.length) {
        this._endMinionDeploy();
        return;
      }

      const allies = this.pieces.filter(p => p.alive && p.side === side && !p.isMinion);
      let bestPos = candidates[0];
      let bestScore = -Infinity;

      for (const pos of candidates) {
        let score = 0;

        for (const ally of allies) {
          const dist = Math.abs(pos.x - ally.x) + Math.abs(pos.y - ally.y);
          if (dist <= 2) score += (3 - dist) * 10;
        }

        const enemyDist = side === 'red' ? pos.y : (SIZE - 1 - pos.y);
        score += enemyDist * 5;

        if (score > bestScore) {
          bestScore = score;
          bestPos = pos;
        }
      }

      this._deployMinion(card, bestPos.x, bestPos.y);

      if (this.minionPoints[side] > 0 && this.minionHand[side].length > 0) {
        const self = this;
        setTimeout(() => self._aiDeployMinion(), 600);
      } else {
        const self = this;
        setTimeout(() => self._endMinionDeploy(), 800);
      }
    },

    _aiPickGeneral() {
      const pool = this.draftPool.filter(g =>
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
          if (skill.limited && this._limitedUsed && this._limitedUsed[skill.id]) continue;
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

      // ===== 2.5 多类型技能评估（支持 types 数组）=====
      const types = hint.types || [hint.type];
      const hpRatio = actor.hp / (actor.maxHp || 200);
      const hpMissing = (actor.maxHp || 200) - actor.hp;
      let hasHealType = false, hasBuffAtkType = false, hasBuffDefType = false, hasDamageType = false;
      for (const t of types) {
        if (t === 'heal') hasHealType = true;
        else if (t === 'buff_atk') hasBuffAtkType = true;
        else if (t === 'buff_def' || t === 'buff') hasBuffDefType = true;
        else if (t === 'damage') hasDamageType = true;
      }

      if (hasHealType && (hasBuffAtkType || hasDamageType)) {
        if (hpRatio < 0.4) {
          score *= 1.5;
        } else if (hpRatio > 0.8) {
          score *= 1.2;
        }
      }

      if (hasHealType && hpRatio >= 0.99) {
        score *= 0.4;
      }

      // 攻击增益类技能：附近有敌人且能攻击到时，提前使用增益再攻击
      if (hasBuffAtkType && !actor.attacked) {
        const atkTarget = this._aiBestAttackTarget(actor);
        if (atkTarget) {
          // 增益后攻击能多造成的伤害值
          const buffAmount = hint.power || 30;
          const currentAtk = Effect.getEffectiveAttack(actor);
          const buffedAtk = currentAtk + buffAmount;
          // 增益前无法击杀、增益后能击杀 → 大幅加分
          if (atkTarget.hp > currentAtk && atkTarget.hp <= buffedAtk) {
            score += Effect._aiThreat(atkTarget) * 1.5 + 60;
          } else {
            // 增益后多造成的伤害价值
            score += buffAmount * 0.8 + 25;
          }
        }
      }

      // 防御增益类技能：当前位置受到威胁时加分
      if (hasBuffDefType) {
        const posThreat = Effect._aiPositionThreat(actor);
        if (posThreat > 0) {
          score += Math.min(40, posThreat * 0.3);
        }
      }

      if (hasDamageType) {
        const enemiesNear = this.pieces.filter(p => p.alive && p.side !== side && Math.abs(p.x - actor.x) + Math.abs(p.y - actor.y) <= 3).length;
        if (enemiesNear === 0) score *= 0.5;
      }

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
      const atkRange = Effect.getEffectiveAttackRange(actor);
      const cells = Range.cellsInRangeWithBlock(atkRange.shape, atkRange.n, actor.x, actor.y, {
        pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; }
      });
      if (!cells.length) return null;

      const allies = this.pieces.filter(p => p.alive && p.side === side);
      const atk = Effect.getEffectiveAttack(actor);

      let best = null, bestScore = -1;
      for (const c of cells) {
        const p = this.pieceAt(c.x, c.y);
        if (!p || !p.alive || p.side === side) continue;
        if (Effect.isUntargetable(p)) continue; // 隐身单位不可被攻击

        let score = Effect._aiThreat(p);

        if (p.hp <= atk) score *= 2.5;

        let allyCanAttack = 0;
        for (const a of allies) {
          if (a === actor) continue;
          const aAtkCells = Range.cellsInRangeWithBlock(a.attackRange.shape, a.attackRange.n, a.x, a.y, {
            pieceAt: (x, y) => { const pp = this.pieceAt(x, y); return (pp && pp.alive) ? pp : null; }
          });
          if (aAtkCells.some(ac => ac.x === p.x && ac.y === p.y)) {
            allyCanAttack++;
          }
        }
        if (allyCanAttack > 0) score += allyCanAttack * 15;

        const pAtk = Effect.getEffectiveAttack(p);
        let protectingAlly = false;
        for (const a of allies) {
          if (a.hp / (a.maxHp || 200) < 0.5) {
            const pAtkRange = Range.cellsInRangeWithBlock(p.attackRange.shape, p.attackRange.n, p.x, p.y, {
              pieceAt: (x, y) => { const pp = this.pieceAt(x, y); return (pp && pp.alive) ? pp : null; }
            });
            if (pAtkRange.some(ac => ac.x === a.x && ac.y === a.y)) {
              protectingAlly = true;
              break;
            }
          }
        }
        if (protectingAlly) score += 20;

        if (p.hp / (p.maxHp || 200) < 0.3) {
          let otherAllyCanKill = false;
          for (const a of allies) {
            if (a === actor) continue;
            const aAtk = Effect.getEffectiveAttack(a);
            if (aAtk >= p.hp) {
              const aAtkCells = Range.cellsInRangeWithBlock(a.attackRange.shape, a.attackRange.n, a.x, a.y, {
                pieceAt: (x, y) => { const pp = this.pieceAt(x, y); return (pp && pp.alive) ? pp : null; }
              });
              if (aAtkCells.some(ac => ac.x === p.x && ac.y === p.y)) {
                otherAllyCanKill = true;
                break;
              }
            }
          }
          if (!otherAllyCanKill) score += 30;
        }

        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      return best;
    },

    // 找最佳移动落点（朝最近敌人靠近，且尽量能攻击到）
    _aiBestMoveDest(actor) {
      const side = actor.side;
      const moveRange = Effect.getEffectiveMoveRange(actor);
      const moveCells = Range.reachableCells(actor.x, actor.y, moveRange.n, this, moveRange.shape);
      const enemies = this.pieces.filter(p => p.alive && p.side !== side);
      const allies = this.pieces.filter(p => p.alive && p.side === side && p !== actor);
      if (!enemies.length || !moveCells.length) return null;

      const hpRatio = actor.hp / (actor.maxHp || 200);
      const posThreat = Effect._aiPositionThreat(actor);
      const shouldEscape = hpRatio < 0.4 && posThreat > Effect.getEffectiveAttack(actor) * 2;
      const hasLowHpAlly = allies.some(a => a.hp / (a.maxHp || 200) < 0.3);

      const emptyMoves = moveCells.filter(c => !this.pieceAt(c.x, c.y));
      if (!emptyMoves.length) return null;

      let best = null, bestScore = -Infinity;

      for (const m of emptyMoves) {
        let score = 0;

        if (shouldEscape) {
          let minDist = Infinity;
          for (const e of enemies) {
            const dist = Math.abs(m.x - e.x) + Math.abs(m.y - e.y);
            minDist = Math.min(minDist, dist);
          }
          const currentMinDist = Math.min(...enemies.map(e => Math.abs(actor.x - e.x) + Math.abs(actor.y - e.y)));
          score = minDist * 20;
          if (minDist > currentMinDist) score += 50;
        } else {
          const nearest = enemies.reduce((a, b) => {
            const da = Math.abs(a.x - actor.x) + Math.abs(a.y - actor.y);
            const db = Math.abs(b.x - actor.x) + Math.abs(b.y - actor.y);
            return da < db ? a : b;
          });
          const dist = Math.abs(m.x - nearest.x) + Math.abs(m.y - nearest.y);
          score = Math.max(10, 60 - dist * 3);

          const atkCells = Range.cellsInRangeWithBlock(actor.attackRange.shape, actor.attackRange.n, m.x, m.y, {
            pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; }
          });
          for (const ac of atkCells) {
            const p = this.pieceAt(ac.x, ac.y);
            if (p && p.alive && p.side !== side) {
              score += Effect._aiThreat(p) * 0.8;
              if (p.hp <= Effect.getEffectiveAttack(actor)) score += 60;
            }
          }

          if (hasLowHpAlly) {
            const lowHpAlly = allies.find(a => a.hp / (a.maxHp || 200) < 0.3);
            if (lowHpAlly) {
              const allyDist = Math.abs(m.x - lowHpAlly.x) + Math.abs(m.y - lowHpAlly.y);
              const currentAllyDist = Math.abs(actor.x - lowHpAlly.x) + Math.abs(actor.y - lowHpAlly.y);
              if (allyDist < currentAllyDist) {
                score += (currentAllyDist - allyDist) * 5;
              }
            }
          }

          const terrain = this.terrain[m.y] ? this.terrain[m.y][m.x] : 'plain';
          if (terrain === 'm') score += 10;
          else if (terrain === 'f') score += 5;

          let allyProtection = 0;
          for (const a of allies) {
            const allyDist = Math.abs(m.x - a.x) + Math.abs(m.y - a.y);
            if (allyDist <= 1) {
              allyProtection += (a.def || 0) * 0.2;
            }
          }
          score += allyProtection;

          let canBlock = false;
          for (const e of enemies) {
            const eMoveCells = Range.reachableCells(e.x, e.y, e.moveRange.n, this, e.moveRange.shape);
            const eAtkCells = Range.cellsInRangeWithBlock(e.attackRange.shape, e.attackRange.n, e.x, e.y, {
              pieceAt: (x, y) => { const p = this.pieceAt(x, y); return (p && p.alive) ? p : null; }
            });
            for (const ally of allies) {
              if (ally.hp / (ally.maxHp || 200) < 0.5) {
                const eCanReach = eMoveCells.some(c => c.x === ally.x && c.y === ally.y);
                const eCanAttack = eAtkCells.some(c => c.x === ally.x && c.y === ally.y);
                if (eCanReach || eCanAttack) {
                  const distToAlly = Math.abs(m.x - ally.x) + Math.abs(m.y - ally.y);
                  const distToEnemy = Math.abs(m.x - e.x) + Math.abs(m.y - e.y);
                  if (distToAlly <= 1 && distToEnemy <= e.moveRange.n + 1) {
                    canBlock = true;
                    break;
                  }
                }
              }
            }
            if (canBlock) break;
          }
          if (canBlock) score += 40;
        }

        if (score > bestScore) {
          bestScore = score;
          best = { x: m.x, y: m.y, score };
        }
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
          if (skill.limited) {
            self._limitedUsed = self._limitedUsed || {};
            self._limitedUsed[skill.id] = true;
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
            if (skill.limited && self._limitedUsed && self._limitedUsed[skill.id]) continue;
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
      Effect._checkTraps(actor); // 陷阱触发
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
        const home = document.getElementById('home-screen');
        const app = document.getElementById('app');
        const onlineScreen = document.getElementById('online-screen');
        const roomScreen = document.getElementById('room-screen');
        if (home) home.classList.remove('hidden');
        if (app) app.classList.add('hidden');
        if (onlineScreen) onlineScreen.classList.add('hidden');
        if (roomScreen) roomScreen.classList.add('hidden');
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
    const onlineBtn = document.getElementById('btn-online');
    const aiBtn = document.getElementById('btn-ai');
    const diyBtn = document.getElementById('btn-diy');
    const homeBtn = document.getElementById('btn-home');
    if (localBtn) localBtn.addEventListener('click', () => { tryPlayBgm(true); Game.startGame('local'); });
    if (onlineBtn) onlineBtn.addEventListener('click', () => { showOnlineScreen(); });
    if (aiBtn) aiBtn.addEventListener('click', () => { tryPlayBgm(true); Game.startGame('ai'); });
    if (diyBtn) diyBtn.addEventListener('click', () => { window.location.href = 'diy.html'; });
    if (homeBtn) homeBtn.addEventListener('click', () => Game.goHome());

    // ========== 武将图鉴 ==========
    const galleryBtn = document.getElementById('btn-gallery');
    if (galleryBtn) galleryBtn.addEventListener('click', () => { showGalleryScreen(); });

    function shapeText(shape) {
      if (shape === '+') return '十字';
      if (shape === 'x') return '斜角';
      if (shape === 'r') return '圆形';
      if (shape === 'square') return '方形';
      return shape;
    }

    function resolveGeneralSkills(g) {
      const rawSkills = (g.skills && g.skills.length) ? g.skills : (g.skill ? [g.skill] : []);
      return rawSkills.map(function(s) {
        if (typeof s === 'string') return (global.SkillsAPI && global.SkillsAPI.getSkill(s)) || { name: s, desc: '', type: '' };
        if (typeof s === 'object' && typeof s.content === 'function') return s;
        if (typeof s === 'object' && typeof s.contentCode === 'string') {
          return (global.SkillsAPI && global.SkillsAPI.compileSkill(s)) || s;
        }
        return s;
      }).filter(Boolean);
    }

    let gallerySearchTerm = '';
    let galleryFilterMode = 'all';

    function showGalleryScreen() {
      document.getElementById('home-screen').classList.add('hidden');
      document.getElementById('gallery-screen').classList.remove('hidden');
      renderGallery();
    }

    function hideGalleryScreen() {
      document.getElementById('gallery-screen').classList.add('hidden');
      document.getElementById('home-screen').classList.remove('hidden');
    }

    function renderGallery() {
      const grid = document.getElementById('gallery-grid');
      const statsBar = document.getElementById('gallery-stats-bar');
      if (!grid) return;
      grid.innerHTML = '';

      const all = Generals.list.slice();
      const total = all.length;

      // 过滤
      let filtered = all.filter(function(g) {
        // 搜索过滤
        if (gallerySearchTerm) {
          var term = gallerySearchTerm.toLowerCase();
          var skills = resolveGeneralSkills(g);
          var skillMatch = skills.some(function(s) {
            return (s.name && s.name.toLowerCase().indexOf(term) >= 0) ||
                   (s.desc && s.desc.toLowerCase().indexOf(term) >= 0);
          });
          var nameMatch = g.name && g.name.toLowerCase().indexOf(term) >= 0;
          if (!nameMatch && !skillMatch) return false;
        }
        // 技能类型过滤
        if (galleryFilterMode !== 'all') {
          var skills2 = resolveGeneralSkills(g);
          var hasType = skills2.some(function(s) {
            if (galleryFilterMode === 'active') return s.type !== '被动';
            if (galleryFilterMode === 'passive') return s.type === '被动';
            return true;
          });
          if (!hasType) return false;
        }
        return true;
      });

      // 统计栏
      if (statsBar) {
        var activeCount = 0, passiveCount = 0;
        all.forEach(function(g) {
          resolveGeneralSkills(g).forEach(function(s) {
            if (s.type === '被动') passiveCount++;
            else activeCount++;
          });
        });
        statsBar.textContent = '共 ' + total + ' 位武将 · ' + activeCount + ' 个主动技 · ' + passiveCount + ' 个被动技' +
          (filtered.length !== total ? ' · 当前筛选 ' + filtered.length + ' 位' : '');
      }

      if (filtered.length === 0) {
        grid.innerHTML = '<div class="gallery-empty">没有找到匹配的武将</div>';
        return;
      }

      filtered.forEach(function(g) {
        grid.appendChild(buildGalleryCard(g));
      });
    }

    function buildGalleryCard(g) {
      var card = document.createElement('div');
      card.className = 'gcard';

      // 立绘
      var portraitWrap = document.createElement('div');
      portraitWrap.className = 'gcard-portrait';
      if (g.portrait) {
        var img = document.createElement('img');
        img.src = '/portraits/' + g.portrait;
        img.alt = g.name;
        img.onerror = function() {
          portraitWrap.innerHTML = '<span class="gcard-no-portrait">' + g.name.charAt(0) + '</span>';
        };
        portraitWrap.appendChild(img);
      } else {
        portraitWrap.innerHTML = '<span class="gcard-no-portrait">' + (g.name ? g.name.charAt(0) : '?') + '</span>';
      }
      card.appendChild(portraitWrap);

      // 名字条
      var nameBar = document.createElement('div');
      nameBar.className = 'gcard-name-bar';
      nameBar.innerHTML = '<span class="gcard-name">' + g.name + '</span>' +
        '<span class="gcard-id">' + g.id + '</span>';
      card.appendChild(nameBar);

      // 属性
      var stats = document.createElement('div');
      stats.className = 'gcard-stats';
      stats.innerHTML =
        '<div class="gcard-stat hp"><div class="gcard-stat-val">' + g.hp + '</div><div class="gcard-stat-label">生命</div></div>' +
        '<div class="gcard-stat atk"><div class="gcard-stat-val">' + g.atk + '</div><div class="gcard-stat-label">攻击</div></div>' +
        '<div class="gcard-stat def"><div class="gcard-stat-val">' + g.def + '</div><div class="gcard-stat-label">防御</div></div>';
      card.appendChild(stats);

      // 移动/攻击范围
      var rangeDiv = document.createElement('div');
      rangeDiv.className = 'gcard-range';
      var moveShape = (g.moveRange && g.moveRange.shape) || '+';
      var moveN = (g.moveRange && g.moveRange.n) || 0;
      var atkShape = (g.attackRange && g.attackRange.shape) || '+';
      var atkN = (g.attackRange && g.attackRange.n) || 0;
      rangeDiv.innerHTML =
        '<span class="gcard-range-item">移动 ' + shapeText(moveShape) + moveN + '</span>' +
        '<span class="gcard-range-item">攻击 ' + shapeText(atkShape) + atkN + '</span>';
      card.appendChild(rangeDiv);

      // 技能列表
      var skillsDiv = document.createElement('div');
      skillsDiv.className = 'gcard-skills';
      var skills = resolveGeneralSkills(g);
      if (skills.length === 0) {
        skillsDiv.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0;">无技能</div>';
      } else {
        skills.forEach(function(s) {
          var skillDiv = document.createElement('div');
          skillDiv.className = 'gcard-skill';
          var isPassive = s.type === '被动';
          var tagClass = isPassive ? 'passive' : 'active';
          var tagName = isPassive ? '被动' : '主动';
          var cdText = (!isPassive && s.cooldown) ? 'CD ' + s.cooldown : '';
          skillDiv.innerHTML =
            '<div class="gcard-skill-head">' +
              '<span class="gcard-skill-tag ' + tagClass + '">' + tagName + '</span>' +
              '<span class="gcard-skill-name">' + (s.name || s.id || '未命名') + '</span>' +
              (cdText ? '<span class="gcard-skill-cd">' + cdText + '</span>' : '') +
            '</div>' +
            '<div class="gcard-skill-desc">' + (s.desc || '暂无描述') + '</div>';
          skillsDiv.appendChild(skillDiv);
        });
      }
      card.appendChild(skillsDiv);

      // 点击打开详情
      card.addEventListener('click', function() {
        openGalleryDetail(g);
      });

      return card;
    }

    function openGalleryDetail(g) {
      var modal = document.getElementById('gallery-detail-modal');
      var body = document.getElementById('gallery-detail-body');
      if (!modal || !body) return;

      var skills = resolveGeneralSkills(g);
      var html = '';

      // 大立绘
      html += '<div class="gd-portrait">';
      if (g.portrait) {
        html += '<img src="/portraits/' + g.portrait + '" alt="' + g.name + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" />';
        html += '<span class="gd-no-portrait" style="display:none;">' + g.name.charAt(0) + '</span>';
      } else {
        html += '<span class="gd-no-portrait">' + (g.name ? g.name.charAt(0) : '?') + '</span>';
      }
      html += '</div>';

      // 内容区
      html += '<div class="gd-content">';
      html += '<h2 class="gd-name">' + g.name + '</h2>';
      html += '<div class="gd-id">ID: ' + g.id + '</div>';

      // 属性
      html += '<div class="gd-stats">';
      html += '<div class="gd-stat hp"><div class="gd-stat-val">' + g.hp + '</div><div class="gd-stat-label">生命</div></div>';
      html += '<div class="gd-stat atk"><div class="gd-stat-val">' + g.atk + '</div><div class="gd-stat-label">攻击</div></div>';
      html += '<div class="gd-stat def"><div class="gd-stat-val">' + g.def + '</div><div class="gd-stat-label">防御</div></div>';
      html += '</div>';

      // 范围
      var moveShape = (g.moveRange && g.moveRange.shape) || '+';
      var moveN = (g.moveRange && g.moveRange.n) || 0;
      var atkShape = (g.attackRange && g.attackRange.shape) || '+';
      var atkN = (g.attackRange && g.attackRange.n) || 0;
      html += '<div class="gd-range">';
      html += '<span>移动范围：' + shapeText(moveShape) + ' ' + moveN + ' 格</span>';
      html += '<span>攻击范围：' + shapeText(atkShape) + ' ' + atkN + ' 格</span>';
      html += '</div>';

      // 技能
      html += '<h3 class="gd-section-title">技能</h3>';
      if (skills.length === 0) {
        html += '<div style="font-size:13px;color:var(--muted);padding:8px 0;">该武将暂无技能</div>';
      } else {
        skills.forEach(function(s) {
          var isPassive = s.type === '被动';
          var tagClass = isPassive ? 'passive' : 'active';
          var tagName = isPassive ? '被动' : '主动';
          var cdText = (!isPassive && s.cooldown) ? '冷却 ' + s.cooldown + ' 回合' : '';
          var triggerText = (isPassive && s.trigger) ? s.trigger : '';
          html += '<div class="gd-skill">';
          html += '<div class="gd-skill-head">';
          html += '<span class="gd-skill-tag ' + tagClass + '">' + tagName + '</span>';
          html += '<span class="gd-skill-name">' + (s.name || s.id || '未命名') + '</span>';
          if (cdText) html += '<span class="gd-skill-cd">' + cdText + '</span>';
          if (triggerText) html += '<span class="gd-skill-trigger">触发：' + triggerText + '</span>';
          html += '</div>';
          html += '<div class="gd-skill-desc">' + (s.desc || '暂无描述') + '</div>';
          html += '</div>';
        });
      }

      html += '</div>';

      body.innerHTML = html;
      modal.classList.remove('hidden');
    }

    // 图鉴返回按钮
    var galleryBackBtn = document.getElementById('btn-gallery-back');
    if (galleryBackBtn) galleryBackBtn.addEventListener('click', hideGalleryScreen);

    // 图鉴搜索
    var gallerySearchInput = document.getElementById('gallery-search');
    if (gallerySearchInput) {
      gallerySearchInput.addEventListener('input', function() {
        gallerySearchTerm = this.value.trim();
        renderGallery();
      });
    }

    // 图鉴筛选
    document.querySelectorAll('.gallery-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.gallery-filter-btn').forEach(function(b) { b.classList.remove('selected'); });
        this.classList.add('selected');
        galleryFilterMode = this.getAttribute('data-filter');
        renderGallery();
      });
    });

    // 图鉴详情关闭
    var galleryDetailClose = document.getElementById('gallery-detail-close');
    if (galleryDetailClose) galleryDetailClose.addEventListener('click', function() {
      document.getElementById('gallery-detail-modal').classList.add('hidden');
    });
    var galleryDetailBackdrop = document.querySelector('.gallery-detail-backdrop');
    if (galleryDetailBackdrop) galleryDetailBackdrop.addEventListener('click', function() {
      document.getElementById('gallery-detail-modal').classList.add('hidden');
    });

    // ========== 联机模式界面逻辑 ==========
    let selectedOnlineMode = '3v3';

    function showOnlineScreen() {
      document.getElementById('home-screen').classList.add('hidden');
      document.getElementById('online-screen').classList.remove('hidden');
      document.getElementById('room-screen').classList.add('hidden');
      selectedOnlineMode = '3v3';
      updateOnlineModeSelection();
      document.getElementById('online-name').value = localStorage.getItem('zhanqi_online_name') || '';
      document.getElementById('online-room-id').value = '';
      document.getElementById('online-status').textContent = '等待操作...';
      document.getElementById('online-join-input').classList.add('hidden');
      Online.disconnect();
    }

    function hideOnlineScreen() {
      document.getElementById('online-screen').classList.add('hidden');
      document.getElementById('room-screen').classList.add('hidden');
      document.getElementById('home-screen').classList.remove('hidden');
      Online.disconnect();
    }

    function showRoomScreen() {
      document.getElementById('online-screen').classList.add('hidden');
      document.getElementById('room-screen').classList.remove('hidden');
    }

    function updateOnlineModeSelection() {
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-mode') === selectedOnlineMode);
      });
    }

    // 模式选择
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedOnlineMode = btn.getAttribute('data-mode');
        updateOnlineModeSelection();
      });
    });

    // 创建房间
    const btnCreateRoom = document.getElementById('btn-create-room');
    if (btnCreateRoom) {
      btnCreateRoom.addEventListener('click', () => {
        const name = document.getElementById('online-name').value.trim() || '玩家';
        localStorage.setItem('zhanqi_online_name', name);
        document.getElementById('online-status').textContent = '正在创建房间...';
        btnCreateRoom.disabled = true;
        Online.createRoom(selectedOnlineMode, name);
      });
    }

    // 加入房间
    const btnJoinRoom = document.getElementById('btn-join-room');
    const btnDoJoin = document.getElementById('btn-do-join');
    const onlineJoinInput = document.getElementById('online-join-input');
    if (btnJoinRoom) {
      btnJoinRoom.addEventListener('click', () => {
        onlineJoinInput.classList.toggle('hidden');
      });
    }
    if (btnDoJoin) {
      btnDoJoin.addEventListener('click', () => {
        const roomId = document.getElementById('online-room-id').value.trim();
        const name = document.getElementById('online-name').value.trim() || '玩家';
        if (!roomId) {
          document.getElementById('online-status').textContent = '请输入房间号';
          return;
        }
        localStorage.setItem('zhanqi_online_name', name);
        document.getElementById('online-status').textContent = '正在加入房间...';
        btnDoJoin.disabled = true;
        Online.joinRoom(roomId, name);
      });
    }

    // 返回主页
    const btnOnlineBack = document.getElementById('btn-online-back');
    if (btnOnlineBack) btnOnlineBack.addEventListener('click', hideOnlineScreen);

    // 房间界面
    const btnRoomReady = document.getElementById('btn-room-ready');
    const btnRoomCancel = document.getElementById('btn-room-cancel');
    if (btnRoomReady) {
      btnRoomReady.addEventListener('click', () => {
        btnRoomReady.textContent = '准备中...';
        btnRoomReady.disabled = true;
        Online.ready(Online.roomId);
      });
    }
    if (btnRoomCancel) {
      btnRoomCancel.addEventListener('click', () => {
        Online.disconnect();
        document.getElementById('room-screen').classList.add('hidden');
        document.getElementById('online-screen').classList.remove('hidden');
        btnRoomReady.textContent = '准备就绪';
        btnRoomReady.disabled = false;
      });
    }

    // ========== Online 事件监听 ==========
    Online.on('roomCreated', (data) => {
      document.getElementById('room-id-display').textContent = data.roomId;
      document.getElementById('room-mode-display').textContent = data.mode === '3v3' ? '3v3 对战' : '5v5 对战';
      document.getElementById('player-red-name').textContent = localStorage.getItem('zhanqi_online_name') || '玩家';
      document.getElementById('player-red-ready').textContent = '未准备';
      document.getElementById('player-blue-name').textContent = '等待中...';
      document.getElementById('player-blue-ready').textContent = '未准备';
      btnRoomReady.textContent = '准备就绪';
      btnRoomReady.disabled = false;
      btnCreateRoom.disabled = false;
      showRoomScreen();
    });

    Online.on('roomJoined', (data) => {
      document.getElementById('room-id-display').textContent = data.roomId;
      document.getElementById('room-mode-display').textContent = data.mode === '3v3' ? '3v3 对战' : '5v5 对战';
      document.getElementById('player-blue-name').textContent = localStorage.getItem('zhanqi_online_name') || '玩家';
      document.getElementById('player-blue-ready').textContent = '未准备';
      if (data.players && data.players.length >= 1) {
        const redPlayer = data.players.find(p => p.side === 'red');
        if (redPlayer) document.getElementById('player-red-name').textContent = redPlayer.name;
      }
      btnRoomReady.textContent = '准备就绪';
      btnRoomReady.disabled = false;
      btnDoJoin.disabled = false;
      showRoomScreen();
    });

    Online.on('joinFailed', (data) => {
      document.getElementById('online-status').textContent = '加入失败：' + (data.error || '未知错误');
      btnDoJoin.disabled = false;
    });

    Online.on('playerJoined', (data) => {
      document.getElementById('player-blue-name').textContent = data.player.name;
      document.getElementById('player-blue-ready').textContent = '未准备';
    });

    Online.on('playerLeft', () => {
      document.getElementById('player-blue-name').textContent = '已离开';
      document.getElementById('player-blue-ready').textContent = '未准备';
    });

    Online.on('playerReady', (data) => {
      const myId = Online.socket ? Online.socket.id : '';
      if (Online.side === 'red') {
        if (data.playerId === myId) {
          document.getElementById('player-red-ready').textContent = '已准备';
        } else {
          document.getElementById('player-blue-ready').textContent = '已准备';
        }
      } else {
        if (data.playerId === myId) {
          document.getElementById('player-blue-ready').textContent = '已准备';
        } else {
          document.getElementById('player-red-ready').textContent = '已准备';
        }
      }
    });

    Online.on('gameStart', (data) => {
      GameSettings.onlineMode = data.mode;
      GameSettings.onlineSide = Online.side;
      GameSettings.picksPerSide = data.mode === '3v3' ? 3 : 5;
      GameSettings.draftPoolSize = data.draftPoolSize || (data.mode === '3v3' ? 6 : 10);
      GameSettings.save();

      document.getElementById('room-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      tryPlayBgm(true);
      Game.init('online', { seed: data.seed });
    });

    // 应用一条远端（或历史回放）操作，复用于实时对局与断线重连回放。
    // 返回 Promise：同步动作立即 resolve；异步动作（技能）在 content 执行完毕后 resolve。
    // 这样调用方可串行排队，避免多条远端动作并发回放导致局面错乱。
    Game._applyRemoteAction = function (data) {
      Game._onlineAction = true;  // 标记正在回放，避免重复发送

      if (data.type === 'pick') {
        const general = Generals.list.find(g => g.id === data.generalId);
        if (general) Game._pickGeneral(general);
      } else if (data.type === 'place') {
        const general = Generals.list.find(g => g.id === data.generalId);
        if (general) {
          Game._selectForDeploy(general);
          Game._tryPlacePiece(data.x, data.y);
        }
      } else if (data.type === 'move') {
        const piece = Game.pieceAt(data.fromX, data.fromY);
        if (piece) {
          Game.selected = piece;
          Game._tryMove(data.toX, data.toY);
        }
      } else if (data.type === 'attack') {
        const actor = Game.pieceAt(data.actorX, data.actorY);
        if (actor) {
          Game.selected = actor;
          Game._tryAttack(data.targetX, data.targetY);
        }
      } else if (data.type === 'skill') {
        // 技能异步执行：由 _castSkill 内部维护 _onlineSkillReplay 标记，
        // 贯穿 content 的 await 过程，结束后在 .then()/.catch() 的 _cleanupOnlineSkillState 中复位 _onlineAction。
        const actor = Game.pieceAt(data.actorX, data.actorY);
        let skillPromise = null;
        if (actor) {
          const skill = (actor.skills || []).find(s => s.id === data.skillId);
          if (skill) {
            // 解析目标/选项序列，分别装入对应队列供 chooseCell/chooseOption 依次取用
            Effect._onlineTargetQueue = [];
            Effect._onlineOptionQueue = [];
            try {
              const recorded = data.targets ? JSON.parse(data.targets) : [];
              (recorded || []).forEach(function (r) {
                if (r === null) {
                  Effect._onlineTargetQueue.push(null);           // chooseCell 取消
                } else if (typeof r === 'object') {
                  if ('opt' in r) {
                    Effect._onlineOptionQueue.push(r.opt);        // chooseOption 选择
                  } else if ('x' in r) {
                    Effect._onlineTargetQueue.push({ x: r.x, y: r.y }); // chooseCell 目标
                  }
                }
              });
            } catch (e) {
              Effect._onlineTargetQueue = [];
              Effect._onlineOptionQueue = [];
            }
            Game.selected = actor;
            skillPromise = Game._castSkill(skill);  // 返回 Promise（_cleanupOnlineSkillState 会复位 _onlineAction）
          }
        }
        // 异步技能：等其结束后再 resolve，保证串行回放
        return Promise.resolve(skillPromise).then(function () {
          if (Game._onlineAction) Game._onlineAction = false;  // 兜底复位（actor/skill 缺失时）
        });
      } else if (data.type === 'endTurn') {
        Game.endTurn();
      }

      Game._onlineAction = false;
      return Promise.resolve();
    };

    // 远端动作串行队列：避免异步技能回放期间下一条动作并发执行
    Game._remoteQueue = [];
    Game._remoteBusy = false;
    Game._remoteDrainWaiters = null;
    Game._drainRemoteQueue = function () {
      if (Game._remoteBusy) return;
      const next = Game._remoteQueue.shift();
      if (!next) {
        // 队列空：唤醒所有等待"回放排空"的回调（如重连回放完成提示）
        if (Game._remoteDrainWaiters) {
          const ws = Game._remoteDrainWaiters; Game._remoteDrainWaiters = null;
          ws.forEach(function (fn) { try { fn(); } catch (e) {} });
        }
        return;
      }
      Game._remoteBusy = true;
      Promise.resolve(Game._applyRemoteAction(next)).then(function () {
        Game._remoteBusy = false;
        Game._drainRemoteQueue();
      }).catch(function (e) {
        console.error('[online] 远端动作回放出错:', e);
        Game._remoteBusy = false;
        Game._drainRemoteQueue();
      });
    };
    // 返回 Promise：在当前队列全部回放完毕后 resolve（用于重连后等待状态稳定）
    Game._waitRemoteDrain = function () {
      return new Promise(function (resolve) {
        if (!Game._remoteBusy && !Game._remoteQueue.length) { resolve(); return; }
        Game._remoteDrainWaiters = Game._remoteDrainWaiters || [];
        Game._remoteDrainWaiters.push(resolve);
      });
    };

    // 联机游戏操作回放（实时）
    Online.on('gameAction', (data) => {
      if (!Game.onlineMode) return;
      if (data.fromSide === Game._onlineSide) return;  // 忽略自己发出的操作
      Game._remoteQueue.push(data);
      Game._drainRemoteQueue();
    });

    // 断线重连：用完整操作日志重放出当前局面
    Online.on('rejoined', (data) => {
      GameSettings.onlineMode = data.mode;
      GameSettings.onlineSide = data.side;
      GameSettings.picksPerSide = data.mode === '3v3' ? 3 : 5;
      GameSettings.draftPoolSize = data.draftPoolSize || (data.mode === '3v3' ? 6 : 10);
      GameSettings.save();

      document.getElementById('room-screen').classList.add('hidden');
      document.getElementById('online-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      tryPlayBgm(true);
      showConnBanner('正在重新连接对局...');
      Game.init('online', { seed: data.seed });
      // 重置队列状态，把完整操作日志依次入队（与实时 gameAction 共用同一串行队列，
      // 避免重连回放期间收到实时动作时并发回放导致局面错乱）
      Game._remoteQueue = (data.actionLog || []).slice();
      Game._remoteBusy = false;
      Game._remoteDrainWaiters = null;
      Game._drainRemoteQueue();
      Game._waitRemoteDrain().then(function () {
        hideConnBanner();
        Game.log('已重新连接对局。', 'turn');
      }).catch(function (e) {
        console.error('[online] 重连回放出错:', e);
        hideConnBanner();
        Game.log('已重新连接对局（部分回放失败）。', 'turn');
      });
    });

    Online.on('rejoinFailed', () => {
      hideConnBanner();
      alert('对局已结束，无法恢复连接');
      Game.goHome();
    });

    Online.on('opponentDisconnected', () => {
      if (!Game.onlineMode) return;
      showConnBanner('对方已掉线，等待对方重新连接...');
    });

    Online.on('opponentReconnected', () => {
      if (!Game.onlineMode) return;
      hideConnBanner();
      Game.log('对方已重新连接。', 'turn');
    });

    Online.on('connectionLost', () => {
      if (Game.onlineMode) {
        showConnBanner('与服务器断开，正在尝试重新连接...');
        return;
      }
      Online.disconnect();
      document.getElementById('room-screen').classList.add('hidden');
      document.getElementById('online-screen').classList.add('hidden');
      document.getElementById('home-screen').classList.remove('hidden');
    });

    // 联机断线提示条
    function showConnBanner(text) {
      let el = document.getElementById('conn-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'conn-banner';
        el.className = 'conn-banner';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.classList.remove('hidden');
    }
    function hideConnBanner() {
      const el = document.getElementById('conn-banner');
      if (el) el.classList.add('hidden');
    }

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
        if (GameSettings.gameMode === 'online') {
          showOnlineScreen();
        } else {
          Game.startGame(GameSettings.gameMode);
        }
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
        // 选将阶段且尚未选将时，重新生成将池（联机模式下不修改服务端设定的将池）
        if (Game && Game.phase === 'draft' && Game.draftIndex === 0 && !Game.onlineMode) {
          Game._generateDraftPool();
        }
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

    // 页面刷新/重新打开时，若此前正在联机对局中，尝试自动重连
    if (Online && Online.tryAutoRejoin) {
      Online.tryAutoRejoin();
    }
  });

  global.Game = Game;
  global.GameSettings = GameSettings;
})(window);
