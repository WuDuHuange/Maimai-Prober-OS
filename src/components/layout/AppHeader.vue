<template>
  <header class="top-header">
    <div class="header-left">
      <div class="logo-icon">M</div>
      <span class="logo-text">Maimai-Prober-OS</span>
      <span class="pro-tag">PRO</span>
    </div>
    <nav class="header-nav">
      <a v-for="item in navItems" :key="item.key" class="nav-link" :class="{ active: modelValue === item.key }" @click="$emit('update:modelValue', item.key)">
        {{ item.label }}
      </a>
    </nav>
    <div class="header-right">
      <div class="sync-badge" :class="syncClass">
        <span class="dot" /> {{ syncLabel }}
      </div>
      <div class="notification">
        <span class="bell-icon">^</span>
        <span class="badge-dot" />
      </div>
      <div class="user-info">
        <div class="avatar" />
        <span class="nickname">{{ userName }}</span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue: string;
  syncStatus: 'idle' | 'syncing' | 'completed' | 'error';
  userName?: string;
}>();

defineEmits<{ 'update:modelValue': [key: string] }>();

const navItems = [
  { key: 'overview', label: '总览' },
  { key: 'dashboard', label: '数据看板' },
  { key: 'songs', label: '歌曲库' },
  { key: 'notes', label: '谱面笔记' },
  { key: 'ai', label: 'AI复盘' },
  { key: 'settings', label: '设置' },
];

const syncLabel = computed(() => {
  const m: Record<string, string> = { idle: '就绪', syncing: '同步中...', completed: '同步完成', error: '同步失败' };
  return m[props.syncStatus] || '就绪';
});

const syncClass = computed(() => {
  return { syncing: props.syncStatus === 'syncing', error: props.syncStatus === 'error' };
});
</script>

<style scoped>
.top-header {
  height: var(--header-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 24px;
  flex-shrink: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
}

.logo-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.pro-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  letter-spacing: 1px;
}

.header-nav {
  display: flex;
  gap: 4px;
  flex: 1;
  justify-content: center;
}

.nav-link {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  position: relative;
  transition: all 0.15s;
  white-space: nowrap;
}

.nav-link:hover { color: var(--text-primary); background: var(--bg-hover); }

.nav-link.active {
  color: var(--color-primary);
  font-weight: 600;
  background: var(--bg-tag);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.sync-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  background: #ECFDF5;
  color: var(--color-success);
  font-size: 12px;
}

.sync-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
}

.sync-badge.error { background: #FEF2F2; color: var(--color-danger); }
.sync-badge.error .dot { background: var(--color-danger); }
.sync-badge.syncing { background: #EFF6FF; color: var(--color-primary); }
.sync-badge.syncing .dot { background: var(--color-primary); animation: breathe 1.5s infinite; }

@keyframes breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.notification {
  position: relative;
  cursor: pointer;
}

.bell-icon {
  font-size: 18px;
  color: var(--text-secondary);
}

.badge-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-danger);
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nickname {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
