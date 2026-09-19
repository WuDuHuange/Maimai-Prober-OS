/**
 * Maimai-Prober-OS 多供应商 AI 服务
 * 支持: Gemini · OpenAI · DeepSeek · Claude · Gemma (Google)
 */
import { decrypt, encrypt } from './cryptoService';

export type AIProvider = 'gemini' | 'openai' | 'deepseek' | 'claude' | 'custom';

// ---- 模型预设 ----
export interface ModelPreset {
  id: string;
  label: string;
  provider: AIProvider;
}

export const MODEL_PRESETS: ModelPreset[] = [
  // 内置兜底列表（最新列表优先从 models.json 加载）
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini' },
  { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'deepseek' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'claude' },
];

export function getPresetsForProvider(provider: AIProvider): ModelPreset[] {
  return MODEL_PRESETS.filter(p => p.provider === provider);
}

/** 动态加载模型预设（远程优先 → 缓存 → 内置兜底） */
export async function loadModelPresets(): Promise<ModelPreset[]> {
  const sources: (() => Promise<ModelPreset[] | null>)[] = [
    // 1) 同源 models.json（随部署自动更新）
    async () => {
      const resp = await fetch('/Maimai-Prober-OS/models.json', { cache: 'no-cache' });
      return resp.ok ? resp.json() : null;
    },
    // 2) GitHub Raw（最新版本）
    async () => {
      const resp = await fetch(
        'https://raw.githubusercontent.com/WuDuHuange/Maimai-Prober-OS/master/public/models.json',
        { cache: 'no-cache' }
      );
      return resp.ok ? resp.json() : null;
    },
    // 3) 本地缓存
    async () => {
      const cached = getCachedRemoteModels();
      return cached.models.length > 0 ? cached.models : null;
    },
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result?.length) return result;
    } catch { /* 继续下一个源 */ }
  }

  return MODEL_PRESETS;
}

// ---- 配置读取 ----
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  /** 仅 `provider === 'custom'` 时有值：OpenAI 兼容的 base URL */
  baseUrl?: string;
}

export const STORAGE_KEYS: Record<AIProvider, string> = {
  gemini: 'gemini_key_enc',
  openai: 'openai_key_enc',
  deepseek: 'deepseek_key_enc',
  claude: 'claude_key_enc',
  custom: 'custom_key_enc',
};

export const MODEL_KEYS: Record<AIProvider, string> = {
  gemini: 'gemini_model',
  openai: 'openai_model',
  deepseek: 'deepseek_model',
  claude: 'claude_model',
  custom: 'custom_model',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  claude: 'claude-sonnet-4-20250514',
  custom: '',
};

/** 自定义供应商的 OpenAI 兼容 base URL（如 https://api.example.com/v1） */
export const CUSTOM_BASE_URL_KEY = 'custom_base_url';

export function getCustomBaseUrl(): string {
  return localStorage.getItem(CUSTOM_BASE_URL_KEY) ?? '';
}

export function setCustomBaseUrl(url: string) {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (cleaned) localStorage.setItem(CUSTOM_BASE_URL_KEY, cleaned);
  else localStorage.removeItem(CUSTOM_BASE_URL_KEY);
}

/**
 * 解析某配置对应的 OpenAI 兼容 chat/completions 端点。
 * `custom` 走用户填的 base URL；其余返回空串（它们各有专用端点）。
 */
export function resolveChatEndpoint(config: AIConfig): string {
  switch (config.provider) {
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'deepseek':
      return 'https://api.deepseek.com/v1/chat/completions';
    case 'custom': {
      const base = (config.baseUrl ?? '').replace(/\/+$/, '');
      return base ? `${base}/chat/completions` : '';
    }
    default:
      return '';
  }
}

