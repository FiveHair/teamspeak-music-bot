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
    const res = await this.api.get("/getSearchByKey", {
      params: { key: query, pageSize: limit, ...this.cookieParams },
    });

    const songs: Song[] = (res.data?.response?.data?.song?.list ?? []).map(
      (s: any) => ({
        id: String(s.songmid ?? s.songid),
        name: s.songname ?? "",
        artist: (s.singer ?? []).map((a: any) => a.name).join(" / "),
        album: s.albumname ?? "",
        duration: s.interval ?? 0,
        coverUrl: s.albummid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`
          : "",
        platform: "qq",
      })
    );

    return { songs, playlists: [], albums: [] };
  }

  async getSongUrl(songId: string): Promise<string | null> {
    const res = await this.api.get("/getMusicPlay", {
      params: { songmid: songId, ...this.cookieParams },
    });
    const playUrl = res.data?.data?.playUrl?.[songId];
    return playUrl?.url || null;
  }

  async getSongDetail(songId: string): Promise<Song | null> {
    // getSongInfo requires cookie; use search as fallback
    try {
      const res = await this.api.get("/getSongInfo", {
        params: { songmid: songId, ...this.cookieParams },
      });
      const s = res.data?.response?.data;
      if (s && s.track_info) {
        const t = s.track_info;
        return {
          id: String(t.mid ?? t.id),
          name: t.name ?? "",
          artist: (t.singer ?? []).map((a: any) => a.name).join(" / "),
          album: t.album?.name ?? "",
          duration: t.interval ?? 0,
          coverUrl: t.album?.mid
            ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${t.album.mid}.jpg`
            : "",
          platform: "qq",
        };
      }
    } catch {
      // fallback: search by songmid (less reliable)
    }
    return null;
  }

  async getPlaylistSongs(playlistId: string): Promise<Song[]> {
    const res = await this.api.get("/getSongListDetail", {
      params: { disstid: playlistId, ...this.cookieParams },
    });
    const cdlist = res.data?.response?.cdlist ?? [];
    if (cdlist.length === 0) return [];
    return (cdlist[0].songlist ?? []).map((s: any) => ({
      id: String(s.songmid ?? s.songid),
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
    const res = await this.api.get("/getSongLists", {
      params: { categoryId: 10000000, pageSize: 10, ...this.cookieParams },
    });
    return (res.data?.response?.data?.list ?? []).map((p: any) => ({
      id: String(p.dissid),
      name: p.dissname ?? "",
      coverUrl: p.imgurl ?? "",
      songCount: p.listennum ?? 0,
      platform: "qq",
    }));
  }

  async getAlbumSongs(albumId: string): Promise<Song[]> {
    const res = await this.api.get("/getAlbumInfo", {
      params: { albummid: albumId, ...this.cookieParams },
    });
    return (res.data?.response?.data?.list ?? []).map((s: any) => ({
      id: String(s.songmid ?? s.songid),
      name: s.songname ?? "",
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
    const res = await this.api.get("/getLyric", {
      params: { songmid: songId, ...this.cookieParams },
    });
    return parseLyrics(
      res.data?.response?.lyric ?? res.data?.lyric ?? "",
      res.data?.response?.trans ?? res.data?.trans ?? ""
    );
  }

  async getQrCode(): Promise<QrCodeResult> {
    const res = await this.api.get("/getQQLoginQr");
    return {
      qrUrl: "",
      qrImg: res.data?.img ?? "",
      key: res.data?.qrsig ?? res.data?.ptqrtoken ?? "",
    };
  }

  async checkQrCodeStatus(
    key: string
  ): Promise<"waiting" | "scanned" | "confirmed" | "expired"> {
    const res = await this.api.get("/checkQQLoginQr", {
      params: { qrsig: key },
    });
    const code = res.data?.code ?? res.data?.response?.code;
    if (code === 0) {
      if (res.data?.cookie) {
        this.cookie = res.data.cookie;
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
      const res = await this.api.get("/getUserAvatar", {
        params: { ...this.cookieParams },
      });
      if (res.data?.response?.data) {
        return {
          loggedIn: true,
          nickname: res.data.response.data.nickname,
          avatarUrl: res.data.response.data.headpic,
        };
      }
    } catch {
      // ignore
    }
    return { loggedIn: false };
  }
}
