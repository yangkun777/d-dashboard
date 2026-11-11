<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { TrendCharts, Tickets, Timer, Warning, Refresh } from '@element-plus/icons-vue'
import EChart from '../components/EChart.vue'
import DataEmpty from '../components/DataEmpty.vue'
import { colors, donut, horizontalBars } from '../charts'
import { getOverviewData, type OverviewData } from '../api/overview'
import { isRequestCancelled, useSlowRefresh } from '../api/slow-refresh'

const overview = ref<OverviewData | null>(null)
const loading = ref(false)
const error = ref('')
const lastUpdated = ref('')
let timer: number | undefined

const { refresh, dispose, isCurrent } = useSlowRefresh(async signal => {
  loading.value = true
  error.value = ''
  try {
    const data = await getOverviewData(signal)
    if (signal.aborted) return
    overview.value = data
    lastUpdated.value = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
  } catch (caught) {
    if (isRequestCancelled(signal)) return
    error.value = caught instanceof Error ? caught.message : '运营总览数据加载失败'
  } finally {
    if (isCurrent(signal)) loading.value = false
  }
})

onMounted(() => { refresh(); timer = window.setInterval(refresh, 10 * 60 * 1000) })
onBeforeUnmount(() => { dispose(); if (timer) window.clearInterval(timer) })

const formatNumber = (value: number, digits = 0) => value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const formatChange = (value: number) => `${value < 0 ? '↘' : '↗'} ${formatNumber(Math.abs(value), value % 1 ? 1 : 0)}%`
const metrics = computed(() => {
  const data = overview.value?.metrics
  if (!data) return []
  const alertTriggered = overview.value?.alert?.triggered ?? false
  return [
    { title: '本月工单总量', value: formatNumber(data.totalOrders), unit: '单', change: data.totalGrowth, icon: Tickets, tone: 'purple' },
    { title: '日均工单量', value: formatNumber(data.dailyAverage, 1), unit: '单', change: data.dailyGrowth, icon: TrendCharts, tone: 'gold' },
    { title: '待处理工单数', value: formatNumber(data.pendingOrders), unit: '单', change: data.pendingGrowth, icon: Warning, tone: 'pink', lowerIsBetter: true, alert: alertTriggered },
    { title: '本月预计总工时', value: formatNumber(data.expectedHours), unit: 'h', change: data.hoursGrowth, icon: Timer, tone: 'teal' },
  ]
})

