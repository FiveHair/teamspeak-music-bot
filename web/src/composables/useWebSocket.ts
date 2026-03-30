import { ref, onUnmounted } from 'vue';
import { usePlayerStore } from '../stores/player.js';

export function useWebSocket() {
  const connected = ref(false);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      connected.value = true;
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const store = usePlayerStore();

      switch (data.type) {
        case 'init':
          for (const bot of data.bots) {
            store.updateBotStatus(bot.id, bot);
          }
          break;
        case 'stateChange':
          store.updateBotStatus(data.botId, data.status);
          if (data.queue) {
            store.setQueue(data.botId, data.queue);
          } else {
            // Queue not included in event; refresh for this specific bot
            store.fetchQueueForBot(data.botId);
          }
          break;
        case 'botConnected':
          store.updateBotStatus(data.botId, data.status);
          break;
        case 'botDisconnected':
          // Bot disconnected from TS3 but still exists — update status, don't remove
          if (data.status) {
            store.updateBotStatus(data.botId, data.status);
          } else {
            const existing = store.bots.find((b) => b.id === data.botId);
            if (existing) {
              store.updateBotStatus(data.botId, {
                ...existing,
                connected: false,
                playing: false,
                paused: false,
                currentSong: null,
              });
            }
          }
          break;
      }
    };

    ws.onclose = () => {
      connected.value = false;
      // Reconnect after 3 seconds
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  }

  onUnmounted(disconnect);

  return { connected, connect, disconnect };
}
