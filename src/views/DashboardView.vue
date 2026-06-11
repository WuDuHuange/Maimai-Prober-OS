<template>
  <div class="dashboard p-4 flex flex-col gap-4 h-full overflow-y-auto">
    <!-- Rating 趋势 -->
    <section class="chart-card">
      <h2 class="card-title">Rating 趋势</h2>
      <div class="h-[240px]">
        <RatingTrendChart />
      </div>
    </section>

    <!-- B50 列表 -->
    <section class="chart-card">
      <h2 class="card-title">Best 50</h2>
      <B50Table />
    </section>
  </div>
</template>

<script setup lang="ts">
import RatingTrendChart from '@/components/charts/RatingTrendChart.vue';
import B50Table from '@/components/b50/B50Table.vue';
</script>

<style scoped>
.chart-card {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}
</style>

<script setup lang="ts">
</script>
