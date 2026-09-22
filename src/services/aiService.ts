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

/**
 * Gemini 流式端点。
 *
 * ⚠️ **`alt=sse` 不能少**（2026-09-22 修）。Google 规定是否走 SSE **完全由这个 query 参数决定**：
 *   - 带 `alt=sse` → `Content-Type: text/event-stream`，每行一条 `data: {...}`
 *   - 不带       → 「流式 JSON」，即 **JSON 数组流**，**没有 `data:` 前缀**
 *   原先两处 URL 都漏了它，而解析器只认 `data:` → 一行都匹配不到 → **解析出 0 字符**。
 *   症状极具迷惑性：**连接测试通过，但对话没有任何输出**。
 */
function geminiStreamUrl(model: string, apiKey: string): string {
  return (
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    `${model}:streamGenerateContent?alt=sse&key=${apiKey}`
  );
}

/** Gemini GenerateContentResponse 里我们关心的字段 */
interface GeminiResponseShape {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
}

/**
 * 解析 Gemini 流式响应。**两处调用共用这一份**（原先各写一遍，已经漂移过）。
 *
 * - SSE（正常情况）按行解析 `data:`；
 * - 非 SSE（网关/代理把 `alt` 参数剥掉时）整段按 JSON 数组兜底解析 ——
 *   宁可牺牲流式体验，也不要静默无输出；
 * - **思考与正文严格分流**：`part.thought` 的文本只进 onThinking，绝不混进正文；
 * - 拿到 0 字符时**抛出可读错误**，而不是返回空串让 UI 一片空白。
 */
async function readGeminiStream(
  resp: Response,
  onChunk: (text: string) => void,
  onThinking?: (text: string) => void
): Promise<string> {
  const isSse = (resp.headers.get('content-type') ?? '').includes('text/event-stream');
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let raw = '';
  let full = '';
  let blockReason = '';
  let finishReason = '';

  const consume = (json: GeminiResponseShape) => {
    if (json?.promptFeedback?.blockReason) blockReason = json.promptFeedback.blockReason;
    const cand = json?.candidates?.[0];
    if (cand?.finishReason) finishReason = cand.finishReason;
    for (const part of cand?.content?.parts ?? []) {
      if (!part?.text) continue;
      if (part.thought) {
        onThinking?.(part.text);
      } else {
        full += part.text;
        onChunk(part.text);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });

    if (!isSse) {
      raw += text;
      continue;
    }

    buffer += text;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        consume(JSON.parse(payload) as GeminiResponseShape);
      } catch {
        /* 半行 / 非 JSON，跳过 */
      }
    }
  }

  // 非 SSE 兜底：整段是一个 JSON 数组（或单个对象）
  if (!isSse && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as GeminiResponseShape | GeminiResponseShape[];
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) consume(item);
    } catch {
      /* 解析不了 → 交给下面的报错 */
    }
  }

  if (!full) {
    if (blockReason) throw new Error(`Gemini 拒绝了本次请求（blockReason: ${blockReason}）`);
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`Gemini 未返回正文（finishReason: ${finishReason}）`);
    }
    throw new Error(
      'Gemini 返回了空响应。请确认该模型名对当前 Key 可用；若持续如此，请到设置里换一个模型。'
    );
  }
  return full;
}

