<template>
  <header class="app-header">
    <div class="flex items-center justify-between px-4 h-full">
      <div class="flex items-center gap-6">
        <span class="text-lg font-bold tracking-wider text-text-primary select-none">Maimai-Prober-OS</span>
        <nav class="flex gap-1">
          <button v-for="t in tabs" :key="t.key" class="tab-btn" :class="{ active: modelValue === t.key }" @click="$emit('update:modelValue', t.key)">{{ t.label }}</button>
        </nav>
      </div>
      <div class="flex items-center gap-2">
        <SyncButton :status="syncStatus" @sync="$emit('sync')" />
        <router-link to="/settings" class="text-xs text-text-muted hover:text-text-primary no-underline">设置</router-link>
      </div>
    </div>
    <SyncProgress v-if="syncStatus === 'syncing'" :progress="syncProgress" :visible="true" />
  </header>
</template>

<script setup lang="ts">
import SyncButton from '@/components/sync/SyncButton.vue';
import SyncProgress from '@/components/sync/SyncProgress.vue';
import type { SyncProgress as SyncProgressType } from '@/types/sync';

defineProps<{ modelValue: string; syncStatus: 'idle' | 'syncing' | 'completed' | 'error'; syncProgress: SyncProgressType }>();
defineEmits<{ 'update:modelValue': [key: string]; sync: [] }>();

const tabs = [
  { key: 'b50', label: 'Best 50' },
  { key: 'song', label: 'Song Analysis' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'ai', label: 'AI Coach' },
];
</script>

<style scoped>
.app-header { height: 48px; background: var(--bg-secondary); border-bottom: 1px solid var(--bg-hover); flex-shrink: 0; }
.tab-btn { padding: 6px 14px; border-radius: 6px; font-size: 13px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; transition: 0.15s; }
.tab-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.tab-btn.active { background: var(--color-primary); color: white; }
</style>
