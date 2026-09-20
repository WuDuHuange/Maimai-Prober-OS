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
      <h2 class="card-h2">AI 服务配置</h2>
      <p class="card-desc">选择一个 AI 供应商，填入 API Key，即可使用 AI 教练分析战绩。</p>

      <!-- 供应商选择 -->
      <div class="provider-tabs mt-3">
        <button
          v-for="p in providerDefs"
          :key="p.key"
          class="provider-tab"
          :class="{ active: activeProvider === p.key }"
          :title="p.desc"
          @click="selectProvider(p.key)"
        >
          {{ p.label }}
        </button>
      </div>

      <!-- 当前供应商配置 -->
      <div class="ai-config-panel mt-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-text-muted">API Key</span>
          <span v-if="remoteUpdatedAt" class="text-xs text-text-muted">模型列表更新于 {{ fmtTime(remoteUpdatedAt) }}</span>
        </div>

        <!-- 自定义供应商：OpenAI 兼容 Base URL -->
        <div v-if="activeProvider === 'custom'" class="mb-2">
          <input
            v-model="customBaseUrlInput"
            class="setting-input w-full"
            placeholder="Base URL，例如 https://api.deepseek.com/v1"
          />
          <p class="text-xs text-text-muted mt-1 leading-relaxed">
            需为 OpenAI 兼容端点：会自动拼 <code class="inline-code">/chat/completions</code>（对话）
            与 <code class="inline-code">/models</code>（模型列表）。适用于 One-API、Ollama、vLLM、各类中转站。
          </p>
        </div>

        <div class="flex gap-2 mb-2">
          <input
            v-model="aiKeyInput"
            type="password"
            class="setting-input flex-1"
            :placeholder="activeProvider === 'custom' ? 'API Key（自建端点可留空）' : `输入 ${activeProvider} API Key`"
          />
          <button class="btn primary" @click="handleSaveAI" :disabled="!canSave">保存</button>
        </div>

        <!-- 模型选择 -->
        <div class="model-select-row">
          <div class="flex items-center justify-between">
            <span class="model-label">模型</span>
            <button class="refresh-models-btn" @click="handleRefreshModels" :disabled="remoteLoading">
              {{ remoteLoading ? '更新中...' : '🔄 联网更新' }}
            </button>
          </div>
          <div class="model-presets">
            <button
              v-for="mp in mergedPresets"
              :key="mp.id"
              class="model-chip"
              :class="{ active: aiModelInput === mp.id }"
              @click="aiModelInput = mp.id"
              :title="mp.id"
            >
              {{ mp.label }}
            </button>
          </div>
          <input
            v-model="aiModelInput"
            class="setting-input model-custom"
            placeholder="或输入自定义模型名..."
          />
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-2 mt-3 items-center">
          <button class="btn" @click="handleTestAI" :disabled="aiTestLoading || !canSave">
            {{ aiTestLoading ? '测试中...' : '🔗 测试连接' }}
          </button>
          <button
            class="btn"
            @click="handleRemoveAI"
            v-if="aiKeyInput || (activeProvider === 'custom' && customBaseUrlInput)"
          >移除配置</button>
          <span v-if="aiTestResult" class="test-result text-xs" :class="aiTestResult.ok ? 'text-success' : 'text-danger'">
            {{ aiTestResult.message }}
          </span>
        </div>
      </div>

      <!-- 已配置供应商列表 -->
      <p class="text-xs text-text-muted mt-2">
        已配置: {{ configuredProviders.map(p => p.label).join(', ') || '无' }}
        <span v-if="activeProvider" class="ml-1">｜ 当前: {{ providerDefs.find(p => p.key === activeProvider)?.label }}</span>
      </p>
    </section>

    <section class="setting-card">
      <h2 class="card-h2">数据</h2>
      <p class="card-desc">本地同步记录与运行日志，用于排查同步异常。</p>
      <SyncLogPanel class="mt-3" />
    </section>

    <section class="setting-card">
      <h2 class="card-h2">关于</h2>
      <p class="card-desc">Maimai-Prober-OS v0.1.0 - 纯 Web 端 Maimai DX 底力量化与 AI 策略复盘系统。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import SyncLogPanel from '@/components/sync/SyncLogPanel.vue';
import { encrypt, decrypt } from '@/services/cryptoService';
import { API_BASE } from '@/types/sync';
import {
  type AIProvider,
  type ModelPreset,
  MODEL_PRESETS,
  STORAGE_KEYS,
  MODEL_KEYS,
  saveAIConfig,
  removeAIConfig,
  testAIConnection,
  fetchRemoteModels,
  getCachedRemoteModels,
  getCustomBaseUrl,
  setCustomBaseUrl,
  loadModelPresets,
  type RemoteModelEntry,
} from '@/services/aiService';

const username = ref('');
const password = ref('');
const jwtStatus = ref<{ text: string; color: string } | null>(null);

const importToken = ref('');
const importTokenStatus = ref<{ text: string; color: string } | null>(null);