const valueLabel = { show: true, position: 'top' as const, color: colors.text, fontSize: 11 }
const volumeOption = computed<EChartsOption>(() => {
  const flow = [...(overview.value?.flow ?? [])]
  const totalIndex = flow.findIndex(item => item.name === '合计')
  if (totalIndex > 0) flow.unshift(...flow.splice(totalIndex, 1))
  return {
    color: [colors.purple, colors.cyan, colors.gold],
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#DCE6EF', textStyle: { color: colors.text } },
    legend: { right: 12, top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: colors.muted, fontSize: 11 } },
    grid: { left: 40, right: 17, top: 48, bottom: 30 },
    xAxis: { type: 'category', data: flow.map(item => item.name), axisLine: { lineStyle: { color: '#D9E1EA' } }, axisTick: { show: false }, axisLabel: { color: colors.muted, fontSize: 11 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#E7EDF3' } }, axisLabel: { color: colors.muted, fontSize: 11 } },
    series: [
      { name: '待处理', type: 'bar', barWidth: 14, data: flow.map(item => item.pending), itemStyle: { borderRadius: [3,3,0,0] }, label: valueLabel },
      { name: '完成', type: 'bar', barWidth: 14, data: flow.map(item => item.completed), itemStyle: { borderRadius: [3,3,0,0] }, label: valueLabel },
      { name: '净增', type: 'line', smooth: .3, symbolSize: 7, data: flow.map(item => item.net), lineStyle: { width: 3 }, itemStyle: { color: colors.gold }, label: valueLabel },
    ],
  }
})
const categoryOption = computed(() => {
  const items = overview.value?.categories ?? []
  return horizontalBars(items.map(item => item.name), items.map(item => item.value), colors.blue)
})
const productOption = computed(() => {
  const items = overview.value?.products ?? []
  return donut(items, `${items.reduce((sum, item) => sum + item.value, 0)} 单`)
})
const urgencyOption = computed(() => {
  const items = overview.value?.urgency ?? []
  return donut(items, `${items.reduce((sum, item) => sum + item.value, 0)} 单`)
})
const categoryTotal = computed(() => overview.value?.categories.reduce((sum, item) => sum + item.value, 0) ?? 0)
const topCategoryPercent = computed(() => {
  const items = [...(overview.value?.categories ?? [])].sort((a, b) => b.value - a.value)
  if (!categoryTotal.value) return '0%'
  const topThree = items.slice(0, 3).reduce((sum, item) => sum + item.value, 0)
  return `${Math.round(topThree / categoryTotal.value * 100)}%`
})
const hasCategoryData = computed(() => overview.value?.categories.some(item => item.value > 0) ?? false)
const urgentPercent = computed(() => {
  const items = overview.value?.urgency ?? []
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return total ? `${((items.find(item => item.name === '紧急')?.value ?? 0) / total * 100).toFixed(2)}%` : '0%'
})
</script>

<template>
  <div class="screen-page overview-page">
    <div class="page-heading">
      <div><div class="eyebrow">高松技术支持中心 / 数据驾驶舱</div><h1>运营总览</h1><p>掌握工单流量、处理进度与业务分布</p></div>
      <div class="heading-actions"><span class="live-dot" :class="{ 'is-error': error }"></span><span>{{ error ? '更新失败' : loading ? '正在更新' : 'BI 数据' }}</span><span v-if="lastUpdated" class="date-chip">上次成功更新 {{ lastUpdated }}</span><button class="refresh-button" title="刷新数据" aria-label="刷新数据" @click="refresh"><el-icon :size="17"><Refresh /></el-icon></button></div>
    </div>
    <div v-if="error" class="data-error" role="status" aria-live="polite"><div><strong>{{ lastUpdated ? '刷新失败，已保留上次成功加载的数据' : '数据加载失败' }}</strong><span class="refresh-error-detail">{{ error }}</span><span v-if="lastUpdated" class="refresh-stale-note">当前内容为上次成功加载的数据，可能不是最新结果，请重试。</span></div><el-button link type="primary" @click="refresh">重试</el-button></div>
    <template v-if="overview">
      <section class="metric-grid">
        <div v-for="metric in metrics" :key="metric.title" class="metric-card" :class="[metric.tone, { 'metric-alert': metric.alert }]">
          <div class="metric-head"><span>{{ metric.title }}</span><span class="metric-icon"><el-icon :size="20"><component :is="metric.icon" /></el-icon></span></div>
          <div class="metric-value">{{ metric.value }}<small>{{ metric.unit }}</small></div>
          <div class="metric-footer"><span class="trend-pill" :class="{ negative: metric.lowerIsBetter ? metric.change > 0 : metric.change < 0 }">{{ formatChange(metric.change) }}</span><span>较上期变化</span></div>
        </div>
      </section>
      <section class="overview-charts">
        <div class="chart-panel flow-panel"><div class="panel-header"><div><h2>工单流量</h2><p>按处理人统计的工单进度</p></div><span class="panel-tag">{{ overview.flow.filter(item => item.name !== '合计').length }} 位处理人</span></div><EChart :option="volumeOption" /></div>
        <div class="chart-panel category-panel"><div class="panel-header"><div><h2>事项分布</h2><p>当前工单分类</p></div><span class="panel-tag">共 {{ categoryTotal }} 项</span></div><EChart v-if="hasCategoryData" :option="categoryOption" /><DataEmpty v-else /><div v-if="hasCategoryData" class="category-footnote"><span>合计：{{ categoryTotal }} 项</span><span>前3类占比：{{ topCategoryPercent }}</span></div></div>
        <div class="chart-panel donut-panel"><div class="panel-header"><div><h2>各产品线工单分布</h2><p>不同事业部占比</p></div></div><EChart :option="productOption" /></div>
        <div class="chart-panel donut-panel"><div class="panel-header"><div><h2>紧急程度</h2><p>按工单优先级统计</p></div><span class="panel-tag">紧急 {{ urgentPercent }}</span></div><EChart :option="urgencyOption" /></div>
      </section>
    </template>
    <div v-else class="overview-state">{{ loading ? '正在读取 BI 运营数据…' : '暂时无法显示运营数据' }}</div>
  </div>
</template>
