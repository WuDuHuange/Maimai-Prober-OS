<template>
  <header class="top-header">
    <!-- 窄屏：唤起左侧抽屉（宽屏下 CSS 隐藏） -->
    <button class="menu-btn" title="展开侧栏" @click="toggleLeftDrawer">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    </button>

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
        <div class="avatar-wrap" @click="triggerUpload" title="点击上传头像">
          <img v-if="playerStore.avatarUrl" :src="playerStore.avatarUrl" class="avatar-img" />
          <div v-else class="avatar-placeholder">{{ playerStore.playerName.charAt(0) }}</div>
        </div>
        <span class="nickname">{{ userName }}</span>
        <input ref="fileInput" type="file" accept="image/*" class="hidden-input" @change="onFileChange" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePlayerStore } from '@/stores/usePlayerStore';

const props = defineProps<{
  modelValue: string;
  syncStatus: 'idle' | 'syncing' | 'completed' | 'error';
  userName?: string;
}>();

defineEmits<{ 'update:modelValue': [key: string] }>();

const playerStore = usePlayerStore();
const fileInput = ref<HTMLInputElement | null>(null);

/** 窄屏下唤起 / 收起左侧抽屉（LeftSidebar 监听此事件） */
function toggleLeftDrawer() {
  window.dispatchEvent(new CustomEvent('toggle-left-drawer'));
}

function triggerUpload() {
  fileInput.value?.click();
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    // 缩放到 128x128
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      // 居中裁剪
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      playerStore.setAvatar(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}

const navItems = [
  { key: 'overview', label: '总览' },
  { key: 'stats', label: '统计' },
  { key: 'galaxy', label: '3D 星系' },
  { key: 'songs', label: '歌曲库' },
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
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 4px 20px rgba(44, 76, 160, 0.02);
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
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  box-shadow: 0 4px 12px rgba(74, 114, 255, 0.3);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
}

.logo-text {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: var(--letter-spacing-tight);
}

.pro-tag {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  border: 1px solid rgba(74, 114, 255, 0.3);
  letter-spacing: 1px;
}

.header-nav {
  display: flex;
  gap: 4px;
  flex: 1;
  justify-content: center;
}

.nav-link {
  padding: 8px 18px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  position: relative;
  transition: all var(--transition-smooth);
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: var(--letter-spacing-normal);
}

.nav-link:hover { color: var(--text-primary); background: rgba(255, 255, 255, 0.5); }

.nav-link.active {
  color: var(--color-primary);
  font-weight: 700;
  background: white;
  box-shadow: var(--shadow-sm);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.sync-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 20px;
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-success);
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.sync-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
}

.sync-badge.error { background: rgba(239, 68, 68, 0.1); color: var(--color-danger); border-color: rgba(239, 68, 68, 0.15); }
.sync-badge.error .dot { background: var(--color-danger); box-shadow: 0 0 6px rgba(239, 68, 68, 0.4); }
.sync-badge.syncing { background: rgba(74, 114, 255, 0.1); color: var(--color-primary); border-color: rgba(74, 114, 255, 0.15); }
.sync-badge.syncing .dot { background: var(--color-primary); box-shadow: 0 0 6px rgba(74, 114, 255, 0.4); animation: breathe 1.5s infinite; }

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

.avatar-wrap {
  width: 30px; height: 30px; border-radius: 50%;
  overflow: hidden; cursor: pointer;
  flex-shrink: 0; position: relative;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.avatar-wrap:hover { transform: scale(1.1); box-shadow: 0 2px 12px rgba(74,114,255,0.2); }
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white; font-size: 14px; font-weight: 800;
}
.hidden-input { display: none; }

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nickname {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ===== 窄屏汉堡按钮：默认不占位，只在 <1180 出现 ===== */
.menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.menu-btn:hover {
  color: var(--color-primary);
  border-color: rgba(74, 114, 255, 0.3);
  background: #fff;
}

/* ===== 响应式：<1180 头部瘦身，让出导航宽度 ===== */
@media (max-width: 1179px) {
  .top-header { padding: 0 14px; gap: 12px; }
  .menu-btn { display: flex; }
  .logo-text, .pro-tag { display: none; }
  .nickname { display: none; }
  .header-nav { justify-content: flex-start; }
  .nav-link { padding: 8px 12px; font-size: 12.5px; }
}

/* ===== 响应式：<900 进一步压缩，导航可横向滚动 ===== */
@media (max-width: 899px) {
  .top-header { padding: 0 10px; gap: 8px; }
  .header-right { gap: 10px; }
  .notification { display: none; }
  .sync-badge { padding: 5px 9px; }
  .nav-link { padding: 7px 9px; font-size: 12px; }
  .header-nav {
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .header-nav::-webkit-scrollbar { display: none; }
}
</style>
