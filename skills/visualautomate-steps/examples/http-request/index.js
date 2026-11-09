/** @type {PluginModule} */
module.exports = {
  execute: async (input, config) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (config.timeoutSeconds || 10) * 1000);

    try {
      const hasBody = config.method === "POST" || config.method === "PUT";
      const res = await fetch(config.url, {
        method: config.method || "GET",
        headers: hasBody ? { "Content-Type": "application/json" } : {},
        body: hasBody ? JSON.stringify(config.body ?? {}) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let body = text;
      try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }

      return { output: res.ok ? "success" : "error", data: { status: res.status, body } };
    } catch (err) {
      return { output: "error", data: { status: 0, reason: String(err) } };
    } finally {
      clearTimeout(timer);
    }
  },
};
