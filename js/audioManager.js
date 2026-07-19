// ============================================================
// AudioManager —— 音效/语音/BGM 管理模块
// 负责音频资源注册、预加载、播放、混音、字幕显示
// 通过拓展 soundBank 注册，通过 Effect/Game 事件触发
// ============================================================
(function (global) {
  'use strict';

  // soundId → 资源定义
  const bank = new Map();
  // soundId → HTMLAudioElement（已加载）
  const cache = new Map();
  // 已预加载完成的 soundId
  const loaded = new Set();

  // 设置
  let enabled = true;
  let subtitleEnabled = true;
  let sfxVolume = 0.7;
  let voiceVolume = 1.0;
  let bgmVolume = 0.4;

  // 状态
  let currentBgm = null;
  let bgmAudio = null;
  let lastVoiceAt = 0;
  const VOICE_THROTTLE_MS = 1200;  // 语音节流间隔

  const AudioManager = {
    // ====== 注册（拓展加载时调用）======
    // soundDef: { id, file?, type, volume, subtitle, loop }
    // 注意：soundId 在服务端已统一为 sd_xxx 格式，这里直接用
    register(soundDef) {
      if (!soundDef || !soundDef.id) return;
      bank.set(soundDef.id, {
        id: soundDef.id,
        url: '/api/sound/get?id=' + encodeURIComponent(soundDef.id),
        type: soundDef.type || 'sfx',           // sfx | voice | bgm
        volume: soundDef.volume != null ? soundDef.volume : 0.7,
        subtitle: soundDef.subtitle || '',
        loop: !!soundDef.loop
      });
    },

    registerBatch(list) {
      if (!Array.isArray(list)) return;
      list.forEach(s => this.register(s));
    },

    // 注册拓展声明的 soundBank（拓展对象中含 soundBank 数组）
    registerExtension(ext) {
      if (!ext || !Array.isArray(ext.soundBank)) return;
      for (const s of ext.soundBank) {
        // 拓展中的 soundId 可能没加 sd_ 前缀，这里统一加
        const fullId = s.id && s.id.startsWith('sd_') ? s.id : 'sd_' + s.id;
        this.register({
          id: fullId,
          type: s.type,
          volume: s.volume,
          subtitle: s.subtitle,
          loop: s.loop
        });
      }
    },

    // ====== 预加载 ======
    preload(soundIds) {
      const ids = Array.isArray(soundIds) ? soundIds : [soundIds];
      return Promise.all(ids.map(id => this._load(id)));
    },

    preloadAll() {
      const ids = Array.from(bank.keys());
      return this.preload(ids);
    },

    _load(soundId) {
      return new Promise((resolve) => {
        if (loaded.has(soundId)) return resolve();
        const def = bank.get(soundId);
        if (!def) return resolve();
        try {
          const audio = new Audio(def.url);
          audio.preload = 'auto';
          audio.volume = def.volume * this._getCatVolume(def.type);
          let settled = false;
          const onReady = () => {
            if (settled) return;
            settled = true;
            loaded.add(soundId);
            cache.set(soundId, audio);
            resolve();
          };
          audio.addEventListener('canplaythrough', onReady, { once: true });
          audio.addEventListener('error', () => {
            if (settled) return;
            settled = true;
            resolve();  // 错误时不存入 cache（文件不存在等）
          }, { once: true });
          // 兜底超时：即使未 canplaythrough，音频可能已部分加载，仍存入 cache
          setTimeout(() => {
            if (settled) return;
            settled = true;
            loaded.add(soundId);
            cache.set(soundId, audio);
            resolve();
          }, 3000);
          audio.load();
        } catch (e) { resolve(); }
      });
    },

    // ====== 播放 ======
    play(soundId, opts) {
      if (!enabled) return Promise.resolve(null);
      opts = opts || {};
      const def = bank.get(soundId);
      if (!def) return Promise.resolve(null);

      // 语音节流
      if (def.type === 'voice') {
        const now = Date.now();
        if (now - lastVoiceAt < VOICE_THROTTLE_MS) return Promise.resolve(null);
        lastVoiceAt = now;
      }

      return this._load(soundId).then(() => {
        const cached = cache.get(soundId);
        if (!cached) return null;
        try {
          // 克隆 audio 元素以支持同一音效同时播放多个实例（如多个棋子同时受伤）
          // 预加载阶段已让浏览器缓存了音频文件，此处新建元素可快速从缓存读取
          const audio = new Audio(def.url);
          audio.volume = (opts.volume != null ? opts.volume : def.volume) * this._getCatVolume(def.type);
          const p = audio.play();
          if (p && p.catch) p.catch(() => {});  // 忽略自动播放限制错误
          // 播放结束后释放资源
          audio.addEventListener('ended', () => { try { audio.src = ''; } catch (e) {} }, { once: true });
        } catch (e) {}
        // 字幕
        if (def.subtitle && subtitleEnabled && global.Game && typeof global.Game.showSubtitle === 'function') {
          global.Game.showSubtitle(def.subtitle, def.type === 'voice' ? 2200 : 1000);
        }
        return cached;
      });
    },

    // ====== BGM ======
    playBgm(soundId, fadeMs) {
      if (fadeMs == null) fadeMs = 800;
      if (currentBgm === soundId) return;
      this.stopBgm(fadeMs);
      const def = bank.get(soundId);
      if (!def) return;
      try {
        const audio = new Audio(def.url);
        audio.loop = true;
        audio.volume = 0;
        const startPlay = () => {
          bgmAudio = audio;
          currentBgm = soundId;
          this._fade(audio, 0, bgmVolume * def.volume, fadeMs);
        };
        const p = audio.play();
        if (p && p.then) p.then(startPlay).catch(() => {});
        else startPlay();
      } catch (e) {}
    },

    stopBgm(fadeMs) {
      if (fadeMs == null) fadeMs = 600;
      if (!bgmAudio) { currentBgm = null; return; }
      const audio = bgmAudio;
      bgmAudio = null;
      currentBgm = null;
      this._fade(audio, audio.volume, 0, fadeMs, () => {
        try { audio.pause(); } catch (e) {}
      });
    },

    // ====== 工具 ======
    _getCatVolume(type) {
      if (type === 'voice') return voiceVolume;
      if (type === 'bgm')   return bgmVolume;
      return sfxVolume;
    },

    _fade(audio, from, to, ms, done) {
      const steps = 20;
      const stepMs = Math.max(10, ms / steps);
      const delta = (to - from) / steps;
      let v = from;
      const timer = setInterval(() => {
        v += delta;
        audio.volume = Math.max(0, Math.min(1, v));
        if ((delta > 0 && v >= to) || (delta < 0 && v <= to)) {
          clearInterval(timer);
          audio.volume = to;
          if (done) done();
        }
      }, stepMs);
    },

    // ====== 设置 ======
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) {
        this.stopBgm(200);
        // 静音所有正在播放的 sfx
        cache.forEach(a => { try { a.pause(); } catch (e) {} });
      }
    },
    setSfxVolume(v) { sfxVolume = Math.max(0, Math.min(1, v)); },
    setVoiceVolume(v) { voiceVolume = Math.max(0, Math.min(1, v)); },
    setBgmVolume(v) {
      bgmVolume = Math.max(0, Math.min(1, v));
      if (bgmAudio && currentBgm) {
        const def = bank.get(currentBgm);
        if (def) bgmAudio.volume = bgmVolume * def.volume;
      }
    },
    setSubtitleEnabled(v) { subtitleEnabled = !!v; },
    isEnabled() { return enabled; },
    isSubtitleEnabled() { return subtitleEnabled; },
    getVolumes() { return { sfx: sfxVolume, voice: voiceVolume, bgm: bgmVolume }; },

    // ====== 持久化设置 ======
    saveSettings() {
      try {
        localStorage.setItem('audio_settings', JSON.stringify({
          enabled, subtitleEnabled, sfxVolume, voiceVolume, bgmVolume
        }));
      } catch (e) {}
    },
    loadSettings() {
      try {
        const raw = localStorage.getItem('audio_settings');
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.enabled != null) enabled = !!s.enabled;
        if (s.subtitleEnabled != null) subtitleEnabled = !!s.subtitleEnabled;
        if (s.sfxVolume != null) sfxVolume = s.sfxVolume;
        if (s.voiceVolume != null) voiceVolume = s.voiceVolume;
        if (s.bgmVolume != null) bgmVolume = s.bgmVolume;
      } catch (e) {}
    },

    // ====== 清理 ======
    clear() {
      cache.forEach(a => { try { a.pause(); } catch (e) {} });
      cache.clear();
      bank.clear();
      loaded.clear();
      bgmAudio = null;
      currentBgm = null;
    }
  };

  // 启动时自动加载设置
  AudioManager.loadSettings();

  global.AudioManager = AudioManager;
})(window);
