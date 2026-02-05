<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">
          FD Catering HACCP eQMS System
        </h1>
        <p class="text-xl text-gray-600 mb-8">
          电子质量管理系统 - HACCP 合规性追踪
        </p>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <router-link
            to="/cooking-logs/new"
            class="card hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div class="text-center">
              <div class="text-4xl mb-4">🔥</div>
              <h3 class="text-xl font-semibold mb-2">烹饪日志</h3>
              <p class="text-gray-600">记录烹饪批次和核心温度</p>
            </div>
          </router-link>
          
          <router-link
            to="/cooking-logs"
            class="card hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div class="text-center">
              <div class="text-4xl mb-4">📋</div>
              <h3 class="text-xl font-semibold mb-2">查看日志</h3>
              <p class="text-gray-600">查看所有烹饪日志记录</p>
            </div>
          </router-link>
          
          <div class="card hover:shadow-lg transition-shadow cursor-pointer opacity-50">
            <div class="text-center">
              <div class="text-4xl mb-4">❄️</div>
              <h3 class="text-xl font-semibold mb-2">冷却日志</h3>
              <p class="text-gray-600">即将推出</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import NavBar from '@/components/NavBar.vue'
</script>
