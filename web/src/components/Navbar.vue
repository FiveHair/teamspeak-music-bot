<template>
  <nav class="navbar frosted-glass">
    <RouterLink to="/" class="logo">TSMusicBot</RouterLink>

    <div class="nav-links">
      <RouterLink to="/" class="nav-link" active-class="active">发现</RouterLink>
      <RouterLink to="/search" class="nav-link" active-class="active">搜索</RouterLink>
      <RouterLink to="/history" class="nav-link" active-class="active">播放历史</RouterLink>
    </div>

    <div class="nav-right">
      <!-- Multi-bot selector -->
      <div v-if="store.bots.length > 1" class="bot-selector" ref="selectorRef">
        <button class="bot-selector-btn" @click="dropdownOpen = !dropdownOpen">
          <span class="bot-dot" :class="{ online: activeBot?.connected }" />
          <span class="bot-selector-name">{{ activeBot?.name ?? '选择机器人' }}</span>
          <Icon icon="mdi:chevron-down" class="bot-chevron" :class="{ rotated: dropdownOpen }" />
        </button>
        <div v-if="dropdownOpen" class="bot-dropdown">
          <button
            v-for="bot in store.bots"
            :key="bot.id"
            class="bot-dropdown-item"
            :class="{ active: bot.id === store.activeBotId }"
            @click="selectBot(bot.id)"
          >
            <span class="bot-dot" :class="{ online: bot.connected }" />
            <span class="bot-dropdown-name">{{ bot.name }}</span>
            <span v-if="bot.playing && !bot.paused" class="bot-playing-badge">播放中</span>
            <span v-else-if="bot.paused" class="bot-paused-badge">已暂停</span>
            <span v-else-if="bot.connected" class="bot-idle-badge">空闲</span>
            <span v-else class="bot-offline-badge">离线</span>
          </button>
        </div>
      </div>

      <!-- Single bot status (original behavior) -->
      <div v-else-if="activeBot" class="bot-status" :class="{ online: activeBot.connected }">
        {{ activeBot.name }} {{ activeBot.connected ? '在线' : '离线' }}
      </div>

      <RouterLink to="/settings" class="settings-btn">
        <Icon icon="mdi:cog" />
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import { usePlayerStore } from '../stores/player.js';

const store = usePlayerStore();
const activeBot = computed(() => store.activeBot);
const dropdownOpen = ref(false);
const selectorRef = ref<HTMLElement | null>(null);

function selectBot(id: string) {
  store.setActiveBotId(id);
  dropdownOpen.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (selectorRef.value && !selectorRef.value.contains(e.target as Node)) {
    dropdownOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside);
});
</script>

<style lang="scss" scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--navbar-height);
  display: flex;
  align-items: center;
  padding: 0 10vw;
  z-index: 100;
  border-bottom: 1px solid var(--border-color);

  @media (max-width: 1336px) {
    padding: 0 5vw;
  }
}

.logo {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
  margin-right: 40px;
}

.nav-links {
  display: flex;
  gap: 24px;
}

.nav-link {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.6;
  transition: opacity var(--transition-fast);

  &:hover { opacity: 0.8; }
  &.active { opacity: 1; color: var(--color-primary); }
}

.nav-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.bot-status {
  padding: 4px 12px;
  background: var(--hover-bg);
  border-radius: var(--radius-sm);
  font-size: 12px;
  opacity: 0.6;

  &.online {
    background: rgba(51, 94, 234, 0.15);
    color: var(--color-primary);
    opacity: 1;
  }
}

/* Bot selector dropdown */
.bot-selector {
  position: relative;
}

.bot-selector-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--hover-bg);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  transition: background var(--transition-fast);
  cursor: pointer;

  &:hover {
    background: var(--bg-card);
  }
}

.bot-chevron {
  font-size: 16px;
  opacity: 0.5;
  transition: transform 0.2s ease;

  &.rotated {
    transform: rotate(180deg);
  }
}

.bot-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;

  &.online {
    background: #22c55e;
  }
}

.bot-selector-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 200;
}

.bot-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--hover-bg);
  }

  &.active {
    background: rgba(51, 94, 234, 0.12);
    color: var(--color-primary);
  }
}

.bot-dropdown-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-playing-badge,
.bot-paused-badge,
.bot-idle-badge,
.bot-offline-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  flex-shrink: 0;
}

.bot-playing-badge {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.bot-paused-badge {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.bot-idle-badge {
  background: rgba(51, 94, 234, 0.12);
  color: var(--color-primary);
}

.bot-offline-badge {
  background: var(--hover-bg);
  color: var(--text-tertiary);
}

.settings-btn {
  font-size: 20px;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
  &:hover { opacity: 1; }
}
</style>
