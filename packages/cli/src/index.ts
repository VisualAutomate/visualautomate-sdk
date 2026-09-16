/**
 * The `visualautomate` command.
 *
 *   login    sign this machine in, through the browser
 *   init     start a plugin from a template
 *   test     run it here, with a context that behaves
 *   dev      the sandbox, and a run again on every save
 *   push     publish it to your account
 *   whoami   which account this machine is signed in as
 *   logout   forget the token
 *
 * WHAT THIS IS SHAPED AROUND: an author should install one thing and then never
 * think about tooling again. So the CLI carries the SDK inside it, compiles
 * TypeScript itself, and writes the type declarations into the project rather
 * than asking anybody to install a package to get them. A scaffolded plugin has
 * no dependencies, no build step and no node_modules, and `test` works on a
 * directory that was created ten seconds ago.
 */

import { createServer } from "node:http"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync, watch } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"

import { build, stop as stopBundler } from "esbuild"
import { loadPluginCode, sandboxRequire, simulate, validatePluginCode } from "@visualautomate/plugin-sdk"
import { TYPE_DECLARATIONS } from "./declarations"
import { ensureRepoTypes, JSCONFIG_FILE, projectRoot, TYPES_FILE } from "./repo-types"
import { TEMPLATES, type TemplateName } from "./templates"
import { parseJsonc } from "./jsonc"
import { findTargets, readTestFile, targetForPath, type Target } from "./project"
import { toSandboxModule } from "./sandbox-module"
import { guardFetch, policyFor } from "./egress"
import { loadPersisted, persistEnabled, savePersisted } from "./persist"
import { IMAGE, ensureDocker, forwardedFlags, pullImage, runInDocker, tierOf, type DockerRun } from "./docker"
import { bold, dim, green, red, yellow } from "./colour"

/** Set by build.mjs from package.json. */
declare const __CLI_VERSION__: string
const VERSION = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0-dev"

const DEFAULT_API_URL = "https://visualautomate.com"

// ─── Where the token lives ───────────────────────────────────────────────────

/**
 * One file under the home directory, not an environment variable.
 *
 * An env var is fine for CI and hopeless for a person: it has to be set again
 * in every shell, and the usual way round that is pasting a credential into a
 * dotfile that ends up in a repository. VISUALAUTOMATE_API_TOKEN is still read
 * first, for exactly the CI case.
 */
function configPath(): string {
    return join(homedir(), ".visualautomate", "config.json")
}

interface Stored {
    token?: string
    apiUrl?: string
    email?: string
}

async function readConfig(): Promise<Stored> {
    try {
        return JSON.parse(await readFile(configPath(), "utf8")) as Stored
    } catch {
        return {}
    }
}

async function writeConfig(next: Stored): Promise<void> {
    const path = configPath()
    await mkdir(dirname(path), { recursive: true })
    // 0600: it is a credential, and the default on a shared machine is not.
    await writeFile(path, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 })
}

async function tokenFor(flags: Flags): Promise<{ token: string; apiUrl: string }> {
    const stored = await readConfig()
    const apiUrl = (
        flags["api-url"] ||
        process.env.VISUALAUTOMATE_API_URL ||
        stored.apiUrl ||
        DEFAULT_API_URL
    ).replace(/\/+$/, "")
    const token = flags.token || process.env.VISUALAUTOMATE_API_TOKEN || stored.token
    if (!token) {
        fail("Not signed in. Run `visualautomate login` first.")
    }
    return { token, apiUrl }
}

// ─── Small helpers ───────────────────────────────────────────────────────────

type Flags = Record<string, string>

function fail(message: string): never {
    console.error(red(message))
    // Not process.exit: the bundler has to be stopped first. Throwing lands in
    // main()'s catch, which does that and then exits 1 — and the message is
    // already printed, so the catch has nothing left to say.
    throw new SilentExit()
}

/** Already reported. Carries nothing, so main() prints nothing twice. */
class SilentExit extends Error {
    constructor() {
        super("")
        this.name = "SilentExit"
    }
}

function ok(message: string): void {
    console.log(message)
}

/** Open a URL in whatever the platform calls a browser. Best effort. */
function openBrowser(url: string): void {
    const command =
        process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open"
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
    try {
        spawn(command, args, { stdio: "ignore", detached: true }).unref()
    } catch {
        /* the URL is printed as well, which is the fallback */
    }
}

