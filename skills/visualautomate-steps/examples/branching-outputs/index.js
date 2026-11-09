/** @type {PluginModule} */
module.exports = {
  execute: async (input, config) => {
    const score = Number(input.score);
    if (Number.isNaN(score)) {
      return { output: "error", data: { reason: "input.score is not a number" } };
    }
    const high = config.highFrom ?? 80;
    const medium = config.mediumFrom ?? 50;
    const output = score >= high ? "high" : score >= medium ? "medium" : "low";
    return { output, data: { score } };
  },
};
