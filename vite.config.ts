import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = parseInt(env.VITE_PORT || '5173', 10)
  const serverPort = env.SERVER_PORT || '3001'
  const useHostAndSsl = env.VITE_HOST_AND_SSL === 'true'

  return {
    plugins: [
      react(),
      useHostAndSsl ? basicSsl() : null
    ].filter(Boolean),
    server: {
      port,
      host: useHostAndSsl,
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
