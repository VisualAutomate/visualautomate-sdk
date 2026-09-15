/**
 * The rules the VisualAutomate platform applies to a plugin's code on upload.
 *
 * Kept identical to the platform's, so a local test refuses what an upload
 * would refuse. When the platform changes them, this file changes with them in
 * the next release of the SDK.
 */

/** The npm packages a step may require, and the version the sandbox has installed. */
export const ALLOWED_PACKAGES: ReadonlyArray<{ name: string; version: string }> = [
    {
        "name": "nodemailer",
        "version": "^6.10.0"
    },
    {
        "name": "lodash",
        "version": "^4.17.21"
    },
    {
        "name": "ramda",
        "version": "^0.30.1"
    },
    {
        "name": "underscore",
        "version": "^1.13.8"
    },
    {
        "name": "immer",
        "version": "^11.1.18"
    },
    {
        "name": "immutable",
        "version": "^5.1.9"
    },
    {
        "name": "deepmerge",
        "version": "^4.3.1"
    },
    {
        "name": "defu",
        "version": "^6.1.7"
    },
    {
        "name": "rfdc",
        "version": "^1.4.1"
    },
    {
        "name": "klona",
        "version": "^2.0.6"
    },
    {
        "name": "fast-copy",
        "version": "^4.1.1"
    },
    {
        "name": "fast-deep-equal",
        "version": "^3.1.3"
    },
    {
        "name": "dequal",
        "version": "^2.0.3"
    },
    {
        "name": "object-hash",
        "version": "^3.0.0"
    },
    {
        "name": "hash-sum",
        "version": "^2.0.0"
    },
    {
        "name": "flat",
        "version": "^6.0.1"
    },
    {
        "name": "dot-prop",
        "version": "^10.2.0"
    },
    {
        "name": "object-path",
        "version": "^0.11.8"
    },
    {
        "name": "sort-array",
        "version": "^5.1.1"
    },
    {
        "name": "natural-orderby",
        "version": "^5.0.0"
    },
    {
        "name": "deep-object-diff",
        "version": "^1.1.9"
    },
    {
        "name": "microdiff",
        "version": "^1.6.0"
    },
    {
        "name": "fast-json-patch",
        "version": "^3.1.1"
    },
    {
        "name": "rfc6902",
        "version": "^5.3.0"
    },
    {
        "name": "just-clone",
        "version": "^6.2.0"
    },
    {
        "name": "just-diff",
        "version": "^6.0.2"
    },
    {
        "name": "just-diff-apply",
        "version": "^5.5.0"
    },
    {
        "name": "just-omit",
        "version": "^2.2.0"
    },
    {
        "name": "just-pick",
        "version": "^4.2.0"
    },
    {
        "name": "just-group-by",
        "version": "^2.2.0"
    },
    {
        "name": "just-order-by",
        "version": "^1.0.0"
    },
    {
        "name": "just-unique",
        "version": "^4.2.0"
    },
    {
        "name": "just-flatten-it",
        "version": "^5.2.0"
    },
    {
        "name": "just-safe-get",
        "version": "^4.2.0"
    },
    {
        "name": "just-safe-set",
        "version": "^4.2.1"
    },
    {
        "name": "just-typeof",
        "version": "^3.2.0"
    },
    {
        "name": "just-range",
        "version": "^4.2.0"
    },
    {
        "name": "just-zip-it",
        "version": "^3.2.0"
    },
    {
        "name": "just-compare",
        "version": "^2.3.0"
    },
    {
        "name": "just-intersect",
        "version": "^4.3.0"
    },
    {
        "name": "just-split",
        "version": "^3.2.0"
    },
    {
        "name": "just-truncate",
        "version": "^2.2.0"
    },
    {
        "name": "semver",
        "version": "^7.6.3"
    },
    {
        "name": "compare-versions",
        "version": "^6.1.1"
    },
    {
        "name": "tiny-invariant",
        "version": "^1.3.3"
    },
    {
        "name": "json-stringify-safe",
        "version": "^5.0.1"
    },
    {
        "name": "fast-safe-stringify",
        "version": "^2.1.1"
    },
    {
        "name": "flatted",
        "version": "^3.4.4"
    },
    {
        "name": "superjson",
        "version": "^2.2.6"
    },
    {
        "name": "devalue",
        "version": "^5.9.2"
    },
    {
        "name": "lru-cache",
        "version": "^11.5.2"
    },
    {
        "name": "quick-lru",
        "version": "^7.3.0"
    },
    {
        "name": "memoize-one",
        "version": "^6.0.0"
    },
    {
        "name": "fast-memoize",
        "version": "^2.5.2"
    },
    {
        "name": "uuid",
        "version": "^11.0.5"
    },
    {
        "name": "nanoid",
        "version": "^5.0.9"
    },
    {
        "name": "ulid",
        "version": "^3.0.2"
    },
    {
        "name": "@paralleldrive/cuid2",
        "version": "^3.3.0"
    },
    {
        "name": "slugify",
        "version": "^1.6.6"
    },
    {
        "name": "slug",
        "version": "^12.0.1"
    },
    {
        "name": "sanitize-filename",
        "version": "^1.6.4"
    },
    {
        "name": "filenamify",
        "version": "^7.0.3"
    },
    {
        "name": "seedrandom",
        "version": "^3.0.5"
    },
    {
        "name": "random-js",
        "version": "^2.1.0"
    },
    {
        "name": "chance",
        "version": "^1.1.13"
    },
    {
        "name": "@faker-js/faker",
        "version": "^10.6.0"
    },
    {
        "name": "lorem-ipsum",
        "version": "^3.0.0"
    },
    {
        "name": "randomcolor",
        "version": "^0.6.2"
    },
    {
        "name": "date-fns",
        "version": "^4.1.0"
    },
    {
        "name": "date-fns-tz",
        "version": "^3.2.0"
    },
    {
        "name": "dayjs",
        "version": "^1.11.13"
    },
    {
        "name": "luxon",
        "version": "^3.5.0"
    },
    {
        "name": "moment",
        "version": "^2.30.1"
    },
    {
        "name": "moment-timezone",
        "version": "^0.6.3"
    },
    {
        "name": "ms",
        "version": "^2.1.3"
    },
    {
        "name": "pretty-ms",
        "version": "^9.3.1"
    },
    {
        "name": "parse-duration",
        "version": "^2.1.8"
    },
    {
        "name": "humanize-duration",
        "version": "^3.34.1"
    },
    {
        "name": "timeago.js",
        "version": "^4.0.2"
    },
    {
        "name": "chrono-node",
        "version": "^2.7.7"
    },
    {
        "name": "rrule",
        "version": "^2.8.1"
    },
    {
        "name": "cron-parser",
        "version": "^5.10.0"
    },
    {
        "name": "cronstrue",
        "version": "^3.26.0"
    },
    {
        "name": "date-and-time",
        "version": "^4.5.2"
    },
    {
        "name": "fecha",
        "version": "^4.2.3"
    },
    {
        "name": "dateformat",
        "version": "^5.0.3"
    },
    {
        "name": "iso8601-duration",
        "version": "^2.1.4"
    },
    {
        "name": "ics",
        "version": "^3.12.0"
    },
    {
        "name": "zod",
        "version": "^3.24.1"
    },
    {
        "name": "yup",
        "version": "^1.6.1"
    },
    {
        "name": "joi",
        "version": "^18.2.8"
    },
    {
        "name": "ajv",
        "version": "^8.17.1"
    },
    {
        "name": "ajv-formats",
        "version": "^3.0.1"
    },
    {
        "name": "ajv-errors",
        "version": "^3.0.0"
    },
    {
        "name": "superstruct",
        "version": "^2.0.2"
    },
    {
        "name": "valibot",
        "version": "^1.5.0"
    },
    {
        "name": "jsonschema",
        "version": "^1.5.0"
    },
    {
        "name": "@sinclair/typebox",
        "version": "^0.34.52"
    },
    {
        "name": "validator",
        "version": "^13.12.0"
    },
    {
        "name": "email-validator",
        "version": "^2.0.4"
    },
    {
        "name": "libphonenumber-js",
        "version": "^1.11.17"
    },
    {
        "name": "iban",
        "version": "^0.0.14"
    },
    {
        "name": "credit-card-type",
        "version": "^10.3.0"
    },
    {
        "name": "card-validator",
        "version": "^10.0.4"
    },
    {
        "name": "psl",
        "version": "^1.15.0"
    },
    {
        "name": "tldts",
        "version": "^7.4.12"
    },
    {
        "name": "normalize-url",
        "version": "^9.0.1"
    },
    {
        "name": "valid-url",
        "version": "^1.0.9"
    },
    {
        "name": "is-ip",
        "version": "^5.0.1"
    },
    {
        "name": "ipaddr.js",
        "version": "^2.5.0"
    },
    {
        "name": "ip-address",
        "version": "^10.7.0"
    },
    {
        "name": "netmask",
        "version": "^2.1.1"
    },
    {
        "name": "ua-parser-js",
        "version": "^2.0.10"
    },
    {
        "name": "bowser",
        "version": "^2.14.1"
    },
    {
        "name": "papaparse",
        "version": "^5.4.1"
    },
    {
        "name": "csv-parse",
        "version": "^7.0.2"
    },
    {
        "name": "csv-stringify",
        "version": "^6.8.3"
    },
    {
        "name": "json-2-csv",
        "version": "^5.6.0"
    },
    {
        "name": "js-yaml",
        "version": "^4.1.0"
    },
    {
        "name": "yaml",
        "version": "^2.9.0"
    },
    {
        "name": "json5",
        "version": "^2.2.3"
    },
    {
        "name": "jsonc-parser",
        "version": "^3.3.1"
    },
    {
        "name": "hjson",
        "version": "^3.2.2"
    },
    {
        "name": "toml",
        "version": "^5.0.0"
    },
    {
        "name": "@iarna/toml",
        "version": "^2.2.5"
    },
    {
        "name": "ini",
        "version": "^7.0.0"
    },
    {
        "name": "fast-xml-parser",
        "version": "^4.5.1"
    },
    {
        "name": "xml2js",
        "version": "^0.6.2"
    },
    {
        "name": "xml-js",
        "version": "^1.6.11"
    },
    {
        "name": "xmlbuilder2",
        "version": "^4.0.3"
    },
    {
        "name": "@xmldom/xmldom",
        "version": "^0.9.12"
    },
    {
        "name": "xpath",
        "version": "^0.0.34"
    },
    {
        "name": "cheerio",
        "version": "^1.0.0"
    },
    {
        "name": "htmlparser2",
        "version": "^12.0.0"
    },
    {
        "name": "node-html-parser",
        "version": "^9.0.4"
    },
    {
        "name": "parse5",
        "version": "^8.0.1"
    },
    {
        "name": "sanitize-html",
        "version": "^2.17.7"
    },
    {
        "name": "marked",
        "version": "^15.0.6"
    },
    {
        "name": "markdown-it",
        "version": "^15.0.1"
    },
    {
        "name": "showdown",
        "version": "^2.1.0"
    },
    {
        "name": "turndown",
        "version": "^7.2.0"
    },
    {
        "name": "html-to-text",
        "version": "^9.0.5"
    },
    {
        "name": "he",
        "version": "^1.2.0"
    },
    {
        "name": "entities",
        "version": "^8.1.0"
    },
    {
        "name": "striptags",
        "version": "^3.2.0"
    },
    {
        "name": "front-matter",
        "version": "^4.0.2"
    },
    {
        "name": "qs",
        "version": "^6.13.1"
    },
    {
        "name": "query-string",
        "version": "^9.5.1"
    },
    {
        "name": "url-parse",
        "version": "^1.5.10"
    },
    {
        "name": "mime-types",
        "version": "^2.1.35"
    },
    {
        "name": "mime",
        "version": "^4.1.0"
    },
    {
        "name": "content-type",
        "version": "^3.0.0"
    },
    {
        "name": "cookie",
        "version": "^2.0.1"
    },
    {
        "name": "set-cookie-parser",
        "version": "^3.1.2"
    },
    {
        "name": "jsonpath-plus",
        "version": "^10.2.0"
    },
    {
        "name": "jmespath",
        "version": "^0.16.0"
    },
    {
        "name": "jsonata",
        "version": "^2.2.2"
    },
    {
        "name": "exceljs",
        "version": "^4.4.0"
    },
    {
        "name": "change-case",
        "version": "^5.4.4"
    },
    {
        "name": "camelcase",
        "version": "^9.0.0"
    },
    {
        "name": "decamelize",
        "version": "^6.0.1"
    },
    {
        "name": "title-case",
        "version": "^4.3.2"
    },
    {
        "name": "pluralize",
        "version": "^8.0.0"
    },
    {
        "name": "inflection",
        "version": "^3.0.2"
    },
    {
        "name": "voca",
        "version": "^1.4.1"
    },
    {
        "name": "underscore.string",
        "version": "^3.3.6"
    },
    {
        "name": "string-similarity",
        "version": "^4.0.4"
    },
    {
        "name": "fastest-levenshtein",
        "version": "^1.0.16"
    },
    {
        "name": "leven",
        "version": "^4.1.0"
    },
    {
        "name": "diff",
        "version": "^7.0.0"
    },
    {
        "name": "diff-match-patch",
        "version": "^1.0.5"
    },
    {
        "name": "remove-accents",
        "version": "^0.5.0"
    },
    {
        "name": "transliteration",
        "version": "^2.6.1"
    },
    {
        "name": "latinize",
        "version": "^2.0.0"
    },
    {
        "name": "franc",
        "version": "^6.2.0"
    },
    {
        "name": "stopword",
        "version": "^3.1.5"
    },
    {
        "name": "emoji-regex",
        "version": "^10.6.0"
    },
    {
        "name": "node-emoji",
        "version": "^2.2.0"
    },
    {
        "name": "string-width",
        "version": "^8.2.2"
    },
    {
        "name": "word-wrap",
        "version": "^1.2.5"
    },
    {
        "name": "wrap-ansi",
        "version": "^10.0.1"
    },
    {
        "name": "linkify-it",
        "version": "^6.1.0"
    },
    {
        "name": "linkifyjs",
        "version": "^4.3.3"
    },
    {
        "name": "fuse.js",
        "version": "^7.5.0"
    },
    {
        "name": "minisearch",
        "version": "^7.2.0"
    },
    {
        "name": "lunr",
        "version": "^2.3.9"
    },
    {
        "name": "flexsearch",
        "version": "^0.8.212"
    },
    {
        "name": "mustache",
        "version": "^4.2.0"
    },
    {
        "name": "liquidjs",
        "version": "^10.20.1"
    },
    {
        "name": "intl-messageformat",
        "version": "^11.2.14"
    },
    {
        "name": "gpt-tokenizer",
        "version": "^4.0.0"
    },
    {
        "name": "js-tiktoken",
        "version": "^1.0.21"
    },
    {
        "name": "decimal.js",
        "version": "^10.4.3"
    },
    {
        "name": "big.js",
        "version": "^6.2.2"
    },
    {
        "name": "bignumber.js",
        "version": "^11.1.5"
    },
    {
        "name": "currency.js",
        "version": "^2.0.4"
    },
    {
        "name": "dinero.js",
        "version": "^2.0.2"
    },
    {
        "name": "numeral",
        "version": "^2.0.6"
    },
    {
        "name": "accounting",
        "version": "^0.4.1"
    },
    {
        "name": "fraction.js",
        "version": "^5.3.4"
    },
    {
        "name": "convert-units",
        "version": "^2.3.4"
    },
    {
        "name": "js-quantities",
        "version": "^1.8.0"
    },
    {
        "name": "mathjs",
        "version": "^15.2.0"
    },
    {
        "name": "simple-statistics",
        "version": "^7.12.0"
    },
    {
        "name": "ml-matrix",
        "version": "^6.15.0"
    },
    {
        "name": "d3-array",
        "version": "^3.2.4"
    },
    {
        "name": "d3-format",
        "version": "^3.1.2"
    },
    {
        "name": "d3-time-format",
        "version": "^4.1.0"
    },
    {
        "name": "geolib",
        "version": "^3.3.14"
    },
    {
        "name": "haversine-distance",
        "version": "^1.2.4"
    },
    {
        "name": "filesize",
        "version": "^11.0.23"
    },
    {
        "name": "bytes",
        "version": "^3.1.2"
    },
    {
        "name": "human-format",
        "version": "^1.2.1"
    },
    {
        "name": "jsonwebtoken",
        "version": "^9.0.2"
    },
    {
        "name": "jose",
        "version": "^5.9.6"
    },
    {
        "name": "jws",
        "version": "^4.0.1"
    },
    {
        "name": "jwt-decode",
        "version": "^4.0.0"
    },
    {
        "name": "crypto-js",
        "version": "^4.2.0"
    },
    {
        "name": "bcryptjs",
        "version": "^2.4.3"
    },
    {
        "name": "otplib",
        "version": "^13.5.0"
    },
    {
        "name": "otpauth",
        "version": "^9.5.2"
    },
    {
        "name": "tweetnacl",
        "version": "^1.0.3"
    },
    {
        "name": "tweetnacl-util",
        "version": "^0.15.1"
    },
    {
        "name": "node-forge",
        "version": "^1.4.0"
    },
    {
        "name": "elliptic",
        "version": "^6.6.1"
    },
    {
        "name": "bn.js",
        "version": "^5.2.5"
    },
    {
        "name": "js-base64",
        "version": "^3.7.7"
    },
    {
        "name": "base64-js",
        "version": "^1.5.1"
    },
    {
        "name": "base-64",
        "version": "^1.0.0"
    },
    {
        "name": "hi-base32",
        "version": "^0.5.1"
    },
    {
        "name": "thirty-two",
        "version": "^1.0.2"
    },
    {
        "name": "js-sha256",
        "version": "^1.0.0"
    },
    {
        "name": "js-sha512",
        "version": "^0.9.0"
    },
    {
        "name": "js-sha1",
        "version": "^0.7.0"
    },
    {
        "name": "js-md5",
        "version": "^0.9.2"
    },
    {
        "name": "hash.js",
        "version": "^1.1.7"
    },
    {
        "name": "spark-md5",
        "version": "^3.0.2"
    },
    {
        "name": "blueimp-md5",
        "version": "^2.19.0"
    },
    {
        "name": "crc-32",
        "version": "^1.2.2"
    },
    {
        "name": "crc",
        "version": "^4.3.2"
    },
    {
        "name": "utf8",
        "version": "^3.0.0"
    },
    {
        "name": "iconv-lite",
        "version": "^0.7.3"
    },
    {
        "name": "punycode",
        "version": "^2.3.1"
    },
    {
        "name": "pako",
        "version": "^3.0.1"
    },
    {
        "name": "fflate",
        "version": "^0.8.3"
    },
    {
        "name": "lz-string",
        "version": "^1.5.0"
    },
    {
        "name": "color",
        "version": "^5.0.3"
    },
    {
        "name": "tinycolor2",
        "version": "^1.6.0"
    },
    {
        "name": "chroma-js",
        "version": "^3.2.0"
    },
    {
        "name": "color-convert",
        "version": "^3.1.3"
    },
    {
        "name": "colord",
        "version": "^2.10.0"
    },
    {
        "name": "i18n-iso-countries",
        "version": "^7.14.0"
    },
    {
        "name": "iso-3166-1",
        "version": "^2.1.1"
    },
    {
        "name": "iso-639-1",
        "version": "^3.1.6"
    },
    {
        "name": "currency-codes",
        "version": "^2.2.0"
    },
    {
        "name": "qrcode-generator",
        "version": "^2.0.4"
    },
    {
        "name": "p-limit",
        "version": "^6.2.0"
    },
    {
        "name": "p-retry",
        "version": "^6.2.1"
    },
    {
        "name": "p-map",
        "version": "^7.0.3"
    },
    {
        "name": "p-queue",
        "version": "^9.3.3"
    },
    {
        "name": "p-timeout",
        "version": "^7.0.1"
    },
    {
        "name": "p-all",
        "version": "^5.0.1"
    },
    {
        "name": "p-props",
        "version": "^6.1.0"
    },
    {
        "name": "p-settle",
        "version": "^5.2.1"
    },
    {
        "name": "p-throttle",
        "version": "^8.1.0"
    },
    {
        "name": "p-debounce",
        "version": "^5.1.0"
    },
    {
        "name": "async",
        "version": "^3.2.6"
    },
    {
        "name": "bluebird",
        "version": "^3.7.2"
    },
    {
        "name": "promise-retry",
        "version": "^2.0.1"
    },
    {
        "name": "retry",
        "version": "^0.13.1"
    },
    {
        "name": "exponential-backoff",
        "version": "^3.1.3"
    },
    {
        "name": "bottleneck",
        "version": "^2.19.5"
    },
    {
        "name": "throttle-debounce",
        "version": "^5.0.2"
    },
    {
        "name": "delay",
        "version": "^7.0.0"
    },
    {
        "name": "graphlib",
        "version": "^2.1.8"
    }
]

