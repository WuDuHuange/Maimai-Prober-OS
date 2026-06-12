<template>
  <div class="settings-page max-w-2xl mx-auto p-6 overflow-y-auto h-full">
    <h1 class="text-lg font-bold text-text-primary mb-6">设置</h1>

    <section class="setting-card">
      <h2 class="card-h2">水鱼账号登录</h2>
      <p class="card-desc">通过用户名密码获取 JWT, 用于需要登录验证的端点。</p>
      <div class="flex gap-2 mt-2 flex-wrap">
        <input v-model="username" class="setting-input w-32" placeholder="用户名" />
        <input v-model="password" type="password" class="setting-input w-32" placeholder="密码" />
        <button class="btn primary" @click="doLogin">登录</button>
        <button class="btn" @click="logout">登出</button>
      </div>
      <p v-if="jwtStatus" class="text-xs mt-1" :class="jwtStatus.color">{{ jwtStatus.text }}</p>
    </section>

    <section class="setting-card">
      <h2 class="card-h2">Import-Token</h2>
      <p class="card-desc">用于获取完整战绩数据。在水鱼网站"编辑个人资料"中生成。</p>
      <div class="flex gap-2 mt-2">
        <input v-model="importToken" type="password" class="setting-input flex-1" placeholder="输入 Import-Token" />
        <button class="btn primary" @click="saveImportToken">保存</button>
      </div>
      <p v-if="importTokenStatus" class="text-xs mt-1" :class="importTokenStatus.color">{{ importTokenStatus.text }}</p>
    </section>

    <section class="setting-card">
      <h2 class="card-h2">AI 服务 API Key</h2>
      <p class="card-desc">配置各大 AI 服务的 API Key, 在 AI 面板中选择使用。</p>
      <div class="ai-keys mt-2">
        <div v-for="svc in aiServices" :key="svc.key" class="ai-key-row">
          <span class="ai-key-label">{{ svc.label }}</span>
          <input v-model="svc.value" type="password" class="setting-input flex-1" :placeholder="svc.label + ' Key'" />
          <button class="btn primary" @click="saveAIKey(svc)">保存</button>
        </div>
      </div>
      <p class="text-xs text-text-muted mt-2">已配置: {{ configuredAIs.join(', ') || '无' }}</p>
    </section>

    <section class="setting-card">
      <h2 class="card-h2">关于</h2>
      <p class="card-desc">Maimai-Prober-OS v0.1.0 - 纯 Web 端 Maimai DX 底力量化与 AI 策略复盘系统。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { encrypt, decrypt } from '@/services/cryptoService';
import { API_BASE } from '@/types/sync';

const username = ref('');
const password = ref('');
const jwtStatus = ref<{ text: string; color: string } | null>(null);

const importToken = ref('');
const importTokenStatus = ref<{ text: string; color: string } | null>(null);

const aiServices = reactive([
  { key: 'gemini', label: 'Gemini', value: '', skey: 'gemini_key_enc' },
  { key: 'openai', label: 'OpenAI', value: '', skey: 'openai_key_enc' },
  { key: 'claude', label: 'Claude', value: '', skey: 'claude_key_enc' },
]);

const configuredAIs = computed(() => aiServices.filter(s => !!localStorage.getItem(s.skey)).map(s => s.label));

onMounted(() => {
  const jwt = localStorage.getItem('jwt_token');
  if (jwt) {
    const u = localStorage.getItem('jwt_username');
    username.value = u || '';
    jwtStatus.value = { text: `已登录: ${u || '---'}`, color: 'text-success' };
  }
  const it = localStorage.getItem('import_token_enc');
  if (it) {
    importToken.value = decrypt(it);
    importTokenStatus.value = { text: '已保存', color: 'text-success' };
  }
  for (const s of aiServices) {
    const v = localStorage.getItem(s.skey);
    if (v) s.value = decrypt(v);
  }
});

async function doLogin() {
  if (!username.value.trim() || !password.value.trim()) {
    jwtStatus.value = { text: '请输入用户名和密码', color: 'text-warning' }; return;
  }
  jwtStatus.value = { text: '登录中...', color: 'text-text-secondary' };
  try {
    const resp = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value.trim(), password: password.value.trim() }),
    });
    if (!resp.ok) {
      jwtStatus.value = { text: '登录凭据错误', color: 'text-danger' }; return;
    }
    const jwtCookie = resp.headers.get('set-cookie') || '';
    const match = jwtCookie.match(/jwt_token=([^;]+)/);
    if (match) {
      localStorage.setItem('jwt_token', match[1]);
      localStorage.setItem('jwt_username', username.value.trim());
      jwtStatus.value = { text: `登录成功: ${username.value.trim()}`, color: 'text-success' };
    } else {
      jwtStatus.value = { text: '登录成功但未获取到 JWT', color: 'text-warning' };
    }
  } catch (err: any) {
    jwtStatus.value = { text: `网络错误: ${err.message}`, color: 'text-danger' };
  }
}

function logout() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('jwt_username');
  jwtStatus.value = { text: '已登出', color: 'text-muted' };
}

function saveImportToken() {
  if (!importToken.value.trim()) return;
  localStorage.setItem('import_token_enc', encrypt(importToken.value.trim()));
  importTokenStatus.value = { text: '已保存', color: 'text-success' };
}

function saveAIKey(svc: { key: string; label: string; value: string; skey: string }) {
  if (!svc.value.trim()) return;
  localStorage.setItem(svc.skey, encrypt(svc.value.trim()));
  localStorage.setItem('ai_active', svc.key);
}
</script>

<style scoped>
.settings-page { padding: 24px; }
.setting-card { background: var(--bg-secondary); border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); }
.card-h2 { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.card-desc { font-size: 11px; color: var(--text-muted); line-height: 1.5; }
.setting-input { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; font-size: 12px; color: var(--text-primary); outline: none; }
.setting-input:focus { border-color: var(--color-primary); }
.btn { padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); cursor: pointer; white-space: nowrap; }
.btn:hover { background: var(--bg-hover); }
.btn.primary { background: var(--color-primary); border-color: var(--color-primary); color: white; }
.btn.primary:hover { background: var(--color-primary-dark); }
.ai-keys { display: flex; flex-direction: column; gap: 8px; }
.ai-key-row { display: flex; align-items: center; gap: 8px; }
.ai-key-label { font-size: 12px; color: var(--text-secondary); width: 56px; flex-shrink: 0; }
</style>
