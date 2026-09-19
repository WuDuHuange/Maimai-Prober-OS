<template>
  <Teleport to="body">
    <Transition name="cr-fade">
      <div v-if="store.isOpen" class="cr-mask" @click.self="store.close()">
        <div class="cr-panel" role="dialog" aria-modal="true" aria-label="教练详细分析">
          <!-- 头部 -->
          <header class="cr-head">
            <div class="cr-head-left">
              <span class="cr-title">教练详细分析</span>
              <span v-if="metaText" class="cr-meta">{{ metaText }}</span>
            </div>
            <div class="cr-head-actions">
              <button
                class="cr-btn"
                :disabled="store.isGenerating"
                @click="store.generate()"
              >{{ store.isGenerating ? '生成中…' : (store.hasReport ? '重新生成' : '生成') }}</button>
              <button class="cr-btn ghost" @click="store.close()">关闭</button>
            </div>
          </header>

          <!-- 正文 -->
          <div class="cr-body">
            <!-- 生成中 -->
            <div v-if="store.isGenerating && !store.displayContent" class="cr-state">
              <span class="cr-spinner" />
              <div class="cr-state-text">
                <span class="cr-state-title">教练正在分析…</span>
                <span class="cr-state-sub">{{ progressText }}</span>
              </div>
            </div>

            <!-- 失败 -->
            <div v-else-if="store.lastError && !store.isGenerating" class="cr-state">
              <span class="cr-err-icon">!</span>
              <div class="cr-state-text">
                <span class="cr-state-title">生成失败</span>
                <span class="cr-state-sub">{{ store.lastError }}</span>
              </div>
              <button class="cr-btn" @click="store.generate()">重试</button>
            </div>

            <!-- 空态 -->
            <div v-else-if="!store.hasReport && !store.displayContent" class="cr-state">
              <div class="cr-state-text">
                <span class="cr-state-title">还没有生成过报告</span>
                <span class="cr-state-sub">
                  教练会基于上面的六维分析写一份完整诊断（整体判断 / 六维解读 / 谱面性质 / 可操作建议 / 阶段目标）。
                  生成过程会调用查库工具核对数据，结果会存在本地。
                </span>
              </div>
              <button class="cr-btn primary" @click="store.generate()">立即生成</button>
            </div>

            <!-- 报告正文 -->
            <template v-else>
              <div v-if="store.isGenerating" class="cr-generating-bar">
                <span class="cr-spinner sm" />
                <span>{{ progressText }}</span>
              </div>
              <article class="cr-md" v-html="renderedContent" />
            </template>
          </div>

          <!-- 底部 -->
          <footer class="cr-foot">
            <template v-if="store.isStale">
              <span class="cr-foot-warn">分析数据已更新，这份报告可能已过期</span>
              <button
                class="cr-foot-btn"
                :disabled="store.isGenerating"
                @click="store.generate(true)"
              >刷新基准并重新生成</button>
            </template>
            <span v-else-if="store.hasReport" class="cr-foot-hint">
              报告已存在本地，随时可看，不会重复消耗 AI 额度
            </span>
            <span v-else class="cr-foot-hint">报告只存在你的浏览器里，不会上传</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue';
import { useCoachReportStore } from '@/stores/useCoachReportStore';
import { renderSafeMarkdown } from '@/utils/markdown';

const store = useCoachReportStore();

const renderedContent = computed(() => renderSafeMarkdown(store.displayContent));

const metaText = computed(() => {
  const r = store.report;
  if (!r) return '';
  const d = new Date(r.generatedAt);
  const t = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const model = [r.provider, r.model].filter(Boolean).join(' / ');
  return `${t} · ${model}`;
});

const progressText = computed(() => {
  const tools = [...new Set(store.toolLog)];
  if (tools.length > 0) return `已查询：${tools.join(' · ')}`;
  return '正在读取 B50 快照…';
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') store.close();
}

// 打开时锁滚动 + 接管 Esc
watch(() => store.isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeydown);
  } else {
    document.body.style.overflow = '';
    window.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.cr-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.cr-panel {
  width: min(760px, 100%);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
  overflow: hidden;
}

/* ---- 头部 ---- */
.cr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color-light);
  background: linear-gradient(120deg, rgba(74, 114, 255, 0.06), rgba(157, 123, 255, 0.05));
  flex-shrink: 0;
}

.cr-head-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cr-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cr-meta { font-size: 10px; color: var(--text-muted); }
.cr-head-actions { display: flex; gap: 6px; flex-shrink: 0; }

