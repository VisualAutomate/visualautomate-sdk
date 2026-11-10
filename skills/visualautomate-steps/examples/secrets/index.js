/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    // Provided for the step at run time. Never put a key in index.js: this repository, a fork
    // and a reviewer can all read it.
    const apiKey = context.secrets.API_KEY;
    if (!apiKey) {
      return { output: "error", data: { reason: "API_KEY is not set for this step" } };
    }

    const res = await fetch(`https://api.example.com/search?q=${encodeURIComponent(config.query)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { output: res.ok ? "success" : "error", data: { status: res.status } };
  },
};
