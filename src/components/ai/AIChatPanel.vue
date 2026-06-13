<template>
  <div class="ai-chat-panel">
    <!-- 消息历史 -->
    <div ref="messageContainer" class="messages-area">
      <div v-if="chatStore.messages.length === 0" class="empty-state">
        <p class="text-text-muted text-xs">在此与 AI 教练对话</p>
        <p class="text-text-muted text-xs mt-1">点击"请求教练分析"或直接输入问题</p>
      </div>

      <div v-for="(msg, i) in chatStore.messages" :key="i" class="message-row" :class="msg.role">
        <div class="message-bubble" :class="msg.role">
          <div class="message-label">{{ msg.role === 'user' ? '你' : 'AI 教练' }}</div>

          <!-- 思考链（可折叠） -->
          <div v-if="msg.role === 'assistant' && msg.thinking" class="thinking-section">
            <button class="thinking-toggle" @click="toggleThinking(i)">
              <svg class="thinking-chevron" :class="{ open: openThinking.has(i) }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="m9 18 6-6-6-6"/>
              </svg>
              <span>思考过程</span>
              <span class="thinking-badge" v-if="isStreamingMsg(i)">生成中...</span>
            </button>
            <div v-if="openThinking.has(i)" class="thinking-content">{{ msg.thinking }}</div>
          </div>

          <!-- 用户消息：纯文本 -->
          <div v-if="msg.role === 'user'" class="message-content">{{ msg.content }}</div>
          <!-- AI 消息：流式输出时纯文本，完成后渲染 Markdown -->
          <div
            v-else
            class="message-content markdown-body"
            v-html="renderMarkdown(msg.content, isStreamingMsg(i))"
          />
          <span v-if="isStreamingMsg(i) && !msg.content && !msg.thinking" class="cursor-blink">|</span>
          <button
            v-if="msg.role === 'assistant' && i === chatStore.messages.length - 1 && !chatStore.isStreaming && msg.content.length > 50"
            class="save-plan-btn"
            @click="saveAsPlan(msg.content)"
          >
            保存为练习计划
          </button>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <button
        class="coach-btn"
        :disabled="chatStore.isStreaming"
        @click="$emit('coach')"
      >
        请求教练分析
      </button>
      <div class="flex gap-2 mt-2">
        <input
          v-model="inputText"
          class="chat-input"
          placeholder="输入问题..."
          :disabled="chatStore.isStreaming"
          @keydown.enter="send"
        />
        <button
          class="send-btn"
          :disabled="chatStore.isStreaming || !inputText.trim()"
          @click="send"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { useAIChatStore } from '@/stores/useAIChatStore';
import { db } from '@/services/db';
import { marked } from 'marked';

const emit = defineEmits<{
  coach: [];
  send: [text: string];
}>();

const chatStore = useAIChatStore();
const inputText = ref('');
const messageContainer = ref<HTMLElement | null>(null);
const openThinking = ref(new Set<number>());

/** 判断某条消息是否正在流式输出中 */
function isStreamingMsg(index: number): boolean {
  return index === chatStore.messages.length - 1 && chatStore.isStreaming;
}

/** 切换思考链折叠 */
function toggleThinking(index: number) {
  if (openThinking.value.has(index)) {
    openThinking.value.delete(index);
  } else {
    openThinking.value.add(index);
  }
  // 触发响应式更新
  openThinking.value = new Set(openThinking.value);
}

// 流式输出中自动展开思考链
watch(() => chatStore.isStreaming, (streaming) => {
  if (streaming) {
    const idx = chatStore.messages.length - 1;
    if (idx >= 0 && chatStore.messages[idx].role === 'assistant') {
      openThinking.value.add(idx);
      openThinking.value = new Set(openThinking.value);
    }
  }
});

/** 渲染 Markdown：流式时保留纯文本防渲染不完整，完成后转 HTML */
function renderMarkdown(content: string, isStreaming: boolean): string {
  if (!content) return '';
  if (isStreaming) {
    // 流式输出中 — 纯文本 + 简单换行
    return content.replace(/\n/g, '<br>');
  }
  try {
    return marked.parse(content, { breaks: true }) as string;
  } catch {
    return content.replace(/\n/g, '<br>');
  }
}

function send() {
  const text = inputText.value.trim();
  if (!text || chatStore.isStreaming) return;
  inputText.value = '';
  emit('send', text);
}

