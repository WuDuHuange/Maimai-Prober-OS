<template>
  <div class="ai-chat-panel">
    <!-- 消息历史 -->
    <div ref="messageContainer" class="messages-area">
      <div v-if="messages.length === 0" class="empty-state">
        <p class="text-text-muted text-xs">在此与 AI 教练对话</p>
        <p class="text-text-muted text-xs mt-1">点击"请求教练分析"或直接输入问题</p>
      </div>

      <div v-for="(msg, i) in messages" :key="i" class="message-row" :class="msg.role">
        <div class="message-bubble" :class="msg.role">
          <div class="message-label">{{ msg.role === 'user' ? '你' : 'AI 教练' }}</div>
          <div class="message-content">
            {{ msg.content }}
            <span v-if="msg.role === 'assistant' && i === messages.length - 1 && isStreaming && msg.content === ''" class="cursor-blink">|</span>
          </div>
          <button
            v-if="msg.role === 'assistant' && i === messages.length - 1 && !isStreaming && msg.content.length > 50"
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
        :disabled="isStreaming"
        @click="$emit('coach')"
      >
        请求教练分析
      </button>
      <div class="flex gap-2 mt-2">
        <input
          v-model="inputText"
          class="chat-input"
          placeholder="输入问题..."
          :disabled="isStreaming"
          @keydown.enter="send"
        />
        <button
          class="send-btn"
          :disabled="isStreaming || !inputText.trim()"
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

const emit = defineEmits<{
  coach: [];
  send: [text: string];
}>();

const chatStore = useAIChatStore();
const inputText = ref('');
const messageContainer = ref<HTMLElement | null>(null);

const { messages, isStreaming } = storeToRefs(chatStore);

function send() {
  const text = inputText.value.trim();
  if (!text || isStreaming.value) return;
  inputText.value = '';
  emit('send', text);
}

async function saveAsPlan(content: string) {
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
}

// Auto-scroll to bottom on new messages
watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
    }
  },
  { flush: 'post' }
);

// Helper to make Pinia reactive refs
function storeToRefs<T extends Record<string, any>>(store: T) {
  const refs: Record<string, any> = {};
  for (const key of Object.keys(store)) {
    refs[key] = store[key];
  }
  return refs as { messages: typeof store.messages; isStreaming: typeof store.isStreaming };
}
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
</style>
