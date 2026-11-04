<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, Refresh, Download, Setting, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import { getOrders, type OrderFilters, type OrderRow } from '../api/orders'
import { isRequestCancelled, useSlowRefresh } from '../api/slow-refresh'
import DataEmpty from '../components/DataEmpty.vue'


const columnOptions = [{"key": "id", "label": "工单编号"}, {"key": "handler", "label": "办理人"}, {"key": "region", "label": "区域"}, {"key": "name", "label": "工单名称"}, {"key": "applicant", "label": "申请人"}, {"key": "date", "label": "申请日期"}, {"key": "customerCode", "label": "客户代码"}, {"key": "salesforceNo", "label": "SF商机号"}, {"key": "product", "label": "产品名称"}, {"key": "division", "label": "产品所属事业部"}, {"key": "category", "label": "事项分类"}, {"key": "status", "label": "事项状态"}, {"key": "quantity", "label": "数量"}, {"key": "quantityType", "label": "数量分类"}, {"key": "hours", "label": "工时 (h)"}, {"key": "urgency", "label": "紧急程度"}, {"key": "schedule", "label": "档期排布"}, {"key": "resolutionDuration", "label": "解决时长"}]
const columnStorageKey = 'degson.orders.columns.v1'
const allColumnKeys = columnOptions.map(item => item.key)
function readColumns(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(columnStorageKey) || 'null')
    if (Array.isArray(saved)) return [...new Set(['id', ...saved.filter((key): key is string => typeof key === 'string' && allColumnKeys.includes(key))])]
  } catch { /* Storage may be unavailable; use all columns. */ }
  return [...allColumnKeys]
}
const visibleColumns = ref(readColumns())
watch(visibleColumns, value => {
  try { localStorage.setItem(columnStorageKey, JSON.stringify(value)) } catch { /* Current selection remains usable. */ }
}, { deep: true })
async function copyOrderId(id: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(id)
    else {
      const input = document.createElement('textarea')
      input.value = id
      input.style.cssText = 'position:fixed;left:-9999px;top:0'
      document.body.appendChild(input)
      const previous = document.activeElement as HTMLElement | null
      try { input.select(); if (!document.execCommand('copy')) throw new Error('copy failed') }
      finally { input.remove(); previous?.focus() }
    }
    ElMessage.success('工单编号已复制')
  } catch { ElMessage.error('复制失败，请在工单详情中手动选择并复制编号') }
}

const dates = ref<[string, string] | null>(null)
const handler = ref<string | undefined>('')
const status = ref<string | undefined>('')
const category = ref<string | undefined>('')
const keyword = ref<string | undefined>('')
const page = ref(1)
const pageSize = ref(10)
const autoScroll = ref(false)
const scrollPaused = ref(false)
const tableWrap = ref<HTMLElement | null>(null)
const rows = ref<OrderRow[]>([])
const loading = ref(false)
const error = ref('')
const lastUpdated = ref('')
const handlerOptions = ref<string[]>([])
const statusOptions = ref<string[]>([])
const categoryOptions = ref<string[]>([])
const selected = ref<OrderRow | null>(null)
const dialogOpen = computed({ get: () => selected.value !== null, set: value => { if (!value) selected.value = null } })
const pageRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const displayRows = computed(() => {
  if (!autoScroll.value || !rows.value.length) return pageRows.value
  const copies = Math.max(2, Math.ceil(30 / rows.value.length))
  return Array.from({ length: copies }, () => rows.value).flat()
})
const detailFields = computed(() => selected.value ? [
  ['工单编号', selected.value.id], ['办理人', selected.value.handler],
  ['事项状态', selected.value.status], ['紧急程度', selected.value.urgency],
  ['区域', selected.value.region], ['申请日期', selected.value.date],
  ['工单名称', selected.value.name], ['申请人', selected.value.applicant],
  ['客户代码', selected.value.customerCode], ['SF商机号', selected.value.salesforceNo],
  ['产品名称', selected.value.product], ['产品所属事业部', selected.value.division],
  ['事项分类', selected.value.category], ['数量', selected.value.quantity],
  ['数量分类', selected.value.quantityType], ['工时', selected.value.hours],
  ['档期排布', selected.value.schedule], ['解决时长', selected.value.resolutionDuration],
] : [])
let timer: number | undefined
let scrollTimer: number | undefined

