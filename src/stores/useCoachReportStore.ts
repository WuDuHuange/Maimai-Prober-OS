/**
 * 教练详细分析报告 —— 状态与持久化
 *
 * 一份报告的生命周期：
 *   生成（走 agentChat，带查库工具）→ 落 IndexedDB → 之后一直读缓存，不重复消耗额度
 *
 * 「随时生成」的语义：
 *   - 首次点开时若还没有本地分析结果，先自动跑一次本地分析（首次分析），再让 AI 写报告
 *   - 已有报告时，「重新生成」会强制刷新基准数据后重写
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db } from '@/services/db';
import { agentChat, streamAIChat, getActiveAIConfig } from '@/services/aiService';
import { SYSTEM_PROMPT } from '@/utils/aiPrompt';
import {
  renderAnalysisSnapshot,
  buildLayeredContext,
  type PlayerProfileFacts,
} from '@/utils/coachMemory';
import {
  COACH_REPORT_KEY,
  analysisFingerprint,
  buildReportRequest,
  isReportStale,
  type CoachReport,
} from '@/utils/coachReport';
import { useAnalysisStore } from '@/stores/useAnalysisStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { useTagStore } from '@/stores/useTagStore';
import { checkSongMentions, type MentionCheck } from '@/utils/reportCheck';

export const useCoachReportStore = defineStore('coachReport', () => {
  const report = ref<CoachReport | null>(null);
  /** 正在流式写入的草稿 */
  const draft = ref('');
  const isGenerating = ref(false);
  const lastError = ref<string | null>(null);
  /** 生成过程中教练调过的工具，用于在等待时给用户反馈 */
  const toolLog = ref<string[]>([]);
  /** 弹窗开关 */
  const isOpen = ref(false);

  const hasReport = computed(() => !!report.value?.content);
  const isStale = computed(() =>
    isReportStale(report.value, useAnalysisStore().result)
  );
  /** 展示用文本：生成中优先显示草稿 */
  const displayContent = computed(() =>
    isGenerating.value ? draft.value : (report.value?.content ?? '')
  );

  /**
   * 防幻觉事后核对：把正文里「」《》`` 包裹的曲名与本地曲库比对。
   * ⚠️ 只在**生成结束后**跑 —— 流式期间每个 chunk 都会变，跑起来会拖垮主线程。
   * ⚠️ `unverified` 只代表「没能核对上」，可能是简称/别名，UI 文案不要写成「编造」。
   */
  const mentionCheck = computed<MentionCheck>(() => {
    if (isGenerating.value) return { verified: [], unverified: [] };
    const content = report.value?.content ?? '';
    if (!content) return { verified: [], unverified: [] };

    const songStore = useSongStore();
    if (songStore.songs.size === 0) return { verified: [], unverified: [] };

    const analysis = useAnalysisStore();
    // 白名单：维度名 / 技术类型名 / tag 名 —— 这些出现在引号里是正常的，不是曲名
    const known = [
      ...(analysis.result?.dimensions.map(d => d.label) ?? []),
      ...(analysis.result?.typeSpecialties.map(t => t.name) ?? []),
      ...(useTagStore().catalog?.tags.map(t => t.name) ?? []),
    ];
    return checkSongMentions(content, songStore.songs.values(), known);
  });

  /** 从 IndexedDB 读回上次存下的报告 */
  async function load() {
    try {
      const row = await db.appSettings.get(COACH_REPORT_KEY);
      report.value = row?.value ? (JSON.parse(row.value) as CoachReport) : null;
    } catch {
      report.value = null;
    }
  }

  async function persist() {
    if (!report.value) return;
    await db.appSettings.put({
      key: COACH_REPORT_KEY,
      value: JSON.stringify(report.value),
      updatedAt: new Date().toISOString(),
    });
  }

  function open() { isOpen.value = true; }
  function close() { isOpen.value = false; }

  /** 删除已存报告 */
  async function clear() {
    report.value = null;
    draft.value = '';
    lastError.value = null;
    await db.appSettings.delete(COACH_REPORT_KEY);
  }

  /**
   * 生成（或重新生成）报告。
   * @param refreshBaseline 是否先强制刷新基准与 tag 缓存再分析
   */
  async function generate(refreshBaseline = false) {
    if (isGenerating.value) return;
    lastError.value = null;

    const analysisStore = useAnalysisStore();

    // 「首次分析」：还没有本地结果就先跑一次，别让用户点两遍
    let result = analysisStore.result;
    if (!result || refreshBaseline) {
      result = await analysisStore.runAnalysis(refreshBaseline);
    }
    if (!result) {
      lastError.value = analysisStore.lastError ?? '本地分析失败，无法生成报告。';
      return;
    }

    const config = getActiveAIConfig();
    if (!config) {
      lastError.value = '尚未配置 AI 服务。请到「设置 → AI 服务配置」填入 API Key 后再试。';
      return;
    }

    isGenerating.value = true;
    draft.value = '';
    toolLog.value = [];

    const songStore = useSongStore();
    if (songStore.songs.size === 0) await songStore.loadFromDB();

    const playerStore = usePlayerStore();
    const playLogStore = usePlayLogStore();
    const records = playLogStore.records;
    const avg = records.length > 0
      ? records.reduce((s, x) => s + x.achievements, 0) / records.length
      : null;
    const profile: PlayerProfileFacts = {
      nickname: playerStore.playerName,
      rating: playerStore.currentRating,
      totalPlays: playLogStore.totalCount,
      avgAchievement: avg,
      songDbSize: songStore.songs.size,
    };

    const userMessage = buildLayeredContext({
      profile,
      snapshot: renderAnalysisSnapshot(result),
      summary: '',
      history: [],
      current: buildReportRequest(result),
    });

    let content = '';
    try {
      // 走 Agent：教练可以自己调工具查库补充数据
      await agentChat(SYSTEM_PROMPT, userMessage, {
        onChunk: (c) => { draft.value += c; },
        onToolCall: (name) => { toolLog.value.push(name); },
      });
      content = draft.value.trim();
    } catch (err: any) {
      // 部分网关不认工具协议 → 退回普通流式（这次是逐字返回，体验反而更好）
      console.warn('[CoachReport] Agent 失败，回退普通流式:', err?.message);
      try {
        draft.value = '';
        content = (await streamAIChat(SYSTEM_PROMPT, userMessage, (c) => { draft.value += c; })).trim();
      } catch (fallbackErr: any) {
        lastError.value = fallbackErr?.message ?? '生成失败，请稍后重试。';
        isGenerating.value = false;
        return;
      }
    }

    if (!content) {
      lastError.value = 'AI 没有返回内容，请稍后重试。';
      isGenerating.value = false;
      return;
    }

    report.value = {
      generatedAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      fingerprint: analysisFingerprint(result),
      content,
    };
    await persist();
    isGenerating.value = false;
  }

  return {
    report, draft, isGenerating, lastError, toolLog, isOpen,
    hasReport, isStale, displayContent, mentionCheck,
    load, persist, generate, clear, open, close,
  };
});
