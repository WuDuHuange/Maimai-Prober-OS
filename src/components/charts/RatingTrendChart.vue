<template>
  <div class="chart-container">
    <div ref="chartEl" class="chart-box" />
    <p v-if="noData" class="empty-text">暂无数据</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useECharts } from '@/composables/useECharts';
import * as echarts from 'echarts';
import { usePlayLogStore } from '@/stores/usePlayLogStore';

const props = defineProps<{
  days?: number;
}>();

const chartEl = ref<HTMLElement | null>(null);
const noData = ref(false);
const { setOption } = useECharts(chartEl);

async function loadData() {
  const store = usePlayLogStore();
  const data = await store.getRatingTrend(props.days ?? 90);

  if (data.length === 0) {
    noData.value = true;
    return;
  }
  noData.value = false;

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0];
        return `日期: ${p.axisValue}<br/>Rating: <b>${p.value.toFixed(0)}</b>`;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Rating',
      nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        type: 'line',
        data: data.map(d => [d.playDate, d.rating]),
        smooth: true,
        lineStyle: { color: '#6366f1', width: 2 },
        itemStyle: { color: '#6366f1' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
            { offset: 1, color: 'rgba(99, 102, 241, 0.02)' },
          ]),
        },
      },
    ],
    dataZoom: [
      { type: 'slider', start: 0, end: 100, bottom: 0, height: 20, borderColor: '#475569' },
      { type: 'inside' },
    ],
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
  };

  setOption(option);
}

onMounted(loadData);
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
