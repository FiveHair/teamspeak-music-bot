import axios, { type AxiosInstance } from "axios";
import type {
  MusicProvider,
  Song,
  Playlist,
  LyricLine,
  SearchResult,
  QrCodeResult,
  AuthStatus,
} from "./provider.js";
import { parseLyrics } from "./netease.js";

export class QQMusicProvider implements MusicProvider {
  readonly platform = "qq" as const;
  private api: AxiosInstance;
  private cookie = "";

  constructor(baseUrl: string) {
    this.api = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
    });
  }

  private get cookieParams(): Record<string, string> {
    return this.cookie ? { cookie: this.cookie } : {};
  }

  async search(query: string, limit = 20): Promise<SearchResult> {
    const res = await this.api.get("/search", {
      params: { key: query, pageSize: limit, ...this.cookieParams },
    });

    const songs: Song[] = (res.data?.data?.list ?? []).map((s: any) => ({
      id: String(s.songmid ?? s.id),
      name: s.songname ?? s.name ?? "",
      artist: (s.singer ?? []).map((a: any) => a.name).join(" / "),
      album: s.albumname ?? "",
      duration: s.interval ?? 0,
      coverUrl: s.albummid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`
        : "",
      platform: "qq",
    }));

    return { songs, playlists: [], albums: [] };
  }

  async getSongUrl(songId: string): Promise<string | null> {
    const res = await this.api.get("/song/url", {
      params: { id: songId, ...this.cookieParams },
    });
    return res.data?.data ?? null;
  }

  async getSongDetail(songId: string): Promise<Song | null> {
    const res = await this.api.get("/song", {
      params: { songmid: songId, ...this.cookieParams },
    });
    const s = res.data?.data;
    if (!s) return null;
    return {
      id: String(s.mid ?? s.id),
      name: s.name ?? "",
      artist: (s.singer ?? []).map((a: any) => a.name).join(" / "),
      album: s.album?.name ?? "",
      duration: s.interval ?? 0,
      coverUrl: s.album?.mid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg`
        : "",
      platform: "qq",
    };
  }

  async getPlaylistSongs(playlistId: string): Promise<Song[]> {
    const res = await this.api.get("/songlist", {
      params: { id: playlistId, ...this.cookieParams },
    });
    return (res.data?.data?.songlist ?? []).map((s: any) => ({
      id: String(s.songmid ?? s.id),
      name: s.songname ?? s.name ?? "",
      artist: (s.singer ?? []).map((a: any) => a.name).join(" / "),
      album: s.albumname ?? "",
      duration: s.interval ?? 0,
      coverUrl: s.albummid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`
        : "",
      platform: "qq",
    }));
  }

  async getRecommendPlaylists(): Promise<Playlist[]> {
    const res = await this.api.get("/recommend/playlist", {
      params: { ...this.cookieParams },
    });
    return (res.data?.data?.list ?? []).map((p: any) => ({
      id: String(p.content_id ?? p.id),
      name: p.title ?? p.name ?? "",
      coverUrl: p.cover ?? "",
      songCount: p.cnt ?? 0,
      platform: "qq",
    }));
  }

  async getAlbumSongs(albumId: string): Promise<Song[]> {
    const res = await this.api.get("/album/songs", {
      params: { albummid: albumId, ...this.cookieParams },
    });
    return (res.data?.data?.list ?? []).map((s: any) => ({
      id: String(s.songmid ?? s.id),
      name: s.songname ?? s.name ?? "",
      artist: (s.singer ?? []).map((a: any) => a.name).join(" / "),
      album: s.albumname ?? "",
      duration: s.interval ?? 0,
      coverUrl: s.albummid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`
        : "",
      platform: "qq",
    }));
  }

  async getLyrics(songId: string): Promise<LyricLine[]> {
    const res = await this.api.get("/lyric", {
      params: { songmid: songId, ...this.cookieParams },
    });
    return parseLyrics(
      res.data?.data?.lyric ?? "",
      res.data?.data?.trans ?? ""
    );
  }

  async getQrCode(): Promise<QrCodeResult> {
    const res = await this.api.get("/login/qr/create");
    return {
      qrUrl: res.data?.data?.qrurl ?? "",
      key: res.data?.data?.key ?? "",
    };
  }

  async checkQrCodeStatus(
    key: string
  ): Promise<"waiting" | "scanned" | "confirmed" | "expired"> {
    const res = await this.api.get("/login/qr/check", {
      params: { key },
    });
    const code = res.data?.data?.code;
    if (code === 0) {
      if (res.data?.data?.cookie) {
        this.cookie = res.data.data.cookie;
      }
      return "confirmed";
    }
    if (code === 1) return "scanned";
    if (code === 2) return "waiting";
    return "expired";
  }

  setCookie(cookie: string): void {
    this.cookie = cookie;
  }

  getCookie(): string {
    return this.cookie;
  }

  async getAuthStatus(): Promise<AuthStatus> {
    if (!this.cookie) return { loggedIn: false };
    try {
      const res = await this.api.get("/user/detail", {
        params: { ...this.cookieParams },
      });
      if (res.data?.data) {
        return {
          loggedIn: true,
          nickname: res.data.data.nickname,
          avatarUrl: res.data.data.headpic,
        };
      }
    } catch {
      // ignore
    }
    return { loggedIn: false };
  }
}
