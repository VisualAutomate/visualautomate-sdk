// Gmail takes a whole RFC 2822 message, base64url-encoded, in one field. Building
// that needs code: a declared step can fill in a JSON body, not encode one.
const { Base64 } = require("js-base64")

/** "a@x.com, b@y.com" to ["a@x.com", "b@y.com"]. */
const addresses = (value) =>
  String(value || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)

/** A header value with non-ASCII text in it, encoded so every mail client reads it. */
const headerText = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Base64.encode(text)}?=`)

/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    const to = addresses(config.to)
    if (to.length === 0) return { output: "error", data: { error: "Fill in who the email goes to." } }
    if (!context.connections) return { output: "error", data: { error: "Choose a Google account on this step." } }

    const cc = addresses(config.cc)
    const message = [
      `To: ${to.join(", ")}`,
      ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
      `Subject: ${headerText(config.subject || "")}`,
      "MIME-Version: 1.0",
      `Content-Type: ${config.isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
      "Content-Transfer-Encoding: base64",
      "",
      Base64.encode(config.body || ""),
    ].join("\r\n")

    const account = await context.connections.get("account")
    const res = await account.request({
      method: "POST",
      path: "gmail/v1/users/me/messages/send",
      // URL-safe base64 without padding, as Gmail's "raw" field wants it.
      body: { raw: Base64.encodeURI(message) },
    })

    if (!res.ok) {
      const reason = res.body && res.body.error && res.body.error.message
      return { output: "error", data: { error: reason || `Gmail answered ${res.status}`, status: res.status } }
    }
    console.log(`sent to ${to.length} recipient(s)`)
    return { output: "success", data: { id: res.body.id, threadId: res.body.threadId, to } }
  },
}
