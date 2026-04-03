import net from "node:net";
import http from "node:http";

export type ServerProtocol = "ts3" | "ts6" | "unknown";

export interface ProtocolDetectResult {
  protocol: ServerProtocol;
  /** The query port that responded (10011 for TS3, 10080 for TS6 HTTP) */
  queryPort: number | null;
  /** Whether the voice port (UDP 9987) is the same for both */
  voicePort: number;
}

/**
 * Probe a TeamSpeak server to determine if it's running TS3 or TS6.
 *
 * Detection strategy:
 *  1. Try TCP connect to port 10011 (TS3 ServerQuery) — if banner starts with "TS3", it's TS3.
 *  2. Try HTTP GET to port 10080 (TS6 HTTP Query) — if we get a valid HTTP response, it's TS6.
 *  3. If neither responds, return "unknown" (voice-only connection may still work).
 */
export async function detectServerProtocol(
  host: string,
  voicePort = 9987,
  timeoutMs = 3000,
): Promise<ProtocolDetectResult> {
  const [ts3, ts6] = await Promise.allSettled([
    probeTS3Query(host, 10011, timeoutMs),
    probeTS6HttpQuery(host, 10080, timeoutMs),
  ]);

  if (ts3.status === "fulfilled" && ts3.value) {
    return { protocol: "ts3", queryPort: 10011, voicePort };
  }
  if (ts6.status === "fulfilled" && ts6.value) {
    return { protocol: "ts6", queryPort: 10080, voicePort };
  }

  return { protocol: "unknown", queryPort: null, voicePort };
}

/**
 * Probe TS3 ServerQuery by connecting to raw TCP and checking for "TS3" banner.
 */
function probeTS3Query(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    let banner = "";

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.on("data", (data: Buffer) => {
      banner += data.toString("utf-8");
      if (banner.includes("TS3")) {
        cleanup();
        resolve(true);
      }
    });

    socket.on("connect", () => {
      // Wait briefly for banner
      setTimeout(() => {
        cleanup();
        resolve(banner.includes("TS3"));
      }, 500);
    });

    socket.on("error", () => {
      cleanup();
      resolve(false);
    });

    socket.on("timeout", () => {
      cleanup();
      resolve(false);
    });
  });
}

/**
 * Probe TS6 HTTP Query by sending GET / and checking for a valid response.
 */
function probeTS6HttpQuery(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: host,
        port,
        path: "/",
        method: "GET",
        timeout: timeoutMs,
        headers: { Accept: "application/json" },
      },
      (res) => {
        // TS6 HTTP Query returns some response (even 401/403 is valid — it means the service exists)
        res.resume();
        resolve(res.statusCode !== undefined);
      },
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}
