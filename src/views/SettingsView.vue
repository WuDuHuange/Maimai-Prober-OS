<template>
  <div class="settings-page p-6 max-w-2xl mx-auto">
    <h1 class="text-xl font-bold text-text-primary mb-6">设置</h1>

    <section class="setting-section">
      <h2 class="setting-title">水鱼计分器</h2>
      <p class="setting-desc">Token 可在水鱼网站个人资料页面获取。</p>
      <div class="flex gap-2 mt-2">
        <input
          v-model="tokenInput"
          type="password"
          class="setting-input flex-1"
          placeholder="输入水鱼 Token"
        />
        <button class="setting-btn" @click="validateToken">验证</button>
        <button class="setting-btn primary" @click="saveToken">保存</button>
      </div>
      <p v-if="tokenStatus" class="text-xs mt-1" :class="tokenStatus.color">{{ tokenStatus.text }}</p>
    </section>

    <section class="setting-section">
      <h2 class="setting-title">Gemini API Key</h2>
      <p class="setting-desc">用于 AI 教练功能。可在 Google AI Studio 获取。</p>
      <div class="flex gap-2 mt-2">
        <input
          v-model="geminiInput"
          type="password"
          class="setting-input flex-1"
          placeholder="输入 Gemini API Key"
        />
        <button class="setting-btn primary" @click="saveGeminiKey">保存</button>
      </div>
      <p v-if="geminiStatus" class="text-xs mt-1" :class="geminiStatus.color">{{ geminiStatus.text }}</p>
    </section>

    <section class="setting-section">
      <h2 class="setting-title">关于</h2>
      <p class="setting-desc">Maimai-Prober-OS v0.1.0</p>
      <p class="setting-desc">纯 Web 端 Maimai DX 底力量化与 AI 策略复盘系统。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { encrypt, decrypt } from '@/services/cryptoService';
import { useSettingsStore } from '@/stores/useSettingsStore';

const settingsStore = useSettingsStore();

const tokenInput = ref('');
const geminiInput = ref('');
const tokenStatus = ref<{ text: string; color: string } | null>(null);
const geminiStatus = ref<{ text: string; color: string } | null>(null);

onMounted(() => {
  const savedToken = localStorage.getItem('prober_token_enc');
  if (savedToken) {
    tokenInput.value = decrypt(savedToken);
    tokenStatus.value = { text: '已保存 Token', color: 'text-success' };
  }
  const savedKey = localStorage.getItem('gemini_key_enc');
  if (savedKey) {
    geminiInput.value = decrypt(savedKey);
    geminiStatus.value = { text: '已保存 API Key', color: 'text-success' };
  }
  settingsStore.checkSettings();
});

async function validateToken() {
  if (!tokenInput.value.trim()) {
    tokenStatus.value = { text: '请输入 Token', color: 'text-warning' };
    return;
  }
  tokenStatus.value = { text: '正在验证...', color: 'text-text-secondary' };
  try {
    const { fetchPlayerProfile } = await import('@/services/divingFishApi');
    const profile = await fetchPlayerProfile(tokenInput.value.trim());
    tokenStatus.value = { text: `验证成功 - 用户: ${profile.nickname} (Rating: ${profile.rating})`, color: 'text-success' };
  } catch (err: any) {
    tokenStatus.value = { text: `验证失败: ${err?.message ?? 'Token 无效'}`, color: 'text-danger' };
  }
}

function saveToken() {
  if (!tokenInput.value.trim()) return;
  localStorage.setItem('prober_token_enc', encrypt(tokenInput.value.trim()));
  tokenStatus.value = { text: 'Token 已安全保存', color: 'text-success' };
  settingsStore.checkSettings();
}

function saveGeminiKey() {
  if (!geminiInput.value.trim()) return;
  localStorage.setItem('gemini_key_enc', encrypt(geminiInput.value.trim()));
  geminiStatus.value = { text: 'API Key 已安全保存', color: 'text-success' };
  settingsStore.checkSettings();
}
</script>

<style scoped>
.settings-page { padding: 24px; }
.setting-section {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.setting-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.setting-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
.setting-input {
  background-color: var(--bg-primary);
  border: 1px solid var(--bg-hover);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}
.setting-input:focus { border-color: var(--color-primary); }
.setting-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--bg-hover);
  background-color: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color 0.15s;
}
.setting-btn:hover { background-color: var(--bg-hover); }
.setting-btn.primary {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}
.setting-btn.primary:hover { background-color: var(--color-primary-dark); }
</style>
