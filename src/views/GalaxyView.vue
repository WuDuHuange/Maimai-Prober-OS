<template>
  <div class="galaxy-view">
    <div ref="cardEl" class="galaxy-card">
      <div ref="hostEl" class="galaxy-canvas"></div>

      <!-- 空数据 -->
      <div v-if="isEmpty" class="galaxy-empty">
        <span class="empty-title">暂无数据</span>
        <span class="empty-sub">请先在左侧完成一次水鱼同步</span>
      </div>

      <template v-else>
        <!-- 标题 -->
        <header class="overlay overlay-tl">
          <h2 class="galaxy-title">Rating 星系</h2>
          <p class="galaxy-sub">
            Best 50 三维分布 · 内环 B15 / 外环 B35 · 柱高 = {{ metricLabel }}
          </p>
        </header>

        <!-- 维度切换 -->
        <div class="overlay overlay-tr metric-switch">
          <button
            v-for="m in METRICS"
            :key="m.key"
            class="metric-btn"
            :class="{ active: metric === m.key }"
            @click="setMetric(m.key)"
          >
            {{ m.label }}
          </button>
        </div>

        <!-- 中心 Rating 读数 -->
        <div class="core-readout">
          <span class="core-value">{{ ratingText }}</span>
          <span class="core-label">RATING</span>
        </div>

        <!-- 图例 -->
        <div class="overlay overlay-bl legend">
          <span v-for="d in legendItems" :key="d.key" class="legend-item">
            <i class="legend-dot" :style="{ background: d.color, boxShadow: `0 0 8px ${d.color}` }" />
            {{ d.label }}
            <em>{{ d.count }}</em>
          </span>
        </div>

        <!-- 操作提示 -->
        <div class="overlay overlay-br hint">拖拽旋转 · 滚轮缩放 · 悬停查看</div>

        <!-- 悬停信息卡 -->
        <Transition name="tip">
          <div
            v-if="hovered"
            class="hover-tip"
            :style="{ left: tipPos.x + 'px', top: tipPos.y + 'px' }"
          >
            <span class="tip-title">{{ hovered.title ?? '#' + hovered.songId }}</span>
            <span class="tip-artist" v-if="hovered.artist">{{ hovered.artist }}</span>
            <div class="tip-row">
              <span class="tip-diff" :style="{ color: diffColor(hovered.difficulty) }">
                {{ diffLabel(hovered.difficulty) }} {{ hovered.constant?.toFixed(1) ?? '-' }}
              </span>
              <span class="tip-metric">{{ hovered.achievements.toFixed(4) }}%</span>
            </div>
            <div class="tip-row">
              <span class="tip-muted">单曲 Rating</span>
              <span class="tip-strong">{{ Math.round(hovered.ratingContribution ?? 0) }}</span>
            </div>
            <div class="tip-row">
              <span class="tip-muted">{{ hovered.isNew ? 'B15 · 新曲' : 'B35 · 旧曲' }}</span>
              <span class="tip-muted">{{ hovered.type }}</span>
            </div>
          </div>
        </Transition>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { useB50Store } from '@/stores/useB50Store';
import { usePlayerStore } from '@/stores/usePlayerStore';
import type { B50Record } from '@/types/b50';
import type { DifficultyType } from '@/types/song';

type MetricKey = 'ra' | 'const' | 'acc';

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'ra', label: '单曲 Rating' },
  { key: 'const', label: '谱面定数' },
  { key: 'acc', label: '达成率' },
];

const DIFF_COLOR: Record<DifficultyType, string> = {
  basic: '#34D399',
  advanced: '#FBBF24',
  expert: '#F87171',
  master: '#A78BFA',
  remaster: '#F472B6',
};

const DIFF_SHORT: Record<DifficultyType, string> = {
  basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM',
};

const b50Store = useB50Store();
const playerStore = usePlayerStore();

const hostEl = ref<HTMLDivElement | null>(null);
const cardEl = ref<HTMLDivElement | null>(null);
const metric = ref<MetricKey>('ra');
const hovered = ref<B50Record | null>(null);
const tipPos = ref({ x: 0, y: 0 });

const items = computed(() => b50Store.b50List);
const isEmpty = computed(() => !isEmptyPending.value && items.value.length === 0);
const isEmptyPending = ref(true);
const ratingText = computed(() => {
  const r = playerStore.currentRating || b50Store.computedRating;
  return r > 0 ? Math.round(r).toLocaleString() : '----';
});
const metricLabel = computed(() => METRICS.find(m => m.key === metric.value)?.label ?? '');
const legendItems = computed(() =>
  (Object.keys(DIFF_COLOR) as DifficultyType[])
    .map(key => ({
      key,
      color: DIFF_COLOR[key],
      label: DIFF_SHORT[key],
      count: items.value.filter(i => i.difficulty === key).length,
    }))
    .filter(d => d.count > 0),
);