/** 获取当前激活的 AI 配置 */
export function getActiveAIConfig(): AIConfig | null {
  const active = localStorage.getItem('ai_active') as AIProvider | null;
  if (!active) return null;

  const encKey = localStorage.getItem(STORAGE_KEYS[active]);
  if (!encKey) return null;

  const apiKey = decrypt(encKey);
  const model = decrypt(localStorage.getItem(MODEL_KEYS[active]) ?? '') || DEFAULT_MODELS[active];

  // 自定义供应商必须填了 base URL 才算配置完整
  if (active === 'custom') {
    const baseUrl = getCustomBaseUrl();
    if (!baseUrl) return null;
    return { provider: active, apiKey, model, baseUrl };
  }

  return { provider: active, apiKey, model };
}

/** 保存 AI 配置 */
export function saveAIConfig(provider: AIProvider, apiKey: string, model: string) {
  localStorage.setItem(STORAGE_KEYS[provider], encrypt(apiKey));
  if (model) localStorage.setItem(MODEL_KEYS[provider], encrypt(model));
  localStorage.setItem('ai_active', provider);
}

/** 删除 AI 配置 */
export function removeAIConfig(provider: AIProvider) {
  localStorage.removeItem(STORAGE_KEYS[provider]);
  localStorage.removeItem(MODEL_KEYS[provider]);
  if (localStorage.getItem('ai_active') === provider) {
    // 尝试切换到下一个可用的
    const next = (Object.keys(STORAGE_KEYS) as AIProvider[]).find(
      p => p !== provider && !!localStorage.getItem(STORAGE_KEYS[p])
    );
    if (next) localStorage.setItem('ai_active', next);
    else localStorage.removeItem('ai_active');
  }
}

// ---- API 调用 ----

async function callGeminiStream(
  config: AIConfig,
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  onThinking?: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  // Gemini API: 只用 contents，不重复 systemInstruction（避免某些模型忽略正文）
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?key=${config.apiKey}`;

  // 单条消息：系统提示词 + 上下文数据 + 用户问题，清晰分隔
  const combinedText = [
    systemPrompt,
    '---',
    userMessage,
  ].join('\n\n');

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: combinedText }] }],
    }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    if (resp.status === 403) throw new Error('API Key 无效或无权限');
    if (resp.status === 429) throw new Error('请求过于频繁，请稍后重试');
    if (resp.status === 404) throw new Error(`模型 "${config.model}" 不存在或无权访问`);
    throw new Error(`Gemini API 错误 ${resp.status}: ${errText.slice(0, 150)}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          const parts = json.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.thought && part.text && onThinking) {
                onThinking(part.text);
              } else if (!part.thought && part.text) {
                full += part.text;
                onChunk(part.text);
              }
            }
          }
        } catch { /* skip malformed */ }
      }
    }
  }
  return full;
}

async function callOpenAICompatibleStream(
  config: AIConfig,
  endpoint: string,
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  onThinking?: (text: string) => void,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: true,
    }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) throw new Error('API Key 无效或无权限');
    if (resp.status === 429) throw new Error('请求过于频繁，请稍后重试');
    throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 150)}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (delta) {
          // DeepSeek R1 的推理链
          if (delta.reasoning_content && onThinking) {
            onThinking(delta.reasoning_content);
          }
          // 正文
          if (delta.content) {
            full += delta.content;
            onChunk(delta.content);
          }
        }
      } catch { /* skip */ }
    }
  }
  return full;
}

/** 流式 AI 对话 */
export async function streamAIChat(
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  onThinking?: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const config = getActiveAIConfig();
  if (!config) throw new Error('请先在设置中配置 AI 服务');

  switch (config.provider) {
    case 'gemini':
      return callGeminiStream(config, systemPrompt, userMessage, onChunk, onThinking, signal);
    case 'claude':
      return callClaudeStream(config, systemPrompt, userMessage, onChunk, signal);
    case 'openai':
    case 'deepseek':
    case 'custom': {
      const endpoint = resolveChatEndpoint(config);
      if (!endpoint) throw new Error('自定义供应商缺少 Base URL，请到设置中填写');
      return callOpenAICompatibleStream(
        config, endpoint,
        systemPrompt, userMessage, onChunk, onThinking, signal
      );
    }
    default:
      throw new Error(`不支持的 AI 供应商: ${config.provider}`);
  }
}