function stopAutoScroll() {
  if (scrollTimer) window.clearInterval(scrollTimer)
  scrollTimer = undefined
}

function startAutoScroll() {
  stopAutoScroll()
  if (!autoScroll.value || !rows.value.length) return
  const scroller = tableWrap.value?.querySelector<HTMLElement>('.el-scrollbar__wrap')
  if (!scroller) return
  scroller.scrollTop = 0
  let previousTime = performance.now()
  scrollTimer = window.setInterval(() => {
    const time = performance.now()
    const elapsed = Math.min(time - previousTime, 1000)
    previousTime = time
    if (scrollPaused.value || loading.value || selected.value || document.hidden) return
    const currentScroller = tableWrap.value?.querySelector<HTMLElement>('.el-scrollbar__wrap')
    const tableRows = currentScroller?.querySelectorAll<HTMLTableRowElement>('.el-table__body tbody tr')
    if (!currentScroller || !tableRows?.[rows.value.length]) return
    const cycleHeight = tableRows[rows.value.length].getBoundingClientRect().top - tableRows[0].getBoundingClientRect().top
    if (cycleHeight <= 0 || currentScroller.scrollHeight <= currentScroller.clientHeight) return
    currentScroller.scrollTop += elapsed * 28 / 1000
    if (currentScroller.scrollTop >= cycleHeight) currentScroller.scrollTop -= cycleHeight
  }, 50)
}

watch([autoScroll, rows], async () => {
  stopAutoScroll()
  await nextTick()
  startAutoScroll()
}, { flush: 'post' })

function filters(): OrderFilters {
  const [start, end] = Array.isArray(dates.value) ? dates.value : []
  return {
    dateStart: start && end ? `${start} 00:00:00` : '',
    dateEnd: start && end ? `${end} 23:59:59` : '',
    handler: handler.value?.trim() ?? '',
    status: status.value?.trim() ?? '',
    category: category.value?.trim() ?? '',
    keyword: keyword.value?.trim() ?? '',
  }
}

