/**
 * AI Function Calling 工具注册表
 * AI 教练可以通过这些工具按需查询玩家本地数据库
 */
import { db } from '@/services/db';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useB50Store } from '@/stores/useB50Store';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** 所有可用工具定义（发送给 AI） */
export const AI_TOOLS: ToolDefinition[] = [
  {
    name: 'get_player_stats',
    description: '获取当前玩家的统计概览：昵称、Rating、总游玩次数、平均达成率、曲库规模',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_b50_data',
    description: '获取玩家的 Best 50 数据。isNew=true 返回 B15 新版本曲目，isNew=false 返回 B35 旧版本曲目。topN 控制返回条数',
    parameters: {
      type: 'object',
      properties: {
        isNew: { type: 'boolean', description: 'true=新版本B15, false=旧版本B35' },
        topN: { type: 'number', description: '返回前 N 首，默认 15' },
      },
    },
  },
  {
    name: 'get_recent_plays',
    description: '获取玩家最近的游玩记录，包含曲名、难度、达成率、DX分数、FC状态',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数，默认 20' },
        difficulty: { type: 'string', description: '筛选难度: basic/advanced/expert/master/remaster，留空=全部' },
      },
    },
  },
  {
    name: 'get_recent_fails',
    description: '获取玩家在 Master/Re:Master 难度上达成率低于 97% 的记录（需要关注的曲目）',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数，默认 20' },
      },
    },
  },
  {
    name: 'search_songs',
    description: '在曲库中搜索歌曲。返回匹配曲目的标题、类型、各难度定数。用于 AI 推荐练习曲时查阅可选曲目',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词（曲名或艺术家），支持部分匹配' },
        type: { type: 'string', description: 'DX 或 SD，留空为全部' },
        maxResults: { type: 'number', description: '最多返回条数，默认 10' },
      },
    },
  },
];

/**
 * 执行工具调用，返回结果字符串
 * 这些函数访问 Pinia Store 和 Dexie 数据库
 */
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
        nickname: player.playerName,
        rating: player.currentRating,
        totalPlays: playLog.totalCount,
        avgAchievement: avg + '%',
        songDbSize: song.songs.size,
      });
    }

    case 'get_b50_data': {
      const b50 = useB50Store();
      if (b50.b50List.length === 0) await b50.loadFromDB();
      const isNew = args.isNew === true;
      const topN = (args.topN as number) || 15;
      const filtered = b50.b50List
        .filter(b => b.isNew === isNew)
        .slice(0, topN);
      return JSON.stringify(filtered.map(b => ({
        title: b.title ?? `#${b.songId}`,
        type: b.type,
        difficulty: b.difficulty,
        constant: b.constant,
        achievements: Number(b.achievements.toFixed(2)),
        dxScore: b.dxScore,
        fcStatus: b.fcStatus,
        ratingContribution: b.ratingContribution ? Math.round(b.ratingContribution) : null,
      })));
    }

    case 'get_recent_plays': {
      const limit = (args.limit as number) || 20;
      const diff = args.difficulty as string | undefined;
      const all = await db.playLogs.orderBy('playTime').reverse().limit(limit * 2).toArray();
      const filtered = diff ? all.filter(r => r.difficulty === diff).slice(0, limit) : all.slice(0, limit);
      const songs = await db.songs.bulkGet([...new Set(filtered.map(r => r.songId))]);
      const songMap = new Map(songs.filter(Boolean).map(s => [s!.songId, s!]));
      return JSON.stringify(filtered.map(r => ({
        title: songMap.get(r.songId)?.title ?? `#${r.songId}`,
        type: songMap.get(r.songId)?.type ?? '?',
        difficulty: r.difficulty,
        achievements: Number(r.achievements.toFixed(2)),
        dxScore: r.dxScore,
        dxRating: r.dxRating,
        fcStatus: r.fcStatus,
        rate: r.rate,
      })));
    }

    case 'get_recent_fails': {
      const limit = (args.limit as number) || 20;
      const all = await db.playLogs.orderBy('playTime').reverse().toArray();
      const fails = all
        .filter(r => (r.difficulty === 'master' || r.difficulty === 'remaster') && r.achievements < 97)
        .slice(0, limit);
      const songs = await db.songs.bulkGet([...new Set(fails.map(r => r.songId))]);
      const songMap = new Map(songs.filter(Boolean).map(s => [s!.songId, s!]));
      return JSON.stringify(fails.map(r => ({
        title: songMap.get(r.songId)?.title ?? `#${r.songId}`,
        difficulty: r.difficulty,
        constant: r.constant,
        achievements: Number(r.achievements.toFixed(2)),
        dxScore: r.dxScore,
        fcStatus: r.fcStatus,
        rate: r.rate,
      })));
    }

    case 'search_songs': {
      const query = (args.query as string || '').toLowerCase();
      const type = args.type as string | undefined;
      const maxResults = (args.maxResults as number) || 10;
      let all = await db.songs.toArray();
      if (query) {
        all = all.filter(s => s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query));
      }
      if (type === 'DX' || type === 'SD') {
        all = all.filter(s => s.type === type);
      }
      const results = all.slice(0, maxResults);
      return JSON.stringify(results.map(s => ({
        title: s.title,
        artist: s.artist,
        type: s.type,
        bpm: s.bpm,
        constants: {
          Basic: s.basicConst, Advanced: s.advancedConst,
          Expert: s.expertConst, Master: s.masterConst, ReM: s.remasterConst,
        },
      })));
    }

    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}
