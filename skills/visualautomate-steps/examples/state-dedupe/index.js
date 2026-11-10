/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    const id = input.id;
    if (id === undefined || id === null) {
      return { output: "error", data: { reason: "input.id is missing" } };
    }

    const key = config.key || "seen-ids";
    // Values are JSON and at most 128 KB, so keep a bounded list rather than everything ever seen.
    const seen = (await context.state.get(key)) ?? [];
    if (seen.includes(id)) return { output: "duplicate", data: { id } };

    seen.push(id);
    await context.state.set(key, seen.slice(-500));

    // A value that expires on its own: a lock for five minutes (the minimum is 60 seconds).
    await context.state.set(`lock:${id}`, true, { ttlSeconds: 300 });

    return { output: "new", data: { id } };
  },
};
