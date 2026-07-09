// ============================================================
// 联机客户端逻辑 (Socket.io)
// ============================================================
(function (global) {
  let socket = null;
  let currentRoomId = null;
  let currentSide = null;
  let onlineMode = null;
  const listeners = {};

  function connect() {
    if (socket && socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        socket = io({ transports: ['websocket', 'polling'] });
        socket.on('connect', () => {
          console.log('[online] 已连接服务器');
          resolve();
        });
        socket.on('connect_error', (err) => {
          console.error('[online] 连接失败:', err.message);
          reject(err);
        });

        // 注册所有事件转发
        const events = [
          'roomCreated', 'roomJoined', 'joinFailed', 'playerJoined',
          'playerLeft', 'playerReady', 'gameStart', 'gameAction'
        ];
        events.forEach(evt => {
          socket.on(evt, (data) => {
            console.log('[online] 收到事件:', evt, data);
            // 更新本地状态
            if (evt === 'roomCreated' || evt === 'roomJoined') {
              currentRoomId = data.roomId;
              currentSide = data.side;
              onlineMode = data.mode;
            }
            // 触发监听器
            (listeners[evt] || []).forEach(fn => fn(data));
          });
        });

        socket.on('disconnect', () => {
          console.log('[online] 断开连接');
          (listeners['connectionLost'] || []).forEach(fn => fn());
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    currentRoomId = null;
    currentSide = null;
    onlineMode = null;
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

  global.Online = {
    connect, disconnect, createRoom, joinRoom, ready, sendAction,
    on, off,
    get roomId() { return currentRoomId; },
    get side() { return currentSide; },
    get mode() { return onlineMode; },
    get connected() { return socket && socket.connected; },
    get socket() { return socket; }
  };
})(window);
