import { decrypt } from '@/services/cryptoService';
import { useAIChatStore } from '@/stores/useAIChatStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { SYSTEM_PROMPT } from '@/utils/aiPrompt';
import type { PlayRecord } from '@/types/playRecord';
import type { SongMeta } from '@/types/song';

function formatRecordForAI(record: PlayRecord, song: SongMeta | undefined): string {
  const constMap: Record<string, number | null> = {
    basic: song?.basicConst ?? null,
    advanced: song?.advancedConst ?? null,
    expert: song?.expertConst ?? null,
    master: song?.masterConst ?? null,
    remaster: song?.remasterConst ?? null,
  };
  const constant = constMap[record.difficulty] ?? 'N/A';

  return [
    `- [${record.playTime}] ${song?.title ?? '未知曲目'} [${record.difficulty.toUpperCase()} ${constant}]`,
    `  Achievement: ${record.achievements.toFixed(2)}%`,
    `  DX Score: ${record.dxScore}`,
    `  Fast: ${record.fastCount} | Late: ${record.lateCount}`,
    `  Miss: ${record.missCount} | FC: ${record.fcStatus}`,
  ].join('\n');
}

function buildCoachContext(
  recentFails: PlayRecord[],
  playerRating: number,
  songMap: Map<number, SongMeta>
): string {
  const recordsText = recentFails
    .map(r => formatRecordForAI(r, songMap.get(r.songId)))
    .join('\n');

  return [
    `## Player Current Status`,
    `- Current Rating: ${playerRating}`,
    ``,
    `## Recent Struggle Records (Last 20 plays below 97% on Master/Re:Master)`,
    recordsText || '  (无近期翻车记录)',
    ``,
    `## Available Song Database Stats`,
    `- Total songs in database: ${songMap.size}`,
    ``,
    `Please analyze these records and provide your coaching diagnosis and practice recommendations.`,
  ].join('\n');
}

export function useAICoach() {
  const chatStore = useAIChatStore();
  const playLogStore = usePlayLogStore();
  const songStore = useSongStore();
  const playerStore = usePlayerStore();

  async function sendMessage(userInput: string, context?: string) {
    const encryptedKey = localStorage.getItem('gemini_key_enc');
    if (!encryptedKey) {
      throw new Error('请先在设置中配置 Gemini API Key');
    }

    const apiKey = decrypt(encryptedKey);
    const fullPrompt = context
      ? SYSTEM_PROMPT + '\n\n' + context + '\n\n' + userInput
      : SYSTEM_PROMPT + '\n\n' + userInput;

    chatStore.addMessage({ role: 'user', content: userInput });
    chatStore.addMessage({ role: 'assistant', content: '' });
    chatStore.isStreaming = true;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 403) throw new Error('Gemini API Key 无效, 请在设置中重新配置');
        if (response.status === 429) throw new Error('AI 请求过于频繁, 请稍后再试');
        throw new Error(`API 请求失败: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                chatStore.appendToLastMessage(text);
              }
            } catch {
              // skip malformed JSON lines
            }
          }
        }
      }
    } catch (err: any) {
      chatStore.addMessage({ role: 'assistant', content: `错误: ${err.message}` });
    } finally {
      chatStore.isStreaming = false;
    }
  }

  async function coachAnalysis() {
    const recentFails = await playLogStore.getRecentFails(20);
    const context = buildCoachContext(
      recentFails,
      playerStore.currentRating,
      songStore.songs
    );

    await sendMessage('请分析我的近期战绩并提供练习建议。', context);
  }

  return { sendMessage, coachAnalysis };
}
