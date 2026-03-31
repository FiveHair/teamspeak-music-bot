import { WebSocketServer, WebSocket } from "ws";
import type { BotManager } from "../bot/manager.js";
import type { BotInstance } from "../bot/instance.js";
import type { Logger } from "../logger.js";

export function setupWebSocket(
  wss: WebSocketServer,
  botManager: BotManager,
  logger: Logger
): () => void {
  const clients = new Set<WebSocket>();

  /** Track which bots already have listeners attached */
  const attachedBots = new Map<string, {
    stateChange: () => void;
    connected: () => void;
    disconnected: () => void;
  }>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    logger.debug("WebSocket client connected");

    const bots = botManager.getAllBots().map((b) => b.getStatus());
    ws.send(JSON.stringify({ type: "init", bots }));

    ws.on("close", () => {
      clients.delete(ws);
      logger.debug("WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
      clients.delete(ws);
    });
  });

  const broadcast = (data: object) => {
    const message = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch {
          clients.delete(client);
        }
      }
    }
  };

  function attachBotListener(bot: BotInstance): void {
    if (attachedBots.has(bot.id)) return;

    const onStateChange = () => {
      broadcast({
        type: "stateChange",
        botId: bot.id,
        status: bot.getStatus(),
        queue: bot.getQueue(),
      });
    };

    const onConnected = () => {
      broadcast({
        type: "botConnected",
        botId: bot.id,
        status: bot.getStatus(),
      });
    };

    const onDisconnected = () => {
      broadcast({
        type: "botDisconnected",
        botId: bot.id,
        status: bot.getStatus(),
      });
    };

    bot.on("stateChange", onStateChange);
    bot.on("connected", onConnected);
    bot.on("disconnected", onDisconnected);

    attachedBots.set(bot.id, {
      stateChange: onStateChange,
      connected: onConnected,
      disconnected: onDisconnected,
    });
  }

  /** Attach listeners for any new bots that don't have them yet */
  function ensureAllBotsAttached(): void {
    for (const bot of botManager.getAllBots()) {
      attachBotListener(bot);
    }
  }

  // Check for newly added bots periodically
  const intervalId = setInterval(ensureAllBotsAttached, 5000);
  ensureAllBotsAttached();

  return () => {
    clearInterval(intervalId);
    // Clean up named listeners
    for (const bot of botManager.getAllBots()) {
      const listeners = attachedBots.get(bot.id);
      if (listeners) {
        bot.removeListener("stateChange", listeners.stateChange);
        bot.removeListener("connected", listeners.connected);
        bot.removeListener("disconnected", listeners.disconnected);
      }
    }
    attachedBots.clear();
  };
}
