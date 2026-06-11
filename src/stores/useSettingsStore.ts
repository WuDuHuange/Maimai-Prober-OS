import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  const hasToken = ref(false);
  const hasGeminiKey = ref(false);

  function checkSettings() {
    hasToken.value = !!localStorage.getItem('prober_token_enc');
    hasGeminiKey.value = !!localStorage.getItem('gemini_key_enc');
  }

  return { hasToken, hasGeminiKey, checkSettings };
});
