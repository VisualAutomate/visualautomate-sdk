/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    // A path property holds the path; the file is not read into the step.
    const info = await context.storage.head(config.source);
    if (!info) return { output: "error", data: { reason: `${config.source} is not in storage` } };

    // media is only present where the server has ffmpeg configured.
    if (!context.media) return { output: "error", data: { reason: "Media is not available here" } };

    const output = config.source.replace(/(\.[a-z0-9]+)?$/i, "-trimmed.mp4");
    const result = await context.media.run("trim", {
      input: config.source,
      start: config.start ?? 0,
      duration: config.duration ?? 10,
      output,
    });

    if (!result.ok) return { output: "error", data: { logs: result.logs } };
    return { output: "success", data: { output, files: result.files, extras: config.extras ?? [] } };
  },
};