// ---- Prompt-Based Agent (统一架构，不依赖 API 原生 Function Calling) ----
import { buildToolPrompt, executeToolCall } from './aiTools';

export interface AgentCallbacks {
  onChunk: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolName: string) => void;
  signal?: AbortSignal;
}

/**
 * Prompt-Based Agent 循环
 * 原理：在 System Prompt 中注入工具清单 + TOOL/ARGS/===END=== 文本协议
 * 流式拦截 AI 响应 → 检测 TOOL: → 执行 Dexie → 注入 RESULT: → 继续
 */
export async function agentChat(
  systemPrompt: string,
  userMessage: string,
  callbacks: AgentCallbacks
): Promise<void> {
  const config = getActiveAIConfig();
  if (!config) throw new Error('请先配置 AI 服务');

  // 拼接完整 System Prompt（原提示词 + 工具清单）
  const fullSystemPrompt = systemPrompt + '\n\n' + buildToolPrompt();

  // 对话历史（纯文本累积）
  let conversation = userMessage;
  const maxTurns = 4;

  for (let turn = 0; turn < maxTurns; turn++) {
    console.log('[Agent] 第', turn + 1, '轮, 上下文长度:', conversation.length);

    // 调用对应供应商的流式接口，但我们需要拦截 TOOL 指令
    // 流式累积文本，检测 TOOL: 触发点
    let accumulated = '';
    let toolDetected = false;
    let toolName = '';
    let toolArgs: Record<string, unknown> = {};

    const toolInterceptor = (chunk: string) => {
      accumulated += chunk;

      // 检测 TOOL: 指令（在累积文本中查找）
      const toolMatch = accumulated.match(/TOOL:\s*(\S+)\s*\nARGS:\s*(\{[\s\S]*?\})\s*\n===END===/);
      if (toolMatch && !toolDetected) {
        toolDetected = true;
        toolName = toolMatch[1].trim();
        try { toolArgs = JSON.parse(toolMatch[2]); } catch { toolArgs = {}; }
        console.log('[Agent] 检测到 TOOL:', toolName, toolArgs);
        callbacks.onToolCall?.(toolName);
      }
    };

    // 调用流式接口（所有供应商统一走这个拦截器）
    try {
      await streamAIChatRaw(fullSystemPrompt, conversation, toolInterceptor, callbacks.onThinking, callbacks.signal, config);
    } catch (err: any) {
      throw err;
    }

    // 如果检测到工具调用 → 执行 → 注入结果 → 下一轮
    if (toolDetected && toolName) {
      const result = await executeToolCall({ name: toolName, args: toolArgs });
      const resultBlock = `\n\nRESULT:\n${result.slice(0, 3000)}\n===END===\n\n基于以上真实数据回答用户问题。`;
      conversation += '\n\n' + accumulated.split('===END===')[0] + '===END===' + resultBlock;
      callbacks.onChunk(`\n> 🔧 已执行 ${toolName}，正在分析数据...\n\n`);
      continue;
    }

    // 没有工具调用 → 最终回复
    callbacks.onChunk(accumulated);
    return;
  }

  throw new Error('工具调用超过最大轮次');
}

