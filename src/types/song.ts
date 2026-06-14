export type DifficultyType = 'basic' | 'advanced' | 'expert' | 'master' | 'remaster';

export const DIFFICULTY_LIST: DifficultyType[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];

export const DIFFICULTY_LABEL: Record<DifficultyType, string> = {
  basic: 'Basic', advanced: 'Advanced', expert: 'Expert', master: 'Master', remaster: 'Re:Master',
};

export const DIFFICULTY_LABEL_SHORT: Record<DifficultyType, string> = {
  basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM',
};

// DB-stored song metadata (flattened from API response)
export interface SongMeta {
  songId: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number | null;
  type: 'DX' | 'SD';
  from: string;
  isNew: boolean;
  basicConst: number | null;
  advancedConst: number | null;
  expertConst: number | null;
  masterConst: number | null;
  remasterConst: number | null;
  basicLevel: string | null;
  advancedLevel: string | null;
  expertLevel: string | null;
  masterLevel: string | null;
  remasterLevel: string | null;
}

export function getConstByDifficulty(song: SongMeta | undefined, d: DifficultyType): number | null {
  if (!song) return null;
  const map: Record<DifficultyType, number | null> = {
    basic: song.basicConst, advanced: song.advancedConst,
    expert: song.expertConst, master: song.masterConst, remaster: song.remasterConst,
  };
  return map[d] ?? null;
}

export function getLevelByDifficulty(song: SongMeta | undefined, d: DifficultyType): string | null {
  if (!song) return null;
  const map: Record<DifficultyType, string | null> = {
    basic: song.basicLevel, advanced: song.advancedLevel,
    expert: song.expertLevel, master: song.masterLevel, remaster: song.remasterLevel,
  };
  return map[d] ?? null;
}

// ---- 判定明细 (用户手动补充) ----
export type NoteType = 'tap' | 'hold' | 'slide' | 'touch' | 'break';

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  tap: 'Tap', hold: 'Hold', slide: 'Slide', touch: 'Touch', break: 'Break',
};

export interface NoteJudge {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

export interface JudgeDetail {
  tap: NoteJudge;
  hold: NoteJudge;
  slide: NoteJudge;
  touch: NoteJudge;
  break: NoteJudge;
  fast: number;
  late: number;
}

export function emptyNoteJudge(): NoteJudge {
  return { perfect: 0, great: 0, good: 0, miss: 0 };
}

export function emptyJudgeDetail(): JudgeDetail {
  return {
    tap: emptyNoteJudge(),
    hold: emptyNoteJudge(),
    slide: emptyNoteJudge(),
    touch: emptyNoteJudge(),
    break: emptyNoteJudge(),
    fast: 0,
    late: 0,
  };
}

/** 从 JudgeDetail 计算各 note 类型的 Fast/Late 衍生指标 */
export function calcJudgeSummary(jd: JudgeDetail) {
  const total = (nj: NoteJudge) => nj.perfect + nj.great + nj.good + nj.miss;
  const notes = (['tap', 'hold', 'slide', 'touch', 'break'] as NoteType[]).map(t => ({
    type: t,
    label: NOTE_TYPE_LABEL[t],
    ...jd[t],
    total: total(jd[t]),
    // 达成率估算：(perfect + great*0.8 + good*0.5) / total
    acc: total(jd[t]) > 0
      ? ((jd[t].perfect + jd[t].great * 0.8 + jd[t].good * 0.5) / total(jd[t]) * 100).toFixed(1)
      : '-',
  }));
  const totalNotes = notes.reduce((s, n) => s + n.total, 0);
  return { notes, totalNotes, fast: jd.fast, late: jd.late };
}
