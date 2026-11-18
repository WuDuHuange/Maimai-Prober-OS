import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PlayerProfile } from '@/types/sync';

/** 上次同步的玩家信息 —— 刷新后据此恢复登录态，避免每次都退回欢迎页 */
const PROFILE_KEY = 'last_profile';

export const usePlayerStore = defineStore('player', () => {
  const token = ref<string | null>(null);
  const profile = ref<PlayerProfile | null>(null);
  const isTokenValid = ref(false);

  const playerName = computed(() => profile.value?.nickname ?? '未登录');
  const currentRating = computed(() => profile.value?.rating ?? 0);
  const avatarUrl = computed(() => profile.value?.avatar ?? localStorage.getItem('player_avatar') ?? '');
  /** 用户是否已完成至少一次数据同步（有 profile 即为已登录） */
  const isLoggedIn = computed(() => profile.value !== null);
  /** 是否配置了导入 Token */
  const hasToken = computed(() => !!localStorage.getItem('import_token_enc'));

  function setToken(newToken: string) {
    token.value = newToken;
  }

  function setProfile(p: PlayerProfile) {
    profile.value = p;
    // 同步持久化头像
    if (p.avatar) localStorage.setItem('player_avatar', p.avatar);
    // ⚠️ profile 是「已登录」的唯一依据（`isLoggedIn = profile !== null`）。
    //    不持久化的话每次刷新都会退回欢迎页、被迫重新同步一次。
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        nickname: p.nickname,
        rating: p.rating,
        additionalRating: p.additionalRating,
        plate: p.plate,
        courseRank: p.courseRank,
        classRank: p.classRank,
        trophy: p.trophy,
      }));
    } catch {
      /* 配额满 / 隐私模式：不影响同步，只是下次仍要重新同步 */
    }
  }

  function setAvatar(dataUrl: string) {
    localStorage.setItem('player_avatar', dataUrl);
    if (profile.value) {
      profile.value = { ...profile.value, avatar: dataUrl };
    }
  }

  function restoreFromStorage() {
    const enc = localStorage.getItem('import_token_enc');
    if (enc) {
      token.value = enc;
      isTokenValid.value = true;
    }

    // 恢复上次同步的玩家信息，刷新后直接进主界面。
    // 只信任自己写进去的结构；解析失败就当没有，退回欢迎页让用户重新同步。
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<PlayerProfile>;
      if (!p || typeof p.nickname !== 'string' || !p.nickname) return;
      profile.value = {
        nickname: p.nickname,
        rating: Number(p.rating) || 0,
        additionalRating: Number(p.additionalRating) || 0,
        plate: typeof p.plate === 'string' ? p.plate : '',
        courseRank: Number(p.courseRank) || 0,
        classRank: Number(p.classRank) || 0,
        trophy: p.trophy && typeof p.trophy === 'object'
          ? { title: String(p.trophy.title ?? ''), color: String(p.trophy.color ?? '') }
          : { title: '', color: '' },
        avatar: localStorage.getItem('player_avatar') ?? undefined,
      };
    } catch {
      /* 坏数据忽略 */
    }
  }

  function clearPlayer() {
    token.value = null;
    profile.value = null;
    isTokenValid.value = false;
    localStorage.removeItem(PROFILE_KEY);
  }

  return {
    token, profile, isTokenValid,
    playerName, currentRating, avatarUrl, isLoggedIn, hasToken,
    setToken, setProfile, setAvatar, restoreFromStorage, clearPlayer,
  };
});