/** 流式调用（不含工具拦截逻辑，只负责发送请求和回调） */
async function streamAIChatRaw(
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  onThinking: ((text: string) => void) | undefined,
  signal: AbortSignal | undefined,
  config: AIConfig
): Promise<void> {
  switch (config.provider) {
    case 'gemini': {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?key=${config.apiKey}`;
      const resp = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + '\n\n---\n\n' + userMessage }] }],
        }),
        signal,
      });
      if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              for (const part of (json.candidates?.[0]?.content?.parts || [])) {
                if (part.text) onChunk(part.text);
                if (part.thought && onThinking) onThinking(part.text || '');
              }
            } catch { /* skip */ }
          }
        }
      }
      return;
    }
    case 'deepseek':
    case 'openai':
    case 'custom': {
      const endpoint = resolveChatEndpoint(config);
      if (!endpoint) throw new Error('自定义供应商缺少 Base URL，请到设置中填写');
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          stream: true,
        }),
        signal,
      });
      if (!resp.ok) throw new Error(`${config.provider} ${resp.status}`);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) onChunk(delta.content);
            if (delta?.reasoning_content && onThinking) onThinking(delta.reasoning_content);
          } catch { /* skip */ }
        }
      }
      return;
    }
    case 'claude': {
      await callClaudeStream(config, systemPrompt, userMessage, onChunk, signal);
      return;
    }
    default:
      throw new Error(`不支持的供应商: ${config.provider}`);
  }
}


async function callClaudeStream(
  config: AIConfig,
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) throw new Error('API Key 无效或无权限');
    throw new Error(`Claude API 错误 ${resp.status}: ${errText.slice(0, 150)}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      try {
        const json = JSON.parse(data);
        if (json.type === 'content_block_delta') {
          const text = json.delta?.text;
          if (text) {
            full += text;
            onChunk(text);
          }
        }
      } catch { /* skip */ }
    }
  }
  return full;
}

/** 测试 AI 连接 */
export async function testAIConnection(provider: AIProvider, apiKey: string, model: string): Promise<{ ok: boolean; message: string }> {
  const testPrompt = '请回复"OK"';

  try {
    switch (provider) {
      case 'gemini': {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: testPrompt }] }] }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return { ok: false, message: (err as any).error?.message || `HTTP ${resp.status}` };
        }
        return { ok: true, message: '连接成功 ✓' };
      }
      case 'openai':
      case 'deepseek':
      case 'custom': {
        const endpoint = resolveChatEndpoint({
          provider, apiKey, model, baseUrl: getCustomBaseUrl(),
        });
        if (!endpoint) {
          return { ok: false, message: '请先填写自定义 Base URL（如 https://api.example.com/v1）' };
        }
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: testPrompt }],
            max_tokens: 10,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return { ok: false, message: (err as any).error?.message || `HTTP ${resp.status}` };
        }
        return { ok: true, message: '连接成功 ✓' };
      }
      case 'claude': {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 10,
            messages: [{ role: 'user', content: testPrompt }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return { ok: false, message: (err as any).error?.message || `HTTP ${resp.status}` };
        }
        return { ok: true, message: '连接成功 ✓' };
      }
      default:
        return { ok: false, message: '不支持的供应商' };
    }
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { ok: false, message: '连接超时 (15s)，请检查网络或 API 地址' };
    }
    return { ok: false, message: err.message || '未知错误' };
  }
}

// ---- 远程模型列表 ----
const REMOTE_MODELS_KEY = 'ai_remote_models';
const REMOTE_MODELS_TS_KEY = 'ai_remote_models_ts';

export interface RemoteModelEntry { id: string; label: string; provider: AIProvider }

/** 获取缓存的远程模型列表 */
export function getCachedRemoteModels(): { models: RemoteModelEntry[]; updatedAt: string | null } {
  try {
    const raw = localStorage.getItem(REMOTE_MODELS_KEY);
    const ts = localStorage.getItem(REMOTE_MODELS_TS_KEY);
    if (!raw) return { models: [], updatedAt: null };
    return { models: JSON.parse(raw), updatedAt: ts };
  } catch {
    return { models: [], updatedAt: null };
  }
}

/** 从 Gemini API 获取可用模型列表 */
async function fetchGeminiModels(apiKey: string): Promise<RemoteModelEntry[]> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  const models: any[] = data.models || [];
  return models
    .filter((m: any) => {
      const name = m.name || '';
      // 只保留 generateContent 支持的
      return m.supportedGenerationMethods?.includes('generateContent') &&
        !name.includes('embedding') && !name.includes('aqa');
    })
    .map((m: any) => {
      const id = (m.name || '').replace('models/', '');
      const label = m.displayName || id;
      return { id, label, provider: 'gemini' as AIProvider };
    });
}