async function saveAsPlan(content: string) {
  try {
    const existing = await db.appSettings.get('practice_plans');
    let plans: any[] = [];
    if (existing?.value) {
      try { plans = JSON.parse(existing.value); } catch { plans = []; }
    }

    const newPlan = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      summary: content.slice(0, 500),
      songs: [],
    };

    plans.unshift(newPlan);
    await db.appSettings.put({
      key: 'practice_plans',
      value: JSON.stringify(plans),
      updatedAt: new Date().toISOString(),
    });
    alert('练习计划已保存');
  } catch (err: any) {
    console.error('保存练习计划失败:', err);
  }
}

// Auto-scroll to bottom on new messages
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick();
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
    }
  },
  { flush: 'post' }
);
</script>

<style scoped>
.ai-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.message-row {
  display: flex;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 85%;
  border-radius: 8px;
  padding: 10px 12px;
}

.message-bubble.user {
  background-color: var(--color-primary);
  color: white;
}

.message-bubble.assistant {
  background-color: var(--bg-card);
  color: var(--text-primary);
}

.message-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.message-bubble.user .message-label {
  color: rgba(255, 255, 255, 0.7);
}

.message-content {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.save-plan-btn {
  display: block;
  margin-top: 6px;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid var(--color-primary);
  background-color: transparent;
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.15s;
}

.save-plan-btn:hover {
  background-color: rgba(99, 102, 241, 0.1);
}

.input-area {
  padding: 12px;
  border-top: 1px solid var(--bg-hover);
}

.coach-btn {
  width: 100%;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background-color: transparent;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}

.coach-btn:hover:not(:disabled) {
  background-color: rgba(99, 102, 241, 0.1);
}

.coach-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input {
  flex: 1;
  background-color: var(--bg-primary);
  border: 1px solid var(--bg-hover);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}

.chat-input:focus {
  border-color: var(--color-primary);
}

.send-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  background-color: var(--color-primary);
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.send-btn:hover:not(:disabled) {
  background-color: var(--color-primary-dark);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== Markdown 渲染样式 ===== */
.markdown-body :deep(h1) { font-size: 18px; font-weight: 800; margin: 12px 0 6px; color: var(--text-primary); }
.markdown-body :deep(h2) { font-size: 15px; font-weight: 700; margin: 10px 0 4px; color: var(--text-primary); }
.markdown-body :deep(h3) { font-size: 13px; font-weight: 700; margin: 8px 0 4px; color: var(--text-primary); }
.markdown-body :deep(p) { margin: 4px 0; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 20px; margin: 4px 0; }
.markdown-body :deep(li) { margin: 2px 0; }
.markdown-body :deep(strong) { font-weight: 700; color: var(--text-primary); }
.markdown-body :deep(code) {
  padding: 1px 5px; border-radius: 4px;
  background: rgba(74,114,255,0.08); color: #7C3AED;
  font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace;
}
.markdown-body :deep(pre) {
  background: #1E1E2E; color: #CDD6F4; border-radius: 8px;
  padding: 12px; margin: 8px 0; overflow-x: auto;
  font-size: 12px; line-height: 1.5;
}
.markdown-body :deep(pre code) { background: transparent; color: inherit; padding: 0; }
.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--color-primary); padding-left: 12px;
  margin: 8px 0; color: var(--text-secondary); font-style: italic;
}
.markdown-body :deep(table) { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
.markdown-body :deep(th), .markdown-body :deep(td) {
  border: 1px solid var(--border-color); padding: 6px 10px; text-align: left;
}
.markdown-body :deep(th) { background: var(--bg-body); font-weight: 700; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 12px 0; }
.markdown-body :deep(a) { color: var(--color-primary); text-decoration: underline; }

/* ===== 思考链 ===== */
.thinking-section {
  margin-bottom: 8px;
  border: 1px solid rgba(139,155,180,0.2);
  border-radius: 8px;
  overflow: hidden;
}
.thinking-toggle {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 7px 10px;
  border: none; background: rgba(139,155,180,0.04);
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; transition: background var(--transition-fast);
}
.thinking-toggle:hover { background: rgba(139,155,180,0.08); }
.thinking-chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}
.thinking-chevron.open { transform: rotate(90deg); }
.thinking-badge {
  margin-left: auto; padding: 1px 7px; border-radius: 4px;
  background: rgba(74,114,255,0.1); color: var(--color-primary);
  font-size: 10px; font-weight: 600;
}
.thinking-content {
  padding: 10px 12px;
  font-size: 11px; line-height: 1.6; color: var(--text-muted);
  white-space: pre-wrap; word-break: break-word;
  max-height: 240px; overflow-y: auto;
  border-top: 1px solid rgba(139,155,180,0.1);
  background: rgba(139,155,180,0.03);
}
</style>
