<template>
  <aside class="right-panel">
    <!-- AI Header -->
    <div class="ai-header">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold">AI 协同复盘官</span>
        <span class="beta-tag">BETA</span>
      </div>
      <button class="close-btn">X</button>
    </div>

    <!-- AI Greeting -->
    <div class="ai-greeting">
      <span class="star-icon">*</span>
      嗨, 水鱼! 基于你的数据, 我为你生成了本周的练歌计划.
    </div>

    <!-- Practice Plan List -->
    <div class="practice-list">
      <div v-for="(song, i) in practiceSongs" :key="i" class="practice-item">
        <div class="rank-indicator" :style="{ background: song.gradient }" />
        <span class="rank-num">{{ String(i+1).padStart(2,'0') }}</span>
        <div class="song-thumb" :style="{ background: song.gradient }" />
        <div class="practice-info">
          <span class="p-song-name">{{ song.title }}</span>
          <span class="diff-tag-sm" :class="'d-'+song.difficulty">{{ song.difficulty.toUpperCase() }} {{ song.constant }}</span>
          <span class="purpose-tag">{{ song.purpose }}</span>
        </div>
        <div class="practice-score">
          <span class="score-gain">+{{ song.gain }}</span>
          <span class="score-target">{{ song.target }}</span>
        </div>
      </div>
    </div>

    <!-- AI Coach Message -->
    <div class="ai-message">
      高难曲特定底力很棒! 不过偏差分布显示你"早打"偏多, 建议这周重点练习精度.
    </div>

    <!-- Robot Mascot -->
    <div class="robot-float">R</div>
  </aside>
</template>

<script setup lang="ts">
const practiceSongs = [
  { title: 'Oshama Scramble!', difficulty: 'master', constant: 14.7, purpose: '提升稳定度', gain: '+42.18', target: '15,080', gradient: 'linear-gradient(135deg,#EF4444,#F97316)' },
  { title: 'Axeria', difficulty: 'master', constant: 14.5, purpose: '肌肉耐力', gain: '+38.62', target: '15,020', gradient: 'linear-gradient(135deg,#F97316,#F59E0B)' },
  { title: 'Glorious Crown', difficulty: 'master', constant: 14.3, purpose: '精度训练', gain: '+35.74', target: '14,960', gradient: 'linear-gradient(135deg,#8B5CF6,#A78BFA)' },
  { title: 'World\'s End Loneliness', difficulty: 'expert', constant: 13.8, purpose: '体力分配', gain: '+31.25', target: '14,850', gradient: 'linear-gradient(135deg,#10B981,#34D399)' },
  { title: 'Titania', difficulty: 'master', constant: 14.1, purpose: '交互练习', gain: '+29.90', target: '14,780', gradient: 'linear-gradient(135deg,#3B82F6,#60A5FA)' },
];
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
