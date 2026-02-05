import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { cookingLogsApi, type CookingLogResponse, type CookingLogCreate } from '@/api/cookingLogs'

export const useCookingLogsStore = defineStore('cookingLogs', () => {
  const logs = ref<CookingLogResponse[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const passLogs = computed(() => logs.value.filter(log => log.status === 'PASS'))
  const failLogs = computed(() => logs.value.filter(log => log.status === 'FAIL'))

  async function fetchLogs() {
    loading.value = true
    error.value = null
    try {
      logs.value = await cookingLogsApi.getAll()
    } catch (err: any) {
      error.value = err.response?.data?.detail || err.message || '获取日志失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchLogById(id: number) {
    loading.value = true
    error.value = null
    try {
      const log = await cookingLogsApi.getById(id)
      const index = logs.value.findIndex(l => l.id === id)
      if (index >= 0) {
        logs.value[index] = log
      } else {
        logs.value.push(log)
      }
      return log
    } catch (err: any) {
      error.value = err.response?.data?.detail || err.message || '获取日志失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createLog(data: CookingLogCreate) {
    loading.value = true
    error.value = null
    try {
      const newLog = await cookingLogsApi.create(data)
      logs.value.unshift(newLog)
      return newLog
    } catch (err: any) {
      error.value = err.response?.data?.detail || err.message || '创建日志失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    logs,
    loading,
    error,
    passLogs,
    failLogs,
    fetchLogs,
    fetchLogById,
    createLog,
  }
})
