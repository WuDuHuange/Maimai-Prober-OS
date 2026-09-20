#!/usr/bin/env node
/**
 * 抓取 DXRating 社区谱面标注 → public/dxr-tags.json
 *
 * 为什么需要这一步（2026-09-20 定位）：
 *   生产环境**不能**直连 `miruku.dxrating.net`。该服务端按 Origin 白名单放行 CORS
 *   —— 响应带 `Vary: Origin` 与 `Access-Control-Allow-Credentials: true`，
 *   但**不返回** `Access-Control-Allow-Origin`，GitHub Pages 的源不在白名单里，
 *   浏览器会直接拦截请求（curl / Node 不受影响，所以离线测试会假阳性通过）。
 *   故改为「构建前抓取 → 运行时读同源静态文件」。
 *
 * 失败策略：**绝不让构建挂掉**。
 *   - 已有旧文件 → 保留旧数据，exit 0（用旧数据远好于没有数据）
 *   - 没有旧文件 → exit 1（此时确实无数据可用，应当显式失败而不是静默发布残缺产物）
 *
 * 用法：`npm run sync:tags`
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SOURCE = 'https://miruku.dxrating.net/api/v1/tags';
const OUT = path.resolve('public/dxr-tags.json');
const TIMEOUT_MS = 60_000;

const log = (...a) => console.log('[sync:tags]', ...a);

/** 有旧文件就保留旧数据并放行，没有就真失败 */
async function bail(reason) {
  log(`❌ ${reason}`);
  if (existsSync(OUT)) {
    log('已有旧数据 → 保留，继续构建（数据可能不是最新）');
    log(`   文件：${path.relative(process.cwd(), OUT)}`);
    process.exit(0);
  }
  log('没有任何可用数据，构建中止');
  process.exit(1);
}

async function main() {
  log('拉取', SOURCE);

  let payload;
  try {
    const resp = await fetch(SOURCE, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return bail(`HTTP ${resp.status}`);
    payload = await resp.json();
  } catch (err) {
    return bail(`请求失败：${err?.message ?? err}`);
  }

  // 结构校验 —— 缺任一项都说明响应异常，宁可回退旧数据
  if (!Array.isArray(payload?.tags) || !Array.isArray(payload?.tagSongs)) {
    return bail('响应结构异常（缺 tags / tagSongs）');
  }
  if (payload.tags.length === 0 || payload.tagSongs.length === 0) {
    return bail(`响应内容为空（tags=${payload.tags.length} tagSongs=${payload.tagSongs.length}）`);
  }

  const json = JSON.stringify(payload);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, json, 'utf8');

  log(`✅ 写入 ${path.relative(process.cwd(), OUT)}`);
  log(`   tags=${payload.tags.length}  tagSongs=${payload.tagSongs.length}  ${(json.length / 1024).toFixed(0)} KB`);
}

main();
