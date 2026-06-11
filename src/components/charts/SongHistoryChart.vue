<template>
  <div class="chart-container">
    <div ref="chartEl" class="chart-box" />
    <p v-if="noData" class="empty-text">暂无该曲目的游玩记录</p>
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
  if (props.records.length === 0) {
    noData.value = true;
    return;
  }

  const labels = props.records.map((_, i) => `#${i + 1}`);
  const achievements = props.records.map(r => +r.achievements.toFixed(2));
  const fastCounts = props.records.map(r => r.fastCount);
  const lateCounts = props.records.map(r => r.lateCount);

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['达成率', 'Fast', 'Late'],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 0,
    },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: '达成率 (%)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      {
        type: 'value',
        name: '判定数',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '达成率',
        type: 'line',
        data: achievements,
        smooth: true,
        lineStyle: { color: '#22c55e', width: 2 },
        itemStyle: { color: '#22c55e' },
      },
      {
        name: 'Fast',
        type: 'line',
        yAxisIndex: 1,
        data: fastCounts,
        lineStyle: { color: '#ef4444', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#ef4444' },
      },
      {
        name: 'Late',
        type: 'line',
        yAxisIndex: 1,
        data: lateCounts,
        lineStyle: { color: '#3b82f6', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#3b82f6' },
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
