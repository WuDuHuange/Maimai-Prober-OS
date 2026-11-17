/**
 * 选曲复盘 —— 用户手动挑 3~16 首，分析「这几首打得怎么样」。
 *
 * ⚠️ 口径边界（必须与 UI 文案一致）：
 * - 数据源是水鱼「历史最好成绩」，**不是本次成绩**；
 * - `historyCount` 是**成绩刷新次数**（recordMd5 去重后的行数），不是游玩次数；
 * - 不提供「游玩时间」，`playTime` 只是同步时刻。
 */
import type { ChartTag } from './tag';
import type { DifficultyType } from './song';

export interface ChartKey {
  songId: number;
  difficulty: DifficultyType;
}

/** 一个评级里程碑（达成率下限） */
export interface Milestone {
  label: string;
  target: number;
  /** 距离该里程碑还差多少个百分点 */
  gap: number;
}

export interface SelectedChart {
  songId: number;
  title: string;
  artist: string;
  difficulty: DifficultyType;
  constant: number | null;
  type: 'DX' | 'SD';
  coverUrl: string;
  achievements: number;
  dxScore: number;
  fcStatus: string;
  rate: string;
  tags: ChartTag[];
  /** 相对本人 B50 平均达成率 */
  ownDelta: number | null;
  /** 历史记录行数 = 成绩刷新次数（不是游玩次数） */
  historyCount: number;
  /** 最早一条记录（当时的最好成绩） */
  firstAchievement: number | null;
  /** 首次记录 → 当前最好，正数 = 有提升 */
  gain: number | null;
  /** 下一个还没达到的评级里程碑 */
  next: Milestone | null;
}

export interface SelectionReport {
  charts: SelectedChart[];
  summary: {
    count: number;
    avgAchievement: number;
    avgConstant: number;
    /** 全部选中谱面的平均 ownDelta（无 B50 基准时为 null） */
    avgOwnDelta: number | null;
    b50AvgAchievement: number;
    b50AvgConstant: number;
    birdCount: number;
    birdPlusCount: number;
    strongCount: number;
    weakCount: number;
  };
  /** tag 覆盖统计（按张数降序，仅样本 ≥ 2） */
  tags: {
    tagId: number;
    name: string;
    group: 'config' | 'evaluation';
    count: number;
    avgOwnDelta: number | null;
  }[];
  /** 历史提升最大的一首（需要 ≥ 2 条历史记录） */
  biggestGain: SelectedChart | null;
  /** 距离下一个里程碑最近的一首（gap ≤ 1.0 才算） */
  nearMiss: SelectedChart | null;
  /** 规则生成的结论，UI 直接逐条展示 */
  verdicts: string[];
}
