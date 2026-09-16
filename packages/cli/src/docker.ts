/**
 * Running `test` inside the VisualAutomate plugin sandbox image.
 *
 * The image has what the platform's sandbox has — the same Node version, every
 * allowed npm package installed, this CLI — so a plugin that needs `lodash` runs
 * without `npm install`, and one that only works because of something on this
 * machine stops working. The container gets the CPU and memory of the chosen
 * sandbox tier, no Linux capabilities, a read-only filesystem apart from the
 * project folder and a small /tmp, and a cap on processes.
 *
 * The project is mounted at /work. Nothing else from this machine is visible.
 */

import { spawnSync } from "node:child_process"

import { colourEnv, red, yellow } from "./colour"

export const IMAGE = "ghcr.io/visualautomate/plugin-sandbox"

/** The platform's sandbox sizes. */
export const TIERS = {
    standard: { cpus: "0.25", memory: "1g" },
    boosted: { cpus: "0.5", memory: "4g" },
    high: { cpus: "1", memory: "6g" },
    max: { cpus: "2", memory: "8g" },
} as const

export type TierName = keyof typeof TIERS

export interface DockerRun {
    /** The project folder on this machine. */
    cwd: string
    image: string
    tier: TierName
    /** What to run inside, after `va`. */
    args: string[]
    /** This process's uid and gid, on systems that have them, so files written to /work stay yours. */
    user?: { uid: number; gid: number }
}

export function dockerArgs(run: DockerRun): string[] {
    const tier = TIERS[run.tier]
    return [
        "run",
        "--rm",
        "--init",
        "--volume", `${run.cwd}:/work`,
        "--workdir", "/work",
        "--cpus", tier.cpus,
        "--memory", tier.memory,
        "--memory-swap", tier.memory,
        "--pids-limit", "256",
        "--read-only",
        "--tmpfs", "/tmp:rw,size=64m",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        // So a run inside the container is as readable as one out here: its
        // stdout is a pipe to Docker, which would otherwise turn colour off.
        ...colourEnv(),
        ...(run.user ? ["--user", `${run.user.uid}:${run.user.gid}`] : []),
        run.image,
        ...run.args,
    ]
}

/** The flags `test` passes on into the container, without the ones that only mean something out here. */
export function forwardedFlags(flags: Record<string, string>): string[] {
    const local = new Set(["docker", "image", "tier"])
    return Object.entries(flags)
        .filter(([key]) => !local.has(key))
        .flatMap(([key, value]) => (value === "true" ? [`--${key}`] : [`--${key}`, value]))
}

export function tierOf(value: string | undefined): TierName {
    if (!value) return "standard"
    if (value in TIERS) return value as TierName
    throw new Error(`Unknown tier "${value}". Available: ${Object.keys(TIERS).join(", ")}.`)
}

/** Null when Docker answers; otherwise what to tell the author. */
export function dockerProblem(): string | null {
    const probe = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" })
    if (probe.error) return "Docker is not installed, or not on PATH. Install Docker Desktop, or run without --docker."
    if (probe.status !== 0) return "Docker is installed but not running. Start Docker Desktop and try again."
    return null
}

/** What an exit code from the container means, when it is not the test's own verdict. */
export function explainExit(code: number, tier: TierName): string | null {
    if (code === 137) {
        const next = (Object.keys(TIERS) as TierName[])[(Object.keys(TIERS) as TierName[]).indexOf(tier) + 1]
        return red(
            `✗ stopped   the step used more than the ${TIERS[tier].memory.replace("g", " GB")} of memory the ${tier} tier has, `
            + `and the container was killed. On the platform it would stop the same way.`
            + (next ? ` To check it fits a bigger machine: --tier ${next}` : ""),
        )
    }
    if (code === 125) return red("✗ Docker could not start the container. Is the image available? Try: docker pull " + IMAGE)
    return null
}

/**
 * Get Docker ready, rather than telling somebody it is not.
 *
 * Docker Desktop is installed on nearly every machine this runs on and is
 * usually just not started yet, so it is started here and waited for. Docker
 * that is not installed at all is the one thing this cannot fix.
 *
 * Returns what to say when it could not be made ready, or null when it is.
 */
export function ensureDocker(say: (text: string) => void, waitMs = 120_000): string | null {
    const problem = dockerProblem()
    if (!problem) return null
    if (problem.includes("not installed")) return problem

    say(yellow("Docker is not running. Starting Docker Desktop…"))
    const started = spawnSync("docker", ["desktop", "start"], { encoding: "utf8" })
    if (started.status !== 0) {
        say("Could not start it from here — start Docker Desktop yourself; this will carry on when it is up.")
    }

    const until = Date.now() + waitMs
    while (Date.now() < until) {
        // A second of sleep, without a dependency: the engine takes tens of
        // seconds to come up and there is nothing else to do meanwhile.
        spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 1000)"])
        if (!dockerProblem()) {
            say("Docker is ready.")
            return null
        }
    }
    return "Docker did not come up in time. Start Docker Desktop and try again."
}

/** Whether this machine already has the image. */
export function hasImage(image: string): boolean {
    return spawnSync("docker", ["image", "inspect", image], { stdio: "ignore" }).status === 0
}

/** Fetch the image, showing the download. Returns what to say on failure. */
export function pullImage(image: string, say: (text: string) => void): string | null {
    if (hasImage(image)) return null
    say(`Fetching ${image} — once, about 700 MB.`)
    const pulled = spawnSync("docker", ["pull", image], { stdio: "inherit" })
    if (pulled.status === 0) return null
    return `Could not fetch ${image}. Check your connection, or pass --image with one you have.`
}

/** Run once in the container. Returns the exit code. */
export function runInDocker(run: DockerRun): number {
    const result = spawnSync("docker", dockerArgs(run), { stdio: "inherit" })
    const code = result.status ?? 1
    const explained = explainExit(code, run.tier)
    if (explained) console.error(explained)
    return code
}
