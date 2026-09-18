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
          <h2 class="galaxy-title">Rating 判定盘</h2>
          <p class="galaxy-sub">
            maimai PRiSM 主题 · 内环 B15 / 外环 B35 · 牌高 = {{ metricLabel }}
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

        <!-- 图例 -->
        <div class="overlay overlay-bl legend">
          <span v-for="d in legendItems" :key="d.key" class="legend-item">
            <i class="legend-dot" :style="{ background: d.color }" />
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
            <span v-if="hovered.artist" class="tip-artist">{{ hovered.artist }}</span>
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

/** maimai 难度色（在明亮判定盘上保持高饱和辨识度） */
const DIFF_COLOR: Record<DifficultyType, string> = {
  basic: '#22C55E',
  advanced: '#F5B301',
  expert: '#EF4444',
  master: '#8B5CF6',
  remaster: '#EC4899',
};

const DIFF_SHORT: Record<DifficultyType, string> = {
  basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM',
};

/* ===== 主题常量（PRiSM：蓝紫 → 粉的糖果天空 + 淡黄判定环） ===== */
const SKY_STOPS: Array<[number, string]> = [
  [0.00, '#3D2A78'],
  [0.34, '#6B4A9E'],
  [0.62, '#A868B0'],
  [0.84, '#DC90BA'],
  [1.00, '#F0C4D8'],
];
const RING_COLOR = 0xf5e68a;   // 判定盘主环（淡黄）
const DISK_RADIUS = 21;
const RING_RADIUS: Record<'new' | 'old', number> = { new: 8.6, old: 15.2 };
const NOTE_SIZE: Record<'new' | 'old', number> = { new: 1.3, old: 1.06 };
const NOTE_BASE_Y = 1.8;
const NOTE_RISE = 11;

/** 水平视场角基准：保证判定盘在窄卡片里不会被裁掉（对应 aspect≈0.96 时 vFov=45°） */
const BASE_H_FOV = 43.4;
const MAX_V_FOV = 62;

const b50Store = useB50Store();
const playerStore = usePlayerStore();

const hostEl = ref<HTMLDivElement | null>(null);
const cardEl = ref<HTMLDivElement | null>(null);
const metric = ref<MetricKey>('ra');
const hovered = ref<B50Record | null>(null);
const tipPos = ref({ x: 0, y: 0 });

const items = computed(() => b50Store.b50List);
const isEmptyPending = ref(true);
const isEmpty = computed(() => !isEmptyPending.value && items.value.length === 0);
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
let userInteracting = false;
let hoverPaused = false;

const pickables: THREE.Mesh[] = [];
let bloomPass: UnrealBloomPass | null = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
let pointerClient = { x: 0, y: 0 };
let pointerInside = false;

/** 悬停时从盘心拉出的 slide 弧线 */
let hoverArcMesh: THREE.Mesh | null = null;
const ARC_SEGMENTS = 28;

/** 需要随场景释放的共享几何 */
const sharedGeometries: THREE.BufferGeometry[] = [];

let noteGroup: THREE.Group | null = null;
let skyGroup: THREE.Group | null = null;
let coreGroup: THREE.Group | null = null;
const floaters: Array<{ obj: THREE.Object3D; phase: number; amp: number; spin: number }> = [];
const clouds: Array<{ sprite: THREE.Sprite; speed: number; span: number }> = [];

function metricValue(r: B50Record): number {
  if (metric.value === 'const') return r.constant ?? 0;
  if (metric.value === 'acc') return r.achievements;
  return r.ratingContribution ?? 0;
}

