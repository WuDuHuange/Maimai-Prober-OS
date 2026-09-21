/**
 * 工具调用文本协议的解析与清理 —— **纯函数，无副作用**。
 *
 * 协议形如：
 *   TOOL: search_songs
 *   ARGS: {"query": "Oshama"}
 *   ===END===
 *
 * ⚠️ 为什么单开一个文件放在 utils：解析逻辑与「工具注册表 / 执行器」（aiTools.ts，
 * 要访问 Dexie 与 Pinia）性质完全不同 —— 前者是纯字符串处理，后者有副作用。
 * 分开之后解析器可以被离线单测覆盖，而不必把整个数据库拖进测试环境。
 */

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** 文本里是否出现了工具协议标记 */
export function hasToolMarker(text: string): boolean {
  return /TOOL\s*[:：]/.test(text);
}

/**
 * 从模型输出里解析工具调用。
 *
 * ⚠️ 为什么不用一条正则硬啃：模型（尤其推理模型）实测会输出各种变体 ——
 *   - 用 ``` 代码围栏包起来
 *   - `TOOL: xxx` 与 `ARGS: {...}` 挤在同一行
 *   - JSON 里嵌套花括号 `{"a":{"b":1}}`（非贪婪 `\}` 会在第一个 `}` 截断）
 *   - 漏掉 `===END===`
 *   - 冒号写成全角 `：`
 * 所以这里改成「定位 TOOL → 花括号配平扫描取 JSON」。
 * 解析不出来就返回 null，**绝不猜**。
 */
export function parseToolCall(text: string): ToolCall | null {
  // 代码围栏会干扰后续扫描，先去壳
  const src = text.replace(/```[a-zA-Z]*\s*/g, '');
  const toolMatch = src.match(/TOOL\s*[:：]\s*([A-Za-z_][\w-]*)/);
  if (!toolMatch) return null;

  const name = toolMatch[1];
  const rest = src.slice(toolMatch.index! + toolMatch[0].length);
  const argsStart = rest.indexOf('{');

  // 无参数工具（如 get_player_stats）允许省略 ARGS
  if (argsStart === -1) return { name, args: {} };

  const json = scanBalancedObject(rest, argsStart);
  if (json === null) return { name, args: {} };

  try {
    const parsed = JSON.parse(json);
    return {
      name,
      args: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {},
    };
  } catch {
    // JSON 残缺 —— 退化为无参数调用，让工具自己报参数错，也好过整轮崩掉
    return { name, args: {} };
  }
}

/** 从 start（指向 '{'）开始做花括号配平扫描，返回完整 JSON 串；未闭合返回 null */
function scanBalancedObject(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 从模型输出里剥掉工具协议残留。
 *
 * 用途：解析失败时兜底 —— 无论模型输出多离谱，
 * **TOOL/ARGS/===END=== 这些内部协议都不该出现在用户眼前**。
 * 只在文本确实含协议标记时调用（避免误伤正常正文）。
 */
export function stripToolProtocol(text: string): string {
  let out = text.replace(/```[a-zA-Z]*\s*/g, '');
  // ⚠️ 顺序要紧：RESULT 块必须**在**单独删 `===END===` 之前处理，
  // 否则 END 行先被删掉，`RESULT...===END===` 这条规则就永远匹配不上，
  // 结果只剩一个光秃秃的 "RESULT:" 留在正文里（踩过）。
  out = out.replace(/^\s*RESULT\s*[:：][\s\S]*?===END===\s*$/gm, '');
  out = out.replace(/^\s*TOOL\s*[:：][^\n]*$/gm, '');
  out = out.replace(/^\s*ARGS\s*[:：][^\n]*$/gm, '');
  out = out.replace(/^\s*===END===\s*$/gm, '');
  // 同一行里写的 "TOOL: x ARGS: {...}" 也清掉
  out = out.replace(/TOOL\s*[:：]\s*[A-Za-z_][\w-]*(\s*ARGS\s*[:：]\s*\{[\s\S]*?\})?/g, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