/* ============ Three.js 运行时 ============ */
let renderer: THREE.WebGLRenderer | null = null;
let composer: EffectComposer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let rafId = 0;
let resizeObserver: ResizeObserver | null = null;
let autoRotateTimer = 0;

const pickables: THREE.Mesh[] = [];
let bloomPass: UnrealBloomPass | null = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
let pointerClient = { x: 0, y: 0 };
let pointerInside = false;

const RING_RADIUS: Record<'new' | 'old', number> = { new: 10.5, old: 19.5 };
const BASE_HEIGHT = 2;
const HEIGHT_RANGE = 11.5;

function metricValue(r: B50Record): number {
  if (metric.value === 'const') return r.constant ?? 0;
  if (metric.value === 'acc') return r.achievements;
  return r.ratingContribution ?? 0;
}

/** 生成径向渐变贴图，用于中心光晕 */
function makeGlowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(160,180,255,0.95)');
  g.addColorStop(0.25, 'rgba(110,130,255,0.45)');
  g.addColorStop(0.6, 'rgba(70,90,220,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 生成圆点贴图，用于星空粒子 */
function makeStarTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(200,215,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildScene() {
  const host = hostEl.value;
  if (!host) return;

  const width = host.clientWidth || 800;
  const height = host.clientHeight || 520;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#070B1E');
  scene.fog = new THREE.FogExp2('#070B1E', 0.0125);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 400);
  camera.position.set(0, 30, 46);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 4.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 20;
  controls.maxDistance = 95;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.42;
  controls.addEventListener('start', () => {
    window.clearTimeout(autoRotateTimer);
    if (controls) controls.autoRotate = false;
  });
  controls.addEventListener('end', () => {
    // 松手后延迟恢复自转，避免打扰操作
    window.clearTimeout(autoRotateTimer);
    autoRotateTimer = window.setTimeout(() => {
      if (controls) controls.autoRotate = true;
    }, 2200);
  });

  scene.add(new THREE.AmbientLight(0xffffff, 1.15));

  const keyLight = new THREE.PointLight(0x7B9AFF, 900, 160, 2);
  keyLight.position.set(0, 26, 0);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xC9A8FF, 1.1);
  rimLight.position.set(-24, 18, -20);
  scene.add(rimLight);

  buildStars();
  buildCore();
  buildTracks();

  // 后处理：泛光
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.85, 0.55, 0.22);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  resizeObserver = new ResizeObserver(() => handleResize());
  resizeObserver.observe(host);

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  rebuildBars();
  animate();
}

/** 星空粒子背景 */
function buildStars() {
  if (!scene) return;
  const count = 1400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 60 + Math.random() * 90;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.55 + 10;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.5,
    map: makeStarTexture(),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  scene.add(new THREE.Points(geo, mat));
}

/** 中心 Rating 核心 */
function buildCore() {
  if (!scene) return;
  const coreGeo = new THREE.IcosahedronGeometry(1.7, 1);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x8FA8FF,
    emissive: 0x5B78FF,
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.4,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.set(0, 4.5, 0);
  scene.add(core);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
    fog: false,
  }));
  halo.scale.set(30, 30, 1);
  halo.position.set(0, 4.5, 0);
  scene.add(halo);

  // 竖直光柱
  const beamGeo = new THREE.CylinderGeometry(0.16, 0.16, 30, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x6E8CFF,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, 15, 0);
  scene.add(beam);
}