/* ============ 贴图工厂 ============ */
/** PRiSM 天空：竖直渐变 + 低透明斜向格纹（CiRCLE 的网格语言） */
function makeSkyTexture(): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const g = ctx.createLinearGradient(0, 0, size * 0.25, size);
  for (const [pos, color] of SKY_STOPS) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // 斜向格纹
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += 58) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + size, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }
  ctx.restore();

  // 顶部柔光
  const glow = ctx.createRadialGradient(size * 0.5, size * 0.18, 0, size * 0.5, size * 0.18, size * 0.62);
  glow.addColorStop(0, 'rgba(255,255,255,0.30)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 云朵：一组圆拼出轮廓（底边压平、顶部隆起），再柔化边缘 */
function makeCloudTexture(): THREE.Texture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // 云体：底部对齐到 y≈190，顶部隆起
  const puffs: Array<[number, number, number]> = [
    [128, 168, 46],
    [180, 148, 62],
    [246, 136, 76],
    [312, 150, 62],
    [366, 168, 48],
    [104, 180, 34],
    [392, 182, 32],
  ];

  ctx.save();
  ctx.filter = 'blur(9px)';
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.99)');
    g.addColorStop(0.62, 'rgba(255,251,255,0.88)');
    g.addColorStop(1, 'rgba(255,248,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 压平底边
  ctx.filter = 'blur(7px)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(248, 192, 152, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 整体淡出边缘，避免出现方形边界
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(256, 150, 40, 256, 150, 210);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.72, 'rgba(0,0,0,0.9)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 圆点（刻度点 / 星尘） */
function makeDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.42, 'rgba(255,252,240,0.62)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 盘心 Rating 读数（Sprite 贴图） */
function makeTextTexture(main: string, sub: string): THREE.Texture {
  const w = 640;
  const h = 320;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '700 34px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(62, 34, 104, 0.60)';
  ctx.fillText('R A T I N G', w / 2, 74);

  ctx.font = '800 138px "Segoe UI", system-ui, sans-serif';
  ctx.shadowColor = 'rgba(255,255,255,0.95)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#33205C';
  ctx.fillText(main, w / 2, 182);

  ctx.shadowBlur = 0;
  ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(62, 34, 104, 0.52)';
  ctx.fillText(sub, w / 2, 268);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ============ 几何工厂 ============ */
/** maimai 音符造型：圆角方块 */
function roundedSquareShape(size: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const h = size / 2;
  const r = Math.min(radius, h * 0.92);
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h);
  shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r);
  shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h);
  shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r);
  shape.quadraticCurveTo(-h, -h, -h + r, -h);
  return shape;
}

/** 四角星（内凹弧边） */
function createSparkShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const outer = 1;
  const inner = 0.2;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    pts.push(new THREE.Vector2(Math.cos(a) * outer, Math.sin(a) * outer));
  }
  const controls: THREE.Vector2[] = [];
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2 - Math.PI / 2;
    controls.push(new THREE.Vector2(Math.cos(a) * inner, Math.sin(a) * inner));
  }
  shape.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < 4; i++) {
    const next = pts[(i + 1) % 4];
    shape.quadraticCurveTo(controls[i].x, controls[i].y, next.x, next.y);
  }
  return shape;
}

/** 装饰性 slide 弧线：沿判定盘外沿扫过一段，中段抬起（CiRCLE 的红 / 蓝滑条） */
function buildSlideArc(startAngle: number, sweep: number, lift: number, color: number, parent: THREE.Object3D) {
  const seg = 44;
  const baseR = RING_RADIUS.old + 2.8;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = startAngle + sweep * t;
    const r = baseR + Math.sin(t * Math.PI) * 1.0;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.3 + Math.sin(t * Math.PI) * lift, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.13, 6, false);
  sharedGeometries.push(tubeGeo);
  parent.add(new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.82, depthWrite: false,
  })));

  // 末端音符圆点
  const dotGeo = new THREE.SphereGeometry(0.34, 14, 12);
  sharedGeometries.push(dotGeo);
  const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  dot.position.copy(pts[pts.length - 1]);
  parent.add(dot);

  // 起点圆点
  const dot2 = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  dot2.position.copy(pts[0]);
  parent.add(dot2);
}

/* ============ 场景构建 ============ */
function buildScene() {
  const host = hostEl.value;
  if (!host) return;

  const width = host.clientWidth || 800;
  const height = host.clientHeight || 520;

  scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.FogExp2(0xB98BC0, 0.0082);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 400);
  camera.position.set(0, 34, 41);
  updateCameraFov(width / height);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 20;
  controls.maxDistance = 88;
  controls.maxPolarAngle = Math.PI * 0.44;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.34;
  controls.addEventListener('start', () => {
    window.clearTimeout(autoRotateTimer);
    userInteracting = true;
    syncAutoRotate();
  });
  controls.addEventListener('end', () => {
    window.clearTimeout(autoRotateTimer);
    autoRotateTimer = window.setTimeout(() => {
      userInteracting = false;
      syncAutoRotate();
    }, 2200);
  });

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));

  const keyLight = new THREE.DirectionalLight(0xfff4ff, 1.35);
  keyLight.position.set(10, 34, 20);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xc9a8ff, 0.85);
  rimLight.position.set(-22, 16, -20);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xffd9ea, 420, 120, 2);
  fillLight.position.set(0, 8, 0);
  scene.add(fillLight);

  buildSky();
  buildDisk();
  buildCore();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // 亮色场景下只让高光泛光，避免整体过曝
  bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.42, 0.6, 0.74);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  resizeObserver = new ResizeObserver(() => handleResize());
  resizeObserver.observe(host);

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  rebuildNotes();
  animate();
}

