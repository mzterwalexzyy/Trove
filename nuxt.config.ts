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
    // Keeper, the bounty drafting assistant. Optional: with no key the create
    // form simply stays manual rather than breaking.
    aiApiKey: '',
    aiBaseUrl: 'https://openrouter.ai/api/v1',
    aiModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    // Tried only if the primary fails. Free endpoints rate-limit often enough
    // that one provider is not a dependable answer.
    aiFallbackApiKey: '',
    aiFallbackBaseUrl: '',
    aiFallbackModel: '',
    public: {
      // No escrowAddress here on purpose. It is derived from the private key
      // server-side; a second configured copy silently truncated at the spaces
      // in a Nimiq address and broke every funding check.
      nimiqNetwork: 'test',
      explorerBase: 'https://test.nimiq.watch',
    },
  },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/logo-192.png' },
      ],
      script: [
        {
          // Runs before first paint so the page never flashes light before
          // resolving to dark. Kept tiny and dependency-free on purpose;
          // anything slower here is visible as a flash.
          innerHTML: `(function(){try{var s=localStorage.getItem('trove-theme');var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})()`,
          tagPosition: 'head',
        },
      ],
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
})
