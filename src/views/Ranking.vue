<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import EChart from '../components/EChart.vue'
import { colors, horizontalBars } from '../charts'
import { getRankingData, type RankingData } from '../api/ranking'

const ranking = ref<RankingData>({ domesticOrders: [], domesticHours: [], internationalOrders: [], internationalHours: [] })
const loading = ref(false)
const error = ref('')
const lastUpdated = ref('')
let timer: number | undefined
let controller: AbortController | undefined

const charts = computed(() => [
  { title: '国内 · 业务需求总工单排行', subtitle: '处理工单数 / 单', color: colors.purple, items: ranking.value.domesticOrders },
  { title: '国内 · 业务需求总工时排行', subtitle: '累计工时 / h', color: colors.cyan, items: ranking.value.domesticHours },
  { title: '国际 · 业务需求总工单排行', subtitle: '处理工单数 / 单', color: colors.blue, items: ranking.value.internationalOrders },
  { title: '国际 · 业务需求总工时排行', subtitle: '累计工时 / h', color: colors.pink, items: ranking.value.internationalHours },
])

async function refresh() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try {
    const data = await getRankingData(current.signal)
    if (current.signal.aborted) return
    ranking.value = data
    lastUpdated.value = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
  } catch (caught) {
    if (!current.signal.aborted) error.value = caught instanceof Error ? caught.message : '业务排行数据加载失败'
  } finally {
    if (controller === current) loading.value = false
  }
}

onMounted(() => { refresh(); timer = window.setInterval(refresh, 10 * 60 * 1000) })
onBeforeUnmount(() => { controller?.abort(); if (timer) window.clearInterval(timer) })
</script>

<template>
  <div class="screen-page ranking-page">
    <div class="page-heading compact-heading"><div><div class="eyebrow">技术支持中心 / 业绩分析</div><h1>业务排行</h1><p>按区域查看人员工单与工时表现</p></div><div class="heading-actions"><span class="live-dot" :class="{ 'is-error': error }"></span><span>{{ error ? '更新失败' : loading ? '正在更新' : 'BI 数据' }}</span><span v-if="lastUpdated" class="date-chip">上次成功更新 {{ lastUpdated }}</span><button class="refresh-button" title="刷新数据" aria-label="刷新数据" @click="refresh"><el-icon :size="17"><Refresh /></el-icon></button></div></div>
    <div v-if="error" class="data-error" role="status" aria-live="polite"><div><strong>{{ lastUpdated ? '刷新失败，已保留上次成功加载的数据' : '数据加载失败' }}</strong><span class="refresh-error-detail">{{ error }}</span><span v-if="lastUpdated" class="refresh-stale-note">当前内容为上次成功加载的数据，可能不是最新结果，请重试。</span></div><el-button link type="primary" @click="refresh">重试</el-button></div>
    <section class="ranking-grid">
      <div v-for="chart in charts" :key="chart.title" v-loading="loading && !lastUpdated" class="chart-panel ranking-panel">
        <div class="panel-header"><div><h2>{{ chart.title }}</h2><p>{{ chart.subtitle }}<span v-if="chart.items.length > 10"> · 向下滚动查看全部人员</span></p></div><span v-if="chart.items.length" class="panel-tag">{{ chart.items.length }} 人</span></div>
        <div class="ranking-chart-scroll" :tabindex="chart.items.length > 10 ? 0 : -1" role="region" :aria-label="`${chart.title}，共 ${chart.items.length} 人`">
          <div class="ranking-chart-inner" :style="{ height: chart.items.length > 10 ? `${chart.items.length * 32 + 48}px` : '100%' }">
            <EChart :option="horizontalBars(chart.items.map(item => item.name), chart.items.map(item => item.value), chart.color)" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
