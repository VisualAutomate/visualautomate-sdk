/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    if (!config.name) {
      return { output: "error", data: { reason: "No name given" } };
    }
    return { output: "success", data: { greeting: `Hello, ${config.name}!` } };
  },
};
