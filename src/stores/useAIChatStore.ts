import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessage } from '@/types/ai';

export const useAIChatStore = defineStore('aiChat', () => {
  const messages = ref<ChatMessage[]>([]);
  const isStreaming = ref(false);
  /** 核心记忆 — 定期由 AI 总结的长期目标/状态 */
  const summaryMemory = ref('');

  function addMessage(msg: Omit<ChatMessage, 'timestamp'>) {
    messages.value.push({ ...msg, timestamp: new Date().toISOString() });
  }

  function appendToLastMessage(text: string) {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.content += text;
    }
  }

  /** 追加思考链内容到最新一条助手消息 */
  function appendThinking(text: string) {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.thinking = (last.thinking ?? '') + text;
    }
  }

  function clearMessages() {
    messages.value = [];
    summaryMemory.value = '';
  }

  /** 设置核心记忆 */
  function setSummaryMemory(text: string) {
    summaryMemory.value = text;
  }

  /** 获取最近 N 条对话历史（user + assistant） */
  function getRecentHistory(windowSize = 6): { role: 'user' | 'assistant'; content: string }[] {
    return messages.value
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-windowSize)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  return {
    messages, isStreaming, summaryMemory,
    addMessage, appendToLastMessage, appendThinking, clearMessages,
    setSummaryMemory, getRecentHistory,
  };
});
