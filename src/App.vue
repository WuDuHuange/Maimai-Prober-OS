<template>
  <div class="app-container flex flex-col">
    <AppHeader
      v-model="activeTab"
      :syncStatus="syncStore.status"
      :userName="playerStore.playerName"
    />

    <div class="flex flex-1 overflow-hidden">
      <LeftSidebar @sync="handleSync" />

      <main class="main-content">
        <DashboardView v-if="activeTab === 'overview' || activeTab === 'dashboard'" />
        <SongDetailView v-else-if="activeTab === 'songs'" :songId="selectedSongId" @back="activeTab='dashboard'" />
        <AIChatPanel v-else-if="activeTab === 'ai'" @coach="handleAICoach" @send="handleAISend" />
        <SettingsView v-else-if="activeTab === 'settings'" />
        <div v-else class="p-8 text-center text-text-muted">即将推出</div>
      </main>

      <RightSidebar />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import LeftSidebar from '@/components/layout/LeftSidebar.vue';
import RightSidebar from '@/components/layout/RightSidebar.vue';
import DashboardView from '@/views/DashboardView.vue';
import SongDetailView from '@/views/SongDetailView.vue';
import AIChatPanel from '@/components/ai/AIChatPanel.vue';
import SettingsView from '@/views/SettingsView.vue';
import { useProberSync } from '@/composables/useProberSync';
import { useAICoach } from '@/composables/useAICoach';
import { useSyncStore } from '@/stores/useSyncStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { decrypt } from '@/services/cryptoService';

const activeTab = ref('overview');
const selectedSongId = ref<number | null>(null);
const syncStore = useSyncStore();
const playerStore = usePlayerStore();
const { startSync } = useProberSync();
const { sendMessage, coachAnalysis } = useAICoach();

onMounted(() => {
  useSettingsStore().checkSettings();
});

function handleSync() {
  const enc = localStorage.getItem('import_token_enc');
  if (!enc) { alert('请先在设置页面配置水鱼 Import-Token'); return; }
  startSync(decrypt(enc));
}

function handleAICoach() { coachAnalysis(); }
function handleAISend(text: string) { sendMessage(text); }
</script>

<style scoped>
.app-container { width: 100%; height: 100vh; overflow: hidden; }
.main-content { flex: 1; overflow-y: auto; background: var(--bg-primary); }
</style>