// ─── login ───────────────────────────────────────────────────────────────────

/**
 * Sign in by listening on a loopback port and letting the browser deliver.
 *
 * The token arrives as a form POST rather than in a redirect's query string, so
 * it never reaches browser history or this process's argv. The platform's
 * /cli/login page is the other half.
 */
async function cmdLogin(flags: Flags): Promise<void> {
    const stored = await readConfig()
    const apiUrl = (
        flags["api-url"] ||
        process.env.VISUALAUTOMATE_API_URL ||
        stored.apiUrl ||
        DEFAULT_API_URL
    ).replace(/\/+$/, "")

    const state = randomBytes(24).toString("base64url")

    const token = await new Promise<string>((resolveToken, rejectToken) => {
        const server = createServer((req, res) => {
            if (!req.url?.startsWith("/callback") || req.method !== "POST") {
                res.writeHead(404).end("Not found")
                return
            }
            let body = ""
            req.on("data", (chunk) => {
                body += chunk
                // A callback body is two short fields. Anything larger is not
                // this flow, and reading it would be somebody else's decision
                // about how much memory this process uses.
                if (body.length > 8192) req.destroy()
            })
            req.on("end", () => {
                const fields = new URLSearchParams(body)
                const answer = (status: number, text: string) => {
                    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" })
                    res.end(
                        `<!doctype html><meta charset="utf-8"><title>VisualAutomate</title>` +
                            `<body style="font:16px system-ui;padding:3rem;max-width:32rem;margin:auto">${text}</body>`,
                    )
                }
                if (fields.get("state") !== state) {
                    answer(400, "<h1>That did not match</h1><p>Run <code>visualautomate login</code> again.</p>")
                    return
                }
                const received = fields.get("token")
                if (!received) {
                    answer(400, "<h1>No token in the reply</h1><p>Run <code>visualautomate login</code> again.</p>")
                    return
                }
                answer(200, "<h1>Signed in</h1><p>You can close this tab and go back to your terminal.</p>")
                server.close()
                resolveToken(received)
            })
        })

        // Port 0: the operating system picks a free one, which is the only way
        // to avoid colliding with whatever else the author is running.
        server.listen(0, "127.0.0.1", () => {
            const address = server.address()
            if (!address || typeof address === "string") {
                rejectToken(new Error("Could not open a port to listen on"))
                return
            }
            const url = `${apiUrl}/cli/login?port=${address.port}&state=${state}`
            ok(`Opening ${url}\n`)
            ok("If your browser did not open, paste that address into it.")
            openBrowser(url)
        })

        server.on("error", rejectToken)
        setTimeout(() => {
            server.close()
            rejectToken(new Error("Timed out after five minutes waiting for the browser."))
        }, 5 * 60_000).unref()
    })

    // Prove it works before storing it, so "signed in" means signed in.
    const who = await whoami(apiUrl, token)
    await writeConfig({ token, apiUrl, email: who.email })
    ok(green(`\n✓ Signed in as ${who.email}`))
    ok(`  Token stored in ${configPath()}`)
}

async function whoami(apiUrl: string, token: string): Promise<{ email: string; developer: boolean }> {
    const res = await fetch(`${apiUrl}/api/cli/whoami`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) fail("That token is not valid. Run `visualautomate login` again.")
    if (!res.ok) fail(`Could not reach ${apiUrl} (status ${res.status}).`)
    const data = (await res.json()) as { email?: string; pluginDeveloper?: boolean }
    return { email: data.email ?? "(unknown)", developer: Boolean(data.pluginDeveloper) }
}

async function cmdWhoami(flags: Flags): Promise<void> {
    const { token, apiUrl } = await tokenFor(flags)
    const who = await whoami(apiUrl, token)
    ok(`${who.email} on ${apiUrl}`)
    if (!who.developer) {
        ok("\nThis account is not a plugin developer yet, so `push` will be refused.")
        ok("Turn it on from the dashboard under Developer settings.")
    }
}

async function cmdLogout(): Promise<void> {
    await writeConfig({})
    ok("Signed out. The token file is empty.")
}

// ─── init ────────────────────────────────────────────────────────────────────

