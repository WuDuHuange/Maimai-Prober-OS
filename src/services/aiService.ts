/**
 * Maimai-Prober-OS 多供应商 AI 服务
 * 支持: Gemini · OpenAI · DeepSeek · Claude · Gemma (Google)
 */
import { decrypt, encrypt } from './cryptoService';

export type AIProvider = 'gemini' | 'openai' | 'deepseek' | 'claude';

// ---- 模型预设 ----
export interface ModelPreset {
  id: string;
  label: string;
  provider: AIProvider;
}

export const MODEL_PRESETS: ModelPreset[] = [
  // Google Gemini 系列
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (推荐)', provider: 'gemini' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'gemini' },
  // Google Gemma 系列 (同 API)
  { id: 'gemma-4-31b-it', label: 'Gemma 4 31B Instruct', provider: 'gemini' },
  { id: 'gemma-3-27b-it', label: 'Gemma 3 27B Instruct', provider: 'gemini' },
  { id: 'gemma-3-12b-it', label: 'Gemma 3 12B Instruct', provider: 'gemini' },
  // OpenAI 系列
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
  // DeepSeek 系列
  { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'deepseek' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'deepseek' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'deepseek' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (推荐)', provider: 'deepseek' },
  // Claude 系列
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'claude' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'claude' },
];

export function getPresetsForProvider(provider: AIProvider): ModelPreset[] {
  return MODEL_PRESETS.filter(p => p.provider === provider);
}

// ---- 配置读取 ----
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

const STORAGE_KEYS: Record<AIProvider, string> = {
  gemini: 'gemini_key_enc',
  openai: 'openai_key_enc',
  deepseek: 'deepseek_key_enc',
  claude: 'claude_key_enc',
};

const MODEL_KEYS: Record<AIProvider, string> = {
  gemini: 'gemini_model',
  openai: 'openai_model',
  deepseek: 'deepseek_model',
  claude: 'claude_model',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  claude: 'claude-sonnet-4-20250514',
};

/** 获取当前激活的 AI 配置 */
export function getActiveAIConfig(): AIConfig | null {
  const active = localStorage.getItem('ai_active') as AIProvider | null;
  if (!active) return null;

  const encKey = localStorage.getItem(STORAGE_KEYS[active]);
  if (!encKey) return null;

  const apiKey = decrypt(encKey);
  const model = decrypt(localStorage.getItem(MODEL_KEYS[active]) ?? '') || DEFAULT_MODELS[active];

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
    case 'openai':
      return callOpenAICompatibleStream(
        config, 'https://api.openai.com/v1/chat/completions',
        systemPrompt, userMessage, onChunk, onThinking, signal
      );
    case 'deepseek':
      return callOpenAICompatibleStream(
        config, 'https://api.deepseek.com/v1/chat/completions',
        systemPrompt, userMessage, onChunk, onThinking, signal
      );
    case 'claude':
      return callClaudeStream(config, systemPrompt, userMessage, onChunk, signal);
    default:
      throw new Error(`不支持的 AI 供应商: ${config.provider}`);
  }
}

// ---- Function Calling Agent Loop ----
import type { ToolCall } from './aiTools';
import { AI_TOOLS, executeToolCall } from './aiTools';

export interface AgentCallbacks {
  onChunk: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolName: string) => void;
  signal?: AbortSignal;
}

/**
 * Agent 循环：发送消息 → 检查是否需要工具调用 → 执行工具 → 继续对话
 * 最多循环 3 轮工具调用
 */
export async function agentChat(
  systemPrompt: string,
  userMessage: string,
  callbacks: AgentCallbacks
): Promise<void> {
  const config = getActiveAIConfig();
  if (!config) throw new Error('请先配置 AI 服务');

  // Gemma 不支持 Function Calling
  if (config.model.includes('gemma')) {
    console.warn('[Agent] Gemma 不支持 Function Calling，回退');
    await streamAIChat(systemPrompt, userMessage, callbacks.onChunk, callbacks.onThinking, callbacks.signal);
    return;
  }

  if (config.provider === 'gemini') {
    await geminiAgentLoop(config, systemPrompt, userMessage, callbacks);
  } else if (config.provider === 'deepseek' || config.provider === 'openai') {
    await openAIAgentLoop(config, systemPrompt, userMessage, callbacks);
  } else {
    await streamAIChat(systemPrompt, userMessage, callbacks.onChunk, callbacks.onThinking, callbacks.signal);
  }
}

