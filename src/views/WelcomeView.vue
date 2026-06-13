<template>
  <div class="welcome-screen">
    <!-- 背景氛围光 -->
    <div class="bg-aura aura-1" />
    <div class="bg-aura aura-2" />
    <div class="bg-aura aura-3" />

    <!-- 主卡片 -->
    <div class="welcome-card">
      <!-- Logo 区域 -->
      <div class="logo-section">
        <div class="logo-ring">
          <div class="logo-inner">
            <span class="logo-char">M</span>
          </div>
        </div>
        <h1 class="app-title">Maimai-Prober-OS</h1>
        <p class="app-subtitle">舞萌 DX 数据探针 · 液态玻璃视觉</p>
      </div>

      <!-- 分割装饰 -->
      <div class="divider-ornament">
        <span class="ornament-dot" />
        <span class="ornament-line" />
        <span class="ornament-dot" />
      </div>

      <!-- 状态区域 -->
      <div class="status-section">
        <!-- 有 Token 但未同步 -->
        <template v-if="playerStore.hasToken && !isSyncing">
          <div class="status-icon ready">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
              <path d="M8 12l3 3 5-5"/>
            </svg>
          </div>
          <p class="status-title">已配置导入令牌</p>
          <p class="status-desc">
            点击下方按钮，从水鱼服务器同步你的舞萌战绩数据。<br />
            首次同步将获取完整曲库与全部游玩记录。
          </p>
          <button class="sync-cta" @click="$emit('sync')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            开始同步
          </button>
        </template>

        <!-- 正在同步 -->
        <template v-else-if="isSyncing">
          <div class="status-icon syncing">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </div>
          <p class="status-title">正在同步数据...</p>
          <p class="status-desc">正在从水鱼服务器拉取曲库与战绩，请稍候</p>
          <!-- 进度条 -->
          <div class="sync-progress-bar">
            <div class="progress-fill" :style="{ width: syncProgress + '%' }" />
          </div>
          <p class="progress-text">{{ syncMessage }}</p>
        </template>

        <!-- 无 Token → 引导配置 -->
        <template v-else>
          <div class="status-icon guide">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <p class="status-title">欢迎使用 Maimai-Prober-OS</p>
          <p class="status-desc">
            请先在设置中配置你的
            <a href="https://www.diving-fish.com/maimaidx/prober" target="_blank" class="inline-link">水鱼 Import-Token</a>，
            即可同步舞萌 DX 的全部战绩数据。
          </p>
          <button class="setup-cta" @click="goSettings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            前往设置
          </button>
        </template>
      </div>

      <!-- 底部特性列表 -->
      <div class="feature-row">
        <div class="feature-chip">
          <span class="chip-dot" />
          B50 数据分析
        </div>
        <div class="feature-chip">
          <span class="chip-dot" />
          谱面笔记
        </div>
        <div class="feature-chip">
          <span class="chip-dot" />
          AI 复盘
        </div>
        <div class="feature-chip">
          <span class="chip-dot" />
          周报统计
        </div>
      </div>
    </div>

    <!-- 底部版本号 -->
    <p class="version-text">Maimai-Prober-OS v1.0 · 数据来源 Diving-Fish</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSyncStore } from '@/stores/useSyncStore';

defineEmits<{ sync: []; 'nav-settings': [] }>();

const playerStore = usePlayerStore();
const syncStore = useSyncStore();

const isSyncing = computed(() => syncStore.status === 'syncing');
const syncProgress = computed(() => {
  if (syncStore.progress.total > 0) {
    return Math.round((syncStore.progress.current / syncStore.progress.total) * 100);
  }
  return 0;
});
const syncMessage = computed(() => syncStore.progress.message || '准备中...');

function goSettings() {
  // 通知 App.vue 切换到设置页
  window.dispatchEvent(new CustomEvent('nav-to-settings'));
}
</script>

<style scoped>
.welcome-screen {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-body);
  position: relative;
  overflow: hidden;
}

