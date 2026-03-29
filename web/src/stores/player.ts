import { defineStore } from 'pinia';
import axios from 'axios';

export interface Song {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  platform: 'netease' | 'qq';
}

export interface BotStatus {
  id: string;
  name: string;
  connected: boolean;
  playing: boolean;
  paused: boolean;
  currentSong: Song | null;
  queueSize: number;
  volume: number;
  playMode: string;
  seekOffset?: number;
  playStartTime?: number;
}

export interface PlaylistItem {
  id: string;
  name: string;
  coverUrl: string;
  songCount: number;
  platform: string;
}

const HOME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const usePlayerStore = defineStore('player', {
  state: () => ({
    bots: [] as BotStatus[],
    activeBotId: null as string | null,
    queue: [] as Song[],
    theme: 'dark' as 'dark' | 'light',
    playStartedAt: 0, // client timestamp when playback started
    seekOffset: 0, // server seek offset in seconds
    pausedElapsed: 0, // elapsed seconds when paused
    // Home page cached data
    recommendPlaylists: [] as PlaylistItem[],
    dailySongs: [] as Song[],
    userPlaylists: [] as PlaylistItem[],
    lastFetchTime: 0,
  }),

  getters: {
    activeBot(): BotStatus | null {
      return this.bots.find((b) => b.id === this.activeBotId) ?? this.bots[0] ?? null;
    },
    currentSong(): Song | null {
      return this.activeBot?.currentSong ?? null;
    },
    isPlaying(): boolean {
      return this.activeBot?.playing ?? false;
    },
    isPaused(): boolean {
      return this.activeBot?.paused ?? false;
    },
    elapsed(): number {
      if (!this.activeBot?.currentSong) return 0;
      if (this.isPaused) return this.pausedElapsed;
      if (!this.isPlaying || this.playStartedAt === 0) return 0;
      return this.seekOffset + (Date.now() - this.playStartedAt) / 1000;
    },
  },

  actions: {
    setActiveBotId(id: string) {
      this.activeBotId = id;
    },

    updateBotStatus(botId: string, status: BotStatus) {
      const prev = this.bots.find((b) => b.id === botId);
      const prevSongId = prev?.currentSong?.id;
      const prevPaused = prev?.paused ?? false;
      const prevPlaying = prev?.playing ?? false;
      const newSongId = status.currentSong?.id;

      const index = this.bots.findIndex((b) => b.id === botId);
      if (index >= 0) {
        this.bots[index] = status;
      } else {
        this.bots.push(status);
      }

      if (botId !== (this.activeBotId ?? this.bots[0]?.id)) return;

      // Use server-provided seekOffset
      const serverSeek = status.seekOffset ?? 0;

      // Song changed or seek offset changed — reset timer
      if ((newSongId && newSongId !== prevSongId) || serverSeek !== this.seekOffset) {
        this.seekOffset = serverSeek;
        this.playStartedAt = Date.now();
        this.pausedElapsed = 0;
        return;
      }

      // Resumed
      if (status.playing && !status.paused && prevPaused) {
        this.playStartedAt = Date.now() - this.pausedElapsed * 1000;
        return;
      }

      // Paused
      if (status.paused && prevPlaying && !prevPaused) {
        this.pausedElapsed = this.playStartedAt > 0
          ? this.seekOffset + (Date.now() - this.playStartedAt) / 1000
          : this.seekOffset;
      }
    },

    removeBotStatus(botId: string) {
      this.bots = this.bots.filter((b) => b.id !== botId);
    },

    setQueue(queue: Song[]) {
      this.queue = queue;
    },

    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', this.theme);
    },

    loadTheme() {
      const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
      if (saved) this.theme = saved;
    },

    async fetchBots() {
      const res = await axios.get('/api/bot');
      this.bots = res.data.bots;
      if (!this.activeBotId && this.bots.length > 0) {
        this.activeBotId = this.bots[0].id;
      }
      // If a song is playing, set the start time
      const bot = this.activeBot;
      if (bot?.playing && bot.currentSong && this.playStartedAt === 0) {
        this.playStartedAt = Date.now();
      }
    },

    async fetchQueue() {
      if (!this.activeBotId) return;
      try {
        const res = await axios.get(`/api/player/${this.activeBotId}/queue`);
        this.queue = res.data.queue ?? [];
      } catch {
        // ignore
      }
    },

    _resetTiming(seekSec = 0) {
      this.seekOffset = seekSec;
      this.playStartedAt = Date.now();
      this.pausedElapsed = 0;
    },

    async play(query: string, platform = 'netease') {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/play`, { query, platform });
      this._resetTiming();
    },

    async playById(songId: string, platform = 'netease') {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/play-by-id`, { songId, platform });
      this._resetTiming();
    },

    async addToQueue(query: string, platform = 'netease') {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/add`, { query, platform });
    },

    async addToQueueById(songId: string, platform = 'netease') {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/add-by-id`, { songId, platform });
    },

    async playPlaylist(playlistId: string, platform = 'netease') {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/play-playlist`, { playlistId, platform });
      this._resetTiming();
    },

    async pause() {
      if (!this.activeBotId) return;
      // Save current elapsed including seekOffset
      this.pausedElapsed = this.elapsed;
      await axios.post(`/api/player/${this.activeBotId}/pause`);
    },

    async resume() {
      if (!this.activeBotId) return;
      // Restore: playStartedAt = now - (pausedElapsed - seekOffset)
      this.playStartedAt = Date.now() - (this.pausedElapsed - this.seekOffset) * 1000;
      await axios.post(`/api/player/${this.activeBotId}/resume`);
    },

    async next() {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/next`);
      this._resetTiming();
    },

    async prev() {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/prev`);
      this._resetTiming();
    },

    async stop() {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/stop`);
      this.seekOffset = 0;
      this.playStartedAt = 0;
      this.pausedElapsed = 0;
    },

    async setVolume(volume: number) {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/volume`, { volume });
    },

    async setMode(mode: string) {
      if (!this.activeBotId) return;
      await axios.post(`/api/player/${this.activeBotId}/mode`, { mode });
    },

    async fetchHomeData() {
      // Skip if data was fetched within the last 5 minutes
      if (this.lastFetchTime > 0 && Date.now() - this.lastFetchTime < HOME_CACHE_TTL) {
        return;
      }

      const [playlistRes, dailyRes, userRes] = await Promise.allSettled([
        axios.get('/api/music/recommend/playlists'),
        axios.get('/api/music/recommend/songs'),
        axios.get('/api/music/user/playlists'),
      ]);

      if (playlistRes.status === 'fulfilled') {
        this.recommendPlaylists = playlistRes.value.data.playlists;
      }
      if (dailyRes.status === 'fulfilled') {
        this.dailySongs = dailyRes.value.data.songs;
      }
      if (userRes.status === 'fulfilled') {
        this.userPlaylists = userRes.value.data.playlists;
      }

      this.lastFetchTime = Date.now();
    },
  },
});