/** Gemini Function Calling Agent */
async function geminiAgentLoop(
  config: AIConfig, systemPrompt: string, userMessage: string, callbacks: AgentCallbacks
) {

  // 构建对话历史
  const contents: any[] = [
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const tools = [{ functionDeclarations: AI_TOOLS }];

  // Agent 循环
  for (let turn = 0; turn < 3; turn++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools,
      }),
      signal: callbacks.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Agent API 错误 ${resp.status}: ${errText.slice(0, 150)}`);
    }

    const data = await resp.json();
    const candidate = data.candidates?.[0];
    if (!candidate) {
      console.error('[Agent] 无候选:', JSON.stringify(data).slice(0, 300));
      throw new Error('AI 返回为空');
    }

    const parts = candidate.content?.parts || [];
    console.log('[Agent] 第', turn + 1, '轮响应 parts:', parts.map((p: any) => Object.keys(p)).join(','));

    // 检查是否有 functionCall
    const funcCalls = parts.filter((p: any) => p.functionCall);
    const textParts = parts.filter((p: any) => p.text);

    if (funcCalls.length > 0) {
      // 处理工具调用
      const funcCall = funcCalls[0].functionCall as ToolCall;
      console.log('[Agent] 第', turn + 1, '轮 → functionCall:', funcCall.name, funcCall.args);
      callbacks.onToolCall?.(funcCall.name);

      // 执行工具
      const result = await executeToolCall(funcCall);

      // 追加到对话历史（role 必须是 'function'，不是 'user'）
      contents.push({
        role: 'model',
        parts: [{ functionCall: funcCall }],
      });
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: funcCall.name,
            response: { name: funcCall.name, content: result },
          },
        }],
      });

      // 继续循环
      continue;
    }

    if (textParts.length > 0) {
      // 最终文本回复 → 直接输出（非流式，因为 Agent 循环不支持）
      const text = textParts.map((p: any) => p.text).join('');
      callbacks.onChunk(text);

      // 同时检查是否有思考内容
      const thoughtParts = parts.filter((p: any) => p.thought);
      for (const tp of thoughtParts) {
        callbacks.onThinking?.(tp.text || '');
      }
      return;
    }

    // 既没有文本也没有 functionCall → 异常
    throw new Error('AI 返回异常：无文本也无工具调用');
  }

  throw new Error('工具调用超过最大轮次 (3)');
}

/** DeepSeek / OpenAI Function Calling Agent */
async function openAIAgentLoop(
  config: AIConfig, systemPrompt: string, userMessage: string, callbacks: AgentCallbacks
) {
  const endpoint = config.provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.deepseek.com/v1/chat/completions';

  // OpenAI 格式工具
  const tools = AI_TOOLS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  for (let turn = 0; turn < 3; turn++) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, messages, tools }),
      signal: callbacks.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Agent API 错误 ${resp.status}: ${errText.slice(0, 150)}`);
    }

    const data = await resp.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('AI 返回为空');

    // 检查 tool_calls
    if (msg.tool_calls?.length > 0) {
      const tc = msg.tool_calls[0];
      const funcName = tc.function.name;
      const funcArgs = JSON.parse(tc.function.arguments || '{}');
      console.log('[Agent] 第', turn + 1, '轮 → tool_call:', funcName, funcArgs);
      callbacks.onToolCall?.(funcName);

      const result = await executeToolCall({ name: funcName, args: funcArgs });

      messages.push({ role: 'assistant', content: null, tool_calls: [tc] });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      continue;
    }

    // 文本回复
    if (msg.content) {
      callbacks.onChunk(msg.content);
      if (msg.reasoning_content) callbacks.onThinking?.(msg.reasoning_content);
      return;
    }

    throw new Error('AI 返回异常：无文本也无工具调用');
  }

  throw new Error('工具调用超过最大轮次 (3)');
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
      case 'deepseek': {
        const endpoint = provider === 'openai'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://api.deepseek.com/v1/chat/completions';
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

/** 联网获取所有已配置供应商的最新模型列表 */
export async function fetchRemoteModels(): Promise<{ models: RemoteModelEntry[]; updatedAt: string }> {
  const providers: { provider: AIProvider; key: string }[] = [];
  const keyMap: Record<string, string> = {
    gemini: 'gemini_key_enc', openai: 'openai_key_enc',
    deepseek: 'deepseek_key_enc', claude: 'claude_key_enc',
  };

  for (const [provider, storageKey] of Object.entries(keyMap)) {
    const enc = localStorage.getItem(storageKey);
    if (enc) {
      try {
        providers.push({ provider: provider as AIProvider, key: decrypt(enc) });
      } catch { /* skip broken config */ }
    }
  }

  const allModels: RemoteModelEntry[] = [];

  for (const { provider, key } of providers) {
    try {
      if (provider === 'gemini') {
        const models = await fetchGeminiModels(key);
        allModels.push(...models);
      } else if (provider === 'openai') {
        const models = await fetchOpenAIModels(key);
        allModels.push(...models);
      }
      // DeepSeek / Claude don't have public model list endpoints
    } catch { /* skip failed provider */ }
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
