// ============================================================
// 联机客户端逻辑 (Socket.io)
// ============================================================
(function (global) {
  let socket = null;
  let currentRoomId = null;
  let currentSide = null;
  let onlineMode = null;
  let currentToken = null;
  let inGame = false;       // 是否已经进入过对局（用于断线后判断是否需要重连而非直接回大厅）
  const listeners = {};
  const SESSION_KEY = 'zhanqi_online_session';

  function saveSession() {
    if (!currentRoomId || !currentToken) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        roomId: currentRoomId, token: currentToken, side: currentSide,
        mode: onlineMode, ts: Date.now()
      }));
    } catch (_) {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // 会话超过 10 分钟未使用则视为过期，避免误重连到已结束的对局
      if (!data || (Date.now() - (data.ts || 0)) > 10 * 60 * 1000) return null;
      return data;
    } catch (_) { return null; }
  }

  function connect() {
    if (socket && socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        socket = io({ transports: ['websocket', 'polling'], reconnection: true });
        let firstConnect = true;
        socket.on('connect', () => {
          console.log('[online] 已连接服务器');
          if (firstConnect) {
            firstConnect = false;
            resolve();
            return; // 首次连接由调用方（createRoom/joinRoom/tryAutoRejoin）驱动后续动作，避免重复 rejoin
          }
          // 之后的重连（如网络抖动导致 socket.io 自动重连）才在此处自动尝试恢复房间
          if (inGame) {
            const session = loadSession();
            if (session) {
              socket.emit('rejoinRoom', { roomId: session.roomId, token: session.token });
            }
          }
        });
        socket.on('connect_error', (err) => {
          console.error('[online] 连接失败:', err.message);
          reject(err);
        });

        // 注册所有事件转发
        const events = [
          'roomCreated', 'roomJoined', 'joinFailed', 'playerJoined',
          'playerLeft', 'playerReady', 'gameStart', 'gameAction',
          'rejoined', 'rejoinFailed', 'opponentDisconnected', 'opponentReconnected'
        ];
        events.forEach(evt => {
          socket.on(evt, (data) => {
            console.log('[online] 收到事件:', evt, data);
            // 更新本地状态
            if (evt === 'roomCreated' || evt === 'roomJoined') {
              currentRoomId = data.roomId;
              currentSide = data.side;
              onlineMode = data.mode;
              currentToken = data.token;
              saveSession();
            }
            if (evt === 'gameStart') {
              inGame = true;
              saveSession();
            }
            if (evt === 'rejoined') {
              currentRoomId = data.roomId;
              currentSide = data.side;
              onlineMode = data.mode;
              inGame = true;
              saveSession();
            }
            if (evt === 'rejoinFailed') {
              inGame = false;
              clearSession();
            }
            // 触发监听器
            (listeners[evt] || []).forEach(fn => fn(data));
          });
        });

        socket.on('disconnect', () => {
          console.log('[online] 断开连接');
          if (inGame) {
            // 对局进行中掉线：不立即清空状态，等待底层自动重连后走 rejoinRoom
            (listeners['connectionLost'] || []).forEach(fn => fn());
          } else {
            (listeners['connectionLost'] || []).forEach(fn => fn());
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function disconnect() {
    inGame = false;
    clearSession();
    if (socket) {
      if (currentRoomId) {
        try { socket.emit('leaveRoom', currentRoomId); } catch (_) {}
      }
      socket.disconnect();
      socket = null;
    }
    currentRoomId = null;
    currentSide = null;
    onlineMode = null;
    currentToken = null;
  }

  async function createRoom(mode, name) {
    await connect();
    socket.emit('createRoom', { mode, name });
  }

  async function joinRoom(roomId, name) {
    await connect();
    socket.emit('joinRoom', { roomId, name });
  }

  function ready(roomId) {
    if (socket) socket.emit('ready', roomId);
  }

  function sendAction(data) {
    if (socket && currentRoomId) {
      socket.emit('gameAction', { ...data, roomId: currentRoomId });
    }
  }

  function on(evt, fn) {
    if (!listeners[evt]) listeners[evt] = [];
    listeners[evt].push(fn);
  }

  function off(evt, fn) {
    if (!listeners[evt]) return;
    if (fn) {
      listeners[evt] = listeners[evt].filter(f => f !== fn);
    } else {
      listeners[evt] = [];
    }
  }

  // 页面刚加载时，如果本地存有未过期的对局会话，尝试自动重连（例如刷新了页面）
  async function tryAutoRejoin() {
    const session = loadSession();
    if (!session) return false;
    inGame = true;
    currentRoomId = session.roomId;
    currentSide = session.side;
    onlineMode = session.mode;
    currentToken = session.token;
    try {
      await connect();
      socket.emit('rejoinRoom', { roomId: session.roomId, token: session.token });
      return true;
    } catch (e) {
      inGame = false;
      clearSession();
      return false;
    }
  }

  function clearFinishedSession() {
    inGame = false;
    clearSession();
  }

  global.Online = {
    connect, disconnect, createRoom, joinRoom, ready, sendAction,
    on, off, tryAutoRejoin, clearFinishedSession,
    get roomId() { return currentRoomId; },
    get side() { return currentSide; },
    get mode() { return onlineMode; },
    get connected() { return socket && socket.connected; },
    get socket() { return socket; }
  };
})(window);
