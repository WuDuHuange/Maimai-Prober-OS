<template>
  <div class="chart-container">
    <div ref="chartEl" class="chart-box" />
    <p v-if="noData" class="empty-text">暂无 B50 数据，请先同步</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useECharts } from '@/composables/useECharts';
import * as echarts from 'echarts';
import { useB50Store } from '@/stores/useB50Store';

const chartEl = ref<HTMLElement | null>(null);
const noData = ref(false);
const { setOption } = useECharts(chartEl);

async function loadChart() {
  const b50Store = useB50Store();
  await b50Store.loadFromDB();
  const list = b50Store.b50List;

  if (list.length === 0) { noData.value = true; return; }
  noData.value = false;

  // Sort by contribution descending, take top 50
  const items = [...list].sort((a, b) => (b.ratingContribution || 0) - (a.ratingContribution || 0)).slice(0, 50);

  const names = items.map((_, i) => `#${i + 1}`);
  const values = items.map(i => +(i.ratingContribution || 0).toFixed(1));
  const tooltipData = items.map((i) => {
    const c = i.constant?.toFixed(1) ?? '?';
    const ach = i.achievements.toFixed(2);
    return `${i.title ?? '未知'} [${i.difficulty.toUpperCase()} ${c}] ${ach}%`;
  });

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = params[0];
        if (!p) return '';
        const idx = p.dataIndex;
        return `${tooltipData[idx]}<br/>Rating 贡献: <b>${values[idx]}</b>`;
      },
    },
    grid: { left: 40, right: 20, top: 10, bottom: 20 },
    xAxis: {
      type: 'value',
      name: '贡献值',
      nameTextStyle: { color: '#64748B', fontSize: 10 },
      axisLine: { lineStyle: { color: '#E8ECF0' } },
      axisLabel: { color: '#64748B', fontSize: 9 },
      splitLine: { lineStyle: { color: '#F0F2F5' } },
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLine: { lineStyle: { color: '#E8ECF0' } },
      axisLabel: { color: '#64748B', fontSize: 9 },
    },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: {
        borderRadius: [0, 6, 6, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#4A72FF' },
          { offset: 1, color: '#A67CFF' },
        ]),
      },
      barMaxWidth: 16,
    }],
    dataZoom: [
      { type: 'slider', yAxisIndex: 0, start: 0, end: 100, width: 12, borderColor: '#E8ECF0', right: 0 },
      { type: 'inside', yAxisIndex: 0 },
    ],
  };

  setOption(option);
}

const b50Store = useB50Store();
watch(() => b50Store.b50List.length, () => { loadChart(); });
onMounted(loadChart);
</script>

<style scoped>
.chart-container { position: relative; width: 100%; height: 100%; min-height: 400px; }
.chart-box { width: 100%; height: 100%; }
.empty-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }
</style>
