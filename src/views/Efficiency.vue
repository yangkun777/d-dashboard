<script setup lang="ts">
import { computed } from 'vue'
import EChart from '../components/EChart.vue'
import { colors, horizontalBars } from '../charts'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { getEfficiencyData, type EfficiencyChartItem, type EfficiencyRow } from '../api/efficiency'

const rows = ref<EfficiencyRow[]>([])
const hourItems = ref<EfficiencyChartItem[]>([])
const orderItems = ref<EfficiencyChartItem[]>([])
const loading = ref(false)
const error = ref('')
const lastUpdated = ref('')
let timer: number | undefined
let controller: AbortController | undefined
const rowClassName = ({ row }: { row: EfficiencyRow }) => row.isTotal ? 'summary-row' : ''
const hourTotal = computed(() => hourItems.value.reduce((sum, item) => sum + item.value, 0))
const orderTotal = computed(() => orderItems.value.reduce((sum, item) => sum + item.value, 0))
const hourOption = computed(() => horizontalBars(hourItems.value.map(item => item.name), hourItems.value.map(item => item.value), colors.purple))
const orderOption = computed(() => horizontalBars(orderItems.value.map(item => item.name), orderItems.value.map(item => item.value), colors.cyan))

async function refresh() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try {
    const data = await getEfficiencyData(current.signal)
    if (current.signal.aborted) return
    hourItems.value = data.hours
    orderItems.value = data.orders
    rows.value = data.rows
    lastUpdated.value = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
  } catch (caught) {
    if (!current.signal.aborted) error.value = caught instanceof Error ? caught.message : '个人效能数据加载失败'
  } finally {
    if (controller === current) loading.value = false
  }
}

onMounted(() => { refresh(); timer = window.setInterval(refresh, 10 * 60 * 1000) })
onBeforeUnmount(() => { controller?.abort(); if (timer) window.clearInterval(timer) })
</script>

<template>
  <div class="screen-page efficiency-page">
    <div class="page-heading compact-heading"><div><div class="eyebrow">技术支持中心 / 人员表现</div><h1>个人效能</h1><p>对比工单处理量与预计工时，关注待办进度</p></div><div class="heading-actions"><span class="live-dot" :class="{ 'is-error': error }"></span><span>{{ error ? '更新失败' : loading ? '正在更新' : 'BI 数据' }}</span><span v-if="lastUpdated" class="date-chip">上次成功更新 {{ lastUpdated }}</span><button class="refresh-button" title="刷新数据" aria-label="刷新数据" @click="refresh"><el-icon :size="17"><Refresh /></el-icon></button></div></div>
    <div v-if="error" class="data-error" role="status" aria-live="polite"><div><strong>{{ lastUpdated ? '刷新失败，已保留上次成功加载的数据' : '数据加载失败' }}</strong><span class="refresh-error-detail">{{ error }}</span><span v-if="lastUpdated" class="refresh-stale-note">当前内容为上次成功加载的数据，可能不是最新结果，请重试。</span></div><el-button link type="primary" @click="refresh">重试</el-button></div>
    <div class="efficiency-layout">
      <section class="efficiency-charts">
        <div v-loading="loading && !lastUpdated" class="chart-panel"><div class="panel-header"><div><h2>工单处理工时分布</h2><p>按人员统计累计工时 / h</p></div><span class="panel-tag">累计 {{ hourTotal }} h</span></div><EChart :option="hourOption"/></div>
        <div v-loading="loading && !lastUpdated" class="chart-panel"><div class="panel-header"><div><h2>工单处理数量分布</h2><p>按人员统计已处理工单 / 单</p></div><span class="panel-tag">累计 {{ orderTotal }} 单</span></div><EChart :option="orderOption"/></div>
      </section>
      <section class="chart-panel efficiency-table-panel"><div class="panel-header"><div><h2>工单处理工时明细</h2><p>人员待办、预计完成工时与档期排行 · 每 10 分钟更新</p></div><span v-if="lastUpdated" class="panel-tag">上次成功更新 {{ lastUpdated }}</span></div>
        <div v-if="error" class="table-error"><span>{{ error }}</span><el-button link type="primary" @click="refresh">重试</el-button></div>
        <div class="efficiency-table-wrap"><el-table v-loading="loading && !lastUpdated" :data="rows" :row-class-name="rowClassName" class="dark-table" height="100%" stripe empty-text="暂无工单数据"><el-table-column prop="name" label="人员" min-width="85"/><el-table-column prop="pending" label="待处理工单" min-width="105"><template #default="scope"><span class="number-emphasis">{{ scope.row.pending }}</span> 单</template></el-table-column><el-table-column prop="hours" label="预计完成工时 (h)" min-width="135"><template #default="scope">{{ scope.row.hours.toFixed(2) }}</template></el-table-column><el-table-column prop="deadline" label="档期排行" min-width="125"/></el-table></div>
      </section>
    </div>
  </div>
</template>
