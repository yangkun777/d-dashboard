import type { IncomingMessage, ServerResponse } from 'node:http'
import { createBiSignature, readBiSignatureSecret } from './bi-signature.js'

export interface BiGatewayOptions {
  baseUrl?: string
  sharePageUrl?: string
  signatureSecret?: string
}

const overviewDatasetIds = Array.from({ length: 12 }, (_, index) => `127200000000010${String(index + 1).padStart(4, '0')}`)
const productDatasetIds = Array.from({ length: 6 }, (_, index) => `127200000000010${String(index + 19).padStart(4, '0')}`)
const rankingDatasetIds = ['1272000000000100013', '1272000000000100014', '1272000000000100026', '1272000000000100027']
const orderFilterKeys = ['dateStart', 'dateEnd', 'handler', 'status', 'category', 'keyword'] as const

function orderParams(url: string): Record<string, string> {
  const query = new URL(url, 'http://localhost').searchParams
  const params = Object.fromEntries(orderFilterKeys.flatMap(key => {
    const value = query.get(key)?.trim()
    return value ? [[key, value]] : []
  }))
  for (const key of orderFilterKeys) {
    const value = params[key]
    if (value && (value.length > 100 || /['"\\\x00-\x1f]/.test(value))) throw new Error(`${key} 包含不允许的字符或过长`)
  }
  const datePattern = /^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/
  for (const key of ['dateStart', 'dateEnd'] as const) {
    const value = params[key]
    if (value && !datePattern.test(value)) throw new Error(`${key} 日期格式无效`)
  }
  if (params.dateStart && params.dateEnd && params.dateStart > params.dateEnd) throw new Error('开始时间不能晚于结束时间')
  return params
}

export function createBiGateway(options: BiGatewayOptions = {}) {
  const baseUrl = options.baseUrl || 'http://10.10.10.205'
  const endpoint = new URL('/jeecg-boot/drag/onlDragDatasetHead/getAllChartData', baseUrl).toString()
  const sharePageUrl = options.sharePageUrl || new URL('/jeecg-boot/drag/share/view/1272000000000001003', baseUrl).toString()
  let cachedSecret = ''
  let secretExpiresAt = 0

  async function getSecret(signal?: AbortSignal) {
    if (options.signatureSecret) return options.signatureSecret
    if (cachedSecret && Date.now() < secretExpiresAt) return cachedSecret
    cachedSecret = await readBiSignatureSecret(sharePageUrl, signal)
    secretExpiresAt = Date.now() + 5 * 60 * 1000
    return cachedSecret
  }

  async function fetchDataset(id: string, secret: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
    const body = { id, params }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('客户端已断开')
      let upstream: Response
      const timeout = AbortSignal.timeout(12000)
      try {
        upstream = await fetch(endpoint, {
          method: 'POST',
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          headers: { 'Content-Type': 'application/json', ...createBiSignature(body, secret) },
          body: JSON.stringify(body),
        })
      } catch (error) {
        if (signal?.aborted || attempt === 1) throw error
        await new Promise(resolve => setTimeout(resolve, 250))
        continue
      }
      if (upstream.status >= 500 && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 250))
        continue
      }
      const payload = await upstream.json() as { code?: number; success?: boolean; message?: string; result?: unknown }
      if (!upstream.ok || payload.code !== 200 || payload.success !== true) {
        throw new Error(payload.message || `数据集 ${id} 返回 HTTP ${upstream.status}`)
      }
      return payload.result
    }
    throw new Error(`数据集 ${id} 请求失败`)
  }

  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const path = request.url?.split('?')[0]
    if (path !== '/api/bi/efficiency' && path !== '/api/bi/overview' && path !== '/api/bi/orders' && path !== '/api/bi/products' && path !== '/api/bi/ranking') return false

    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method !== 'GET') {
      response.statusCode = 405
      response.end(JSON.stringify({ message: '仅支持 GET 请求' }))
      return true
    }

    let filters: ReturnType<typeof orderParams> | undefined
    if (path === '/api/bi/orders') {
      try {
        filters = orderParams(request.url || path)
      } catch (error) {
        response.statusCode = 400
        response.end(JSON.stringify({ message: error instanceof Error ? error.message : '筛选条件无效' }))
        return true
      }
    }

    const clientAbort = new AbortController()
    response.on('close', () => {
      if (!response.writableEnded) clientAbort.abort()
    })

    try {
      const secret = await getSecret(clientAbort.signal)
      const signal = clientAbort.signal
      if (path === '/api/bi/overview') {
        const datasets = await Promise.all(overviewDatasetIds.map(async id => [id, await fetchDataset(id, secret, {}, signal)] as const))
        response.end(JSON.stringify({ datasets: Object.fromEntries(datasets) }))
      } else if (path === '/api/bi/products') {
        const datasets = await Promise.all(productDatasetIds.map(async id => [id, await fetchDataset(id, secret, {}, signal)] as const))
        response.end(JSON.stringify({ datasets: Object.fromEntries(datasets) }))
      } else if (path === '/api/bi/ranking') {
        const datasets = await Promise.all(rankingDatasetIds.map(async id => [id, await fetchDataset(id, secret, {}, signal)] as const))
        response.end(JSON.stringify({ datasets: Object.fromEntries(datasets) }))
      } else if (path === '/api/bi/efficiency') {
        const [hours, orders, table] = await Promise.all([
          fetchDataset('1272000000000100015', secret, {}, signal),
          fetchDataset('1272000000000100016', secret, {}, signal),
          fetchDataset('1272000000000100017', secret, {}, signal),
        ])
        response.end(JSON.stringify({ hours, orders, table }))
      } else {
        response.end(JSON.stringify(await fetchDataset('1272000000000100018', secret, filters ?? {}, signal)))
      }
    } catch (error) {
      if (clientAbort.signal.aborted || response.writableEnded) return true
      response.statusCode = 502
      response.end(JSON.stringify({ message: error instanceof Error ? error.message : '无法连接 BI 接口' }))
    }
    return true
  }
}