/** 内外环轨道线 */
function buildTracks() {
  const s = scene;
  if (!s) return;
  (['new', 'old'] as const).forEach(kind => {
    const r = RING_RADIUS[kind];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.06, r + 0.06, 128),
      new THREE.MeshBasicMaterial({
        color: kind === 'new' ? 0x8B5CF6 : 0x4A72FF,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    s.add(ring);
  });
}

const barGeometry = new THREE.CylinderGeometry(0.44, 0.44, 1, 8, 1);
const capGeometry = new THREE.SphereGeometry(0.44, 12, 10);
const barGroup = new THREE.Group();

/** 按当前指标重建柱阵（数据或维度变化时调用） */
function rebuildBars() {
  if (!scene) return;

  // 清理旧柱体（几何体是共享的，只释放各自创建的材质）
  for (const child of barGroup.children) {
    const mat = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => m.dispose());
  }
  barGroup.clear();
  pickables.length = 0;
  if (!barGroup.parent) scene.add(barGroup);

  const list = items.value;
  if (list.length === 0) return;

  const values = list.map(metricValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const grouped: Record<'new' | 'old', B50Record[]> = {
    new: list.filter(i => i.isNew).slice(0, 15),
    old: list.filter(i => !i.isNew).slice(0, 35),
  };

  (['new', 'old'] as const).forEach(kind => {
    const group = grouped[kind];
    const radius = RING_RADIUS[kind];
    const step = (Math.PI * 2) / Math.max(group.length, 1);

    group.forEach((record, i) => {
      const value = metricValue(record);
      const norm = span < 1e-6 ? 0.5 : (value - min) / span;
      const barHeight = BASE_HEIGHT + norm * HEIGHT_RANGE;
      const angle = i * step + (kind === 'old' ? Math.PI / group.length : 0);

      const color = new THREE.Color(DIFF_COLOR[record.difficulty] ?? '#8FA8FF');

      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.42,
        roughness: 0.32,
        metalness: 0.15,
      });
      const bar = new THREE.Mesh(barGeometry, mat);
      bar.scale.set(1, barHeight, 1);
      bar.position.set(Math.cos(angle) * radius, barHeight / 2, Math.sin(angle) * radius);
      bar.userData.record = record;
      bar.userData.baseScale = 1;
      bar.userData.baseHeight = barHeight;
      barGroup.add(bar);
      pickables.push(bar);

      const capMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
      });
      const cap = new THREE.Mesh(capGeometry, capMat);
      cap.position.set(Math.cos(angle) * radius, barHeight, Math.sin(angle) * radius);
      barGroup.add(cap);
      cap.userData.isCap = true;
      // 顶盖跟随柱体做悬停高亮
      bar.userData.cap = cap;
    });
  });
}

function setMetric(key: MetricKey) {
  if (metric.value === key) return;
  metric.value = key;
  hovered.value = null;
  rebuildBars();
}

/* ============ 交互 ============ */
function onPointerMove(e: PointerEvent) {
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerClient = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  pointer.x = (pointerClient.x / rect.width) * 2 - 1;
  pointer.y = -(pointerClient.y / rect.height) * 2 + 1;
  pointerInside = true;
}

function onPointerLeave() {
  pointerInside = false;
  pointer.set(-10, -10);
  hovered.value = null;
}

function updateHover() {
  if (!camera || !pointerInside) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);

  // 恢复上一次的高亮
  for (const mesh of pickables) {
    if (mesh.userData.hovered) {
      mesh.userData.hovered = false;
      mesh.scale.x = 1;
      mesh.scale.z = 1;
      const cap = mesh.userData.cap as THREE.Mesh | undefined;
      if (cap) cap.scale.setScalar(1);
    }
  }

  if (hits.length === 0) {
    hovered.value = null;
    return;
  }

  const mesh = hits[0].object as THREE.Mesh;
  mesh.userData.hovered = true;
  mesh.scale.x = 1.4;
  mesh.scale.z = 1.4;
  const cap = mesh.userData.cap as THREE.Mesh | undefined;
  if (cap) cap.scale.setScalar(1.35);

  hovered.value = mesh.userData.record as B50Record;

  const host = hostEl.value;
  if (host) {
    const maxX = host.clientWidth - 230;
    const maxY = host.clientHeight - 150;
    tipPos.value = {
      x: Math.max(12, Math.min(pointerClient.x + 18, maxX)),
      y: Math.max(12, Math.min(pointerClient.y + 14, maxY)),
    };
  }
}

/* ============ 渲染循环 ============ */
function animate() {
  rafId = requestAnimationFrame(animate);
  if (controls) controls.update();
  updateHover();
  if (composer) composer.render();
}

function handleResize() {
  const host = hostEl.value;
  if (!host || !renderer || !camera || !composer) return;
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass?.setSize(w, h);
}

function disposeScene() {
  cancelAnimationFrame(rafId);
  window.clearTimeout(autoRotateTimer);
  resizeObserver?.disconnect();
  resizeObserver = null;

  if (renderer) {
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  controls?.dispose();
  controls = null;
  composer?.dispose();
  composer = null;

  scene?.traverse(obj => {
    const anyObj = obj as THREE.Mesh;
    if (anyObj.geometry) anyObj.geometry.dispose();
    const mat = anyObj.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => m.dispose());
  });
  scene = null;
  camera = null;
  bloomPass = null;
  pickables.length = 0;
}

/* ============ 工具 ============ */
function diffColor(d: DifficultyType) { return DIFF_COLOR[d] ?? '#8FA8FF'; }
function diffLabel(d: DifficultyType) { return DIFF_SHORT[d] ?? d.toUpperCase(); }

