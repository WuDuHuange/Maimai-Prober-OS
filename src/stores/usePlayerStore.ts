import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PlayerProfile } from '@/types/sync';

export const usePlayerStore = defineStore('player', () => {
  const token = ref<string | null>(null);
  const profile = ref<PlayerProfile | null>(null);
  const isTokenValid = ref(false);

  const playerName = computed(() => profile.value?.nickname ?? '未登录');
  const currentRating = computed(() => profile.value?.rating ?? 0);

  function setToken(newToken: string) {
    token.value = newToken;
  }

  function setProfile(p: PlayerProfile) {
    profile.value = p;
  }

  function clearPlayer() {
    token.value = null;
    profile.value = null;
    isTokenValid.value = false;
  }

  return {
    token, profile, isTokenValid,
    playerName, currentRating,
    setToken, setProfile, clearPlayer,
  };
});