async function cmdInit(args: string[], flags: Flags): Promise<void> {
    const name = args[0]
    if (!name) fail("Usage: visualautomate init <name> [--template <name>]")

    const templateName = (flags.template ?? "blank") as TemplateName
    const template = TEMPLATES[templateName]
    if (!template) {
        fail(`Unknown template "${templateName}". Available: ${Object.keys(TEMPLATES).join(", ")}`)
    }

    const target = resolve(process.cwd(), name)
    if (existsSync(target)) fail(`"${name}" already exists here.`)

    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")

    await mkdir(target, { recursive: true })
    await writeFile(join(target, "plugin.ts"), template.code)
    // Written exactly as the template holds it, comments and all. Passing it
    // through JSON.stringify would produce the same declaration with every
    // worked example stripped out of it, which is the opposite of the point.
    await writeFile(join(target, "manifest.json"), template.manifest)
    await writeFile(
        join(target, "plugin.json"),
        JSON.stringify(
            { name: slug, version: "1.0.0", description: template.description, category: template.category },
            null,
            2,
        ) + "\n",
    )
    // The types, written in rather than installed. A plugin directory with no
    // node_modules in it is the whole point: `test` works immediately, and
    // there is no version of the SDK to be out of date with the platform.
    await writeFile(join(target, "visualautomate.d.ts"), TYPE_DECLARATIONS)
    await writeFile(
        join(target, "tsconfig.json"),
        JSON.stringify(
            {
                compilerOptions: {
                    target: "ES2022",
                    module: "ESNext",
                    moduleResolution: "bundler",
                    lib: ["ES2022"],
                    strict: true,
                    noEmit: true,
                    skipLibCheck: true,
                },
                include: ["plugin.ts", "visualautomate.d.ts"],
            },
            null,
            2,
        ) + "\n",
    )
    await writeFile(
        join(target, "test.json"),
        JSON.stringify(template.testInput, null, 2) + "\n",
    )
    await writeFile(
        join(target, "README.md"),
        `# ${name}\n\n${template.description}\n\n` +
            "```bash\n" +
            "visualautomate test     # run it here\n" +
            "visualautomate push     # publish it to your account\n" +
            "```\n\n" +
            "`manifest.json` declares the fields the canvas shows and what this step hands on.\n" +
            "`test.json` is the input, config and state `test` runs with.\n",
    )

    ok(green(`\n✓ Created ${name} from the "${templateName}" template\n`))
    ok("  cd " + name)
    ok("  visualautomate test")
    ok("  visualautomate push\n")
}

// ─── Compiling the author's plugin ───────────────────────────────────────────

/**
 * Turn whatever is in the directory into one file of JavaScript.
 *
 * TypeScript, ESM, imports between local files — all of it is bundled here, so
 * an author never runs a compiler and the thing that is tested is byte for byte
 * the thing that is published. There is no build output lying next to the
 * source that could be stale.
 *
 * The sandbox loads plugin code with a `module`, `exports` and `require` in
 * scope, not as an ES module. esbuild bundles to an ES module and
 * toSandboxModule rewrites its imports and exports into that shape; see
 * src/sandbox-module.ts for why esbuild's own CommonJS output cannot be used.
 * npm packages stay `require` calls rather than being copied in: the sandbox
 * has the allowed ones installed, and a bundled copy would be megabytes of code
 * the platform already has.
 *
 * Throws with the compiler's message; the caller decides whether that ends the
 * process (`push`) or just this run (`dev`).
 */
