import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "dashboard",
    component: () => import("@/views/DashboardView.vue"),
  },
  {
    path: "/song/:songId",
    name: "song-detail",
    component: () => import("@/views/SongDetailView.vue"),
  },
  {
    path: "/weekly",
    name: "weekly",
    component: () => import("@/views/WeeklyView.vue"),
  },
  {
    path: "/sync-log",
    name: "sync-log",
    component: () => import("@/views/SyncLogView.vue"),
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsView.vue"),
  },
  {
    path: "/practice-plan",
    name: "practice-plan",
    component: () => import("@/views/PracticePlanView.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
