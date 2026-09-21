import { useAIChatStore } from '@/stores/useAIChatStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAnalysisStore } from '@/stores/useAnalysisStore';
import { SYSTEM_PROMPT } from '@/utils/aiPrompt';
import {
  buildLayeredContext,
  renderAnalysisSnapshot,
  buildAnalysisRequest,
  type PlayerProfileFacts,
} from '@/utils/coachMemory';
import { streamAIChat, agentChat, getActiveAIConfig } from '@/services/aiService';

export interface SendMessageOptions {
  /**
   * 额外注入的上下文块（完整数据注入）。一般不需要 —— Agent 会自己调工具。
   * 保留是为了兼容一次性把大块数据塞进上下文的场景。
   */
  extraContext?: string;
  /** 显示在聊天记录里的用户消息文本（默认等于 userInput） */
  displayText?: string;
}

export function useAICoach() {
  const chatStore = useAIChatStore();
  const playLogStore = usePlayLogStore();
  const songStore = useSongStore();
  const playerStore = usePlayerStore();
  const analysisStore = useAnalysisStore();

  /** 收集 L1 玩家画像 */
  function collectProfile(): PlayerProfileFacts {
    const records = playLogStore.records;
    const avg = records.length > 0
      ? records.reduce((s, r) => s + r.achievements, 0) / records.length
      : null;
    return {
      nickname: playerStore.playerName,
      rating: playerStore.currentRating,
      totalPlays: playLogStore.totalCount,
      avgAchievement: avg,
      songDbSize: songStore.songs.size,
    };
  }

  /**
   * 取当前应使用的 L2 分析快照。
   * 优先用 store 里已存的；若为空但本地分析结果还在（例如刚清空过对话），
   * 就地重建 —— 这样「清空对话」不会连带丢掉分析锚点。
   */
  function resolveSnapshot(): string {
    if (chatStore.analysisSnapshot) return chatStore.analysisSnapshot;
    const r = analysisStore.result;
    if (!r) return '';
    const text = renderAnalysisSnapshot(r);
    chatStore.setAnalysisSnapshot(text);
    return text;
  }

  async function sendMessage(userInput: string, opts: SendMessageOptions = {}) {
    const config = getActiveAIConfig();
    if (!config) {
      // 不抛异常 —— 抛出去会让调用方的 UI 静默失败（分析卡片明明出结果了，对话区却空白）。
      // 这里落一条对话消息，把原因直接告诉用户。
      chatStore.addMessage({ role: 'user', content: opts.displayText ?? userInput });
      chatStore.addMessage({
        role: 'assistant',
        content:
          '⚠️ 尚未配置 AI 服务，无法对话。\n\n' +
          '请到「设置 → AI 服务配置」填入 API Key（支持 Gemini / OpenAI / DeepSeek / Claude），' +
          '配置后重新点一次「生成 B50 能力分析」即可展开解读。\n\n' +
          '（上面的分析结果由本地算法算出，不需要 AI，已经可以看。）',
      });
      return;
    }

    // 曲库为空时先落地，否则 L1 画像里的曲库规模是 0
    if (songStore.songs.size === 0) await songStore.loadFromDB();

    // ===== 分层组装上下文（L1 → L5）=====
    const segments: string[] = [];

    // L1 画像 / L2 快照 / L3 摘要 / L4 近期对话（L5 由下方单独追加）
    segments.push(
      buildLayeredContext({
        profile: collectProfile(),
        snapshot: resolveSnapshot(),
        summary: chatStore.summaryMemory,
        history: chatStore.getRecentHistory(6),
      })
    );

    // 额外的显式上下文（极少用）
    if (opts.extraContext) {
      segments.push(`## [补充数据]\n${opts.extraContext}`);
    }

    // L5 当前问题
    segments.push(`## [L5] 当前问题\n${userInput}`);

    const userMessage = segments.join('\n\n---\n\n');

    chatStore.addMessage({ role: 'user', content: opts.displayText ?? userInput });
    chatStore.addMessage({ role: 'assistant', content: '', thinking: '' });
    chatStore.isStreaming = true;

    try {
      await agentChat(SYSTEM_PROMPT, userMessage, {
        onChunk: (chunk) => chatStore.appendToLastMessage(chunk),
        onThinking: (t) => chatStore.appendThinking(t),
        // 「工具调度轮」的思考是「我该调哪个工具」的废话，撤掉，只留真正作答那轮的
        onThinkingReset: () => chatStore.clearThinking(),
        onToolCall: (toolName) => {
          chatStore.appendToLastMessage(`\n\n> 🔧 *正在查询: ${toolName}...*\n\n`);
        },
      });
    } catch (err: any) {
      // Agent 失败 → 回退到普通流式
      console.warn('[Agent] 回退到普通模式:', err.message);
      try {
        await streamAIChat(
          SYSTEM_PROMPT, userMessage,
          (chunk) => chatStore.appendToLastMessage(chunk),
          (t) => chatStore.appendThinking(t)
        );
      } catch (fallbackErr: any) {
        chatStore.addMessage({ role: 'assistant', content: `❌ 错误: ${fallbackErr.message}` });
      }
    } finally {
      chatStore.isStreaming = false;
    }

    // 每 4 轮对话后，触发后台记忆总结
    const userMsgCount = chatStore.messages.filter(m => m.role === 'user').length;
    if (userMsgCount > 0 && userMsgCount % 4 === 0) {
      triggerSummaryUpdate();
    }
  }

  /**
   * 生成 B50 能力分析，并把结果作为 L2 锚点写进上下文，随后让教练展开解读。
   *
   * 这是「好看的按钮」背后的完整链路：
   *   本地算法算六维 → 渲染成快照存入 chatStore → 以「请解读」指令发起一轮对话
   */
  async function requestAnalysis() {
    if (chatStore.isStreaming || analysisStore.isAnalyzing) return;

    const r = await analysisStore.runAnalysis();

    if (!r) {
      chatStore.addMessage({ role: 'user', content: '生成 B50 能力分析' });
      chatStore.addMessage({
        role: 'assistant',
        content: `⚠️ ${analysisStore.lastError ?? '分析失败，请稍后重试。'}`,
      });
      return;
    }

    // 写入 L2 锚点 —— 之后所有提问都会自动带上它
    chatStore.setAnalysisSnapshot(renderAnalysisSnapshot(r));

    await sendMessage(buildAnalysisRequest(r), {
      displayText: '生成 B50 能力分析，并解读结果',
    });
  }

  /** 重新分析（强制刷新基准与 tag 数据） */
  async function reanalyze() {
    if (chatStore.isStreaming || analysisStore.isAnalyzing) return;
    const r = await analysisStore.runAnalysis(true);
    if (!r) return;
    chatStore.setAnalysisSnapshot(renderAnalysisSnapshot(r));
    await sendMessage('基准数据已刷新，请用最新快照重新解读我的 B50 能力分布。', {
      displayText: '重新分析（已刷新基准数据）',
    });
  }

  /** 后台触发 AI 总结当前对话目标，更新核心记忆 */
  async function triggerSummaryUpdate() {
    const history = chatStore.getRecentHistory(8);
    if (history.length === 0) return;
    const prompt = [
      `[后台任务] 请根据以下对话历史，用 1-2 句话总结玩家当前的练习目标、偏好和状态。`,
      `只输出总结，不要加任何前缀或解释。`,
      ``,
      history.map(h => `${h.role === 'user' ? '玩家' : 'AI'}: ${h.content}`).join('\n'),
    ].join('\n');

    try {
      const result = await streamAIChat(
        '你是一个总结助手。只输出1-2句中文总结，不要加前缀。',
        prompt,
        () => {}, // 静默更新，不推送到聊天
        () => {}
      );
      if (result?.trim()) {
        chatStore.setSummaryMemory(result.trim());
      }
    } catch {
      // 总结失败不影响主流程
    }
  }

  return { sendMessage, requestAnalysis, reanalyze };
}
