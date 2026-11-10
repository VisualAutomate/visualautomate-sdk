/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    const folder = config.folder || "reports";
    const path = `${folder}/${new Date().toISOString().slice(0, 10)}.json`;

    // Write. Strings, bytes or a Uint8Array; the content type is optional.
    const saved = await context.storage.put(path, JSON.stringify(input, null, 2), "application/json");

    // Read it back. get() answers null for a path that is not there.
    const back = await context.storage.get(path);
    if (!back) return { output: "error", data: { reason: "The file did not save" } };

    // A link somebody can open without an account, valid for an hour.
    const link = await context.storage.signedUrl(path, 3600);

    // Stream a URL straight into storage without it passing through this sandbox.
    if (config.sourceUrl && context.storage.download) {
      await context.storage.download(config.sourceUrl, `${folder}/source`, undefined);
    }

    const { files, totalSize } = await context.storage.list(`${folder}/`);
    return {
      output: "success",
      data: { path, size: saved.size, expiresAt: saved.expiresAt, link, files: files.map((f) => f.pathname), totalSize },
    };
  },
};
