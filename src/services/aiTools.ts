/**
 * AI 工具注册表 — MCP JSON Schema 格式
 * 执行函数访问 Pinia Store + Dexie 数据库
 */
import { db } from '@/services/db';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useB50Store } from '@/stores/useB50Store';

// ---- MCP-Format 工具定义 ----
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; default?: unknown }>;
    required?: string[];
  };
}

export const AI_TOOLS: MCPTool[] = [
  {
    name: 'get_player_stats',
    description: '获取当前玩家统计概览：昵称、Rating、总游玩次数、平均达成率、曲库规模',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_b50_data',
    description: '获取玩家 Best 50 数据。isNew=true=B15新版本, isNew=false=B35旧版本',
    inputSchema: {
      type: 'object',
      properties: {
        isNew: { type: 'boolean', description: 'true=B15, false=B35' },
        topN: { type: 'number', description: '返回条数，默认15', default: 15 },
      },
    },
  },
  {
    name: 'get_recent_plays',
    description: '获取最近游玩记录（曲名/难度/达成率/DX分/FC状态）',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数，默认20', default: 20 },
        difficulty: { type: 'string', description: '筛选难度: basic/advanced/expert/master/remaster' },
      },
    },
  },
  {
    name: 'get_recent_fails',
    description: '获取 Master/Re:Master 达成率<97% 的翻车记录',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数，默认20', default: 20 },
      },
    },
  },
  {
    name: 'search_songs',
    description: '在曲库搜索歌曲，返回标题/类型/各难度定数',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词（曲名或艺术家）' },
        type: { type: 'string', description: 'DX 或 SD' },
        maxResults: { type: 'number', description: '最多返回条数，默认10', default: 10 },
      },
    },
  },
  {
    name: 'web_search',
    description: '联网搜索舞萌 DX 相关知识（定数/谱面攻略/技术术语）',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '搜索关键词' },
      },
    },
  },
];

/** 生成发送给 AI 的工具清单（纯文本） */
export function buildToolPrompt(): string {
  const lines = ['## 可用工具 — 需要数据时必须调用，禁止编造'];
  for (const t of AI_TOOLS) {
    const props = Object.entries(t.inputSchema.properties)
      .map(([k, v]) => `${k}: ${v.type}`)
      .join(', ');
    lines.push(`- ${t.name}: ${t.description}${props ? ` [参数: ${props}]` : ''}`);
  }
  lines.push('');
  lines.push('### 工具调用规则（必须严格遵守）');
  lines.push('1. 需要数据时，只输出以下格式（不要加任何解释）:');
  lines.push('   TOOL: 工具名');
  lines.push('   ARGS: {"key": value}');
  lines.push('   ===END===');
  lines.push('2. 收到 RESULT ... ===END=== 后才能开始分析。没有收到 RESULT 严禁输出任何结论');
  lines.push('3. 严禁编造任何数据。工具返回为空就说"暂无数据"');
  lines.push('4. 每次只调用一个工具。等待 RESULT 后再决定是否需要更多');
  return lines.join('\n');
}

