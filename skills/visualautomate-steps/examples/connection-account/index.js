/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    if (!context.connections) {
      return { output: "error", data: { reason: "No account was chosen for this step" } };
    }

    // Asked for by the property name in manifest.json, not by an id.
    const account = await context.connections.get("account");
    const res = await account.request({
      path: "user/repos",               // relative to the provider: never a full URL
      method: "GET",
      query: { per_page: config.perPage || 10, sort: "pushed" },
    });

    if (!res.ok) {
      return { output: "error", data: { status: res.status, body: res.body } };
    }
    return { output: "success", data: { repositories: res.body.map((r) => r.full_name) } };
  },
};