/** 天空层：云朵 + 星尘 + 漂浮四角星 */
function buildSky() {
  const s = scene;
  if (!s) return;
  skyGroup = new THREE.Group();
  s.add(skyGroup);

  // 云朵（贴近地平线，从盘面外围望出去能看到）
  const cloudTex = makeCloudTexture();
  const cloudDefs: Array<[number, number, number, number, number]> = [
    [-44, 5.5, -34, 26, 0.62],
    [42, 8.5, -36, 22, 0.52],
    [-28, 12, 42, 21, 0.48],
    [52, 3.5, 26, 19, 0.44],
    [6, 16, -52, 28, 0.36],
    [-56, 2.5, 6, 18, 0.4],
  ];
  for (const [x, y, z, scale, opacity] of cloudDefs) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false,
    }));
    sprite.position.set(x, y, z);
    sprite.scale.set(scale, scale * 0.5, 1);
    skyGroup.add(sprite);
    clouds.push({ sprite, speed: 0.28 + Math.random() * 0.24, span: 132 });
  }

  // 星尘
  const count = 520;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 42 + Math.random() * 78;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.6 + 16;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  sharedGeometries.push(dustGeo);
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 1.35,
    map: makeDotTexture(),
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    sizeAttenuation: true,
    fog: false,
  }));
  skyGroup.add(dust);

  // 漂浮四角星
  const sparkGeo = new THREE.ExtrudeGeometry(createSparkShape(), {
    depth: 0.16,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 1,
  });
  sparkGeo.translate(0, 0, -0.08);
  sharedGeometries.push(sparkGeo);

  const sparkColors = [0xffffff, 0xfff3b0, 0xffd6ea, 0xd8c8ff];
  for (let i = 0; i < 26; i++) {
    const size = 0.42 + Math.random() * 0.5;
    const mesh = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
      color: sparkColors[i % sparkColors.length],
      transparent: true,
      opacity: 0.5 + Math.random() * 0.4,
      depthWrite: false,
      fog: false,
    }));
    const r = 17 + Math.random() * 30;
    const a = Math.random() * Math.PI * 2;
    mesh.position.set(Math.cos(a) * r, 2 + Math.random() * 24, Math.sin(a) * r);
    mesh.scale.setScalar(size);
    mesh.rotation.z = Math.random() * Math.PI;
    skyGroup.add(mesh);
    floaters.push({
      obj: mesh,
      phase: Math.random() * Math.PI * 2,
      amp: 0.5 + Math.random() * 1.1,
      spin: (Math.random() - 0.5) * 0.5,
    });
  }
}