/* ===== 背景氛围光 ===== */
.bg-aura {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.18;
  pointer-events: none;
}
.aura-1 {
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(74,114,255,0.5), transparent);
  top: -15%; left: -10%;
  animation: aura-float 8s ease-in-out infinite;
}
.aura-2 {
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(157,123,255,0.4), transparent);
  bottom: -10%; right: -5%;
  animation: aura-float 10s ease-in-out infinite 1s;
}
.aura-3 {
  width: 300px; height: 300px;
  background: radial-gradient(circle, rgba(16,185,129,0.3), transparent);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  animation: aura-float 12s ease-in-out infinite 2s;
}

@keyframes aura-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -20px) scale(1.05); }
  66% { transform: translate(-20px, 15px) scale(0.95); }
}

/* ===== 主卡片 ===== */
.welcome-card {
  position: relative;
  z-index: 1;
  width: 440px;
  max-width: 92vw;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-top: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    0 8px 32px rgba(44, 76, 160, 0.04),
    0 24px 80px rgba(44, 76, 160, 0.06),
    inset 0 1px 0 rgba(255,255,255,0.8);
  padding: 44px 40px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  animation: card-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(24px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ===== Logo ===== */
.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo-ring {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  padding: 3px;
  box-shadow: 0 8px 32px rgba(74, 114, 255, 0.25);
  animation: logo-pulse 3s ease-in-out infinite;
}

@keyframes logo-pulse {
  0%, 100% { box-shadow: 0 8px 32px rgba(74, 114, 255, 0.25); }
  50% { box-shadow: 0 12px 48px rgba(74, 114, 255, 0.4); }
}

.logo-inner {
  width: 100%; height: 100%;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-char {
  font-size: 36px;
  font-weight: 900;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.03em;
}

.app-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.app-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* ===== 分割线装饰 ===== */
.divider-ornament {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.ornament-line {
  flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(139,155,180,0.3), transparent);
}
.ornament-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: rgba(139,155,180,0.4);
}

/* ===== 状态区域 ===== */
.status-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.status-icon {
  width: 56px; height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.status-icon.ready {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-success);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15);
}
.status-icon.syncing {
  background: rgba(74, 114, 255, 0.1);
  color: var(--color-primary);
  box-shadow: 0 4px 16px rgba(74, 114, 255, 0.15);
}
.status-icon.guide {
  background: rgba(139, 155, 180, 0.1);
  color: var(--text-muted);
  box-shadow: 0 4px 16px rgba(139, 155, 180, 0.1);
}

.spin { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.status-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.status-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 320px;
}

.inline-link {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  font-weight: 600;
  transition: color 0.2s;
}
.inline-link:hover { color: var(--color-primary-dark); }

/* ===== 按钮 ===== */
.sync-cta, .setup-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 36px;
  border-radius: 9999px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.sync-cta {
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white;
  box-shadow: 0 6px 24px rgba(74, 114, 255, 0.3);
}
.sync-cta:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 10px 36px rgba(74, 114, 255, 0.4);
}
.sync-cta:active { transform: scale(0.97); }

.setup-cta {
  background: var(--bg-hover);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-xs);
}
.setup-cta:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  background: white;
}

/* ===== 同步进度条 ===== */
.sync-progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(139, 155, 180, 0.12);
  border-radius: 9999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  border-radius: 9999px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.progress-text {
  font-size: 12px;
  color: var(--text-muted);
}

/* ===== 特性标签 ===== */
.feature-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.feature-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  background: rgba(74, 114, 255, 0.06);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border: 1px solid rgba(74, 114, 255, 0.08);
  transition: all 0.2s ease;
}
.feature-chip:hover {
  background: rgba(74, 114, 255, 0.1);
  border-color: rgba(74, 114, 255, 0.15);
}
.chip-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
}

/* ===== 版本号 ===== */
.version-text {
  position: absolute;
  bottom: 24px;
  z-index: 1;
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
</style>
