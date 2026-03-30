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

const BILIBILI_HEADERS = {
  Referer: "https://www.bilibili.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export class BiliBiliProvider implements MusicProvider {
  readonly platform = "bilibili" as const;
  private api: AxiosInstance;
  private passportApi: AxiosInstance;
  private cookie = "";
  private quality = "high";
  private cidCache = new Map<string, number>();

  constructor() {
    this.api = axios.create({
      baseURL: "https://api.bilibili.com",
      timeout: 15000,
      headers: BILIBILI_HEADERS,
    });
    this.passportApi = axios.create({
      baseURL: "https://passport.bilibili.com",
      timeout: 15000,
      headers: BILIBILI_HEADERS,
    });
  }

  private get cookieHeaders(): Record<string, string> {
    return this.cookie ? { Cookie: this.cookie } : {};
  }

  setQuality(quality: string): void {
    this.quality = quality;
  }

  getQuality(): string {
    return this.quality;
  }

  /** Strip HTML tags from BiliBili search results */
  private stripHtml(str: string): string {
    return str.replace(/<[^>]+>/g, "");
  }

  async search(query: string, limit = 20): Promise<SearchResult> {
    const res = await this.api.get("/x/web-interface/search/type", {
      params: {
        search_type: "video",
        keyword: query,
        page_size: limit,
      },
      headers: this.cookieHeaders,
    });

    const results = res.data?.data?.result ?? [];
    const songs: Song[] = results.map((v: any) => ({
      id: String(v.bvid),
      name: this.stripHtml(v.title ?? ""),
      artist: v.author ?? "",
      album: "",
      duration: v.duration
        ? typeof v.duration === "string"
          ? this.parseDurationString(v.duration)
          : v.duration
        : 0,
      coverUrl: v.pic
        ? v.pic.startsWith("//")
          ? `https:${v.pic}`
          : v.pic
        : "",
      platform: "bilibili" as const,
    }));

    return { songs, playlists: [], albums: [] };
  }

  /** Parse "MM:SS" duration string to seconds */
  private parseDurationString(dur: string): number {
    const parts = dur.split(":");
    if (parts.length === 2) {
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return parseInt(dur, 10) || 0;
  }

  async getSongDetail(songId: string): Promise<Song | null> {
    try {
      const res = await this.api.get("/x/web-interface/view", {
        params: { bvid: songId },
        headers: this.cookieHeaders,
      });

      const data = res.data?.data;
      if (!data) return null;

      // Cache cid for later audio URL fetching
      if (data.pages?.[0]?.cid) {
        this.cidCache.set(songId, data.pages[0].cid);
      }

      return {
        id: String(data.bvid),
        name: data.title ?? "",
        artist: data.owner?.name ?? "",
        album: "",
        duration: data.duration ?? 0,
        coverUrl: data.pic ?? "",
        platform: "bilibili" as const,
      };
    } catch {
      return null;
    }
  }

  /** Get CID for a bvid, using cache when available */
  private async getCid(bvid: string): Promise<number | null> {
    const cached = this.cidCache.get(bvid);
    if (cached) return cached;

    const detail = await this.getSongDetail(bvid);
    if (!detail) return null;
    return this.cidCache.get(bvid) ?? null;
  }

  async getSongUrl(songId: string, _quality?: string): Promise<string | null> {
    const cid = await this.getCid(songId);
    if (!cid) return null;

    try {
      const res = await this.api.get("/x/player/playurl", {
        params: {
          cid,
          bvid: songId,
          fnval: 16, // DASH format
        },
        headers: this.cookieHeaders,
      });

      const audioStreams = res.data?.data?.dash?.audio;
      if (!audioStreams || audioStreams.length === 0) return null;

      // Pick highest bandwidth audio stream
      const best = audioStreams.reduce((a: any, b: any) =>
        (b.bandwidth ?? 0) > (a.bandwidth ?? 0) ? b : a
      );

      return best.baseUrl ?? best.base_url ?? null;
    } catch {
      return null;
    }
  }

  // --- QR Code Login ---

  async getQrCode(): Promise<QrCodeResult> {
    const res = await this.passportApi.get(
      "/x/passport-login/web/qrcode/generate"
    );
    const data = res.data?.data ?? {};
    return {
      qrUrl: data.url ?? "",
      key: data.qrcode_key ?? "",
    };
  }

  async checkQrCodeStatus(
    key: string
  ): Promise<"waiting" | "scanned" | "confirmed" | "expired"> {
    const res = await this.passportApi.get(
      "/x/passport-login/web/qrcode/poll",
      { params: { qrcode_key: key }, headers: this.cookieHeaders }
    );

    const code = res.data?.data?.code;
    switch (code) {
      case 0: {
        // Login success — extract cookie from response headers
        const setCookieHeaders = res.headers["set-cookie"];
        if (setCookieHeaders) {
          this.cookie = setCookieHeaders
            .map((c: string) => c.split(";")[0])
            .join("; ");
        }
        // Also check if cookie is returned in response data
        if (res.data?.data?.url) {
          // BiliBili returns refresh info in the URL, cookie comes from set-cookie headers
        }
        return "confirmed";
      }
      case 86038:
        return "expired";
      case 86090:
        return "scanned";
      case 86101:
      default:
        return "waiting";
    }
  }

  // --- Auth Status ---

  async getAuthStatus(): Promise<AuthStatus> {
    if (!this.cookie) return { loggedIn: false };
    try {
      const res = await this.api.get("/x/web-interface/nav", {
        headers: this.cookieHeaders,
      });
      const data = res.data?.data;
      if (data && data.isLogin) {
        return {
          loggedIn: true,
          nickname: data.uname,
          avatarUrl: data.face,
        };
      }
    } catch {
      // ignore
    }
    return { loggedIn: false };
  }

  setCookie(cookie: string): void {
    this.cookie = cookie;
  }

  getCookie(): string {
    return this.cookie;
  }

  // --- Not applicable for BiliBili (video platform) ---

  async getPlaylistSongs(_playlistId: string): Promise<Song[]> {
    return [];
  }

  async getRecommendPlaylists(): Promise<Playlist[]> {
    return [];
  }

  async getAlbumSongs(_albumId: string): Promise<Song[]> {
    return [];
  }

  async getLyrics(_songId: string): Promise<LyricLine[]> {
    return [];
  }
}