/** Code matching any of these is refused on upload. */
export const RESTRICTED_PATTERNS: ReadonlyArray<RegExp> = [
    /\bprocess\s*\.\s*exit/,
    /\bprocess\s*\.\s*env/,
    /\bprocess\s*\.\s*binding/,
    /\bprocess\s*\.\s*mainModule/,
    /\bprocess\s*\[/,
    /\bprocess\s*\(/,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bnew\s+Function\b/,
    /\bAsyncFunction\b/,
    /\bGeneratorFunction\b/,
    /\bglobalThis\b/,
    /\bself\s*\[/,
    /\bimport\s+/,
    /\bimport\s*\(/,
    /\bReflect\b/,
    /\bProxy\b/,
    /\b__proto__\b/,
    /\bprototype\s*\[/,
    /\bprototype\s*\.\s*constructor\b/,
    /\bconstructor\b/,
    /\bthis\s*\.\s*constructor\b/,
    /\barguments\s*\.\s*callee\b/,
    /\bObject\s*\.\s*defineProperty\b/,
    /\b__defineGetter__\b/,
    /\b__defineSetter__\b/,
    /\b__lookupGetter__\b/,
    /\b__lookupSetter__\b/,
    /\bmodule\s*\.\s*(?:constructor|extensions|_compile|_path|_sourceMaps)\b/,
    /\brequire\s*\.\s*cache\b/,
    /\brequire\s*\.\s*resolve\b/,
    /\bError\s*\.\s*captureStackTrace\b/,
    /\bWebAssembly\b/,
]
