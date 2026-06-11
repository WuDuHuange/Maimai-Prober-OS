import * as echarts from 'echarts';
import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';

export function useECharts(chartRef: Ref<HTMLElement | null>, theme: 'dark' | 'light' = 'dark') {
  const chartInstance = ref<echarts.ECharts | null>(null);

  function initChart() {
    if (!chartRef.value) return;
    if (chartInstance.value) {
      chartInstance.value.dispose();
    }
    chartInstance.value = echarts.init(chartRef.value, theme);
  }

  function setOption(option: echarts.EChartsOption, notMerge = true) {
    chartInstance.value?.setOption(option, notMerge);
  }

  function handleResize() {
    chartInstance.value?.resize();
  }

  onMounted(() => {
    initChart();
    window.addEventListener('resize', handleResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    chartInstance.value?.dispose();
    chartInstance.value = null;
  });

  return { chartInstance, setOption, handleResize, initChart };
}
