<template>
  <div class="app-container flex flex-col">
    <AppHeader>
      <template #actions>
        <div class="flex items-center gap-2">
          <SyncButton :status="syncStore.status" @sync="handleSync" />
          <router-link to="/settings" class="text-xs text-text-muted hover:text-text-primary transition-colors">
            设置
          </router-link>
        </div>
      </template>
    </AppHeader>

    <div v-if="syncStore.status === 'syncing'" class="px-4 py-2">
      <SyncProgress :progress="syncStore.progress" :visible="true" />
    </div>

    <div class="flex flex-1 overflow-hidden">
      <LeftSidebar>
        <template #search>
          <p class="text-xs text-text-muted px-1">TODO: 搜索框</p>
        </template>
      </LeftSidebar>

      <main class="main-content">
        <router-view />
      </main>

      <RightSidebar>
        <AIChatPanel @coach="handleAICoach" @send="handleAISend" />
      </RightSidebar>
    </div>

    <AppStatusBar />
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue';
import LeftSidebar from '@/components/layout/LeftSidebar.vue';
import RightSidebar from '@/components/layout/RightSidebar.vue';
import AppStatusBar from '@/components/layout/AppStatusBar.vue';
import SyncButton from '@/components/sync/SyncButton.vue';
import SyncProgress from '@/components/sync/SyncProgress.vue';
import AIChatPanel from '@/components/ai/AIChatPanel.vue';
import { useProberSync } from '@/composables/useProberSync';
import { useAICoach } from '@/composables/useAICoach';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { onMounted } from 'vue';
import { decrypt } from '@/services/cryptoService';

const syncStore = useSyncStore();
const settingsStore = useSettingsStore();
const { startSync } = useProberSync();
const { sendMessage, coachAnalysis } = useAICoach();

onMounted(() => {
  settingsStore.checkSettings();
});

function handleSync() {
  const encryptedToken = localStorage.getItem('prober_token_enc');
  if (!encryptedToken) {
    alert('请先在设置页面配置水鱼 Token');
    return;
  }
  const token = decrypt(encryptedToken);
  startSync(token);
}

function handleAICoach() {
  coachAnalysis();
}

function handleAISend(text: string) {
  sendMessage(text);
}
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background-color: var(--bg-primary);
}
</style>
