<template>
  <div class="app-container flex flex-col">
    <AppHeader
      v-model="activeTab"
      :syncStatus="syncStore.status"
      :syncProgress="syncStore.progress"
      @sync="handleSync"
    />

    <div class="flex flex-1 overflow-hidden">
      <LeftSidebar @tab="activeTab = $event" />

      <main class="main-content">
        <!-- Best 50 Tab -->
        <div v-if="activeTab === 'b50'" class="tab-panel p-4">
          <div class="h-[240px] mb-4">
            <RatingTrendChart />
          </div>
          <B50Table />
        </div>

        <!-- Song Analysis Tab -->
        <div v-else-if="activeTab === 'song'" class="tab-panel p-4">
          <SongDetailView :songId="selectedSongId" @back="activeTab = 'b50'" />
        </div>

        <!-- Weekly Tab -->
        <div v-else-if="activeTab === 'weekly'" class="tab-panel p-4 h-full">
          <WeeklyView />
        </div>

        <!-- AI Coach Tab -->
        <div v-else-if="activeTab === 'ai'" class="tab-panel h-full">
          <AIChatPanel @coach="handleAICoach" @send="handleAISend" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import LeftSidebar from '@/components/layout/LeftSidebar.vue';
import RatingTrendChart from '@/components/charts/RatingTrendChart.vue';
import B50Table from '@/components/b50/B50Table.vue';
import AIChatPanel from '@/components/ai/AIChatPanel.vue';
import WeeklyView from '@/views/WeeklyView.vue';
import SongDetailView from '@/views/SongDetailView.vue';
import { useProberSync } from '@/composables/useProberSync';
import { useAICoach } from '@/composables/useAICoach';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { decrypt } from '@/services/cryptoService';

const activeTab = ref('b50');
const selectedSongId = ref<number | null>(null);
const syncStore = useSyncStore();
const { startSync } = useProberSync();
const { sendMessage, coachAnalysis } = useAICoach();

onMounted(() => {
  useSettingsStore().checkSettings();
});

function handleSync() {
  const enc = localStorage.getItem('prober_token_enc');
  if (!enc) { alert('请先在设置页面配置水鱼 Token'); return; }
  startSync(decrypt(enc));
}

function handleAICoach() { coachAnalysis(); }
function handleAISend(text: string) { sendMessage(text); }
</script>

<style scoped>
.app-container { width: 100%; height: 100vh; overflow: hidden; }
.main-content { flex: 1; overflow-y: auto; background: var(--bg-primary); }
.tab-panel { min-height: 100%; }
</style>
