import { createHash } from 'node:crypto'

function md5Upper(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex').toUpperCase()
}

export function createBiSignature(body: Record<string, unknown>, secret: string) {
  const xSign = md5Upper(`{}${secret}`)
  const fields: Record<string, string> = { sign: xSign }
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' && value.length > 0) fields[key] = value
  }
  const sorted = Object.fromEntries(Object.keys(fields).sort().map(key => [key, fields[key]]))
  return {
    'X-TIMESTAMP': Date.now().toString(),
    'X-Sign': xSign,
    'V-Sign': md5Upper(`${JSON.stringify(sorted)}${secret}`),
  }
}

export async function readBiSignatureSecret(sharePageUrl: string): Promise<string> {
  const response = await fetch(sharePageUrl, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`无法读取 BI 分享页（HTTP ${response.status}）`)
  const html = await response.text()
  const secret = html.match(/signatureSecret\s*:\s*'([^']+)'/)?.[1]
  if (!secret) throw new Error('BI 分享页未提供签名密钥')
  return secret
}
