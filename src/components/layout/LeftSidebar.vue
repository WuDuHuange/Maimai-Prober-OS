<template>
  <aside class="left-sidebar">
    <nav class="flex flex-col gap-1 p-2">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: $route.path === item.path }"
      >
        <span class="text-sm">{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="px-3 mt-4">
      <p class="text-xs text-text-muted mb-1">曲库搜索</p>
      <slot name="search" />
    </div>
  </aside>
</template>

<script setup lang="ts">
const navItems = [
  { path: '/', label: '看板' },
  { path: '/weekly', label: '周报' },
  { path: '/sync-log', label: '同步日志' },
  { path: '/practice-plan', label: '练习计划' },
  { path: '/settings', label: '设置' },
];
</script>

<style scoped>
.left-sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--bg-hover);
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.nav-item {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}

.nav-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background-color: var(--color-primary);
  color: white;
}
</style>
