import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessage } from '@/types/ai';

export const useAIChatStore = defineStore('aiChat', () => {
  const messages = ref<ChatMessage[]>([]);
  const isStreaming = ref(false);

  function addMessage(msg: Omit<ChatMessage, 'timestamp'>) {
    messages.value.push({ ...msg, timestamp: new Date().toISOString() });
  }

  function appendToLastMessage(text: string) {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.content += text;
    }
  }

  function clearMessages() {
    messages.value = [];
  }

  return { messages, isStreaming, addMessage, appendToLastMessage, clearMessages };
});
