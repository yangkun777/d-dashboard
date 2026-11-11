export interface OverviewData {
  metrics: {
    totalOrders: number
    totalGrowth: number
    dailyAverage: number
    dailyGrowth: number
    pendingOrders: number
    pendingGrowth: number
    expectedHours: number
    hoursGrowth: number
  }
  flow: Array<{ name: string; pending: number; completed: number; net: number }>
  categories: Array<{ name: string; value: number }>
  products: Array<{ name: string; value: number }>
  urgency: Array<{ name: string; value: number }>
  alert: {
    pendingOrders: number
    pendingHours: number
    headcount: number
    threshold: number
    triggered: boolean
  }
}

interface DatasetResult { data?: Array<Record<string, unknown>> }
interface OverviewResponse { datasets?: Record<string, DatasetResult>; alert?: DatasetResult; message?: string }

const id = (n: number) => `127200000000010${String(n).padStart(4, '0')}`

function number(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error('BI 数据中存在无效数值')
  return parsed
}

export async function getOverviewData(signal?: AbortSignal): Promise<OverviewData> {
  const response = await fetch('/api/bi/overview', { signal, cache: 'no-store' })
  const payload = await response.json() as OverviewResponse
  if (!response.ok) throw new Error(payload.message || '运营总览数据加载失败')

  const rows = (n: number) => {
    const data = payload.datasets?.[id(n)]?.data
    if (!Array.isArray(data)) throw new Error(`数据集 ${n} 未返回有效数据`)
    return data
  }
  const scalar = (n: number) => number(rows(n)[0]?.value)
  const pairs = (n: number) => rows(n).map(row => ({ name: String(row.name ?? ''), value: number(row.value) }))

  const flowRows = rows(9)
  const names = [...new Set(flowRows.map(row => String(row.name ?? '')))]
  const flowValue = (name: string, type: string) => {
    const row = flowRows.find(item => item.name === name && item.type === type)
    return row ? number(row.value) : 0
  }

  const alertRow = payload.alert?.data?.[0] ?? {}
  const alert = {
    pendingOrders: number(alertRow['待处理工单'] ?? 0),
    pendingHours: number(alertRow['待处理工时'] ?? 0),
    headcount: number(alertRow['人数'] ?? 0),
    threshold: number(alertRow['阈值'] ?? 0),
    triggered: Number(alertRow['预警'] ?? 0) === 1,
  }

  return {
    metrics: {
      totalOrders: scalar(1), totalGrowth: scalar(2),
      dailyAverage: scalar(3), dailyGrowth: scalar(4),
      pendingOrders: scalar(5), pendingGrowth: scalar(6),
      expectedHours: scalar(7), hoursGrowth: scalar(8),
    },
    flow: names.map(name => ({ name, pending: flowValue(name, '待处理'), completed: flowValue(name, '完成'), net: flowValue(name, '净增') })),
    categories: pairs(10), products: pairs(11), urgency: pairs(12),
    alert,
  }
}