.cr-btn {
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.cr-btn:hover:not(:disabled) { color: var(--color-primary); border-color: rgba(74, 114, 255, 0.35); }
.cr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cr-btn.ghost { background: transparent; }
.cr-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.cr-btn.primary:hover { background: var(--color-primary-dark); }

/* ---- 正文 ---- */
.cr-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
}

.cr-state {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 28px 6px;
}
.cr-state-text { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.cr-state-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cr-state-sub { font-size: 12px; line-height: 1.8; color: var(--text-secondary); }

.cr-spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(74, 114, 255, 0.2);
  border-top-color: var(--color-primary);
  animation: cr-spin 0.7s linear infinite;
  flex-shrink: 0;
  margin-top: 2px;
}
.cr-spinner.sm { width: 12px; height: 12px; border-width: 1.5px; margin-top: 0; }
@keyframes cr-spin { to { transform: rotate(360deg); } }

.cr-err-icon {
  display: grid; place-items: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: rgba(239, 68, 68, 0.12);
  color: var(--color-danger);
  font-size: 12px; font-weight: 800;
  flex-shrink: 0;
}

.cr-generating-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-bottom: 12px;
  border-radius: 9px;
  background: rgba(74, 114, 255, 0.06);
  border: 1px solid rgba(74, 114, 255, 0.14);
  font-size: 11px; color: var(--text-secondary);
}

/* ---- Markdown ---- */
.cr-md { font-size: 13px; line-height: 1.85; color: var(--text-primary); }
.cr-md :deep(h1),
.cr-md :deep(h2) {
  font-size: 14px; font-weight: 700; color: var(--text-primary);
  margin: 20px 0 8px;
  padding-left: 10px;
  border-left: 3px solid var(--color-primary);
  line-height: 1.4;
}
.cr-md :deep(h1:first-child),
.cr-md :deep(h2:first-child) { margin-top: 0; }
.cr-md :deep(h3) { font-size: 13px; font-weight: 700; margin: 16px 0 6px; color: var(--text-primary); }
.cr-md :deep(p) { margin: 8px 0; }
.cr-md :deep(ul),
.cr-md :deep(ol) { margin: 8px 0; padding-left: 22px; }
.cr-md :deep(li) { margin: 4px 0; }
.cr-md :deep(strong) { color: var(--color-primary); font-weight: 700; }
.cr-md :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(74, 114, 255, 0.08);
  color: var(--color-primary);
}
.cr-md :deep(pre) {
  margin: 10px 0; padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-body);
  overflow-x: auto;
}
.cr-md :deep(pre code) { background: none; padding: 0; color: var(--text-primary); }
.cr-md :deep(blockquote) {
  margin: 10px 0; padding: 8px 14px;
  border-left: 3px solid rgba(74, 114, 255, 0.3);
  background: rgba(74, 114, 255, 0.04);
  border-radius: 0 8px 8px 0;
  color: var(--text-secondary);
}
.cr-md :deep(hr) { border: none; border-top: 1px solid var(--border-color-light); margin: 18px 0; }
.cr-md :deep(table) { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
.cr-md :deep(th),
.cr-md :deep(td) { border: 1px solid var(--border-color-light); padding: 6px 10px; text-align: left; }
.cr-md :deep(th) { background: var(--bg-body); font-weight: 700; }

/* ---- 底部 ---- */
.cr-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 18px;
  border-top: 1px solid var(--border-color-light);
  background: var(--bg-body);
}
.cr-foot-hint { font-size: 10px; color: var(--text-muted); }
.cr-foot-warn { font-size: 10px; color: var(--color-warning); font-weight: 600; }

.cr-foot-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.08);
  color: #B45309;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}
.cr-foot-btn:hover:not(:disabled) { background: rgba(245, 158, 11, 0.16); }
.cr-foot-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---- 过渡 ---- */
.cr-fade-enter-active,
.cr-fade-leave-active { transition: opacity 0.18s ease; }
.cr-fade-enter-from,
.cr-fade-leave-to { opacity: 0; }
.cr-fade-enter-active .cr-panel { transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.cr-fade-enter-from .cr-panel { transform: translateY(10px) scale(0.985); }

@media (prefers-reduced-motion: reduce) {
  .cr-fade-enter-active, .cr-fade-leave-active { transition: none; }
  .cr-fade-enter-active .cr-panel { transition: none; }
  .cr-spinner { animation: none; }
}
</style>
