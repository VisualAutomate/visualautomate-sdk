// One DeepL request takes at most 50 texts, so a long document is several
// requests whose answers are put back together in order. Several calls and
// stitching their results is what a declared step cannot do.
const BATCH = 50

/** @type {PluginModule} */
module.exports = {
  execute: async (input, config) => {
    if (!config.apiKey) return { output: "error", data: { error: "Paste your DeepL API key into this step." } }
    const host = config.host || "api-free.deepl.com"
    const paragraphs = String(config.text || "")
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
    if (paragraphs.length === 0) return { output: "error", data: { error: "There is no text to translate." } }

    const translated = []
    let calls = 0
    for (let start = 0; start < paragraphs.length; start += BATCH) {
      const res = await fetch(`https://${host}/v2/translate`, {
        method: "POST",
        headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: paragraphs.slice(start, start + BATCH), target_lang: String(config.targetLang || "EN-GB").toUpperCase() }),
      })
      calls++
      const raw = await res.text()
      let body = {}
      try { body = JSON.parse(raw) } catch { /* not JSON: reported below */ }
      if (!res.ok) {
        return { output: "error", data: { error: body.message || `DeepL answered ${res.status}`, status: res.status } }
      }
      for (const item of body.translations || []) translated.push(item.text)
    }

    console.log(`translated ${paragraphs.length} paragraph(s) in ${calls} call(s)`)
    return { output: "success", data: { text: translated.join("\n\n"), paragraphs: paragraphs.length, calls } }
  },
}
