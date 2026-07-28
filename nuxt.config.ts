import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  // Nimiq Pay loads the Mini App from a phone over the LAN, so the dev server
  // must bind to all interfaces rather than localhost.
  devServer: {
    host: '0.0.0.0',
    port: 5173,
  },

  runtimeConfig: {
    // Server-only. Never exposed to the client.
    escrowPrivateKey: '',
    sessionPassword: '',
    nimiqRpcUrl: 'https://rpc.testnet.nimiqwatch.com/',
    public: {
      // No escrowAddress here on purpose. It is derived from the private key
      // server-side; a second configured copy silently truncated at the spaces
      // in a Nimiq address and broke every funding check.
      nimiqNetwork: 'test',
      explorerBase: 'https://test.nimiq.watch',
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
})
