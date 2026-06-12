<template>
  <aside class="right-panel">
    <div class="ai-header">
      <div class="flex items-center gap-2"><span class="text-sm font-semibold">AI 协同复盘官</span><span class="beta-tag">BETA</span></div>
    </div>

    <div class="ai-greeting">
      <span class="star-icon">*</span>
      同步数据后, AI 教练将分析你的战绩并生成练歌计划.
    </div>

    <div class="practice-list">
      <div v-if="!hasData" class="text-xs text-text-muted text-center py-6">
        请先同步数据以获取 AI 练歌推荐
      </div>
    </div>

    <div class="ai-message">
      连接 AI 服务后可获得个性化的底力缺陷诊断和针对性练习曲推荐.
    </div>

    <div class="robot-float">R</div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePlayLogStore } from '@/stores/usePlayLogStore';

const hasData = computed(() => usePlayLogStore().totalCount > 0);
</script>

<style scoped>
.right-panel {
  width: var(--ai-panel-width);
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.beta-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: #EEF2FF;
  color: var(--color-primary);
}

.close-btn {
  font-size: 12px;
  border: none;
  background: var(--bg-hover);
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
}

.ai-greeting {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: flex;
  gap: 4px;
}

.star-icon {
  color: var(--color-warning);
  font-size: 16px;
  animation: twinkle 2s ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.practice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.practice-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  background: var(--bg-primary);
  border-radius: 12px;
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.practice-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.rank-indicator {
  width: 3px;
  height: 40px;
  border-radius: 2px;
  flex-shrink: 0;
}

.rank-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-muted);
  width: 22px;
}

.song-thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
}

.practice-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.p-song-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.diff-tag-sm {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  width: fit-content;
}

.d-master { background: #F5F3FF; color: #8B5CF6; }
.d-expert { background: #FEF2F2; color: #EF4444; }

.purpose-tag {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 4px;
  width: fit-content;
}

.practice-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.score-gain {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-success);
}

.score-target {
  font-size: 10px;
  color: var(--text-muted);
}

.ai-message {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.robot-float {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  align-self: flex-end;
  animation: float 3s ease-in-out infinite;
  box-shadow: 0 4px 12px rgba(74,114,255,0.3);
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
</style>
