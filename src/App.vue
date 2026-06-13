<template>
  <div class="app-container flex flex-col">
    <!-- 设置页：无论登录状态都可访问 -->
    <template v-if="activeTab === 'settings' && !playerStore.isLoggedIn">
      <div class="settings-standalone">
        <div class="settings-topbar">
          <button class="back-btn-settings" @click="activeTab = 'overview'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            返回
          </button>
          <span class="text-sm font-semibold text-text-primary">设置</span>
          <span />
        </div>
        <SettingsView />
      </div>
    </template>

    <!-- 未登录 / 首次使用 → 引导页 -->
    <WelcomeView
      v-else-if="!playerStore.isLoggedIn"
      @sync="handleSync"
    />

    <!-- 已登录 → 正常主界面 -->
    <template v-else>
      <AppHeader
        v-model="activeTab"
        :syncStatus="syncStore.status"
        :userName="playerStore.playerName"
      />

      <div class="flex flex-1 overflow-hidden">
        <LeftSidebar @sync="handleSync" />

        <main class="main-content">
          <DashboardView v-if="activeTab === 'overview' || activeTab === 'dashboard'" />
          <SongLibraryView
            v-else-if="activeTab === 'songs'"
            @select-song="handleSelectSong"
          />
          <SongDetailView
            v-else-if="activeTab === 'song-detail'"
            :songId="selectedSongId"
            @back="activeTab = 'songs'"
          />
          <AIChatPanel v-else-if="activeTab === 'ai'" @coach="handleAICoach" @send="handleAISend" />
          <SettingsView v-else-if="activeTab === 'settings'" />
          <div v-else class="p-8 text-center text-text-muted">即将推出</div>
        </main>

        <RightSidebar />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import LeftSidebar from '@/components/layout/LeftSidebar.vue';
import RightSidebar from '@/components/layout/RightSidebar.vue';
import WelcomeView from '@/views/WelcomeView.vue';
import DashboardView from '@/views/DashboardView.vue';
import SongLibraryView from '@/views/SongLibraryView.vue';
import SongDetailView from '@/views/SongDetailView.vue';
import AIChatPanel from '@/components/ai/AIChatPanel.vue';
import SettingsView from '@/views/SettingsView.vue';
import { useProberSync } from '@/composables/useProberSync';
import { useAICoach } from '@/composables/useAICoach';
import { useSyncStore } from '@/stores/useSyncStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useB50Store } from '@/stores/useB50Store';
import { decrypt } from '@/services/cryptoService';

const activeTab = ref('overview');
const selectedSongId = ref<number | null>(null);
const syncStore = useSyncStore();
const playerStore = usePlayerStore();
const songStore = useSongStore();
const playLogStore = usePlayLogStore();
const b50Store = useB50Store();
const { startSync } = useProberSync();
const { sendMessage, coachAnalysis } = useAICoach();

onMounted(async () => {
  useSettingsStore().checkSettings();
  playerStore.restoreFromStorage();

  // 监听来自 WelcomeView 的导航事件
  window.addEventListener('nav-to-settings', () => { activeTab.value = 'settings'; });

  // ⚠️ 不再自动恢复 profile —— 用户必须显式点击「同步」才算登录
  // 如果本地有历史数据但未登录，WelcomeView 提供入口让用户手动同步
});

onUnmounted(() => {
  window.removeEventListener('nav-to-settings', () => {});
});

// 登录状态变化时预加载数据
watch(() => playerStore.isLoggedIn, async (loggedIn) => {
  if (loggedIn) {
    await Promise.all([
      songStore.loadFromDB(),
      playLogStore.loadFromDB(),
      b50Store.loadFromDB(),
    ]);
  }
});

async function handleSync() {
  const enc = localStorage.getItem('import_token_enc');
  if (!enc) { alert('请先在设置页面配置水鱼 Import-Token'); return; }
  await startSync(decrypt(enc));
  // startSync 内部会在完成后调用 playerStore.setProfile()
  // → isLoggedIn 变为 true → watch 自动触发数据加载
}

function handleSelectSong(songId: number) {
  selectedSongId.value = songId;
  activeTab.value = 'song-detail';
}

function handleAICoach() { coachAnalysis(); }
function handleAISend(text: string) { sendMessage(text); }
</script>

<style scoped>
.app-container { width: 100%; height: 100vh; overflow: hidden; }
.main-content { flex: 1; overflow-y: auto; background: var(--bg-body); }

/* 未登录时的设置独立页面 */
.settings-standalone {
  width: 100%; height: 100vh;
  display: flex; flex-direction: column;
  background: var(--bg-body);
  overflow: hidden;
}
.settings-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255,255,255,0.8);
  box-shadow: 0 4px 20px rgba(44, 76, 160, 0.02);
  flex-shrink: 0;
}
.back-btn-settings {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none;
  font-size: 13px; font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
  padding: 4px 8px; border-radius: 8px;
  transition: all var(--transition-fast);
}
.back-btn-settings:hover {
  background: rgba(74,114,255,0.06);
}
.settings-standalone :deep(.settings-page) {
  flex: 1; overflow-y: auto;
}
</style>