/** 从 OpenAI API 获取可用模型列表 */
async function fetchOpenAIModels(apiKey: string): Promise<RemoteModelEntry[]> {
  const resp = await fetch('https://api.openai.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const models: any[] = data.data || [];
  return models
    .filter((m: any) => m.id && !m.id.includes('embedding') && !m.id.includes('audio') && !m.id.includes('tts') && !m.id.includes('dall-e') && !m.id.includes('whisper'))
    .slice(0, 30)
    .map((m: any) => ({ id: m.id, label: m.id, provider: 'openai' as AIProvider }));
}

/** 从 DeepSeek API 获取可用模型列表（OpenAI 兼容端点 `GET /models`） */
async function fetchDeepSeekModels(apiKey: string): Promise<RemoteModelEntry[]> {
  const resp = await fetch('https://api.deepseek.com/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const models: any[] = data.data || [];
  return models
    .filter((m: any) => m.id)
    .map((m: any) => ({ id: m.id, label: m.id, provider: 'deepseek' as AIProvider }));
}

/** 从 Anthropic API 获取可用模型列表（`GET /v1/models`） */
async function fetchClaudeModels(apiKey: string): Promise<RemoteModelEntry[]> {
  const resp = await fetch('https://api.anthropic.com/v1/models?limit=50', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // 浏览器直连 Anthropic 需要显式声明，否则被 CORS 拦掉
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const models: any[] = data.data || [];
  return models
    .filter((m: any) => m.id)
    .map((m: any) => ({
      id: m.id,
      label: m.display_name || m.id,
      provider: 'claude' as AIProvider,
    }));
}

/** 从自定义 OpenAI 兼容端点获取模型列表（`{base}/models`） */
async function fetchCustomModels(baseUrl: string, apiKey: string): Promise<RemoteModelEntry[]> {
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (!base) return [];
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const resp = await fetch(`${base}/models`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  // OpenAI 风格是 { data: [...] }，部分自建网关返回 { models: [...] }
  const models: any[] = data.data || data.models || [];
  return models
    .filter((m: any) => m.id || m.name)
    .slice(0, 60)
    .map((m: any) => {
      const id = m.id || String(m.name).replace('models/', '');
      return {
        id,
        label: m.display_name || m.displayName || id,
        provider: 'custom' as AIProvider,
      };
    });
}

/** 联网获取所有已配置供应商的最新模型列表 */
export async function fetchRemoteModels(): Promise<{ models: RemoteModelEntry[]; updatedAt: string }> {
  const allModels: RemoteModelEntry[] = [];

  for (const provider of Object.keys(STORAGE_KEYS) as AIProvider[]) {
    const enc = localStorage.getItem(STORAGE_KEYS[provider]);
    let key = '';
    if (enc) {
      try { key = decrypt(enc); } catch { continue; /* 配置损坏，跳过 */ }
    }
    // custom 允许无 key（自建网关常常不鉴权），其余供应商必须有 key
    if (!key && provider !== 'custom') continue;

    try {
      switch (provider) {
        case 'gemini':
          allModels.push(...await fetchGeminiModels(key));
          break;
        case 'openai':
          allModels.push(...await fetchOpenAIModels(key));
          break;
        case 'deepseek':
          allModels.push(...await fetchDeepSeekModels(key));
          break;
        case 'claude':
          allModels.push(...await fetchClaudeModels(key));
          break;
        case 'custom':
          allModels.push(...await fetchCustomModels(getCustomBaseUrl(), key));
          break;
      }
    } catch { /* 单个供应商失败不影响其余 */ }
  }

  // 合并内置预设（去重，远程优先）
  const remoteIds = new Set(allModels.map(m => m.id));
  for (const preset of MODEL_PRESETS) {
    if (!remoteIds.has(preset.id)) {
      allModels.push({ id: preset.id, label: preset.label, provider: preset.provider });
    }
  }

  const now = new Date().toISOString();
  localStorage.setItem(REMOTE_MODELS_KEY, JSON.stringify(allModels));
  localStorage.setItem(REMOTE_MODELS_TS_KEY, now);

  return { models: allModels, updatedAt: now };
}
