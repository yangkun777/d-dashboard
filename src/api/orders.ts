export interface OrderFilters {
  dateStart: string
  dateEnd: string
  handler: string
  status: string
  category: string
  keyword: string
}

export interface OrderRow {
  id: string
  handler: string
  region: string
  name: string
  applicant: string
  date: string
  customerCode: string
  salesforceNo: string
  product: string
  division: string
  category: string
  status: string
  quantity: string
  quantityType: string
  hours: string
  urgency: string
  schedule: string
  resolutionDuration: string
}

interface OrdersResponse {
  data?: Array<Record<string, unknown>>
  message?: string
}

export async function getOrders(filters: OrderFilters, signal?: AbortSignal): Promise<OrderRow[]> {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''))
  const response = await fetch(`/api/bi/orders${query.size ? `?${query}` : ''}`, { signal, cache: 'no-store' })
  const payload = await response.json() as OrdersResponse
  if (!response.ok) throw new Error(payload.message || '工单明细加载失败')
  if (!Array.isArray(payload.data)) throw new Error('工单明细接口未返回有效数据')

  return payload.data.map(record => {
    const field = (key: string) => String(record[key] ?? '/')
    return {
      id: field('工单编号'),
      handler: field('办理人'),
      region: field('区域'),
      name: field('工单名称'),
      applicant: field('申请人'),
      date: field('申请日期'),
      customerCode: field('客户代码'),
      salesforceNo: field('SF商机号'),
      product: field('产品名称'),
      division: field('产品所属事业部'),
      category: field('事项分类'),
      status: field('事项状态'),
      quantity: field('数量'),
      quantityType: field('数量分类'),
      hours: field('工时'),
      urgency: field('紧急程度'),
      schedule: field('档期排布'),
      resolutionDuration: field('解决时长'),
    }
  })
}
