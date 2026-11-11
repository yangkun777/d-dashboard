<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import EChart from '../components/EChart.vue'
import { donut } from '../charts'
import { getProductLines, type ProductLine } from '../api/products'
import { isRequestCancelled, useSlowRefresh } from '../api/slow-refresh'

const lines = ref<ProductLine[]>([])
const loading = ref(false)
const error = ref('')
const lastUpdated = ref('')
let timer: number | undefined

const { refresh, dispose, isCurrent } = useSlowRefresh(async signal => {
  loading.value = true
  error.value = ''
  try {
    const data = await getProductLines(signal)
    if (signal.aborted) return
    lines.value = data
    lastUpdated.value = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
  } catch (caught) {
    if (isRequestCancelled(signal)) return
    error.value = caught instanceof Error ? caught.message : '产品线事项加载失败'
  } finally {
    if (isCurrent(signal)) loading.value = false
  }
})

onMounted(() => { void refresh(); timer = window.setInterval(() => void refresh(), 10 * 60 * 1000) })
onBeforeUnmount(() => { dispose(); if (timer) window.clearInterval(timer) })
</script>

<template>
  <div class="screen-page product-page">
    <div class="page-heading compact-heading"><div><div class="eyebrow">高松技术支持中心 / 产品线分析</div><h1>产品线事项</h1><p>按事业部查看工单事项类型与占比</p></div><div class="heading-actions"><span class="live-dot" :class="{ 'is-error': error }"></span><span>{{ error ? '更新失败' : loading ? '正在更新' : 'BI 数据' }}</span><span v-if="lastUpdated" class="date-chip">上次成功更新 {{ lastUpdated }}</span><button class="refresh-button" title="刷新数据" aria-label="刷新数据" @click="refresh"><el-icon :size="17"><Refresh /></el-icon></button></div></div>
    <div v-if="error" class="data-error" role="status" aria-live="polite"><div><strong>{{ lastUpdated ? '刷新失败，已保留上次成功加载的数据' : '数据加载失败' }}</strong><span class="refresh-error-detail">{{ error }}</span><span v-if="lastUpdated" class="refresh-stale-note">当前内容为上次成功加载的数据，可能不是最新结果，请重试。</span></div><el-button link type="primary" @click="refresh">重试</el-button></div>
    <section v-if="lines.length" class="product-grid"><div v-for="line in lines" :key="line.name" class="chart-panel product-panel"><div class="panel-header"><div><h2>{{ line.name }}</h2><p>共 {{ line.total }} 项事项</p></div><span class="panel-tag">{{ line.total }} 项</span></div><div class="product-body"><EChart class="product-chart" :option="donut(line.data, `${line.total} 项`, true)"/></div></div></section>
    <div v-else class="overview-state">{{ loading ? '正在读取 BI 产品线事项…' : '暂时无法显示产品线事项' }}</div>
  </div>
</template>
