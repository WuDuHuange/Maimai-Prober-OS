<template>
  <button
    class="sync-btn"
    :class="btnClass"
    :disabled="disabled"
    @click="$emit('sync')"
  >
    <span v-if="status === 'syncing'" class="spinner" />
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'idle' | 'syncing' | 'completed' | 'error';
}>();

defineEmits<{ sync: [] }>();

const label = computed(() => {
  switch (props.status) {
    case 'syncing': return '同步中...';
    case 'completed': return '同步完成';
    case 'error': return '重试同步';
    default: return '同步数据';
  }
});

const disabled = computed(() => props.status === 'syncing');

const btnClass = computed(() => ({
  'bg-primary hover:bg-primary-dark text-white': props.status === 'idle',
  'bg-accent text-white cursor-not-allowed': props.status === 'syncing',
  'bg-success text-white': props.status === 'completed',
  'bg-danger text-white': props.status === 'error',
}));
</script>

<style scoped>
.sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.sync-btn:disabled {
  opacity: 0.7;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