/** 判定盘：外环 + 同心虚线圆 + 8 向辐射轨道 + 刻度点 */
function buildDisk() {
  const s = scene;
  if (!s) return;
  const dg = new THREE.Group();
  s.add(dg);

  // 盘下的光池：让判定盘看起来是悬浮在天空里的一块平台
  const poolGeo = new THREE.PlaneGeometry(DISK_RADIUS * 3.1, DISK_RADIUS * 3.1);
  sharedGeometries.push(poolGeo);
  const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
    map: makeGlowTexture(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -0.6;
  dg.add(pool);

  // 底盘（中心白 → 边缘淡粉的径向渐变，比纯色更有判定盘的"面"感）
  const diskGeo = new THREE.CircleGeometry(DISK_RADIUS, 128);
  sharedGeometries.push(diskGeo);
  const disk = new THREE.Mesh(diskGeo, new THREE.MeshBasicMaterial({
    map: makeDiskTexture(),
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  disk.rotation.x = -Math.PI / 2;
  dg.add(disk);

  // 外圈淡黄粗环（判定环）
  const ringGeo = new THREE.RingGeometry(DISK_RADIUS - 1.5, DISK_RADIUS - 0.12, 160);
  sharedGeometries.push(ringGeo);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: RING_COLOR,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  dg.add(ring);

  // 判定环外沿的柔光
  const glowRingGeo = new THREE.RingGeometry(DISK_RADIUS - 0.12, DISK_RADIUS + 0.5, 160);
  sharedGeometries.push(glowRingGeo);
  const glowRing = new THREE.Mesh(glowRingGeo, new THREE.MeshBasicMaterial({
    color: 0xFFF8D0,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = 0.05;
  dg.add(glowRing);

  // 盘的最外沿描边：把判定盘的轮廓从天空里"切"出来
  const edgeRingGeo = new THREE.RingGeometry(DISK_RADIUS + 0.5, DISK_RADIUS + 0.72, 160);
  sharedGeometries.push(edgeRingGeo);
  const edgeRing = new THREE.Mesh(edgeRingGeo, new THREE.MeshBasicMaterial({
    color: 0xC98BC0,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  edgeRing.rotation.x = -Math.PI / 2;
  edgeRing.position.y = 0.05;
  dg.add(edgeRing);

  // 内侧白色细环
  const thinGeo = new THREE.RingGeometry(DISK_RADIUS - 2.15, DISK_RADIUS - 2.03, 160);
  sharedGeometries.push(thinGeo);
  const thin = new THREE.Mesh(thinGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  thin.rotation.x = -Math.PI / 2;
  thin.position.y = 0.06;
  dg.add(thin);

  // 中心小环
  const centerGeo = new THREE.RingGeometry(3.5, 3.62, 96);
  sharedGeometries.push(centerGeo);
  const centerRing = new THREE.Mesh(centerGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  centerRing.rotation.x = -Math.PI / 2;
  centerRing.position.y = 0.06;
  dg.add(centerRing);

  // 同心虚线圆（CiRCLE 标志性元素）
  for (const [radius, dotSize] of [[5.6, 0.15], [11.8, 0.17], [18.8, 0.19]] as const) {
    const seg = Math.max(48, Math.round(radius * 8));
    const pts = new Float32Array(seg * 3);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts[i * 3] = Math.cos(a) * radius;
      pts[i * 3 + 1] = 0.07;
      pts[i * 3 + 2] = Math.sin(a) * radius;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    sharedGeometries.push(g);
    const dots = new THREE.Points(g, new THREE.PointsMaterial({
      size: dotSize * 3.4,
      map: makeDotTexture(),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    dg.add(dots);
  }

  // 8 向辐射轨道
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const trackGeo = new THREE.PlaneGeometry(DISK_RADIUS - 1.6, 0.055);
    sharedGeometries.push(trackGeo);
    const track = new THREE.Mesh(trackGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: i % 2 === 0 ? 0.34 : 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    track.rotation.x = -Math.PI / 2;
    track.rotation.z = -a;
    track.position.set(Math.cos(a) * (DISK_RADIUS - 1.6) / 2, 0.06, Math.sin(a) * (DISK_RADIUS - 1.6) / 2);
    dg.add(track);
  }

  // 外缘刻度点
  const tickCount = 48;
  const tickPts = new Float32Array(tickCount * 3);
  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2;
    const r = DISK_RADIUS - 1.85;
    tickPts[i * 3] = Math.cos(a) * r;
    tickPts[i * 3 + 1] = 0.09;
    tickPts[i * 3 + 2] = Math.sin(a) * r;
  }
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPts, 3));
  sharedGeometries.push(tickGeo);
  dg.add(new THREE.Points(tickGeo, new THREE.PointsMaterial({
    size: 0.55,
    map: makeDotTexture(),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  })));

  // B15 / B35 分区底色：内环淡紫、外环淡粉，与图例呼应
  const innerZoneGeo = new THREE.CircleGeometry(RING_RADIUS.new + 1.6, 96);
  sharedGeometries.push(innerZoneGeo);
  const innerZone = new THREE.Mesh(innerZoneGeo, new THREE.MeshBasicMaterial({
    color: 0xB79BFF,
    transparent: true,
    opacity: 0.20,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  innerZone.rotation.x = -Math.PI / 2;
  innerZone.position.y = 0.02;
  dg.add(innerZone);

  const outerZoneGeo = new THREE.RingGeometry(RING_RADIUS.new + 1.6, RING_RADIUS.old + 1.7, 128);
  sharedGeometries.push(outerZoneGeo);
  const outerZone = new THREE.Mesh(outerZoneGeo, new THREE.MeshBasicMaterial({
    color: 0xFFA8D2,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  outerZone.rotation.x = -Math.PI / 2;
  outerZone.position.y = 0.02;
  dg.add(outerZone);

  // 装饰性 slide 弧线（CiRCLE 的红 / 蓝滑条，平贴盘面微抬）
  buildSlideArc(4.1, 1.3, 1.5, 0xEF4444, dg);
  buildSlideArc(0.70, 1.05, 1.2, 0x3B82F6, dg);

  // 内外环轨道圈（音符所在环）
  (['new', 'old'] as const).forEach(kind => {
    const r = RING_RADIUS[kind];
    const g = new THREE.RingGeometry(r - 0.05, r + 0.05, 128);
    sharedGeometries.push(g);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: kind === 'new' ? 0xA78BFA : 0xF9A8D4,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.08;
    dg.add(mesh);
  });
}

/** 盘心发光核心 */
function buildCore() {
  const s = scene;
  if (!s) return;
  coreGroup = new THREE.Group();
  s.add(coreGroup);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: false,
  }));
  halo.scale.set(20, 20, 1);
  halo.position.y = 1.2;
  coreGroup.add(halo);

  // 中心十字（maimai 判定盘的圆心定位）
  const barGeo = new THREE.PlaneGeometry(1.5, 0.08);
  sharedGeometries.push(barGeo);
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    bar.rotation.x = -Math.PI / 2;
    bar.rotation.z = (i * Math.PI) / 2;
    bar.position.y = 0.12;
    coreGroup.add(bar);
  }

  // Rating 读数
  const rating = playerStore.currentRating || b50Store.computedRating;
  const main = rating > 0 ? Math.round(rating).toLocaleString() : '----';
  const sub = playerStore.currentRating > 0 ? '官方 Rating' : 'Best 50 合计';
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeTextTexture(main, sub),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
  }));
  sprite.scale.set(12.6, 6.3, 1);
  sprite.position.y = 1.5;
  sprite.renderOrder = 10;
  coreGroup.add(sprite);
}

/** 判定盘底盘：中心亮白 → 边缘淡粉的径向渐变 */
function makeDiskTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.00, 'rgba(255,252,254,0.88)');
  g.addColorStop(0.34, 'rgba(255,242,250,0.72)');
  g.addColorStop(0.68, 'rgba(253,222,240,0.54)');
  g.addColorStop(0.90, 'rgba(246,200,228,0.40)');
  g.addColorStop(1.00, 'rgba(238,184,220,0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 中心光晕贴图 */
function makeGlowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.28, 'rgba(255,236,180,0.42)');
  g.addColorStop(0.62, 'rgba(255,210,235,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ============ 音符（B50 数据） ============ */
let plateGeo: Record<'new' | 'old', THREE.ExtrudeGeometry> | null = null;
let plateEdgeGeo: Record<'new' | 'old', THREE.BufferGeometry> | null = null;
let padGeo: Record<'new' | 'old', THREE.ExtrudeGeometry> | null = null;
let beamGeo: THREE.CylinderGeometry | null = null;

function ensureNoteGeometries() {
  if (plateGeo) return;

  plateGeo = { new: new THREE.ExtrudeGeometry(roundedSquareShape(NOTE_SIZE.new, NOTE_SIZE.new * 0.3), {
    depth: 0.28, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2,
  }), old: new THREE.ExtrudeGeometry(roundedSquareShape(NOTE_SIZE.old, NOTE_SIZE.old * 0.3), {
    depth: 0.28, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2,
  }) };

  padGeo = { new: new THREE.ExtrudeGeometry(roundedSquareShape(NOTE_SIZE.new * 1.5, NOTE_SIZE.new * 0.42), {
    depth: 0.1, bevelEnabled: false,
  }), old: new THREE.ExtrudeGeometry(roundedSquareShape(NOTE_SIZE.old * 1.5, NOTE_SIZE.old * 0.42), {
    depth: 0.1, bevelEnabled: false,
  }) };

  const edgeGeo: Record<'new' | 'old', THREE.BufferGeometry | null> = { new: null, old: null };
  (['new', 'old'] as const).forEach(kind => {
    const shape = roundedSquareShape(NOTE_SIZE[kind], NOTE_SIZE[kind] * 0.3);
    const pts = shape.getPoints(26).map(p => new THREE.Vector3(p.x, p.y, 0.152));
    edgeGeo[kind] = new THREE.BufferGeometry().setFromPoints(pts);
  });
  plateEdgeGeo = { new: edgeGeo.new!, old: edgeGeo.old! };

  plateGeo.new.translate(0, 0, -0.14);
  plateGeo.old.translate(0, 0, -0.14);
  beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);

  sharedGeometries.push(
    plateGeo.new, plateGeo.old,
    padGeo.new, padGeo.old,
    plateEdgeGeo.new, plateEdgeGeo.old,
    beamGeo,
  );
}

/** 按当前指标重建音符阵（数据或维度变化时调用） */
function rebuildNotes() {
  const s = scene;
  if (!s) return;
  ensureNoteGeometries();

  let ng = noteGroup;
  if (!ng) {
    ng = new THREE.Group();
    noteGroup = ng;
    s.add(ng);
  }

  // 清理旧音符（几何体共享，只释放材质）
  for (const child of ng.children) {
    const mat = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => m.dispose());
  }
  ng.clear();
  pickables.length = 0;

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
    const size = NOTE_SIZE[kind];
    const step = (Math.PI * 2) / Math.max(group.length, 1);
    // 旧曲环相位错开，避免与外环视觉对齐
    const phase = kind === 'old' ? Math.PI / Math.max(group.length, 1) : 0;

    group.forEach((record, i) => {
      const value = metricValue(record);
      const norm = span < 1e-6 ? 0.5 : (value - min) / span;
      const centerY = NOTE_BASE_Y + norm * NOTE_RISE;
      const angle = i * step + phase;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const base = new THREE.Color(DIFF_COLOR[record.difficulty] ?? '#8B5CF6');

      // 光柱（细，作为"高度指示线"，不抢判定盘的主体）
      const beamHeight = centerY - 0.1;
      const beamMat = new THREE.MeshBasicMaterial({
        color: base.clone().lerp(new THREE.Color('#ffffff'), 0.3),
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(beamGeo!, beamMat);
      beam.scale.set(size * 0.13, beamHeight, size * 0.13);
      beam.position.set(x, beamHeight / 2 + 0.1, z);
      beam.userData.record = record;
      ng.add(beam);

      // 盘面落点
      const padMat = new THREE.MeshBasicMaterial({
        color: base,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
      const pad = new THREE.Mesh(padGeo![kind], padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, 0.14, z);
      ng.add(pad);

      // 音符牌（立起，正面朝外）
      const plateMat = new THREE.MeshStandardMaterial({
        color: base,
        emissive: base,
        emissiveIntensity: 0.22,
        roughness: 0.34,
        metalness: 0.05,
      });
      const plate = new THREE.Mesh(plateGeo![kind], plateMat);
      plate.position.set(x, centerY, z);
      plate.rotation.y = Math.PI / 2 - angle;
      plate.userData.record = record;
      plate.userData.baseY = centerY;
      plate.userData.beam = beam;
      plate.userData.baseOpacity = 0.38;
      ng.add(plate);
      pickables.push(plate);

      // 白色描边
      const edge = new THREE.LineLoop(plateEdgeGeo![kind], new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }));
      edge.position.copy(plate.position);
      edge.rotation.copy(plate.rotation);
      plate.userData.edge = edge;
      ng.add(edge);
    });
  });
}

function setMetric(key: MetricKey) {
  if (metric.value === key) return;
  metric.value = key;
  clearHover();
  rebuildNotes();
}

/* ============ 交互 ============ */
function syncAutoRotate() {
  if (!controls) return;
  controls.autoRotate = !userInteracting && !hoverPaused;
}

function setHoverPaused(v: boolean) {
  if (hoverPaused === v) return;
  hoverPaused = v;
  syncAutoRotate();
}

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
  clearHover();
}

function clearHover() {
  for (const mesh of pickables) {
    if (mesh.userData.hovered) {
      mesh.userData.hovered = false;
      mesh.scale.setScalar(1);
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.22;
      const beam = mesh.userData.beam as THREE.Mesh | undefined;
      if (beam) {
        const bm = beam.material as THREE.MeshBasicMaterial;
        bm.opacity = (mesh.userData.baseOpacity as number) ?? 0.38;
      }
    }
  }
  hovered.value = null;
  disposeHoverArc();
  setHoverPaused(false);
}

function updateHover() {
  if (!camera || !pointerInside) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);

  if (hits.length === 0) {
    if (hovered.value) clearHover();
    return;
  }

  const mesh = hits[0].object as THREE.Mesh;
  if (mesh.userData.hovered) {
    // 已高亮，仅刷新 tooltip 位置
    updateTipPos();
    return;
  }

  clearHover();
  mesh.userData.hovered = true;
  mesh.scale.setScalar(1.32);
  const plateMat = mesh.material as THREE.MeshStandardMaterial;
  plateMat.emissiveIntensity = 0.9;

  const beam = mesh.userData.beam as THREE.Mesh | undefined;
  if (beam) {
    const bm = beam.material as THREE.MeshBasicMaterial;
    bm.opacity = 0.82;
  }

  // slide 弧线：从盘心抛向该音符（用实体管，细线在 WebGL 里宽度不可控）
  const record = mesh.userData.record as B50Record;
  buildHoverArc(mesh.position, DIFF_COLOR[record.difficulty] ?? '#ffffff');

  hovered.value = record;
  setHoverPaused(true);
  updateTipPos();
}

/** 悬停弧线：每次目标变化时重建（频率低，可接受） */
function buildHoverArc(target: THREE.Vector3, colorHex: string) {
  const s = scene;
  if (!s) return;
  disposeHoverArc();

  const lift = Math.max(3.4, target.y * 0.55);
  const origin = new THREE.Vector3(0, 0.5, 0);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const p = new THREE.Vector3().lerpVectors(origin, target, t);
    p.y += Math.sin(t * Math.PI) * lift;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 48, 0.12, 6, false);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    fog: false,
  }));
  mesh.renderOrder = 5;
  s.add(mesh);
  hoverArcMesh = mesh;
}

function disposeHoverArc() {
  if (!hoverArcMesh) return;
  scene?.remove(hoverArcMesh);
  hoverArcMesh.geometry.dispose();
  (hoverArcMesh.material as THREE.Material).dispose();
  hoverArcMesh = null;
}

function updateTipPos() {
  const host = hostEl.value;
  if (!host) return;
  // 信息卡宽度随容器降级（见 @container 规则），偏移量给足以免盖住音符牌
  const cw = host.clientWidth;
  const tipW = cw < 440 ? 168 : cw < 640 ? 196 : 218;
  const tipH = 152;
  const maxX = Math.max(12, cw - tipW - 14);
  const maxY = Math.max(12, host.clientHeight - tipH - 14);
  tipPos.value = {
    x: Math.max(12, Math.min(pointerClient.x + 38, maxX)),
    y: Math.max(12, Math.min(pointerClient.y + 28, maxY)),
  };
}

/* ============ 渲染循环 ============ */
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;

  if (controls) controls.update();

  // 云朵漂移
  for (const c of clouds) {
    c.sprite.position.x += c.speed * dt;
    if (c.sprite.position.x > c.span / 2) c.sprite.position.x = -c.span / 2;
  }

  // 四角星漂浮 + 自转
  for (const f of floaters) {
    f.obj.position.y += Math.sin(t * 0.6 + f.phase) * f.amp * dt * 0.6;
    f.obj.rotation.z += f.spin * dt;
  }

  // 音符轻微浮动（悬停中的那个不动，避免"抓不住"）
  for (const mesh of pickables) {
    if (mesh.userData.hovered) continue;
    const baseY = mesh.userData.baseY as number;
    mesh.position.y = baseY + Math.sin(t * 0.85 + baseY * 0.4) * 0.14;
    const edge = mesh.userData.edge as THREE.LineLoop | undefined;
    if (edge) edge.position.y = mesh.position.y;
  }

  updateHover();
  if (composer) composer.render();
}

function handleResize() {
  const host = hostEl.value;
  if (!host || !renderer || !camera || !composer) return;
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (w === 0 || h === 0) return;
  const aspect = w / h;
  camera.aspect = aspect;
  updateCameraFov(aspect);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass?.setSize(w, h);
}

/**
 * 卡片变窄时保持水平视场角恒定（等比放大垂直 FOV），
 * 否则 aspect 变小会让判定盘左右被裁掉；垂直 FOV 上限避免出现鱼眼畸变。
 */
function updateCameraFov(aspect: number) {
  if (!camera) return;
  const hHalf = THREE.MathUtils.degToRad(BASE_H_FOV) / 2;
  const vHalf = Math.atan(Math.tan(hHalf) / Math.max(aspect, 0.2));
  camera.fov = Math.min(THREE.MathUtils.radToDeg(2 * vHalf), MAX_V_FOV);
  camera.updateProjectionMatrix();
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
    const mat = anyObj.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => m.dispose());
  });
  for (const g of sharedGeometries) g.dispose();
  sharedGeometries.length = 0;
  disposeHoverArc();

  scene = null;
  camera = null;
  bloomPass = null;
  noteGroup = null;
  skyGroup = null;
  coreGroup = null;
  pickables.length = 0;
  floaters.length = 0;
  clouds.length = 0;
  plateGeo = null;
  plateEdgeGeo = null;
  padGeo = null;
  beamGeo = null;
}

