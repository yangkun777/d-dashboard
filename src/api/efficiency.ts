export interface EfficiencyRow {
  name: string
  pending: number
  hours: number
  deadline: string
  isTotal: boolean
}

export interface EfficiencyChartItem {
  name: string
  value: number
}

export interface EfficiencyData {
  hours: EfficiencyChartItem[]
  orders: EfficiencyChartItem[]
  rows: EfficiencyRow[]
}

interface DatasetResult {
  data?: Array<Record<string, unknown>>
}

interface EfficiencyResponse {
  hours?: DatasetResult
  orders?: DatasetResult
  table?: DatasetResult
  message?: string
}

function chartItems(dataset: DatasetResult | undefined, label: string): EfficiencyChartItem[] {
  if (!Array.isArray(dataset?.data)) throw new Error(`${label}未返回有效数据`)
  return dataset.data.map(record => {
    const name = String(record.name ?? '').trim()
    const value = Number(record.value)
    if (!name || !Number.isFinite(value)) throw new Error(`${label}包含无效数据`)
    return { name, value }
  })
}

export async function getEfficiencyData(signal?: AbortSignal): Promise<EfficiencyData> {
  const response = await fetch('/api/bi/efficiency', { signal, cache: 'no-store' })
  const payload = await response.json() as EfficiencyResponse
  if (!response.ok) throw new Error(payload.message || '个人效能数据加载失败')
  if (!Array.isArray(payload.table?.data)) throw new Error('工单档期表未返回有效数据')

  return {
    hours: chartItems(payload.hours, '工单处理工时图'),
    orders: chartItems(payload.orders, '工单处理数量图'),
    rows: payload.table.data.map(record => {
      const name = String(record['人员'] ?? '')
      const pending = Number(record['待处理工单'])
      const hours = Number(record['预计完成工时'])
      const schedule = String(record['档期排布'] ?? '').trim()
      return {
        name,
        pending: Number.isFinite(pending) ? pending : 0,
        hours: Number.isFinite(hours) ? hours : 0,
        deadline: schedule && schedule !== '-' ? schedule : '—',
        isTotal: name === '合计',
      }
    }),
  }
}
