<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />
    <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6">
        <router-link to="/cooking-logs" class="text-primary-600 hover:text-primary-700 mb-4 inline-block">
          ← 返回日志列表
        </router-link>
      </div>

      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        <p class="mt-4 text-gray-600">加载中...</p>
      </div>

      <div v-else-if="error" class="card bg-red-50 border border-red-200">
        <p class="text-red-800">{{ error }}</p>
        <router-link to="/cooking-logs" class="btn btn-secondary mt-4 inline-block">返回列表</router-link>
      </div>

      <div v-else-if="log" class="card">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 mb-2">{{ log.batch_no }}</h1>
            <span
              :class="[
                'px-4 py-2 rounded-full text-sm font-medium',
                log.status === 'PASS'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              ]"
            >
              {{ log.status === 'PASS' ? '✓ 通过' : '✗ 失败' }}
            </span>
          </div>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-sm text-gray-500">产品</p>
              <p class="text-lg font-medium">{{ log.product_name || `ID: ${log.product_id}` }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">操作员</p>
              <p class="text-lg font-medium">{{ log.operator_username || `ID: ${log.operator_id}` }}</p>
            </div>
          </div>

          <div class="border-t pt-4">
            <p class="text-sm text-gray-500 mb-1">核心温度</p>
            <div class="flex items-center gap-3">
              <span class="text-3xl font-bold" :class="log.status === 'PASS' ? 'text-green-600' : 'text-red-600'">
                {{ log.core_temp }}°C
              </span>
              <span v-if="log.status === 'FAIL'" class="text-sm text-red-600">
                (低于 CCP 限制 90.0°C)
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
            <div>
              <p class="text-sm text-gray-500">开始时间</p>
              <p class="text-lg font-medium">{{ formatDateTime(log.start_time) }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">结束时间</p>
              <p class="text-lg font-medium">{{ formatDateTime(log.end_time) }}</p>
            </div>
          </div>

          <div class="border-t pt-4">
            <p class="text-sm text-gray-500">创建时间</p>
            <p class="text-lg font-medium">{{ formatDateTime(log.created_at) }}</p>
          </div>

          <div v-if="log.status === 'FAIL'" class="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
            <div class="flex">
              <div class="flex-shrink-0">
                <ExclamationTriangleIcon class="h-5 w-5 text-red-400" />
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">偏差记录</h3>
                <div class="mt-2 text-sm text-red-700">
                  <p>此日志未通过 CCP 验证，需要创建偏差记录和纠正措施。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCookingLogsStore } from '@/stores/cookingLogs'
import NavBar from '@/components/NavBar.vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const route = useRoute()
const store = useCookingLogsStore()
const { loading, error, fetchLogById } = store

const logId = computed(() => parseInt(route.params.id as string))
const log = computed(() => store.logs.find(l => l.id === logId.value))

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(async () => {
  if (!log.value) {
    await fetchLogById(logId.value)
  }
})
</script>
