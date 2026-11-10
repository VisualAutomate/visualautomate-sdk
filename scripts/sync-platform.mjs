/**
 * Bring packages/plugin-sdk/src/platform-rules.ts in line with the platform.
 *
 * The SDK and the CLI promise that a step which passes here passes there. That
 * promise is only as good as the facts this file holds, and every one of them
 * lives in the platform's own source: the packages a step may require (and the
 * versions the sandbox installs), the code the upload refuses, the globals the
 * runner hands a step, the Node version it runs on, the machine tiers, and the
 * rules of the push check. Copying them by hand is how they drifted before:
 * nodemailer 10 on the platform and 6 here, a tier table one size out of date,
 * Node 24 there and 20 here.
 *
 * So they are read from checkouts of the platform (www.visualautomate.com) and
 * the developer portal (developers.visualautomate.com) and written out. Only
 * facts are copied, never the platform's code: this repository is public.
 *
 *     node --experimental-strip-types scripts/sync-platform.mjs \
 *         --www ../www.visualautomate.com --portal ../developers.visualautomate.com
 *
 * Node 22.6 or newer, to import the platform's TypeScript lists directly. Then
 * `npm run build && npm run skill:sync` and `npm test`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const args = process.argv.slice(2)
const flag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
}
const www = resolve(flag("www") ?? "../www.visualautomate.com")
const portal = resolve(flag("portal") ?? "../developers.visualautomate.com")
for (const dir of [www, portal]) {
    if (!existsSync(dir)) {
        console.error(`No checkout at ${dir}. Pass --www and --portal.`)
        process.exit(1)
    }
}

const read = (root, path) => readFileSync(join(root, path), "utf8")
const fail = (message) => {
    console.error(`sync-platform: ${message}. The platform's source has changed shape; update this script.`)
    process.exit(1)
}

// ─── Packages, versions and the sandbox's overrides ─────────────────────────

const allowed = await import(pathToFileURL(join(www, "lib/plugins/allowed-packages.ts")).href)
const packages = allowed.ALLOWED_PACKAGES.map((p) => ({ name: p.name, version: p.version }))
const sandboxPackageJson = JSON.parse(allowed.generateSandboxPackageJson())
const overrides = sandboxPackageJson.overrides ?? {}

const portalAllowed = await import(pathToFileURL(join(portal, "lib/plugins/allowed-packages.ts")).href)
const portalList = JSON.stringify(portalAllowed.ALLOWED_PACKAGES.map((p) => [p.name, p.version]))
if (portalList !== JSON.stringify(packages.map((p) => [p.name, p.version]))) {
    fail("the portal's allowed packages differ from the platform's; the push check and a run would disagree")
}

// ─── The code the upload refuses ────────────────────────────────────────────

const manifestSource = read(www, "lib/plugins/manifest.ts")
const patternsBlock = /const RESTRICTED_PATTERNS = \[\n([\s\S]*?)\n\]/.exec(manifestSource)?.[1] ?? fail("no RESTRICTED_PATTERNS in manifest.ts")
const patterns = patternsBlock
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line.startsWith("/"))
    .map((line) => line.replace(/,$/, ""))
const maxCodeLength = Number(/const MAX_CODE_LENGTH = (\d+)/.exec(manifestSource)?.[1] ?? fail("no MAX_CODE_LENGTH"))

// ─── What the runner hands a step ───────────────────────────────────────────

const runner = read(www, "lib/plugins/workflow-runner-script.ts")
const globalsStart = runner.indexOf("const sandboxGlobals = {")
if (globalsStart < 0) fail("no sandboxGlobals in workflow-runner-script.ts")
const globalsBody = runner.slice(globalsStart, runner.indexOf("};", globalsStart)).replace(/\/\*[\s\S]*?\*\//g, "")
const provided = [...globalsBody.matchAll(/^\s+([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1])
const blockedMatch = /blockedGlobals = \[([\s\S]*?)\];/.exec(runner.slice(globalsStart)) ?? fail("no blockedGlobals")
const blocked = [...blockedMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])

// ─── Node, machines, limits ─────────────────────────────────────────────────

const runtimes = [
    ...read(www, "lib/plugins/sandbox-manager.ts").matchAll(/runtime:\s*['"]node(\d+)['"]/g),
    ...read(www, "lib/sandbox.ts").matchAll(/runtime:\s*['"]node(\d+)['"]/g),
].map((m) => Number(m[1]))
if (runtimes.length === 0) fail("no runtime: 'nodeNN' in the sandbox managers")
const nodeMajor = Math.max(...runtimes)
const baseImage = read(www, "workers/sandbox/Dockerfile")
if (!/^FROM docker\.io\/cloudflare\/sandbox:/m.test(baseImage)) fail("the container is no longer built on cloudflare/sandbox; check its Node version by hand")

const tiersModule = await import(pathToFileURL(join(www, "lib/plugins/sandbox-tiers.ts")).href)
const tiers = tiersModule.SANDBOX_TIERS.map((t) => ({ id: t.id, label: t.label, vcpus: t.vcpus, memoryGb: t.memoryGb }))
const tiersSource = read(www, "lib/plugins/sandbox-tiers.ts")
const retired = Object.fromEntries(
    [...(/const RETIRED[^=]*=\s*\{([^}]*)\}/.exec(tiersSource)?.[1] ?? "").matchAll(/(\w+):\s*"(\w+)"/g)].map((m) => [m[1], m[2]]),
)

const pluginTypes = read(www, "lib/plugin-types.ts")
if (!/at most 128 KB/.test(pluginTypes)) fail("plugin-types.ts no longer says state values are at most 128 KB")
if (!/must be at least 60/.test(pluginTypes)) fail("plugin-types.ts no longer says ttlSeconds must be at least 60")

const storageRoute = read(www, "app/api/storage/route.ts")
const signed = /Math\.min\(Math\.max\(Number\(body\.expiresIn\) \|\| (\d+), (\d+)\), (\d+)\)/.exec(storageRoute) ?? fail("no signedUrl clamp in app/api/storage/route.ts")

// ─── The push check ─────────────────────────────────────────────────────────

const plan = read(portal, "lib/github/commit-plan.ts")
const num = (name) => Number((new RegExp(`const ${name} = ([\\d_]+)`).exec(plan)?.[1] ?? fail(`no ${name} in commit-plan.ts`)).replace(/_/g, ""))
const defaultExpect = /let expectOutput = "([^"]+)"/.exec(plan)?.[1] ?? fail("no default expectOutput in commit-plan.ts")
const declaredRefused = /declaresAnAction\(manifestText\)/.test(plan)

// ─── Write ──────────────────────────────────────────────────────────────────

const json = (value) => JSON.stringify(value, null, 4)
const out = `/**
 * The rules the VisualAutomate platform applies to a step, as facts.
 *
 * GENERATED by scripts/sync-platform.mjs from the platform's and the developer
 * portal's source. Do not edit by hand: run the script, so a local test refuses
 * what an upload would refuse and runs a step the way the platform runs it.
 */

