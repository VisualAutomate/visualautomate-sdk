# The sandbox

Code steps run in an isolated sandbox created for the run and destroyed afterwards, on <!-- node:start -->**Node.js 24**<!-- node:end -->. The runner compiles `index.js` into a `vm` context of its own, as the body of a function given `module`, `exports` and a `require` that hands out only the allowed packages. `vsa test` loads code exactly that way, and `vsa dev` and `vsa test --docker` also run on the platform's Node version, in the sandbox image (`ghcr.io/visualautomate/plugin-sandbox`).

A step's context has the language's own objects (`Object`, `Array`, `JSON`, `Math`, `Promise`, `Map`, `Date`, `RegExp`, …) and these globals, nothing more: <!-- provided:start -->`fetch`, `Request`, `Response`, `Headers`, `URL`, `URLSearchParams`, `btoa`, `atob`, `console`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `crypto`, `TextEncoder`, `TextDecoder`, `ArrayBuffer`, `Uint8Array`, `Uint16Array`, `Uint32Array`, `Int8Array`, `Int16Array`, `Int32Array`, `Float32Array`, `Float64Array`, `DataView`, `Blob`, `FormData`, `AbortController`, `AbortSignal`<!-- provided:end -->.

These are set to undefined: <!-- blocked:start -->`process`, `global`, `module`, `exports`, `__dirname`, `__filename`, `eval`, `Function`, `child_process`, `fs`, `os`, `cluster`, `dgram`, `dns`, `net`, `http`, `https`, `path`, `readline`, `stream`, `tls`, `zlib`, `buffer`, `Buffer`, `globalThis`, `self`, `window`, `SharedArrayBuffer`, `Atomics`, `WeakRef`, `FinalizationRegistry`, `AsyncFunction`, `GeneratorFunction`, `AsyncGeneratorFunction`, `WebAssembly`<!-- blocked:end -->. Anything else Node has (`structuredClone`, `setImmediate`, `queueMicrotask`, `performance`) is simply not there.

`console` has four methods: `log`, `error`, `warn` and `info`. `console.debug` and `console.table` do not exist.

The code is wrapped on one line with nothing added after it, so **end `index.js` with a newline**: a last line that is a `//` comment with no newline after it comments out the wrapper's closing bracket and the step does not load.

## Not available

<!-- globals:start -->
| Name | Instead |
| --- | --- |
| `process` | Ids and secrets are on `context`. |
| `fs` | Use context.storage. |
| `child_process` | Not available. For ffmpeg, use context.media.run. |
| `os` | Not available. |
| `net` | Use fetch. |
| `http` | Use fetch. |
| `https` | Use fetch. |
| `eval` | Not available. |
| `Function` | Not available as a constructor. |
| `Buffer` | Use Uint8Array and TextEncoder/TextDecoder. |
| `__dirname` | There is no meaningful filesystem. |
<!-- globals:end -->

No environment variables, no filesystem, no child processes. Files go through `context.storage`; keys through a `secret` property or `context.secrets`. Bytes are `Uint8Array`: decode with `new TextDecoder().decode(bytes)`, encode with `new TextEncoder().encode(text)`.

## npm packages

`require` with a literal string and a bare package name: `require("lodash")`, never `require("lodash/get")` or `require(name)`. They are pre-installed in the sandbox, so there is nothing to install or bundle for the platform. Locally, `vsa test` without Docker loads them from the project and prints the `npm install` line for a missing one.

