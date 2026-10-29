export interface RankingItem {
  name: string
  value: number
}

export interface RankingData {
  domesticOrders: RankingItem[]
  domesticHours: RankingItem[]
  internationalOrders: RankingItem[]
  internationalHours: RankingItem[]
}

interface DatasetResult { data?: Array<Record<string, unknown>> }
interface RankingResponse { datasets?: Record<string, DatasetResult>; message?: string }

const datasetIds = {
  domesticOrders: '1272000000000100013',
  domesticHours: '1272000000000100014',
  internationalOrders: '1272000000000100026',
  internationalHours: '1272000000000100027',
} as const

function items(dataset: DatasetResult | undefined, label: string): RankingItem[] {
  if (!Array.isArray(dataset?.data)) throw new Error(`${label}未返回有效数据`)
  return dataset.data.map(row => {
    const name = String(row.name ?? '').trim()
    // BI 用 null 表示此人暂无工时，图表按 0 展示。
    const value = row.value == null ? 0 : Number(row.value)
    if (!name || !Number.isFinite(value)) throw new Error(`${label}包含无效数据`)
    return { name, value }
  }).sort((a, b) => b.value - a.value)
}

export async function getRankingData(signal?: AbortSignal): Promise<RankingData> {
  const response = await fetch('/api/bi/ranking', { signal, cache: 'no-store' })
  const payload = await response.json() as RankingResponse
  if (!response.ok) throw new Error(payload.message || '业务排行数据加载失败')

  return {
    domesticOrders: items(payload.datasets?.[datasetIds.domesticOrders], '国内工单排行'),
    domesticHours: items(payload.datasets?.[datasetIds.domesticHours], '国内工时排行'),
    internationalOrders: items(payload.datasets?.[datasetIds.internationalOrders], '国际工单排行'),
    internationalHours: items(payload.datasets?.[datasetIds.internationalHours], '国际工时排行'),
  }
}
