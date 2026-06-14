import { useAIChatStore } from '@/stores/useAIChatStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useB50Store } from '@/stores/useB50Store';
import { SYSTEM_PROMPT } from '@/utils/aiPrompt';
import {
  buildSongDatabaseContext,
  buildB50Context,
} from '@/utils/coachContextBuilder';
import { streamAIChat, getActiveAIConfig } from '@/services/aiService';

export function useAICoach() {
  const chatStore = useAIChatStore();
  const playLogStore = usePlayLogStore();
  const songStore = useSongStore();
  const playerStore = usePlayerStore();
  const b50Store = useB50Store();

  /** 构建自动注入的轻量玩家数据上下文（每次对话都带） */
  function buildAutoContext(): string {
    const parts: string[] = [];
    parts.push(`[系统注入 — 当前玩家数据]`);
    parts.push(`昵称: ${playerStore.playerName} | Rating: ${playerStore.currentRating} | 总游玩: ${playLogStore.totalCount} 次 | 曲库: ${songStore.songs.size} 首`);
    
    if (b50Store.b50List.length > 0) {
      const top5 = b50Store.b50List.slice(0, 5);
      parts.push(`B50 Top5: ` + top5.map(b => 
        `${b.title ?? '#'+b.songId}(${b.difficulty.toUpperCase()} ${b.constant} 达成${b.achievements.toFixed(1)}% R贡献${b.ratingContribution?.toFixed(0)})`
      ).join(', '));
    }
    return parts.join('\n');
  }

  async function sendMessage(userInput: string, context?: string) {
    const config = getActiveAIConfig();
    if (!config) {
      throw new Error('请先在设置中配置 AI 服务 (支持 Gemini / OpenAI / DeepSeek / Claude / Gemma)');
    }

    // 自动上下文：手打消息时注入轻量数据；按钮触发时用完整上下文
    const autoCtx = context ? '' : buildAutoContext();
    const userMessage = [autoCtx, context, userInput].filter(Boolean).join('\n\n');

    chatStore.addMessage({ role: 'user', content: userInput });
    chatStore.addMessage({ role: 'assistant', content: '', thinking: '' });
    chatStore.isStreaming = true;

    try {
      await streamAIChat(
        SYSTEM_PROMPT,
        userMessage,
        (chunk) => chatStore.appendToLastMessage(chunk),
        (thinking) => chatStore.appendThinking(thinking)
      );
    } catch (err: any) {
      chatStore.addMessage({ role: 'assistant', content: `❌ 错误: ${err.message}` });
    } finally {
      chatStore.isStreaming = false;
    }
  }

  async function coachAnalysis() {
    // 收集全量数据
    const recentPlays = await playLogStore.getRecentPlays(30);
    const recentFails = await playLogStore.getRecentFails(20);
    const totalPlays = playLogStore.totalCount;
    const avgAch = recentPlays.length > 0
      ? (recentPlays.reduce((s, r) => s + r.achievements, 0) / recentPlays.length).toFixed(2)
      : 'N/A';

    // B50
    if (b50Store.b50List.length === 0) {
      await b50Store.loadFromDB();
    }

    // 如果完全没有数据，直接告知
    if (totalPlays === 0 && b50Store.b50List.length === 0) {
      chatStore.addMessage({ role: 'user', content: '请求教练分析' });
      chatStore.addMessage({
        role: 'assistant',
        content: '⚠️ 尚未同步任何战绩数据。请先在「设置」中配置水鱼 Import-Token，然后点击侧边栏的「开始同步」获取你的舞萌 DX 战绩。同步完成后我就能为你分析了！',
      });
      return;
    }

    const parts: string[] = [];

    // 1) 玩家概况
    parts.push([
      `## 玩家概况`,
      `- 昵称: ${playerStore.playerName}`,
      `- 当前 Rating: ${playerStore.currentRating}`,
      `- 总游玩次数: ${totalPlays}`,
      `- 近 30 次平均达成率: ${avgAch}%`,
      `- 曲库总数: ${songStore.songs.size} 首`,
    ].join('\n'));

    // 2) B50 核心数据
    if (b50Store.b50List.length > 0) {
      parts.push(buildB50Context(b50Store.b50List));
    }

    // 3) 近期战绩（全量，不限难度）
    if (recentPlays.length > 0) {
      parts.push([
        `## 近期战绩（最近 ${recentPlays.length} 次游玩）`,
        ...recentPlays.map(r => {
          const song = songStore.songs.get(r.songId);
          return `- ${song?.title ?? '未知'} [${song?.type ?? '?'}] ${r.difficulty.toUpperCase()} 定数${r.constant ?? '?'} | 达成 ${r.achievements.toFixed(2)}% | DX分 ${r.dxScore} | ${r.fcStatus} | 评级 ${r.rate || '-'}`;
        }),
      ].join('\n'));
    }

    // 4) 翻车记录（如果有）
    if (recentFails.length > 0) {
      parts.push([
        `## 需关注的曲目（Master/Re:Master 达成率 < 97%）`,
        ...recentFails.map(r => {
          const song = songStore.songs.get(r.songId);
          return `- ${song?.title ?? '未知'} [${r.difficulty.toUpperCase()}] 定数${r.constant ?? '?'} | 达成 ${r.achievements.toFixed(2)}% | Fast:${r.fastCount} Late:${r.lateCount} Miss:${r.missCount}`;
        }),
      ].join('\n'));
    }

    // 5) 可用曲库
    const songDbContext = buildSongDatabaseContext(
      recentFails.length > 0 ? recentFails : recentPlays,
      songStore.songs,
      40
    );
    parts.push(songDbContext);

    const fullContext = parts.join('\n\n');
    await sendMessage(
      '以上是我的完整战绩数据（含 B50、近期游玩记录、曲库）。请全面分析并给出练习建议。',
      fullContext
    );
  }

  return { sendMessage, coachAnalysis };
}