/* ============ 工具 ============ */
function diffColor(d: DifficultyType) { return DIFF_COLOR[d] ?? '#8B5CF6'; }
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
  background: linear-gradient(165deg, #3D2A78 0%, #6B4A9E 38%, #A868B0 66%, #F7CFDD 100%);
  box-shadow: var(--shadow-xl);
  border: 1px solid rgba(255, 255, 255, 0.35);
  animation: galaxy-enter 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  /* 浮层按卡片自身宽度自适应，而不是按视口 */
  container-type: inline-size;
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
  font-size: 15px; font-weight: 800; color: #FFFFFF;
  letter-spacing: var(--letter-spacing-tight);
  text-shadow: 0 2px 14px rgba(60, 30, 100, 0.6);
}
.galaxy-sub {
  margin-top: 4px; font-size: 11px; color: rgba(255, 255, 255, 0.78);
  letter-spacing: var(--letter-spacing-wide);
  text-shadow: 0 1px 10px rgba(60, 30, 100, 0.55);
}

.metric-switch {
  display: flex; gap: 2px; padding: 3px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: var(--radius-full);
  box-shadow: 0 6px 20px rgba(60, 30, 100, 0.18);
}
.metric-btn {
  padding: 6px 14px; border: none; border-radius: var(--radius-full);
  background: transparent; color: rgba(58, 33, 96, 0.62);
  font-size: 11px; font-weight: 600; cursor: pointer;
  transition: all var(--transition-smooth);
  letter-spacing: var(--letter-spacing-normal);
}
.metric-btn:hover { color: #3A2160; }
.metric-btn.active {
  background: linear-gradient(135deg, #7C4DFF, #E85BB0);
  color: white;
  box-shadow: 0 4px 14px rgba(124, 77, 255, 0.4);
}

.legend {
  display: flex; gap: 14px; flex-wrap: wrap;
  padding: 7px 14px;
  background: rgba(255, 255, 255, 0.66);
  border-radius: var(--radius-full);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 6px 18px rgba(60, 30, 100, 0.14);
}
.legend-item {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; color: rgba(50, 28, 88, 0.82);
}
.legend-item em { font-style: normal; color: rgba(50, 28, 88, 0.45); font-weight: 500; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }

.hint {
  font-size: 10px; color: rgba(72, 40, 120, 0.72);
  letter-spacing: var(--letter-spacing-wide);
  text-shadow: 0 1px 8px rgba(255, 255, 255, 0.7);
}

.galaxy-empty {
  position: absolute; inset: 0; z-index: 4;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
}
.empty-title { font-size: 14px; font-weight: 700; color: #FFFFFF; }
.empty-sub { font-size: 11px; color: rgba(255, 255, 255, 0.7); }

/* ===== 悬停信息卡（浅色卡片，与明亮场景呼应） ===== */
.hover-tip {
  position: absolute; z-index: 6;
  width: 218px; padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(124, 77, 255, 0.22);
  box-shadow: 0 18px 44px rgba(58, 30, 100, 0.26);
  pointer-events: none;
  display: flex; flex-direction: column; gap: 5px;
}
.tip-title {
  font-size: 12px; font-weight: 700; color: #2E1B4E;
  line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.tip-artist { font-size: 10px; color: rgba(46, 27, 78, 0.5); }
.tip-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px;
}
.tip-diff { font-weight: 700; }
.tip-metric { color: rgba(46, 27, 78, 0.8); font-variant-numeric: tabular-nums; }
.tip-muted { color: rgba(46, 27, 78, 0.48); }
.tip-strong { color: #7C4DFF; font-weight: 800; font-variant-numeric: tabular-nums; }

.tip-enter-active { transition: opacity 0.16s ease, transform 0.16s ease; }
.tip-leave-active { transition: opacity 0.1s ease; }
.tip-enter-from { opacity: 0; transform: translateY(4px); }
.tip-leave-to { opacity: 0; }

/* ===== 窄卡片降级：标题与维度切换改为上下堆叠，图例/提示收起 =====
   640px 是实测临界值：再窄下去标题（含副标题）会与右侧维度切换重叠 */
@container (max-width: 640px) {
  .overlay-tl { top: 16px; left: 16px; }
  .overlay-tr { top: 54px; right: auto; left: 16px; }
  .galaxy-sub { display: none; }
  .legend { display: none; }
  .hint { display: none; }
  .metric-btn { padding: 5px 10px; font-size: 10px; }
  .hover-tip { width: 196px; padding: 10px 12px; }
  .tip-title { font-size: 11px; }
}

@container (max-width: 440px) {
  .galaxy-title { font-size: 13px; }
  .metric-switch { flex-wrap: wrap; }
  .metric-btn { padding: 4px 8px; font-size: 9.5px; }
  .hover-tip { width: 168px; }
}

@media (prefers-reduced-motion: reduce) {
  .galaxy-card { animation: none; }
}
</style>
