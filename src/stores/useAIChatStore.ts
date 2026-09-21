import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessage } from '@/types/ai';

export const useAIChatStore = defineStore('aiChat', () => {
  const messages = ref<ChatMessage[]>([]);
  const isStreaming = ref(false);
  /** 核心记忆 — 定期由 AI 总结的长期目标/状态 */
  const summaryMemory = ref('');
  /**
   * L2 分析快照 —— 由本地算法产出的 B50 分析，渲染成结构化文本。
   * 一旦生成就**一直保留**，后续每轮对话都带上它（上下文锚点）。
   * 只有重新分析或清空对话时才被替换 / 清除。
   */
  const analysisSnapshot = ref('');

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

  /**
   * 清空最新一条助手消息的思考链。
   *
   * 用于 Agent 的「工具调度轮」：那一轮模型只是在决定调哪个工具，
   * 它顺带产出的思考对用户没有价值（推理模型能在这上面啰嗦几千字），
   * 已经推给 UI 的必须撤掉，否则会和真正作答那轮的思考拼成一个巨型 blob。
   */
  function clearThinking() {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.thinking = '';
    }
  }

  function clearMessages() {
    messages.value = [];
    summaryMemory.value = '';
    analysisSnapshot.value = '';
  }

  /** 设置核心记忆 */
  function setSummaryMemory(text: string) {
    summaryMemory.value = text;
  }

  /** 写入 / 替换 L2 分析快照（传空串即清除） */
  function setAnalysisSnapshot(text: string) {
    analysisSnapshot.value = text;
  }

  /** 获取最近 N 条对话历史（user + assistant） */
  function getRecentHistory(windowSize = 6): { role: 'user' | 'assistant'; content: string }[] {
    return messages.value
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-windowSize)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  return {
    messages, isStreaming, summaryMemory, analysisSnapshot,
    addMessage, appendToLastMessage, appendThinking, clearThinking, clearMessages,
    setSummaryMemory, setAnalysisSnapshot, getRecentHistory,
  };
});