async function callGeminiStream(
  config: AIConfig,
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  onThinking?: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  // Gemini API: 只用 contents，不重复 systemInstruction（避免某些模型忽略正文）
  // 单条消息：系统提示词 + 上下文数据 + 用户问题，清晰分隔
  const combinedText = [
    systemPrompt,
    '---',
    userMessage,
  ].join('\n\n');

  const resp = await fetch(geminiStreamUrl(config.model, config.apiKey), {
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

  return readGeminiStream(resp, onChunk, onThinking);
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
import { parseToolCall, stripToolProtocol, hasToolMarker, type ToolCall } from '@/utils/toolProtocol';

export interface AgentCallbacks {
  onChunk: (text: string) => void;
  onThinking?: (text: string) => void;
  /** 丢弃本轮已推给 UI 的思考链（该轮被判定为「工具调度轮」时调用） */
  onThinkingReset?: () => void;
  onToolCall?: (toolName: string) => void;
  signal?: AbortSignal;
}

/** 单次工具调用的指纹，用于识别模型原地打转 */
function callSignature(name: string, args: Record<string, unknown>): string {
  let a: string;
  try { a = JSON.stringify(args); } catch { a = String(args); }
  return `${name}|${a}`;
}

/**
 * Prompt-Based Agent 循环
 * 原理：在 System Prompt 中注入工具清单 + TOOL/ARGS/===END=== 文本协议
 * 流式拦截 AI 响应 → 检测 TOOL: → 执行 Dexie → 注入 RESULT: → 继续
 *
 * ⚠️ 三个刻意的设计（都是踩过坑之后加的）：
 *  1. **思考链按轮分流**。推理模型在「还没拿到数据」时会先输出一大段
 *     「我该调哪个工具」的调度废话，那不是用户想看的思考。所以：
 *     调度轮的思考**不推给 UI**；只有真正作答那轮的思考才展示。
 *  2. **循环必须有界，且不靠抛异常收尾**。抛出去会被上层捕获并回退到
 *     无工具的普通流式，等于把带协议的整段上下文再喂一遍，更容易胡说。
 *     所以改成「重复调用 / 轮次用尽 → 转入强制作答」。
 *  3. **协议原文绝不外泄**。解析失败时走 stripToolProtocol 兜底。
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
  /** 允许的工具轮数；用尽后转强制作答 */
  const maxToolRounds = 4;
  /**
   * 单次工具结果回灌给模型的字符上限。
   * 见下方用法处的注释 —— 3000 会把 `get_b50_analysis` 的 50 张谱明细腰斩成坏 JSON。
   */
  const MAX_TOOL_RESULT = 16000;
  /** 用过的工具调用指纹 —— 同一个工具 + 同一份参数再调一次结果不会变 */
  const seenCalls = new Set<string>();
  let toolRounds = 0;
  /** true = 不再接受工具调用，直接要答案 */
  let forceAnswer = false;

  for (let turn = 0; turn < maxToolRounds + 2; turn++) {
    // 「调度轮」= 对话里还没有任何工具结果。这一轮模型只是在决定调什么，
    // 推理模型能在这上面啰嗦几千字，且对用户毫无价值 → 思考不展示。
    const isSchedulingTurn = !forceAnswer && !conversation.includes('RESULT:');
    console.log('[Agent] 第', turn + 1, '轮, 调度轮:', isSchedulingTurn, ', 上下文长度:', conversation.length);

    const prompt = forceAnswer
      ? conversation +
        '\n\n⚠️ 工具调用预算已用尽。禁止再输出任何 TOOL 指令，' +
        '请立刻基于上面已经拿到的真实数据直接作答。'
      : conversation;

    let accumulated = '';
    let turnThinking = '';
    /** 本轮解析出的工具调用（null = 无） */
    let parsedCall: ToolCall | null = null;
    /**
     * 读取本轮解析结果。
     * ⚠️ 必须包成函数：`parsedCall` 只在下面的闭包里赋值，TS 的控制流分析
     * 会认为它恒为 null，直接在循环体里读会被窄化成 never。
     */
    const readParsedCall = (): ToolCall | null => parsedCall;

    // 调度轮的思考先攒着不推；万一本轮其实是最终作答轮，收尾时补发
    const thinkingSink = (t: string) => {
      turnThinking += t;
      if (!isSchedulingTurn) callbacks.onThinking?.(t);
    };

    // 只负责累积文本，解析交给 parseToolCall（宽容模式，见 aiTools.ts）
    const toolInterceptor = (chunk: string) => {
      accumulated += chunk;
      if (!parsedCall && !forceAnswer && hasToolMarker(accumulated)) {
        const call = parseToolCall(accumulated);
        if (call) {
          parsedCall = call;
          console.log('[Agent] 解析到 TOOL:', call.name, call.args);
          callbacks.onToolCall?.(call.name);
        }
      }
    };

    await streamAIChatRaw(
      fullSystemPrompt, prompt, toolInterceptor, thinkingSink, callbacks.signal, config
    );

    const parsed = readParsedCall();

    // ---- 分支 A：本轮是工具调用轮 ----
    if (parsed && !forceAnswer) {
      // 拿到数据之后还要再调工具（少见）→ 这一轮的思考也是调度性质，撤掉
      if (!isSchedulingTurn) callbacks.onThinkingReset?.();

      const sig = callSignature(parsed.name, parsed.args);
      if (seenCalls.has(sig)) {
        console.warn('[Agent] 重复调用同一工具，转入强制作答:', sig);
        callbacks.onChunk('\n> ⚠️ 检测到重复调用同一个工具，已跳过并直接作答。\n\n');
        forceAnswer = true;
        conversation +=
          `\n\n注意：你刚刚已经用完全相同的参数调用过 ${parsed.name}，结果不会变化。` +
          '禁止再调用任何工具，请立刻基于已获得的数据作答。';
        continue;
      }
      seenCalls.add(sig);
      toolRounds++;

      const result = await executeToolCall(parsed);
      // ⚠️ 结果长度上限。原先写死 3000 —— 但 `get_b50_analysis` 返回全部 50 张谱的
      //    明细时远超此值，会被**从中间腰斩**，模型拿到的是坏 JSON
      //    （实测尾部停在 `"constant":14` 这种半截字段）。
      //    现在提到 16000，并且**截断时显式告知模型**，避免它去解析残缺 JSON。
      const truncated = result.length > MAX_TOOL_RESULT;
      const payload = truncated ? result.slice(0, MAX_TOOL_RESULT) : result;
      const resultBlock =
        `\n\nRESULT:\n${payload}` +
        (truncated
          ? '\n…[结果超长已截断，此处不是完整 JSON，请勿解析；' +
            '改用更精确的参数（如更小的 topN / maxResults）重新调用]'
          : '') +
        '\n===END===\n\n基于以上真实数据回答用户问题。';
      // 只把工具指令块（END 之前的部分）回灌，丢掉模型多写的解释
      conversation += '\n\n' + accumulated.split('===END===')[0] + '===END===' + resultBlock;
      callbacks.onChunk(`\n> 🔧 已执行 ${parsed.name}，正在分析数据...\n\n`);

      if (toolRounds >= maxToolRounds) {
        console.warn('[Agent] 工具轮数达上限，下一轮强制作答');
        forceAnswer = true;
      }
      continue;
    }

    // ---- 分支 B：最终回答 ----
    // 调度轮的思考被压着没发 —— 说明本轮就是最终轮（模型直接作答），补发
    if (isSchedulingTurn && turnThinking) callbacks.onThinking?.(turnThinking);

    let finalText = accumulated;
    // 兜底：无论解析成功与否，内部协议都不该出现在用户眼前
    if (hasToolMarker(finalText) || finalText.includes('===END===')) {
      const cleaned = stripToolProtocol(finalText);
      finalText = cleaned.length >= 20
        ? cleaned
        : '⚠️ 模型返回了无法解析的工具调用格式，已忽略。请重试一次，或到设置里换一个模型。';
    }
    callbacks.onChunk(finalText);
    return;
  }

  // 循环自然结束（理论上不该发生 —— forceAnswer 那轮会走分支 B 返回）
  callbacks.onChunk('⚠️ 工具调用次数超出上限，请重新提问。');
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
      const resp = await fetch(geminiStreamUrl(config.model, config.apiKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + '\n\n---\n\n' + userMessage }] }],
        }),
        signal,
      });
      if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
      // 与 callGeminiStream 共用同一份解析。原先这里各写了一遍，且 thought 判定顺序写反：
      // 先无条件 `onChunk(part.text)` 再判 `part.thought` → 思考内容会被当成正文推给 UI。
      await readGeminiStream(resp, onChunk, onThinking);
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
        // 非流式端点，用于验证 Key / 模型名可用。
        // ⚠️ **必须断言真的拿到了正文**：只判 `resp.ok` 的话，「协议/解析层不兼容」
        //    会被报成「连接成功 ✓」——2026-09-22 的教训（缺 alt=sse 时正是如此，
        //    连接测试全绿、对话却一个字都没有）。
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
        const data = (await resp.json().catch(() => null)) as GeminiResponseShape | null;
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        const text = parts
          .filter(p => !p.thought)
          .map(p => p.text ?? '')
          .join('')
          .trim();
        if (!text) {
          const reason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason;
          const detail = parts.some(p => p.thought)
            ? '只返回了思考内容，没有正文（可能输出预算被思考占用）'
            : reason
              ? `未返回任何内容（${reason}）`
              : '未返回任何内容，请确认该模型名对当前 Key 可用';
          return { ok: false, message: `接口可达，但${detail}` };
        }
        return { ok: true, message: `连接成功 ✓（模型回复：${text.slice(0, 20)}）` };
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