async function bundlePlugin(entry: string): Promise<string> {
    try {
        const result = await build({
            entryPoints: [entry],
            bundle: true,
            write: false,
            platform: "node",
            format: "esm",
            target: "node18",
            packages: "external",
            logLevel: "silent",
        })
        return toSandboxModule(result.outputFiles[0].text)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Your plugin did not compile.\n\n${message}`)
    }
}

/** The code the platform would receive for a target: index.js as written, or the bundle. */
async function codeFor(target: Target): Promise<string> {
    return target.raw ? readFile(target.entry, "utf8") : bundlePlugin(target.entry)
}

// ─── test ────────────────────────────────────────────────────────────────────

/** Output a line, indented under a target's name when several are being run. */
function line(indent: boolean, text: string): void {
    ok(indent ? "  " + text.replace(/\n/g, "\n  ") : text)
}

/**
 * Run one target the way the platform would, and say whether it passed.
 *
 * In order: the code is checked with the platform's upload rules, loaded with
 * the sandbox's `require`, and run with the settings from its test file. It
 * passes when the run succeeds and, if the test file names an `expectOutput`,
 * leaves by that port — the same verdict the GitHub check gives.
 *
 * Never throws: `dev` has to keep going after a broken save.
 */
async function runTarget(target: Target, flags: Flags, several: boolean): Promise<boolean> {
    const say = (text: string) => line(several, text)
    if (several) ok(`\n${bold(`▸ ${target.name}`)}`)

    try {
        const code = await codeFor(target)

        const check = validatePluginCode(code)
        if (!check.valid) {
            say(`${red("✗ refused")}   ${check.error}`)
            return false
        }

        const settings = await readTestFile(target.dir, flags.input)
        if (!settings.path) say("No visualautomate.test.json — running with empty input and config.")

        const exported = loadPluginCode(code, sandboxRequire(packageLoader(target.dir))) as
            | ((...args: unknown[]) => unknown)
            | { execute?: unknown; default?: unknown }
        const plugin =
            typeof exported === "function"
                ? exported
                : typeof exported?.execute === "function"
                    ? exported
                    : (exported?.default as never)

        let outputs: string[] = []
        const manifestPath = join(target.dir, "manifest.json")
        if (existsSync(manifestPath)) {
            try {
                const manifest = parseJsonc(await readFile(manifestPath, "utf8")).value as { outputs?: string[] }
                outputs = manifest.outputs ?? []
            } catch (error) {
                say(red(`✗ manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`))
                return false
            }
        }

        const persist = persistEnabled(target.dir, flags.persist)
        const kept = persist ? await loadPersisted(target.dir) : { storage: {}, state: {} }

        const policy = policyFor(settings.allowedDomains, settings.config)
        const denied = new Map<string, boolean>()
        const baseFetch = globalThis.fetch
        globalThis.fetch = guardFetch(policy, baseFetch, (host, enforced) => denied.set(host, enforced))

        let result: Awaited<ReturnType<typeof simulate>>
        try {
            result = await simulate(plugin as never, {
                input: settings.input,
                config: settings.config,
                storage: { ...settings.storage, ...kept.storage },
                state: { ...settings.state, ...kept.state },
                secrets: settings.secrets,
                timeoutMs: settings.timeoutMs,
            })
        } finally {
            globalThis.fetch = baseFetch
        }

        const port = result.output?.output ?? null
        const expected = settings.expectOutput
        const passed = result.status === "success" && (!expected || port === expected)

        const verdict = passed ? green(bold("✓ passed")) : red(bold("✗ failed"))
        say(`${verdict}  ${dim(`${result.status}, ${result.durationMs}ms`)}`)
        if (result.error) say(`${dim("error")}    ${red(result.error)}`)
        if (result.output) {
            const port_ = passed || !expected ? port : red(String(port))
            say(`${dim("output")}   ${port_}${expected ? dim(` (expected ${expected})`) : ""}`)
            say(`${dim("data")}     ${JSON.stringify(result.output.data, null, 2).replace(/\n/g, "\n         ")}`)
        }
        if (result.files.size > 0) say(`${dim("files")}    ${[...result.files.keys()].join(", ")}`)
        if (result.state.size > 0) say(`${dim("state")}    ${JSON.stringify(Object.fromEntries(result.state))}`)
        for (const entry of result.logs ?? []) say(`${dim("log")}      ${entry}`)

        for (const [host, enforced] of denied) {
            say(
                enforced
                    ? `${dim("egress")}   ${red(`blocked ${host}`)} — not in allowedDomains`
                    : yellow(`! egress ${host} is not allowed on the platform unless the plugin declares it. `)
                        + `Add "allowedDomains": ["${host}"] to the test file to check with the same rule.`,
            )
        }

        if (persist) {
            const refused = await savePersisted(target.dir, result.files, result.state)
            say(`${dim("kept")}     ${dim(`storage and state in ${relative(process.cwd(), join(target.dir, ".visualautomate")) || ".visualautomate"}`)}`)
            for (const path of refused) say(yellow(`! storage path "${path}" points outside the storage folder and was not written`))
        }

        // A port the manifest does not declare is a step whose line goes nowhere on
        // the canvas — it runs, it succeeds, and the workflow stops there. Worth
        // saying here, where it is one line to fix.
        if (port && outputs.length > 0 && !outputs.includes(port)) {
            say(
                yellow(
                    `! This returned output "${port}", which manifest.json does not list `
                    + `(it has ${outputs.map((o) => `"${o}"`).join(", ")}). On a canvas nothing would follow it.`,
                ),
            )
        }
        return passed
    } catch (error) {
        say(red(`✗ ${error instanceof Error ? error.message : String(error)}`))
        return false
    }
}

/** Every target, one after another. True when all of them passed. */
async function runTargets(targets: Target[], flags: Flags): Promise<boolean> {
    let passed = 0
    for (const target of targets) {
        if (await runTarget(target, flags, targets.length > 1)) passed++
    }
    if (targets.length > 1) {
        const tally = `${passed} of ${targets.length} passed`
        ok(`\n${passed === targets.length ? green(bold(tally)) : red(bold(tally))}`)
    }
    return passed === targets.length
}

/**
 * How a step's `require` finds a package: the project's own node_modules first,
 * then the folder the sandbox image installs every allowed package into.
 */
function packageLoader(dir: string): (name: string) => unknown {
    const fromProject = createRequire(join(dir, "noop.js"))
    const imageDir = process.env.VISUALAUTOMATE_PACKAGES
    const fromImage = imageDir ? createRequire(join(imageDir, "noop.js")) : null
    return (name) => {
        try {
            return fromProject(name)
        } catch (error) {
            if (fromImage) return fromImage(name)
            throw error
        }
    }
}

/** The image this CLI asks for: its own version, or the one named with --image. */
function imageFor(flags: Flags): string {
    return flags.image || `${IMAGE}:${VERSION}`
}

/**
 * Docker running and the image on the machine, or a sentence saying why not.
 *
 * Done once before a command starts rather than per run, so `dev` does not
 * check on every save and the download is not half a screen of output in the
 * middle of a test.
 */
function prepareSandbox(flags: Flags): void {
    const docker = ensureDocker(ok)
    if (docker) fail(docker)
    const image = pullImage(imageFor(flags), ok)
    if (image) fail(image)
}

/** How to run in the sandbox image, from `--image` and `--tier`. */
function dockerRunFor(flags: Flags, args: string[]): DockerRun {
    let tier
    try {
        tier = tierOf(flags.tier)
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
    }
    return {
        cwd: process.cwd(),
        image: imageFor(flags),
        tier,
        args,
        user: typeof process.getuid === "function" && typeof process.getgid === "function"
            ? { uid: process.getuid(), gid: process.getgid() }
            : undefined,
    }
}

/** Run targets in the sandbox image: all at once, or one `--module` at a time for a subset. */
function runTargetsInDocker(targets: Target[], all: Target[], flags: Flags): boolean {
    const base = forwardedFlags(flags).filter((f, i, list) => f !== "--module" && list[i - 1] !== "--module")
    if (targets.length === all.length) {
        const extra = flags.module ? ["--module", flags.module] : []
        return runInDocker(dockerRunFor(flags, ["test", ...base, ...extra])) === 0
    }
    let passed = true
    for (const target of targets) {
        const module = target.name.replace(/^modules\//, "")
        if (runInDocker(dockerRunFor(flags, ["test", ...base, "--module", module])) !== 0) passed = false
    }
    return passed
}

/**
 * What to run: everything here, or the module named as the first argument.
 *
 * `vsa dev send` is the same as `vsa dev --module send`, and both take the
 * shortest name that picks one folder out of modules/.
 */
function targetsOrFail(args: string[], flags: Flags): Target[] {
    try {
        return findTargets(process.cwd(), args[0] ?? flags.module)
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
    }
}

/** Which modules these are, and how to run one of them on its own. */
function sayWhatRuns(targets: Target[], picked: boolean): void {
    if (targets.length === 1) {
        ok(`Running ${targets[0].name}`)
        return
    }
    ok(`Running ${targets.length} modules: ${targets.map((t) => t.name.replace(/^modules\//, "")).join(", ")}`)
    if (!picked) ok(dim(`One of them: vsa dev ${targets[0].name.replace(/^modules\//, "")}`))
}

/**
 * Keep the project's types in step, quietly, before anything runs.
 *
 * Here rather than at a command somebody has to know about: the types are how
 * an editor knows what `context` is, and a repository cloned from GitHub has
 * whatever the portal wrote the day it was made — or, if it was made before any
 * of this, nothing at all. Writing them costs nothing and says nothing when
 * there is nothing to do.
 */
function keepTypes(): string[] {
    try {
        return ensureRepoTypes(projectRoot(process.cwd()), VERSION)
    } catch {
        // Never a reason not to run: a read-only checkout still tests fine.
        return []
    }
}

async function cmdTypes(): Promise<void> {
    const root = projectRoot(process.cwd())
    const written = ensureRepoTypes(root, VERSION)
    if (written.length === 0) {
        ok(`${TYPES_FILE} and ${JSCONFIG_FILE} are already what this CLI writes.`)
        return
    }
    ok(green(`\u2713 Wrote ${written.join(" and ")}`))
    ok(dim("Your editor now completes input, config and context. Name the type above module.exports:"))
    ok(dim("  /** @type {PluginModule} */"))
}

async function cmdTest(args: string[], flags: Flags): Promise<void> {
    const targets = targetsOrFail(args, flags)
    keepTypes()
    if (flags.docker) prepareSandbox(flags)
    const passed = flags.docker ? runTargetsInDocker(targets, targets, flags) : await runTargets(targets, flags)
    if (!passed) process.exitCode = 1
}

// ─── dev ─────────────────────────────────────────────────────────────────────

/**
 * The sandbox, and a run again on every save.
 *
 * In the plugin sandbox image unless `--local` says otherwise: it is the thing
 * a push will be tested in, it has every allowed package installed, and it
 * holds a step to the CPU and memory of a tier. Docker is started and the image
 * fetched here, so `vsa dev` is the whole setup.
 *
 * Only the module whose folder changed is run again; a change outside every
 * module folder (a shared file, the test data at the root) runs all of them.
 * Saves are gathered for a moment first, because an editor writes a file in
 * several steps and a formatter writes it again straight after.
 *
 * The watcher stays on this machine: a bind mount does not deliver file events
 * into a container on Windows or macOS.
 */
async function cmdDev(args: string[], flags: Flags): Promise<void> {
    const root = process.cwd()
    const picked = args[0] ?? flags.module
    let targets = targetsOrFail(args, flags)
    const typesWritten = keepTypes()
    const inSandbox = flags.local !== "true"
    if (inSandbox) prepareSandbox(flags)

    const header = () => {
        // Clear the screen the way a terminal understands, so each run reads alone.
        process.stdout.write("\x1Bc")
        ok(`${bold("vsa dev")} ${dim(`— ${new Date().toLocaleTimeString()} — Ctrl+C to stop`)}`)
    }

    const run = async (chosen: Target[]) =>
        inSandbox ? runTargetsInDocker(chosen, targets, flags) : runTargets(chosen, flags)

    header()
    ok(dim(inSandbox ? `in ${imageFor(flags)}, tier ${flags.tier || "standard"}` : "on this machine, not in the sandbox"))
    sayWhatRuns(targets, Boolean(picked))
    if (typesWritten.length > 0) ok(dim(`Wrote ${typesWritten.join(" and ")} — your editor now knows what context is`))
    await run(targets)

    // .visualautomate is where --persist writes, and a run must not trigger the next one.
    const ignored = [`${sep}node_modules${sep}`, `${sep}.git${sep}`, `${sep}dist${sep}`, `${sep}.visualautomate${sep}`]
    const pending = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false

    const flush = async () => {
        if (running) {
            timer = setTimeout(flush, 100)
            return
        }
        running = true
        const changed = [...pending]
        pending.clear()
        try {
            // A module folder may have been added or removed since the last run.
            targets = findTargets(root, picked)
        } catch (error) {
            header()
            ok(red(`✗ ${error instanceof Error ? error.message : String(error)}`))
            running = false
            return
        }
        const hit = changed.map((path) => targetForPath(targets, path))
        const chosen = hit.some((t) => t === null) ? targets : [...new Set(hit as Target[])]
        header()
        ok(dim(`changed: ${changed.map((p) => relative(root, p)).join(", ")}`))
        await run(chosen)
        running = false
    }

    const watcher = watch(root, { recursive: true }, (_event, name) => {
        if (!name) return
        const path = join(root, name.toString())
        if (ignored.some((part) => `${sep}${relative(root, path)}${sep}`.includes(part))) return
        pending.add(path)
        if (timer) clearTimeout(timer)
        timer = setTimeout(flush, 150)
    })

    await new Promise<void>((resolveStop) => {
        process.once("SIGINT", () => {
            watcher.close()
            resolveStop()
        })
    })
}

// ─── push ────────────────────────────────────────────────────────────────────

async function cmdPush(flags: Flags): Promise<void> {
    const dir = process.cwd()
    const { token, apiUrl } = await tokenFor(flags)

    const metaPath = join(dir, "plugin.json")
    const pkgPath = join(dir, "package.json")
    const metaFile = existsSync(metaPath) ? metaPath : existsSync(pkgPath) ? pkgPath : null
    if (!metaFile) {
        fail("No plugin.json here. Run `visualautomate init <name>` to start a plugin.")
    }
    const meta = JSON.parse(await readFile(metaFile, "utf8")) as {
        name?: string
        version?: string
        description?: string
        category?: string
        icon?: string
    }
    if (!meta.name) fail(`${metaFile} has no "name".`)
    if (!meta.version || !/^\d+\.\d+\.\d+$/.test(meta.version)) {
        fail(`${metaFile} needs a "version" like 1.0.0.`)
    }

    /**
     * What the plugin declares.
     *
     * manifest.json first: it is where declarations are heading, it is what
     * `init` writes, and it is a file somebody can open rather than a comment
     * they have to go looking for.
     *
     * THE @schema BLOCK IS STILL READ when there is no manifest, and dropping
     * that fallback would be a quiet act of vandalism: every plugin written
     * before manifests existed declares itself in a comment, and refusing those
     * would strand their authors on an old CLI. The server accepts both, so
     * there is nothing to gain by being stricter here than it is.
     */
    const manifestPath = resolve(process.cwd(), "manifest.json")
    let parsed: Record<string, unknown> = {}
    let manifest: string | null = null
    if (existsSync(manifestPath)) {
        try {
            // Comments are allowed in the file and not on the wire. The
            // scaffolded manifest teaches its own format in commented-out
            // examples, and the server parses what it is sent with a strict
            // JSON.parse — stripping here means neither side gives anything up.
            // See src/jsonc.ts.
            const result = parseJsonc(await readFile(manifestPath, "utf8"))
            parsed = result.value as Record<string, unknown>
            manifest = result.json
        } catch (error) {
            // Checked here so the message names the file on this machine rather
            // than coming back as a 400 from a server the author cannot see.
            fail(`manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    const entry = ["plugin.ts", "plugin.js", "index.ts", "index.js"]
        .map((f) => join(dir, f))
        .find((f) => existsSync(f))
    if (!entry) {
        fail("No plugin.ts or plugin.js here. Run `visualautomate init <name>` to start one.")
    }
    let code: string
    try {
        code = await bundlePlugin(entry)
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
    }

    let schemaJson: string | null = null
    if (!manifest) {
        // Read from the source rather than the bundle: a bundler is free to
        // drop comments, and this one is a comment.
        const source = await readFile(entry, "utf8")
        const match = source.match(/@schema\s*\n([\s\S]*?)(?:\*\s*\/|\*\/)/)
        if (match) {
            schemaJson = match[1].replace(/^\s*\*\s?/gm, "").trim()
            try {
                parsed = JSON.parse(schemaJson) as Record<string, unknown>
            } catch (error) {
                fail(`The @schema block is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
            }
        }
    }

    if (!manifest && !schemaJson) {
        fail(
            "This plugin declares nothing, so it would have no fields, no ports and no trigger —\n" +
                "the canvas would show an empty box. Add a manifest.json next to your code (run\n" +
                "`visualautomate init` somewhere to see one), or keep an @schema block in the source.",
        )
    }

    ok(`Pushing ${meta.name}@${meta.version} to ${apiUrl}...`)

    const res = await fetch(`${apiUrl}/api/plugins/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            name: meta.name,
            version: meta.version,
            description: meta.description ?? (parsed.description as string) ?? "",
            category: meta.category ?? "utility",
            icon: meta.icon ?? (parsed.icon as string) ?? "plugin",
            // Whichever the author actually has. The route takes either.
            ...(manifest ? { manifest } : { schemaJson }),
            code,
        }),
    })

    const text = await res.text()
    let data: { success?: boolean; pluginId?: string; error?: string } = {}
    try {
        data = JSON.parse(text) as typeof data
    } catch {
        fail(`The server answered ${res.status} with something that is not JSON:\n${text.slice(0, 500)}`)
    }

    if (res.status === 401) {
        fail("Your session has expired. Run `visualautomate login` again.")
    }
    if (!res.ok || !data.success) {
        fail(`Push refused: ${data.error ?? `status ${res.status}`}`)
    }

    ok(green(`\n✓ Published (id: ${data.pluginId})`))
    ok(`  A version snapshot was saved, so you can roll back from the dashboard.`)
}

// ─── main ────────────────────────────────────────────────────────────────────

function printHelp(): void {
    console.log(`
vsa — build and publish VisualAutomate plugins

  vsa login                    sign this machine in
  vsa init <name> [--template] start a plugin
  vsa dev [<module>]           the sandbox, and a run again on every save
  vsa test [<module>]          run it once, as the platform's check does
  vsa types                    write the types your editor reads
  vsa push                     publish it
  vsa whoami                   which account this is
  vsa logout                   forget the token
  vsa --version                this CLI's version

\`va\` and \`visualautomate\` are the same command.

Templates: ${Object.keys(TEMPLATES).join(", ")}

\`test\` and \`dev\` work in a plugin made with \`init\`, at the root of a plugin's
GitHub repository, and at the root of an app's repository, where every folder
in modules/ is run (or the one you name: vsa dev send-message). The run's settings come
from visualautomate.test.json, test.json, or --input <file>.

Options for \`dev\` and \`test\`:
  --module <name>      the same as naming it: vsa dev send-message
  --tier <name>        the sandbox's size: standard, boosted, high or max
  --image <ref>        a different sandbox image
  --persist            keep storage and state in .visualautomate/ between runs
  --local              \`dev\` without the sandbox, on this machine's Node
  --docker             \`test\` inside the sandbox, as \`dev\` does

Environment (for CI, where there is no browser):
  VISUALAUTOMATE_API_TOKEN   use instead of \`login\`
  VISUALAUTOMATE_API_URL     a different installation
`)
}

function parse(argv: string[]): { args: string[]; flags: Flags } {
    const args: string[] = []
    const flags: Flags = {}
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg.startsWith("--")) {
            const key = arg.slice(2)
            const next = argv[i + 1]
            flags[key] = next && !next.startsWith("--") ? argv[++i] : "true"
        } else {
            args.push(arg)
        }
    }
    return { args, flags }
}

async function main(): Promise<void> {
    const { args, flags } = parse(process.argv.slice(2))
    const command = args.shift()

    if (flags.version || command === "version") {
        ok(VERSION)
        return
    }

    switch (command) {
        case "login":
            return cmdLogin(flags)
        case "logout":
            return cmdLogout()
        case "whoami":
            return cmdWhoami(flags)
        case "init":
        case "new":
            return cmdInit(args, flags)
        case "test":
            return cmdTest(args, flags)
        case "types":
            return cmdTypes()
        case "dev":
        case "watch":
            return cmdDev(args, flags)
        case "push":
        case "publish":
            return cmdPush(flags)
        // `plugin test` and `plugin push` are accepted as aliases.
        case "plugin": {
            const sub = args.shift()
            if (sub === "test") return cmdTest(args, flags)
            if (sub === "push") return cmdPush(flags)
            printHelp()
            return
        }
        default:
            printHelp()
            if (command) process.exit(1)
    }
}

/**
 * Shut the bundler down before leaving.
 *
 * esbuild runs as a child process and keeps a handle open. Calling
 * process.exit() while that handle is closing trips a libuv assertion on
 * Windows, so a run that worked perfectly ends by printing a crash — which is
 * the first thing anybody would report.
 */
async function finish(code: number): Promise<never> {
    try {
        stopBundler()
    } catch {
        /* nothing to stop, which is fine */
    }
    process.exit(code)
}

main()
    .then(() => finish(Number(process.exitCode ?? 0)))
    .catch((error) => {
        if (!(error instanceof SilentExit)) {
            console.error(error instanceof Error ? error.message : String(error))
        }
        return finish(1)
    })