// ---- AI 配置 ----
const activeProvider = ref<AIProvider>('gemini');
const aiKeyInput = ref('');
const aiModelInput = ref('');
/** 仅 `custom` 使用：OpenAI 兼容的 base URL */
const customBaseUrlInput = ref('');
const aiTestResult = ref<{ ok: boolean; message: string } | null>(null);
const aiTestLoading = ref(false);

// 远程模型
const remoteModels = ref<RemoteModelEntry[]>([]);
const remoteUpdatedAt = ref<string | null>(null);
const remoteLoading = ref(false);
/** 动态加载的模型预设列表 */
const dynamicPresets = ref<ModelPreset[]>(MODEL_PRESETS);

/** 当前供应商可用的模型列表（动态 + 远程合并） */
const mergedPresets = computed(() => {
  const builtin = dynamicPresets.value.filter(m => m.provider === activeProvider.value);
  const remote = remoteModels.value.filter(m => m.provider === activeProvider.value);
  const seen = new Set(builtin.map(m => m.id));
  const extra = remote.filter(m => !seen.has(m.id));
  return [...builtin, ...extra];
});

const providerDefs: { key: AIProvider; label: string; desc: string }[] = [
  { key: 'gemini', label: 'Google Gemini', desc: '含 Gemini + Gemma 系列模型' },
  { key: 'openai', label: 'OpenAI', desc: 'GPT-4o / GPT-4.1 等' },
  { key: 'deepseek', label: 'DeepSeek', desc: 'DeepSeek V3 / R1' },
  { key: 'claude', label: 'Anthropic Claude', desc: 'Claude Sonnet 4 / Haiku' },
  { key: 'custom', label: '自定义', desc: '任意 OpenAI 兼容端点（One-API / Ollama / vLLM / 中转站）' },
];

/** 已保存过 API Key 的供应商（custom 还要求填了 Base URL） */
const configuredProviders = computed(() =>
  providerDefs.filter(p => {
    if (!localStorage.getItem(STORAGE_KEYS[p.key])) return false;
    if (p.key === 'custom') return !!getCustomBaseUrl();
    return true;
  })
);

/** custom 允许留空 API Key（自建网关常常不鉴权） */
const canSave = computed(() =>
  activeProvider.value === 'custom'
    ? !!customBaseUrlInput.value.trim()
    : !!aiKeyInput.value.trim()
);

function selectProvider(p: AIProvider) {
  activeProvider.value = p;
  aiTestResult.value = null;
  // 恢复已保存的配置（key map 统一来自 aiService，避免各处硬编码）
  const encKey = localStorage.getItem(STORAGE_KEYS[p]);
  aiKeyInput.value = encKey ? decrypt(encKey) : '';
  const encModel = localStorage.getItem(MODEL_KEYS[p]);
  aiModelInput.value = encModel ? decrypt(encModel) : '';
  customBaseUrlInput.value = getCustomBaseUrl();
}

async function handleSaveAI() {
  if (!canSave.value) {
    aiTestResult.value = {
      ok: false,
      message: activeProvider.value === 'custom' ? '请填写 Base URL' : '请输入 API Key',
    };
    return;
  }
  if (activeProvider.value === 'custom') setCustomBaseUrl(customBaseUrlInput.value);
  const model = aiModelInput.value.trim()
    || MODEL_PRESETS.find(m => m.provider === activeProvider.value)?.id
    || '';
  saveAIConfig(activeProvider.value, aiKeyInput.value.trim(), model);
  aiTestResult.value = { ok: true, message: '配置已保存 ✓' };
}

async function handleTestAI() {
  if (!canSave.value) {
    aiTestResult.value = {
      ok: false,
      message: activeProvider.value === 'custom' ? '请先填写 Base URL' : '请先输入 API Key',
    };
    return;
  }
  aiTestLoading.value = true;
  aiTestResult.value = null;
  // 测试前先把 Base URL 落盘，testAIConnection 会读它
  if (activeProvider.value === 'custom') setCustomBaseUrl(customBaseUrlInput.value);
  const model = aiModelInput.value.trim()
    || MODEL_PRESETS.find(m => m.provider === activeProvider.value)?.id
    || '';
  const result = await testAIConnection(activeProvider.value, aiKeyInput.value.trim(), model);
  aiTestResult.value = result;
  aiTestLoading.value = false;
}

function handleRemoveAI() {
  removeAIConfig(activeProvider.value);
  if (activeProvider.value === 'custom') setCustomBaseUrl('');
  aiKeyInput.value = '';
  aiModelInput.value = '';
  customBaseUrlInput.value = '';
  aiTestResult.value = { ok: true, message: '配置已移除' };
}

