<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold text-gray-900">烹饪日志</h1>
        <router-link to="/cooking-logs/new" class="btn btn-primary">
          + 新建日志
        </router-link>
      </div>

      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        <p class="mt-4 text-gray-600">加载中...</p>
      </div>

      <div v-else-if="error" class="card bg-red-50 border border-red-200">
        <p class="text-red-800">{{ error }}</p>
        <button @click="fetchLogs" class="btn btn-secondary mt-4">重试</button>
      </div>

      <div v-else-if="logs.length === 0" class="card text-center py-12">
        <p class="text-gray-600 mb-4">暂无日志记录</p>
        <router-link to="/cooking-logs/new" class="btn btn-primary">
          创建第一条日志
        </router-link>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="log in logs"
          :key="log.id"
          class="card hover:shadow-lg transition-shadow cursor-pointer"
          @click="$router.push(`/cooking-logs/${log.id}`)"
        >
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-lg font-semibold">{{ log.batch_no }}</h3>
                <span
                  :class="[
                    'px-3 py-1 rounded-full text-sm font-medium',
                    log.status === 'PASS'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  ]"
                >
                  {{ log.status === 'PASS' ? '通过' : '失败' }}
                </span>
              </div>
              <p class="text-gray-600 mb-2">
                <span class="font-medium">产品:</span> {{ log.product_name || `ID: ${log.product_id}` }}
              </p>
              <p class="text-gray-600 mb-2">
                <span class="font-medium">操作员:</span> {{ log.operator_username || `ID: ${log.operator_id}` }}
              </p>
              <div class="flex gap-6 text-sm text-gray-500">
                <span>
                  <span class="font-medium">核心温度:</span> {{ log.core_temp }}°C
                </span>
                <span>
                  <span class="font-medium">开始时间:</span> {{ formatDateTime(log.start_time) }}
                </span>
                <span>
                  <span class="font-medium">结束时间:</span> {{ formatDateTime(log.end_time) }}
                </span>
              </div>
            </div>
            <ChevronRightIcon class="h-6 w-6 text-gray-400" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useCookingLogsStore } from '@/stores/cookingLogs'
import NavBar from '@/components/NavBar.vue'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'

const store = useCookingLogsStore()
const { logs, loading, error, fetchLogs } = store

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  fetchLogs()
})
</script>
