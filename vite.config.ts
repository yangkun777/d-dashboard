import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createBiGateway } from './server/bi-gateway.js'

function biBridge(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'BI_')
  const gateway = createBiGateway({
    baseUrl: env.BI_BASE_URL,
    sharePageUrl: env.BI_SHARE_PAGE_URL,
    signatureSecret: env.BI_SIGNATURE_SECRET,
  })
  const middleware = (request: Parameters<typeof gateway>[0], response: Parameters<typeof gateway>[1], next: () => void) => {
    void gateway(request, response).then(handled => { if (!handled) next() })
  }
  return {
    name: 'local-bi-data-bridge',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [vue(), biBridge(mode)],
  server: { host: true, port: 5173 },
}))
