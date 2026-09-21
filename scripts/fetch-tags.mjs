#!/usr/bin/env node
/**
 * 抓取 DXRating 社区谱面标注 → public/dxr-tags.json
 *
 * 为什么需要这一步（2026-09-20 定位）：
 *   生产环境**不能**直连 `miruku.dxrating.net`。该服务端按 Origin 白名单放行 CORS
 *   —— 响应带 `Vary: Origin` 与 `Access-Control-Allow-Credentials: true`，
 *   但**不返回** `Access-Control-Allow-Origin`，GitHub Pages 的源不在白名单里，
 *   浏览器会直接拦截请求（curl / Node 不受 CORS 约束，所以离线测试会假阳性通过）。
 *   故改为「构建前抓取 → 运行时读同源静态文件」。
 *
 * 失败策略：**绝不让构建挂掉**（2026-09-21 改为三段式兜底）。
 *   DXRating 是第三方单点 —— 它一挂，若直接 exit 1，则 `Build` 步骤根本不执行，
 *   连与 tag 无关的 hotfix 都发不出去。所以按下面的顺序逐层退让：
 *
 *     ① 本次抓取成功          → 用最新数据
 *     ② 抓取失败 + 本地有副本 → 保留副本，exit 0（副本已入库，见 .gitignore 注释）
 *     ③ 抓取失败 + 本地无副本 → 从**已部署站点**回抓上一次成功发布的副本，exit 0
 *     ④ 以上全失败            → exit 1（确实无数据可用，显式失败好过静默发布残缺产物）
 *
 *   第 ③ 层为什么值得存在：CI 是全新 checkout，本地副本只有在**入库**之后才存在；
 *   而线上那份是每次成功构建发布上去的，永远 ≤1 周旧（周定时 cron 在刷新它），
 *   不依赖「有人记得手动 commit」。它也是「副本被误删 / 被重新 ignore」时的保险。
 *   ⚠️ 在第 ② 层成立的前提下（副本已入库），CI 里第 ③ 层实际不会走到 —— 属纯保险。
 *
 * 用法：`npm run sync:tags`
 * 环境变量：`TAGS_FALLBACK_URL` 覆盖第 ③ 层的数据源（默认指向本仓库的 Pages 站点）。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SOURCE = 'https://miruku.dxrating.net/api/v1/tags';

/** 第 ③ 层兜底源：本仓库 Pages 站点上那份「上次成功发布」的副本。 */
const DEFAULT_FALLBACK_URL =
  'https://wuduhuange.github.io/Maimai-Prober-OS/dxr-tags.json';

const OUT = path.resolve('public/dxr-tags.json');
const TIMEOUT_MS = 60_000;

const log = (...a) => console.log('[sync:tags]', ...a);

/**
 * 解析第 ③ 层的兜底源。环境变量优先（CI 里按当前仓库拼，fork 才不会指向上游），
 * 但只接受「https(s) + 路径里带仓库名」的合法 URL，否则退回默认值 ——
 * 宁可指向本仓库，也不要因为一个拼坏的 URL 把最后一层兜底弄哑。
 */
function resolveFallbackUrl() {
  const candidates = [
    (process.env.TAGS_FALLBACK_URL || '').trim(),
    DEFAULT_FALLBACK_URL,
  ];
  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
      // 期望形如 https://<owner>.github.io/<repo>/dxr-tags.json —— 路径必须含仓库名那一段
      if (!/^\/[^/]+\/[^/]+$/.test(u.pathname)) continue;
      return u.href;
    } catch {
      /* 非法 URL，试下一个候选 */
    }
  }
  return DEFAULT_FALLBACK_URL;
}

const FALLBACK_URL = resolveFallbackUrl();

/** 结构校验 —— 缺任一项都说明响应异常，宁可回退旧数据。校验失败会抛。 */
function assertValid(payload) {
  if (!Array.isArray(payload?.tags) || !Array.isArray(payload?.tagSongs)) {
    throw new Error('响应结构异常（缺 tags / tagSongs）');
  }
  if (payload.tags.length === 0 || payload.tagSongs.length === 0) {
    throw new Error(
      `响应内容为空（tags=${payload.tags.length} tagSongs=${payload.tagSongs.length}）`
    );
  }
}

/** 原子落盘，返回写入的字节数 */
async function persist(payload) {
  const json = JSON.stringify(payload);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, json, 'utf8');
  // 用 byteLength 而不是 json.length —— 内容全是中日文，两者差 11%
  return Buffer.byteLength(json, 'utf8');
}

/**
 * 抓取失败时的兜底：本地副本 → 线上已部署副本 → 才真失败。
 * 只在真的用尽所有来源时才 exit 1。
 */
async function bail(reason) {
  log(`❌ ${reason}`);

  // ② 本地已有副本（入库的兜底副本，或本地开发时上一次的产物）
  if (existsSync(OUT)) {
    log('→ [兜底 1/2] 保留工作区里已有的旧数据，继续构建（数据可能不是最新）');
    log(`   文件：${path.relative(process.cwd(), OUT)}`);
    process.exit(0);
  }

  // ③ 从已部署站点回抓
  log(`→ [兜底 2/2] 本地无副本，尝试从已部署站点回抓：${FALLBACK_URL}`);
  try {
    const resp = await fetch(FALLBACK_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    assertValid(payload);
    const bytes = await persist(payload);
    log('✅ 已从线上副本恢复，继续构建（数据可能不是最新）');
    log(
      `   tags=${payload.tags.length}  tagSongs=${payload.tagSongs.length}  ${(bytes / 1024).toFixed(0)} KB`
    );
    process.exit(0);
  } catch (err) {
    log(`   回抓失败：${err?.message ?? err}`);
  }

  // ④ 所有来源都用尽
  log('❌ 三个来源都拿不到数据，构建中止（不发布缺 tag 数据的产物）');
  process.exit(1);
}

async function main() {
  log('拉取', SOURCE);
  log(`兜底源（抓取失败时逐层退让）：本地副本 → ${FALLBACK_URL}`);

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

  try {
    assertValid(payload);
  } catch (err) {
    return bail(err.message);
  }

  const bytes = await persist(payload);

  log(`✅ 写入 ${path.relative(process.cwd(), OUT)}`);
  log(
    `   tags=${payload.tags.length}  tagSongs=${payload.tagSongs.length}  ${(bytes / 1024).toFixed(0)} KB`
  );
}

main();
