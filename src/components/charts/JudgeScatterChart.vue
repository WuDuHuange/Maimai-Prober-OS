<template>
  <div class="chart-container">
    <div ref="chartEl" class="chart-box" />
    <p v-if="noData" class="empty-text">暂无判定数据</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useECharts } from '@/composables/useECharts';
import * as echarts from 'echarts';
import type { PlayRecord } from '@/types/playRecord';

const props = defineProps<{
  records: PlayRecord[];
}>();

const chartEl = ref<HTMLElement | null>(null);
const noData = ref(false);
const { setOption } = useECharts(chartEl);

onMounted(() => {
  const filtered = props.records.filter(r => r.fastCount > 0 || r.lateCount > 0);
  if (filtered.length === 0) {
    noData.value = true;
    return;
  }

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
});
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

.empty-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
