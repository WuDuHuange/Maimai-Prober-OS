import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PlayerProfile } from '@/types/sync';

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
  }

  function clearPlayer() {
    token.value = null;
    profile.value = null;
    isTokenValid.value = false;
  }

  return {
    token, profile, isTokenValid,
    playerName, currentRating, avatarUrl, isLoggedIn, hasToken,
    setToken, setProfile, setAvatar, restoreFromStorage, clearPlayer,
  };
});
