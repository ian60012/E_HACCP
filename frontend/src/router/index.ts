import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/cooking-logs',
    name: 'CookingLogs',
    component: () => import('@/views/CookingLogsView.vue'),
  },
  {
    path: '/cooking-logs/new',
    name: 'NewCookingLog',
    component: () => import('@/views/NewCookingLogView.vue'),
  },
  {
    path: '/cooking-logs/:id',
    name: 'CookingLogDetail',
    component: () => import('@/views/CookingLogDetailView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