<!-- packages:start -->
`nodemailer`, `lodash`, `ramda`, `underscore`, `immer`, `immutable`, `deepmerge`, `defu`, `rfdc`, `klona`, `fast-copy`, `fast-deep-equal`, `dequal`, `object-hash`, `hash-sum`, `flat`, `dot-prop`, `object-path`, `sort-array`, `natural-orderby`, `deep-object-diff`, `microdiff`, `fast-json-patch`, `rfc6902`, `just-clone`, `just-diff`, `just-diff-apply`, `just-omit`, `just-pick`, `just-group-by`, `just-order-by`, `just-unique`, `just-flatten-it`, `just-safe-get`, `just-safe-set`, `just-typeof`, `just-range`, `just-zip-it`, `just-compare`, `just-intersect`, `just-split`, `just-truncate`, `semver`, `compare-versions`, `tiny-invariant`, `json-stringify-safe`, `fast-safe-stringify`, `flatted`, `superjson`, `devalue`, `lru-cache`, `quick-lru`, `memoize-one`, `fast-memoize`, `uuid`, `nanoid`, `ulid`, `@paralleldrive/cuid2`, `slugify`, `slug`, `sanitize-filename`, `filenamify`, `seedrandom`, `random-js`, `chance`, `@faker-js/faker`, `lorem-ipsum`, `randomcolor`, `date-fns`, `date-fns-tz`, `dayjs`, `luxon`, `moment`, `moment-timezone`, `ms`, `pretty-ms`, `parse-duration`, `humanize-duration`, `timeago.js`, `chrono-node`, `rrule`, `cron-parser`, `cronstrue`, `date-and-time`, `fecha`, `dateformat`, `iso8601-duration`, `ics`, `zod`, `yup`, `joi`, `ajv`, `ajv-formats`, `ajv-errors`, `superstruct`, `valibot`, `jsonschema`, `@sinclair/typebox`, `validator`, `email-validator`, `libphonenumber-js`, `iban`, `credit-card-type`, `card-validator`, `psl`, `tldts`, `normalize-url`, `valid-url`, `is-ip`, `ipaddr.js`, `ip-address`, `netmask`, `ua-parser-js`, `bowser`, `papaparse`, `csv-parse`, `csv-stringify`, `json-2-csv`, `js-yaml`, `yaml`, `json5`, `jsonc-parser`, `hjson`, `toml`, `@iarna/toml`, `ini`, `fast-xml-parser`, `xml2js`, `xml-js`, `xmlbuilder2`, `@xmldom/xmldom`, `xpath`, `cheerio`, `htmlparser2`, `node-html-parser`, `parse5`, `sanitize-html`, `marked`, `markdown-it`, `showdown`, `turndown`, `html-to-text`, `he`, `entities`, `striptags`, `front-matter`, `qs`, `query-string`, `url-parse`, `mime-types`, `mime`, `content-type`, `cookie`, `set-cookie-parser`, `jsonpath-plus`, `jmespath`, `jsonata`, `exceljs`, `change-case`, `camelcase`, `decamelize`, `title-case`, `pluralize`, `inflection`, `voca`, `underscore.string`, `string-similarity`, `fastest-levenshtein`, `leven`, `diff`, `diff-match-patch`, `remove-accents`, `transliteration`, `latinize`, `franc`, `stopword`, `emoji-regex`, `node-emoji`, `string-width`, `word-wrap`, `wrap-ansi`, `linkify-it`, `linkifyjs`, `fuse.js`, `minisearch`, `lunr`, `flexsearch`, `mustache`, `liquidjs`, `intl-messageformat`, `gpt-tokenizer`, `js-tiktoken`, `decimal.js`, `big.js`, `bignumber.js`, `currency.js`, `dinero.js`, `numeral`, `accounting`, `fraction.js`, `convert-units`, `js-quantities`, `mathjs`, `simple-statistics`, `ml-matrix`, `d3-array`, `d3-format`, `d3-time-format`, `geolib`, `haversine-distance`, `filesize`, `bytes`, `human-format`, `jsonwebtoken`, `jose`, `jws`, `jwt-decode`, `crypto-js`, `bcryptjs`, `otplib`, `otpauth`, `tweetnacl`, `tweetnacl-util`, `node-forge`, `elliptic`, `bn.js`, `js-base64`, `base64-js`, `base-64`, `hi-base32`, `thirty-two`, `js-sha256`, `js-sha512`, `js-sha1`, `js-md5`, `hash.js`, `spark-md5`, `blueimp-md5`, `crc-32`, `crc`, `utf8`, `iconv-lite`, `punycode`, `pako`, `fflate`, `lz-string`, `color`, `tinycolor2`, `chroma-js`, `color-convert`, `colord`, `i18n-iso-countries`, `iso-3166-1`, `iso-639-1`, `currency-codes`, `qrcode-generator`, `p-limit`, `p-retry`, `p-map`, `p-queue`, `p-timeout`, `p-all`, `p-props`, `p-settle`, `p-throttle`, `p-debounce`, `async`, `bluebird`, `promise-retry`, `retry`, `exponential-backoff`, `bottleneck`, `throttle-debounce`, `delay`, `graphlib`
<!-- packages:end -->

