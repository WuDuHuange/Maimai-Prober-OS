/**
 * Markdown 渲染 + 危险内容清洗。
 *
 * 渲染对象是 **AI 生成、且会被持久化后用 `v-html` 反复渲染**的文本，
 * 不能直接信任。这里在 marked 输出之后剥掉脚本类标签、`on*` 事件属性、
 * `javascript:` 协议 —— 够挡住常见注入，且不引入新依赖
 * （项目里没有 DOMPurify，为这点用途加一个不划算）。
 */
import { marked } from 'marked';

export function renderSafeMarkdown(md: string): string {
  let html: string;
  try {
    html = marked.parse(md, { breaks: true }) as string;
  } catch {
    html = md.replace(/\n/g, '<br>');
  }

  return html
    // 成对的可执行/外链标签整段删掉
    .replace(/<\s*(script|iframe|object|embed|style|link|meta|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // 自闭合或无内容的形式
    .replace(/<\s*(script|iframe|object|embed|style|link|meta|form)\b[^>]*\/?>/gi, '')
    // on* 事件属性
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // 危险协议
    .replace(/(href|src)\s*=\s*(["'])\s*(javascript|data|vbscript):[^"']*\2/gi, '$1="#"');
}