// ---- 执行层 ----
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export async function executeToolCall(call: ToolCall): Promise<string> {
  const { name, args } = call;

  switch (name) {
    case 'get_player_stats': {
      const player = usePlayerStore();
      const playLog = usePlayLogStore();
      const song = useSongStore();
      const records = playLog.records;
      const avg = records.length > 0
        ? (records.reduce((s, r) => s + r.achievements, 0) / records.length).toFixed(2)
        : 'N/A';
      return JSON.stringify({
        nickname: player.playerName, rating: player.currentRating,
        totalPlays: playLog.totalCount, avgAchievement: avg + '%', songDbSize: song.songs.size,
      });
    }

    case 'get_b50_data': {
      const b50 = useB50Store();
      if (b50.b50List.length === 0) await b50.loadFromDB();
      const isNew = args.isNew === true || args.isNew === 'true';
      const topN = (args.topN as number) || 15;
      const filtered = b50.b50List.filter(b => b.isNew === isNew).slice(0, topN);
      return JSON.stringify(filtered.map(b => ({
        title: b.title ?? `#${b.songId}`, type: b.type, difficulty: b.difficulty,
        constant: b.constant, achievements: Number(b.achievements.toFixed(2)),
        dxScore: b.dxScore, fcStatus: b.fcStatus,
        ratingContribution: b.ratingContribution ? Math.round(b.ratingContribution) : null,
      })));
    }

    case 'get_recent_plays': {
      const limit = (args.limit as number) || 20;
      const diff = (args.difficulty as string) || undefined;
      const all = await db.playLogs.orderBy('playTime').reverse().limit(limit * 2).toArray();
      const filtered = diff ? all.filter(r => r.difficulty === diff).slice(0, limit) : all.slice(0, limit);
      const songs = await db.songs.bulkGet([...new Set(filtered.map(r => r.songId))]);
      const sm = new Map(songs.filter(Boolean).map(s => [s!.songId, s!]));
      return JSON.stringify(filtered.map(r => ({
        title: sm.get(r.songId)?.title ?? `#${r.songId}`, type: sm.get(r.songId)?.type,
        difficulty: r.difficulty, achievements: Number(r.achievements.toFixed(2)),
        dxScore: r.dxScore, dxRating: r.dxRating, fcStatus: r.fcStatus, rate: r.rate,
      })));
    }

    case 'get_recent_fails': {
      const limit = (args.limit as number) || 20;
      const all = await db.playLogs.orderBy('playTime').reverse().toArray();
      const fails = all.filter(r => (r.difficulty === 'master' || r.difficulty === 'remaster') && r.achievements < 97).slice(0, limit);
      const songs = await db.songs.bulkGet([...new Set(fails.map(r => r.songId))]);
      const sm = new Map(songs.filter(Boolean).map(s => [s!.songId, s!]));
      return JSON.stringify(fails.map(r => ({
        title: sm.get(r.songId)?.title ?? `#${r.songId}`, difficulty: r.difficulty,
        constant: r.constant, achievements: Number(r.achievements.toFixed(2)),
        fcStatus: r.fcStatus, rate: r.rate,
      })));
    }

    case 'search_songs': {
      const q = ((args.query as string) || '').toLowerCase();
      const tp = (args.type as string) || undefined;
      const max = (args.maxResults as number) || 10;
      let all = await db.songs.toArray();
      if (q) all = all.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
      if (tp === 'DX' || tp === 'SD') all = all.filter(s => s.type === tp);
      return JSON.stringify(all.slice(0, max).map(s => ({
        title: s.title, artist: s.artist, type: s.type, bpm: s.bpm,
        constants: { Basic: s.basicConst, Advanced: s.advancedConst, Expert: s.expertConst, Master: s.masterConst, ReM: s.remasterConst },
      })));
    }

    case 'web_search': {
      const q = (args.q as string) || '';
      if (!q) return JSON.stringify({ error: '缺少搜索词' });
      try {
        const resp = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(q + ' maimai dx')}&format=json&no_html=1&skip_disambig=1`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!resp.ok) return JSON.stringify({ error: `搜索失败 HTTP ${resp.status}` });
        const data = await resp.json();
        const results: { title: string; url: string }[] = [];
        if (data.AbstractText) results.push({ title: data.AbstractText.slice(0, 250), url: data.AbstractURL || '' });
        for (const r of (data.RelatedTopics || []).slice(0, 4)) {
          if (r.Text) results.push({ title: r.Text.slice(0, 150), url: r.FirstURL || '' });
        }
        return JSON.stringify(results.length > 0 ? results : { message: '未找到相关结果' });
      } catch (e: any) {
        return JSON.stringify({ error: `搜索超时: ${e.message}` });
      }
    }

    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}
