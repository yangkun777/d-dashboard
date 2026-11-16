export interface ProductLine {
  name: string
  total: number
  data: Array<{ name: string; value: number }>
}

interface DatasetResult {
  data?: Array<Record<string, unknown>>
}
interface ProductsResponse {
  datasets?: Record<string, DatasetResult>
  message?: string
}

const divisions = [
  'DC事业部',
  'ICE事业部',
  '充电事业部',
  '光储事业部',
  '圆形事业部',
  '微出行事业部',
]
const id = (n: number) => `127200000000010${String(n).padStart(4, '0')}`

export async function getProductLines(signal?: AbortSignal): Promise<ProductLine[]> {
  const response = await fetch('/api/bi/products', { signal, cache: 'no-store' })
  const payload = (await response.json()) as ProductsResponse
  if (!response.ok) throw new Error(payload.message || '产品线事项加载失败')

  return divisions.map((name, index) => {
    const rows = payload.datasets?.[id(index + 19)]?.data
    if (!Array.isArray(rows)) throw new Error(`${name}未返回有效数据`)
    const data = rows.map((row) => {
      const category = String(row.name ?? '').trim()
      const value = Number(row.value)
      if (!category || !Number.isFinite(value) || value < 0)
        throw new Error(`${name}包含无效事项数据`)
      return { name: category, value }
    })
    return { name, total: data.reduce((sum, item) => sum + item.value, 0), data }
  })
}
