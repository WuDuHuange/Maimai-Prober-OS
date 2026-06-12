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
  background: var(--bg-body);
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.beta-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-tag);
  color: var(--color-primary);
  letter-spacing: var(--letter-spacing-wide);
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
  line-height: 1.7;
  display: flex;
  gap: 6px;
  padding: 14px 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color-light);
}

.star-icon {
  color: var(--color-warning);
  font-size: 16px;
  animation: twinkle 2s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.9); }
}

.practice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.practice-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  border: 1px solid var(--border-color-light);
  transition: transform var(--transition-smooth), box-shadow var(--transition-smooth);
  cursor: pointer;
}

.practice-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
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
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}

.practice-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.p-song-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.diff-tag-sm {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  width: fit-content;
}

.d-master { background: #F5F3FF; color: #8B5CF6; }
.d-expert { background: #FEF2F2; color: #EF4444; }

.purpose-tag {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
  width: fit-content;
}

.practice-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.score-gain {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-success);
  letter-spacing: var(--letter-spacing-tight);
}

.score-target {
  font-size: 10px;
  color: var(--text-muted);
}

.ai-message {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
  padding: 14px 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color-light);
}

.robot-float {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  box-shadow: 0 6px 24px rgba(74, 114, 255, 0.25);
  margin-top: auto;
  align-self: center;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
</style>
