import type { Logger } from "../logger.js";

export interface ApiServerOptions {
  neteasePort: number;
  qqMusicPort: number;
}

export interface ApiServerManager {
  start(): Promise<void>;
  stop(): void;
  getNeteaseBaseUrl(): string;
  getQQMusicBaseUrl(): string;
}

export function createApiServerManager(
  options: ApiServerOptions,
  logger: Logger
): ApiServerManager {
  let neteaseReady = false;
  let qqMusicReady = false;

  const neteaseBaseUrl = `http://127.0.0.1:${options.neteasePort}`;
  const qqMusicBaseUrl = `http://127.0.0.1:${options.qqMusicPort}`;

  return {
    async start(): Promise<void> {
      logger.info("Starting embedded music API servers...");

      try {
        logger.info(
          { port: options.neteasePort },
          "NetEase Cloud Music API starting"
        );
        neteaseReady = true;
      } catch (err) {
        logger.error({ err }, "Failed to start NetEase Cloud Music API");
      }

      try {
        logger.info({ port: options.qqMusicPort }, "QQ Music API starting");
        qqMusicReady = true;
      } catch (err) {
        logger.warn(
          { err },
          "QQ Music API not available, QQ Music features will be disabled"
        );
      }
    },

    stop(): void {
      logger.info("Stopping music API servers");
      neteaseReady = false;
      qqMusicReady = false;
    },

    getNeteaseBaseUrl(): string {
      return neteaseBaseUrl;
    },

    getQQMusicBaseUrl(): string {
      return qqMusicBaseUrl;
    },
  };
}
