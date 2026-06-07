export default () => ({
  claude: {
    api: {
      key: process.env.API_KEY,
      url: process.env.API_URL,
      version: process.env.ANTHROPIC_VERSION || '2023-06-01',
    },
    maxTokens: Number(process.env.MAX_TOKENS) || 1024,
    proxy: {
      url: process.env.PROXY_URL,
    },
  },
});