/** The npm packages a step may require, and the version the sandbox installs. */
export const ALLOWED_PACKAGES: ReadonlyArray<{ name: string; version: string }> = ${json(packages)}

/** npm overrides the platform's sandbox installs the packages with. */
export const SANDBOX_OVERRIDES: Readonly<Record<string, Record<string, string>>> = ${json(overrides)}

/** Code matching any of these is refused on upload. */
export const RESTRICTED_PATTERNS: ReadonlyArray<RegExp> = [
${patterns.map((p) => `    ${p},`).join("\n")}
]

/** Code longer than this many characters is refused on upload. */
export const MAX_CODE_LENGTH = ${maxCodeLength}

/** The major version of Node the platform runs steps on. */
export const PLATFORM_NODE_MAJOR = ${nodeMajor}

/**
 * The globals the runner hands a step's code, besides the language's own
 * (Object, Array, JSON, Math, Promise and the rest, which the step's context
 * has a fresh set of). \`require\` and \`console\` are among them.
 */
export const PROVIDED_GLOBALS: ReadonlyArray<string> = ${json(provided)}

/** Names the runner sets to undefined in a step's context. */
export const BLOCKED_GLOBAL_NAMES: ReadonlyArray<string> = ${json(blocked)}

/** The machines a run can be given, smallest first. */
export const SANDBOX_TIERS: ReadonlyArray<{ id: string; label: string; vcpus: number; memoryGb: number }> = ${json(tiers)}

/** Tier names that are no longer offered, and the tier they now mean. */
export const RETIRED_TIERS: Readonly<Record<string, string>> = ${json(retired)}

/** Limits on \`context.state\`. */
export const STATE_LIMITS = {
    /** One value, once encoded as JSON. */
    maxValueBytes: 128 * 1024,
    /** The shortest \`ttlSeconds\` the store accepts. */
    minTtlSeconds: 60,
} as const

/** How long a \`context.storage.signedUrl\` link may be valid, in seconds. */
export const SIGNED_URL_SECONDS = { default: ${signed[1]}, min: ${signed[2]}, max: ${signed[3]} } as const

/** How the developer portal's check on a push runs a step. */
export const PUSH_CHECK = {
    /** When manifest.json names no \`timeoutMs\`. The test file's is not read. */
    defaultTimeoutMs: ${num("DEFAULT_TIMEOUT_MS")},
    /** The longest \`timeoutMs\` a manifest is given. */
    maxTimeoutMs: ${num("MAX_TIMEOUT_MS")},
    /** The port a run must leave by when the test file names none. */
    defaultExpectOutput: ${JSON.stringify(defaultExpect)},
    /** A declared step (an \`action\` block) is tested in the portal's editor, not on a push. */
    declaredStepsTestedOnPush: ${!declaredRefused},
} as const
`

const target = fileURLToPath(new URL("../packages/plugin-sdk/src/platform-rules.ts", import.meta.url))
const before = readFileSync(target, "utf8")
writeFileSync(target, out)
console.log(before === out ? "platform-rules.ts already matched the platform" : "platform-rules.ts updated from the platform")
console.log(`  ${packages.length} packages, ${Object.keys(overrides).length} override(s), ${patterns.length} patterns, max code ${maxCodeLength}`)
console.log(`  Node ${nodeMajor}, ${provided.length} provided and ${blocked.length} blocked globals, tiers ${tiers.map((t) => t.id).join("/")}`)
