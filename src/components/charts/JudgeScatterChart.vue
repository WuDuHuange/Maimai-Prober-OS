<template>
  <div class="chart-container">
    <div ref="chartEl" class="chart-box" />
    <div v-if="noData" class="empty-state-overlay">
      <svg class="empty-icon-sm" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
      <p class="empty-title-sm">判定数据不可用</p>
      <p class="empty-desc-sm">水鱼 API 不返回 Fast / Late 明细<br/>建议使用官方查分器获取判定偏差</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useECharts } from '@/composables/useECharts';
import * as echarts from 'echarts';
import type { PlayRecord } from '@/types/playRecord';

const props = defineProps<{
  records: PlayRecord[];
}>();

const chartEl = ref<HTMLElement | null>(null);
const noData = ref(false);
const { setOption } = useECharts(chartEl);

function renderChart() {
  const filtered = props.records.filter(r => r.fastCount > 0 || r.lateCount > 0);
  if (filtered.length === 0) {
    noData.value = true;
    return;
  }
  noData.value = false;

  const scatterData = filtered.map((r, i) => ({
    value: [i + 1, r.fastCount - r.lateCount],
    itemStyle: {
      color: r.fastCount >= r.lateCount ? '#ef4444' : '#3b82f6',
    },
  }));

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const v = params.data?.value;
        if (!v) return '';
        return `第 ${v[0]} 次游玩<br/>Fast-Late: <b>${v[1] > 0 ? '+' : ''}${v[1]}</b><br/>${v[1] > 0 ? '偏快' : v[1] < 0 ? '偏慢' : '平衡'}`;
      },
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'value',
      name: '游玩次数',
      nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Fast - Late',
      nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        type: 'scatter',
        data: scatterData,
        symbolSize: 10,
      },
      {
        type: 'line',
        data: [
          [0, 0],
          [filtered.length + 1, 0],
        ],
        lineStyle: { color: '#64748b', width: 1, type: 'dashed' },
        showSymbol: false,
        silent: true,
      },
    ],
  };

  setOption(option);
}

onMounted(() => {
  renderChart();
});

// 数据异步返回后重新渲染图表
watch(() => props.records, () => {
  renderChart();
}, { deep: true });
</script>

<style scoped>
.chart-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
}

.chart-box {
  width: 100%;
  height: 100%;
}

.empty-state-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.empty-icon-sm { color: var(--text-muted); opacity: 0.6; }
.empty-title-sm { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
.empty-desc-sm { font-size: 11px; color: var(--text-muted); text-align: center; line-height: 1.5; }
</style>