onMounted(async () => {
  await b50Store.loadFromDB();
  isEmptyPending.value = false;
  if (b50Store.b50List.length === 0) return;
  buildScene();
});

onBeforeUnmount(disposeScene);
</script>

<style scoped>
.galaxy-view { padding: 20px; height: 100%; }

.galaxy-card {
  position: relative;
  width: 100%;
  height: calc(100vh - var(--header-height) - 40px);
  min-height: 460px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #070B1E;
  box-shadow: var(--shadow-xl);
  border: 1px solid rgba(255, 255, 255, 0.12);
  animation: galaxy-enter 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes galaxy-enter {
  from { opacity: 0; transform: translateY(14px) scale(0.99); }
  to   { opacity: 1; transform: none; }
}

.galaxy-canvas { position: absolute; inset: 0; }
.galaxy-canvas :deep(canvas) { display: block; }

/* ===== 覆盖层 ===== */
.overlay { position: absolute; z-index: 3; pointer-events: none; }
.overlay-tl { top: 20px; left: 22px; }
.overlay-tr { top: 20px; right: 22px; pointer-events: auto; }
.overlay-bl { bottom: 20px; left: 22px; }
.overlay-br { bottom: 20px; right: 22px; }

.galaxy-title {
  font-size: 15px; font-weight: 800; color: #F2F5FF;
  letter-spacing: var(--letter-spacing-tight);
}
.galaxy-sub {
  margin-top: 4px; font-size: 11px; color: rgba(200, 212, 255, 0.55);
  letter-spacing: var(--letter-spacing-wide);
}

.metric-switch {
  display: flex; gap: 2px; padding: 3px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.metric-btn {
  padding: 6px 14px; border: none; border-radius: var(--radius-full);
  background: transparent; color: rgba(210, 220, 255, 0.6);
  font-size: 11px; font-weight: 600; cursor: pointer;
  transition: all var(--transition-smooth);
  letter-spacing: var(--letter-spacing-normal);
}
.metric-btn:hover { color: #E8EDFF; }
.metric-btn.active {
  background: linear-gradient(135deg, #4A72FF, #9D7BFF);
  color: white;
  box-shadow: 0 4px 16px rgba(74, 114, 255, 0.45);
}

.core-readout {
  position: absolute; top: 50%; left: 50%; z-index: 2;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center;
  pointer-events: none;
}
.core-value {
  font-size: 34px; font-weight: 800; color: #FFFFFF;
  letter-spacing: var(--letter-spacing-tight);
  text-shadow: 0 0 24px rgba(120, 150, 255, 0.85);
  font-variant-numeric: tabular-nums;
}
.core-label {
  margin-top: 2px; font-size: 9px; font-weight: 700;
  letter-spacing: 0.32em; color: rgba(190, 205, 255, 0.6);
}

.legend { display: flex; gap: 14px; flex-wrap: wrap; }
.legend-item {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; color: rgba(205, 216, 255, 0.7);
}
.legend-item em { font-style: normal; color: rgba(205, 216, 255, 0.4); font-weight: 500; }
.legend-dot { width: 7px; height: 7px; border-radius: 50%; }

.hint {
  font-size: 10px; color: rgba(190, 205, 255, 0.42);
  letter-spacing: var(--letter-spacing-wide);
}

.galaxy-empty {
  position: absolute; inset: 0; z-index: 4;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
}
.empty-title { font-size: 14px; font-weight: 700; color: #E8EDFF; }
.empty-sub { font-size: 11px; color: rgba(200, 212, 255, 0.5); }

/* ===== 悬停信息卡 ===== */
.hover-tip {
  position: absolute; z-index: 5;
  width: 212px; padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(14, 20, 44, 0.88);
  border: 1px solid rgba(140, 165, 255, 0.28);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  pointer-events: none;
  display: flex; flex-direction: column; gap: 5px;
}
.tip-title {
  font-size: 12px; font-weight: 700; color: #F2F5FF;
  line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.tip-artist { font-size: 10px; color: rgba(200, 212, 255, 0.45); }
.tip-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px;
}
.tip-diff { font-weight: 700; }
.tip-metric { color: rgba(215, 225, 255, 0.8); font-variant-numeric: tabular-nums; }
.tip-muted { color: rgba(190, 205, 255, 0.5); }
.tip-strong { color: #9DB6FF; font-weight: 800; font-variant-numeric: tabular-nums; }

.tip-enter-active { transition: opacity 0.16s ease, transform 0.16s ease; }
.tip-leave-active { transition: opacity 0.1s ease; }
.tip-enter-from { opacity: 0; transform: translateY(4px); }
.tip-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .galaxy-card { animation: none; }
}
</style>
