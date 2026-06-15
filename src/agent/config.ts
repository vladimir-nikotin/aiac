export const config = () => ({
  agent: {
    facts: {
      path: process.env.FACTS_PATH,
    },
    history: {
      path: process.env.SESSION_HISTORY_JSON,
    },
    summary: {
      dir: process.env.SESSION_SUMMARY_DIR,
      prefix: process.env.SESSION_SUMMARY_PREFIX,
    },
  },
});
