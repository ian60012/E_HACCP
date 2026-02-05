<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />
    <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6">
        <router-link to="/cooking-logs" class="text-primary-600 hover:text-primary-700 mb-4 inline-block">
          ← 返回日志列表
        </router-link>
        <h1 class="text-3xl font-bold text-gray-900">新建烹饪日志</h1>
      </div>

      <form @submit.prevent="handleSubmit" class="card">
        <div class="space-y-6">
          <div>
            <label for="batch_no" class="label">批次号 *</label>
            <input
              id="batch_no"
              v-model="form.batch_no"
              type="text"
              required
              class="input"
              placeholder="例如: BATCH-2024-001"
            />
            <p v-if="errors.batch_no" class="mt-1 text-sm text-red-600">{{ errors.batch_no }}</p>
          </div>

          <div>
            <label for="product_id" class="label">产品 ID *</label>
            <input
              id="product_id"
              v-model.number="form.product_id"
              type="number"
              required
              min="1"
              class="input"
              placeholder="例如: 1"
            />
            <p class="mt-1 text-sm text-gray-500">提示: 请先在数据库中创建产品记录</p>
            <p v-if="errors.product_id" class="mt-1 text-sm text-red-600">{{ errors.product_id }}</p>
          </div>

          <div>
            <label for="operator_id" class="label">操作员 ID *</label>
            <input
              id="operator_id"
              v-model.number="form.operator_id"
              type="number"
              required
              min="1"
              class="input"
              placeholder="例如: 1"
            />
            <p class="mt-1 text-sm text-gray-500">提示: 请先在数据库中创建用户记录</p>
            <p v-if="errors.operator_id" class="mt-1 text-sm text-red-600">{{ errors.operator_id }}</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="start_time" class="label">开始时间 *</label>
              <input
                id="start_time"
                v-model="form.start_time"
                type="datetime-local"
                required
                class="input"
              />
              <p v-if="errors.start_time" class="mt-1 text-sm text-red-600">{{ errors.start_time }}</p>
            </div>

            <div>
              <label for="end_time" class="label">结束时间 *</label>
              <input
                id="end_time"
                v-model="form.end_time"
                type="datetime-local"
                required
                class="input"
              />
              <p v-if="errors.end_time" class="mt-1 text-sm text-red-600">{{ errors.end_time }}</p>
            </div>
          </div>

          <div>
            <label for="core_temp" class="label">核心温度 (°C) *</label>
            <input
              id="core_temp"
              v-model.number="form.core_temp"
              type="number"
              required
              step="0.1"
              min="0"
              max="200"
              class="input"
              placeholder="例如: 95.0"
            />
            <p class="mt-1 text-sm text-gray-500">
              CCP 限制: 90.0°C | 
              <span v-if="form.core_temp >= 90" class="text-green-600 font-medium">✓ 通过</span>
              <span v-else-if="form.core_temp > 0" class="text-red-600 font-medium">✗ 失败 (需要偏差记录)</span>
            </p>
            <p v-if="errors.core_temp" class="mt-1 text-sm text-red-600">{{ errors.core_temp }}</p>
          </div>

          <div v-if="form.core_temp > 0 && form.core_temp < 90" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <ExclamationTriangleIcon class="h-5 w-5 text-yellow-400" />
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-yellow-800">CCP 验证失败</h3>
                <div class="mt-2 text-sm text-yellow-700">
                  <p>核心温度 {{ form.core_temp }}°C 低于 CCP 限制 90.0°C。</p>
                  <p class="mt-1">系统将自动创建偏差记录，请准备纠正措施。</p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-4 pt-4">
            <button
              type="submit"
              :disabled="loading"
              class="btn btn-primary flex-1"
            >
              <span v-if="loading">提交中...</span>
              <span v-else>提交日志</span>
            </button>
            <router-link to="/cooking-logs" class="btn btn-secondary">
              取消
            </router-link>
          </div>
        </div>
      </form>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useCookingLogsStore } from '@/stores/cookingLogs'
import NavBar from '@/components/NavBar.vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const store = useCookingLogsStore()
const { loading, createLog } = store

const form = reactive({
  batch_no: '',
  product_id: 1,
  operator_id: 1,
  start_time: new Date().toISOString().slice(0, 16),
  end_time: new Date(Date.now() + 90 * 60 * 1000).toISOString().slice(0, 16),
  core_temp: 0,
})

const errors = ref<Record<string, string>>({})

function validateForm(): boolean {
  errors.value = {}

  if (!form.batch_no.trim()) {
    errors.value.batch_no = '批次号不能为空'
  }

  if (!form.product_id || form.product_id < 1) {
    errors.value.product_id = '请输入有效的产品 ID'
  }

  if (!form.operator_id || form.operator_id < 1) {
    errors.value.operator_id = '请输入有效的操作员 ID'
  }

  if (!form.start_time) {
    errors.value.start_time = '请选择开始时间'
  }

  if (!form.end_time) {
    errors.value.end_time = '请选择结束时间'
  }

  if (new Date(form.start_time) >= new Date(form.end_time)) {
    errors.value.end_time = '结束时间必须晚于开始时间'
  }

  if (!form.core_temp || form.core_temp <= 0) {
    errors.value.core_temp = '请输入有效的核心温度'
  }

  return Object.keys(errors.value).length === 0
}

async function handleSubmit() {
  if (!validateForm()) {
    return
  }

  try {
    const logData = {
      ...form,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
    }

    const newLog = await createLog(logData)
    router.push(`/cooking-logs/${newLog.id}`)
  } catch (err) {
    // Error is handled by the store
    console.error('Failed to create log:', err)
  }
}
</script>