function mergeOptions(current: string[], values: string[]) {
  return [...new Set([...current, ...values].filter(value => value && value !== '/'))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

const { refresh: query, dispose, isCurrent } = useSlowRefresh(async signal => {
  loading.value = true
  error.value = ''
  try {
    const data = await getOrders(filters(), signal)
    if (signal.aborted) return
    rows.value = data
    page.value = 1
    selected.value = null
    handlerOptions.value = mergeOptions(handlerOptions.value, data.map(item => item.handler))
    statusOptions.value = mergeOptions(statusOptions.value, data.map(item => item.status))
    categoryOptions.value = mergeOptions(categoryOptions.value, data.map(item => item.category))
    lastUpdated.value = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
  } catch (caught) {
    if (isRequestCancelled(signal)) return
    error.value = caught instanceof Error ? caught.message : '工单明细加载失败'
  } finally {
    if (isCurrent(signal)) loading.value = false
  }
})

function reset() {
  dates.value = null
  handler.value = ''
  status.value = ''
  category.value = ''
  keyword.value = ''
  void query()
}

function exportExcel() {
  const data = rows.value.map(item => ({
    工单编号: item.id, 办理人: item.handler, 区域: item.region, 工单名称: item.name,
    申请人: item.applicant, 申请日期: item.date, 客户代码: item.customerCode,
    SF商机号: item.salesforceNo, 产品名称: item.product, 产品所属事业部: item.division,
    事项分类: item.category, 事项状态: item.status, 数量: item.quantity,
    数量分类: item.quantityType, 工时: item.hours, 紧急程度: item.urgency,
    档期排布: item.schedule, 解决时长: item.resolutionDuration,
  }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), '工单明细')
  XLSX.writeFile(workbook, '工单明细.xlsx')
}

onMounted(() => { void query(); timer = window.setInterval(() => void query(), 10 * 60 * 1000) })
onBeforeUnmount(() => { dispose(); stopAutoScroll(); if (timer) window.clearInterval(timer) })
</script>

<template>
  <div class="screen-page orders-page">
    <div class="page-heading compact-heading">
      <div><div class="eyebrow">高松技术支持中心 / 工单管理</div><h1>工单明细</h1><p>筛选、查看和导出技术支持工单</p></div>
      <div class="heading-actions"><span class="live-dot" :class="{ 'is-error': error }"></span><span>{{ error ? '更新失败' : loading ? '正在查询' : 'BI 数据' }}</span><span class="date-chip">共 {{ rows.length }} 条记录</span><span v-if="lastUpdated" class="date-chip">上次成功更新 {{ lastUpdated }}</span></div>
    </div>
    <section class="chart-panel filter-panel">
      <div class="filter-grid">
        <div class="filter-field wide"><label>申请日期</label><el-date-picker v-model="dates" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" size="large"/></div>
        <div class="filter-field"><label>办理人</label><el-select v-model="handler" placeholder="全部人员" clearable filterable size="large"><el-option v-for="name in handlerOptions" :key="name" :label="name" :value="name"/></el-select></div>
        <div class="filter-field"><label>事项状态</label><el-select v-model="status" placeholder="全部状态" clearable filterable size="large"><el-option v-for="item in statusOptions" :key="item" :label="item" :value="item"/></el-select></div>
        <div class="filter-field"><label>事项分类</label><el-select v-model="category" placeholder="全部分类" clearable filterable size="large"><el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item"/></el-select></div>
        <div class="filter-field search-field"><label>关键词</label><el-input v-model="keyword" placeholder="工单编号、申请人、产品等" clearable size="large" @keyup.enter="query"><template #prefix><el-icon><Search /></el-icon></template></el-input></div>
        <div class="filter-buttons"><el-button size="large" @click="reset"><el-icon><Refresh /></el-icon>重置</el-button><el-button type="primary" size="large" :loading="loading" @click="query"><el-icon><Search /></el-icon>查询</el-button></div>
      </div>
    </section>
    <div v-if="error" class="data-error" role="status" aria-live="polite"><div><strong>{{ lastUpdated ? '刷新失败，已保留上次成功加载的数据' : '数据加载失败' }}</strong><span class="refresh-error-detail">{{ error }}</span><span v-if="lastUpdated" class="refresh-stale-note">当前列表为最后一次成功查询的结果，可能与当前筛选条件不同，请重试。</span></div><el-button link type="primary" @click="query">重试</el-button></div>
    <section class="chart-panel orders-table-panel">
      <div class="panel-header"><div><h2>工单列表</h2><p>{{ autoScroll ? '循环展示当前筛选结果 · 鼠标移入暂停' : '符合筛选条件的工单 · 左右滚动查看全部字段 · 每 10 分钟更新' }}</p></div><div class="orders-table-actions"><el-popover placement="bottom-end" :width="320" trigger="click"><template #reference><el-button plain><el-icon><Setting /></el-icon>显示列</el-button></template><div class="column-picker"><div class="column-picker-heading"><strong>选择显示字段</strong><el-button link type="primary" @click="visibleColumns = [...allColumnKeys]">恢复全部</el-button></div><p>工单编号始终显示，设置自动保存在本机</p><el-checkbox-group v-model="visibleColumns"><el-checkbox v-for="column in columnOptions" :key="column.key" :value="column.key" :disabled="column.key === 'id'">{{ column.label }}</el-checkbox></el-checkbox-group></div></el-popover><div class="table-mode-toggle"><span>自动滚动</span><el-switch v-model="autoScroll" aria-label="自动滚动" /></div><el-button type="primary" plain :disabled="loading || !rows.length" @click="exportExcel"><el-icon><Download /></el-icon>导出 Excel</el-button></div></div>
      <div ref="tableWrap" class="table-wrap" @mouseenter="scrollPaused = true" @mouseleave="scrollPaused = false"><el-table v-loading="loading && !lastUpdated" :data="displayRows" class="dark-table" max-height="560" stripe empty-text="暂无符合条件的工单" @row-click="selected = $event">
        <el-table-column v-if="visibleColumns.includes('id')" prop="id" label="工单编号" width="185" fixed><template #default="scope"><button type="button" class="order-copy-button" :aria-label="`复制工单编号 ${scope.row.id}`" title="点击复制工单编号" @click.stop="copyOrderId(scope.row.id)">{{ scope.row.id }}<el-icon><CopyDocument /></el-icon></button></template></el-table-column>
        <el-table-column v-if="visibleColumns.includes('handler')" prop="handler" label="办理人" width="100"/><el-table-column v-if="visibleColumns.includes('region')" prop="region" label="区域" width="110"/><el-table-column v-if="visibleColumns.includes('name')" prop="name" label="工单名称" width="155"/><el-table-column v-if="visibleColumns.includes('applicant')" prop="applicant" label="申请人" width="105"/><el-table-column v-if="visibleColumns.includes('date')" prop="date" label="申请日期" width="125"/>
        <el-table-column v-if="visibleColumns.includes('customerCode')" prop="customerCode" label="客户代码" width="110"/><el-table-column v-if="visibleColumns.includes('salesforceNo')" prop="salesforceNo" label="SF商机号" width="120"/><el-table-column v-if="visibleColumns.includes('product')" prop="product" label="产品名称" width="130"/><el-table-column v-if="visibleColumns.includes('division')" prop="division" label="产品所属事业部" width="140"/><el-table-column v-if="visibleColumns.includes('category')" prop="category" label="事项分类" width="150"/>
        <el-table-column v-if="visibleColumns.includes('status')" prop="status" label="事项状态" width="110"><template #default="scope"><span class="status-badge" :class="['完成', '已完成'].includes(scope.row.status) ? 'done' : ['处理中', '处理'].includes(scope.row.status) ? 'progress' : 'pending'">{{ scope.row.status }}</span></template></el-table-column>
        <el-table-column v-if="visibleColumns.includes('quantity')" prop="quantity" label="数量" width="85"/><el-table-column v-if="visibleColumns.includes('quantityType')" prop="quantityType" label="数量分类" width="105"/><el-table-column v-if="visibleColumns.includes('hours')" prop="hours" label="工时 (h)" width="95"/><el-table-column v-if="visibleColumns.includes('urgency')" prop="urgency" label="紧急程度" width="105"><template #default="scope"><span :class="{ 'urgent-text': scope.row.urgency === '紧急' }">{{ scope.row.urgency }}</span></template></el-table-column><el-table-column v-if="visibleColumns.includes('schedule')" prop="schedule" label="档期排布" width="125"/><el-table-column v-if="visibleColumns.includes('resolutionDuration')" prop="resolutionDuration" label="解决时长" width="105"/>
        <template #empty><DataEmpty v-if="lastUpdated" /><span v-else>{{ error ? '数据加载失败' : '正在读取数据…' }}</span></template>
      </el-table></div>
      <div class="table-footer"><span>共 {{ rows.length }} 条记录</span><span v-if="autoScroll" class="scroll-mode-note">{{ !rows.length ? '暂无可滚动的工单' : scrollPaused || selected ? '已暂停，移开鼠标后继续' : '循环滚动中' }}</span><el-pagination v-else v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" layout="sizes, prev, pager, next" :total="rows.length" background/></div>
    </section>
    <el-dialog v-model="dialogOpen" title="工单详情" width="680px" class="detail-dialog"><el-descriptions v-if="selected" :column="2" border><el-descriptions-item v-for="[label, value] in detailFields" :key="label" :label="label">{{ value }}</el-descriptions-item></el-descriptions></el-dialog>
  </div>
</template>