Useful picks: dates `date-fns`, `dayjs`, `luxon`; validation `zod`; CSV `papaparse`, `csv-parse`; XML `fast-xml-parser`; HTML `cheerio`; Markdown `marked`; money `decimal.js`, `currency.js`; JWT `jose`; retries `p-retry`; concurrency `p-limit`; ids `nanoid`, `uuid`; spreadsheets `exceljs`; templates `mustache`, `liquidjs`.

## Refused code

The platform refuses `index.js` when `require` is called with anything but a string literal naming an allowed package, or when any of these regular expressions matches **anywhere in the text, comments and strings included**:

<!-- patterns:start -->
```text
\bprocess\s*\.\s*exit
\bprocess\s*\.\s*env
\bprocess\s*\.\s*binding
\bprocess\s*\.\s*mainModule
\bprocess\s*\[
\bprocess\s*\(
\beval\s*\(
\bFunction\s*\(
\bnew\s+Function\b
\bAsyncFunction\b
\bGeneratorFunction\b
\bglobalThis\b
\bself\s*\[
\bimport\s+
\bimport\s*\(
\bReflect\b
\bProxy\b
\b__proto__\b
\bprototype\s*\[
\bprototype\s*\.\s*constructor\b
\bconstructor\b
\bthis\s*\.\s*constructor\b
\barguments\s*\.\s*callee\b
\bObject\s*\.\s*defineProperty\b
\b__defineGetter__\b
\b__defineSetter__\b
\b__lookupGetter__\b
\b__lookupSetter__\b
\bmodule\s*\.\s*(?:constructor|extensions|_compile|_path|_sourceMaps)\b
\brequire\s*\.\s*cache\b
\brequire\s*\.\s*resolve\b
\bError\s*\.\s*captureStackTrace\b
\bWebAssembly\b
```
<!-- patterns:end -->

So: no `import` (not even `import type`, or the word "import" followed by a space in a comment), no `.constructor` and no variable called `constructor` (`constructorName` is fine: not a whole word), no `globalThis`, `Reflect`, `Proxy`, `eval(` or `process.env`. Rephrase comments that would contain them.

## Network

- `fetch` may reach the hosts allowed for the plugin on the platform (a domain covers its subdomains), plus a host in the step's own configuration, such as a URL field. The manifest cannot widen this.
- Never localhost, private networks or cloud metadata addresses.
- Locally, `allowedDomains` in the test file applies the same rule; without it, `vsa test` lists every host the platform would refuse.

## Limits

| | Default | Max |
| --- | --- | --- |
| `timeoutMs`, one run of the step | 10000 on a canvas, 30000 in the push check | 60000, and the user's plan |
| `index.js` | | 100,000 characters |
| `memoryLimitMb` | 32 | 128 |
| One state value | | 128 KB |
| `ttlSeconds` on a state value | at least 60 | |
| A loop the user puts the step in | | 200 items |

Machine tiers (`vsa dev --tier`), the first being the default: <!-- tiers:start -->`standard` 0.5 vCPU and 4 GB, `boosted` 1 vCPU and 6 GB, `high` 2 vCPU and 8 GB<!-- tiers:end -->.
