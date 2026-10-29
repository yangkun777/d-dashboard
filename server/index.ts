import { createServer } from 'node:http'
import { createBiGateway } from './bi-gateway.js'

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是有效端口')

const gateway = createBiGateway({
  baseUrl: process.env.BI_BASE_URL,
  sharePageUrl: process.env.BI_SHARE_PAGE_URL,
  signatureSecret: process.env.BI_SIGNATURE_SECRET,
})

const server = createServer((request, response) => {
  if (request.url === '/healthz' && request.method === 'GET') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }
  void gateway(request, response).then(handled => {
    if (!handled) {
      response.statusCode = 404
      response.end('Not found')
    }
  })
})

server.listen(port, host, () => {
  process.stdout.write(`BI API listening on http://${host}:${port}\n`)
})

process.on('SIGTERM', () => server.close())