async function handleRefreshModels() {
  remoteLoading.value = true;
  try {
    const result = await fetchRemoteModels();
    remoteModels.value = result.models;
    remoteUpdatedAt.value = result.updatedAt;
    const mine = result.models.filter(m => m.provider === activeProvider.value).length;
    if (mine === 0) {
      aiTestResult.value = {
        ok: false,
        message: activeProvider.value === 'custom'
          ? '未拉到模型：请先填写并保存 Base URL'
          : '未拉到模型：请先保存该供应商的 API Key',
      };
    } else {
      aiTestResult.value = { ok: true, message: `已更新，本供应商 ${mine} 个模型` };
    }
  } catch (err: any) {
    aiTestResult.value = { ok: false, message: `更新失败: ${err.message}` };
  } finally {
    remoteLoading.value = false;
  }
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
}

onMounted(() => {
  const jwtUser = localStorage.getItem('jwt_user');
  if (jwtUser) {
    username.value = jwtUser;
    jwtStatus.value = { text: `已登录: ${jwtUser}`, color: 'text-success' };
  }
  const it = localStorage.getItem('import_token_enc');
  if (it) {
    importToken.value = decrypt(it);
    importTokenStatus.value = { text: '已保存', color: 'text-success' };
  }
  // 恢复当前激活的 AI 供应商
  const active = (localStorage.getItem('ai_active') as AIProvider | null) || 'gemini';
  selectProvider(active);

  // 加载缓存的远程模型列表
  const cached = getCachedRemoteModels();
  if (cached.models.length > 0) {
    remoteModels.value = cached.models;
    remoteUpdatedAt.value = cached.updatedAt;
  }

  // 动态加载最新模型预设（远程优先 → 缓存 → 内置兜底）
  loadModelPresets().then(list => {
    dynamicPresets.value = list;
  });
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
      const data = await resp.json().catch(() => ({}));
      jwtStatus.value = { text: data.message || '登录凭据错误', color: 'text-danger' }; return;
    }
    localStorage.setItem('jwt_user', username.value.trim());
    const hasImport = !!localStorage.getItem('import_token_enc');
    jwtStatus.value = {
      text: hasImport ? '已登录! 可返回首页同步数据' : '已登录! 请在下方配置 Import-Token 后同步',
      color: hasImport ? 'text-success' : 'text-warning',
    };
  } catch (err: any) {
    jwtStatus.value = { text: `网络错误: ${err.message}`, color: 'text-danger' };
  }
}

function logout() {
  localStorage.removeItem('jwt_user');
  fetch(`${API_BASE}/login`, { method: 'DELETE' }).catch(() => {});
  jwtStatus.value = { text: '已登出', color: 'text-muted' };
}

function saveImportToken() {
  if (!importToken.value.trim()) return;
  localStorage.setItem('import_token_enc', encrypt(importToken.value.trim()));
  importTokenStatus.value = { text: '已保存, 可返回首页点击同步数据', color: 'text-success' };
}
</script>

<style scoped>
.settings-page { padding: 24px; }

.setting-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color-light);
}

.card-h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
  letter-spacing: var(--letter-spacing-normal);
}

.card-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.setting-input {
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.setting-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(74, 114, 255, 0.1);
}

.btn {
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.btn:hover { background: var(--bg-hover); }

.btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  box-shadow: 0 2px 8px rgba(74, 114, 255, 0.2);
}

.btn.primary:hover {
  background: var(--color-primary-dark);
  box-shadow: 0 4px 14px rgba(74, 114, 255, 0.3);
}

/* ===== AI 供应商选择标签 ===== */
.provider-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.provider-tab {
  padding: 7px 16px; border-radius: 9999px;
  border: 1px solid var(--border-color);
  background: var(--bg-body);
  font-size: 12px; font-weight: 600;
  color: var(--text-secondary); cursor: pointer;
  transition: all var(--transition-fast);
}
.provider-tab:hover { background: white; border-color: rgba(74,114,255,0.2); }
.provider-tab.active {
  background: var(--color-primary); border-color: var(--color-primary);
  color: white; box-shadow: 0 2px 10px rgba(74,114,255,0.2);
}

.ai-config-panel { background: var(--bg-body); border-radius: var(--radius-md); padding: 14px; }

.model-select-row { display: flex; flex-direction: column; gap: 8px; }
.model-label {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.03em;
}
.model-presets { display: flex; flex-wrap: wrap; gap: 5px; }
.model-chip {
  padding: 4px 10px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  font-size: 11px; font-weight: 500; color: var(--text-secondary);
  cursor: pointer; transition: all var(--transition-fast); white-space: nowrap;
}
.model-chip:hover { border-color: rgba(74,114,255,0.25); color: var(--color-primary); }
.model-chip.active {
  background: rgba(74,114,255,0.08); border-color: var(--color-primary);
  color: var(--color-primary); font-weight: 700;
}
.model-custom { width: 100%; margin-top: 2px; }

.refresh-models-btn {
  padding: 3px 10px; border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 11px; font-weight: 600;
  color: var(--color-primary); cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.refresh-models-btn:hover:not(:disabled) {
  background: rgba(74,114,255,0.06); border-color: rgba(74,114,255,0.3);
}
.refresh-models-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.test-result { font-weight: 600; }

.inline-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(74, 114, 255, 0.08);
  color: var(--color-primary);
}
</style>
