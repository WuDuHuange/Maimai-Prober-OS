<template>
  <div class="chart-container">
    <div ref="chartEl" class="chart-box" />
    <p v-if="noData" class="empty-text">暂无 B50 数据</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useECharts } from '@/composables/useECharts';
import * as echarts from 'echarts';
import { useB50Store } from '@/stores/useB50Store';

const chartEl = ref<HTMLElement | null>(null);
const noData = ref(false);
const { setOption } = useECharts(chartEl);

onMounted(async () => {
  const b50Store = useB50Store();
  await b50Store.loadFromDB();
  const list = b50Store.b50List;

  if (list.length === 0) {
    noData.value = true;
    return;
  }

  // Group by constant range
  const buckets = new Map<string, { count: number; songs: string[]; totalContribution: number }>();
  for (const item of list) {
    const c = item.constant ?? 0;
    const key = `${Math.floor(c)}.0-${Math.floor(c)}.9`;
    if (!buckets.has(key)) buckets.set(key, { count: 0, songs: [], totalContribution: 0 });
    const b = buckets.get(key)!;
    b.count++;
    b.songs.push(item.title ?? '');
    b.totalContribution += item.ratingContribution ?? 0;
  }

  // Sort buckets by constant range
  const sorted = Array.from(buckets.entries())
    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = params[0];
        if (!p) return '';
        const bucket = sorted[p.dataIndex];
        if (!bucket) return '';
        const [range, data] = bucket;
        const songs = data.songs.slice(0, 8).join(', ');
        return `<b>定数 ${range}</b><br/>曲数: ${data.count}<br/>贡献: ${data.totalContribution.toFixed(1)}<br/>曲目: ${songs}${data.songs.length > 8 ? '...' : ''}`;
      },
    },
    grid: { left: 50, right: 20, top: 10, bottom: 30 },
    xAxis: {
      type: 'category',
      data: sorted.map(([k]) => k),
      axisLine: { lineStyle: { color: '#E8ECF0' } },
      axisLabel: { color: '#64748B', fontSize: 10, rotate: 45 },
    },
    yAxis: {
      type: 'value',
      name: '曲数',
      nameTextStyle: { color: '#64748B', fontSize: 10 },
      axisLine: { lineStyle: { color: '#E8ECF0' } },
      axisLabel: { color: '#64748B', fontSize: 10 },
      splitLine: { lineStyle: { color: '#F0F2F5' } },
    },
    series: [{
      type: 'bar',
      data: sorted.map(([, v]) => v.count),
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#A67CFF' },
          { offset: 1, color: '#4A72FF' },
        ]),
      },
      barMaxWidth: 40,
    }],
  };

  setOption(option);
});
</script>

<style scoped>
.chart-container { position: relative; width: 100%; height: 100%; min-height: 200px; }
.chart-box { width: 100%; height: 100%; }
.empty-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }
</style>
