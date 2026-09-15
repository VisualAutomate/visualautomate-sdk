/**
 * Where a plugin's `fetch` may go, applied the way the platform applies it.
 *
 * On the platform a step may contact the domains its plugin declares, plus the
 * hosts that appear in the configuration somebody filled in for that step — the
 * URL typed into an HTTP step is the permission for that step. A declared host
 * covers its subdomains. Loopback, private ranges and cloud metadata addresses
 * are never on the list, whatever it says.
 *
 * Locally the declared domains come from `allowedDomains` in the test file.
 * Without it nothing is blocked, but every host that would have been refused is
 * reported, so the list can be written before the first push rather than after
 * the first failed run.
 */

export interface EgressPolicy {
    hosts: string[]
    wildcard: boolean
    /** Refuse, or only report. */
    enforce: boolean
}

const ALWAYS_DENIED = [
    /^localhost$/i,
    /^127\./,
    /^0\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^\[?::1\]?$/,
    /^\[?f[cd][0-9a-f]{2}:/i,
    /\.internal$/i,
    /\.local$/i,
]

/** A hostname, lowercased and without a port, or null. */
export function hostOf(value: unknown): string | null {
    if (typeof value !== "string" || value.trim() === "") return null
    const trimmed = value.trim()
    try {
        const host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.toLowerCase()
        return host || null
    } catch {
        return null
    }
}

export function isAlwaysDenied(host: string): boolean {
    return ALWAYS_DENIED.some((pattern) => pattern.test(host))
}

/** Every host that appears as an address in a step's configuration. */
export function hostsInConfig(config: unknown, depth = 0): string[] {
    if (depth > 6 || config === null || config === undefined) return []
    if (typeof config === "string") {
        const host = hostOf(config)
        return host && (config.includes("://") || /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(config.trim())) ? [host] : []
    }
    if (Array.isArray(config)) return config.flatMap((entry) => hostsInConfig(entry, depth + 1))
    if (typeof config === "object") {
        return Object.entries(config as Record<string, unknown>)
            .filter(([key]) => !key.startsWith("_"))
            .flatMap(([, value]) => hostsInConfig(value, depth + 1))
    }
    return []
}

/**
 * The policy for one run.
 *
 * @param allowedDomains `allowedDomains` from the test file: a list of hosts,
 *                       `["*"]` for any host, or undefined to report only.
 */
export function policyFor(allowedDomains: string[] | undefined, config: unknown): EgressPolicy {
    const declared = (allowedDomains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean)
    const wildcard = declared.includes("*")
    const hosts = [
        ...new Set([
            ...declared.filter((d) => d !== "*").map((d) => hostOf(d.replace(/^\*\./, "")) ?? d),
            ...hostsInConfig(config),
        ]),
    ].filter((host) => !isAlwaysDenied(host))
    return { hosts, wildcard, enforce: allowedDomains !== undefined }
}

export function permits(policy: EgressPolicy, host: string): boolean {
    if (policy.wildcard) return true
    return policy.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

/**
 * `fetch`, checked against the policy.
 *
 * `onDenied` hears about every host outside the policy, enforced or not.
 */
export function guardFetch(
    policy: EgressPolicy,
    base: typeof fetch,
    onDenied: (host: string, enforced: boolean) => void,
): typeof fetch {
    return ((resource: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const raw = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url
        const host = hostOf(raw)
        if (host && !permits(policy, host)) {
            onDenied(host, policy.enforce)
            if (policy.enforce) {
                return Promise.reject(
                    new Error(`This step is not allowed to contact ${host}. Add it to the plugin's allowed domains.`),
                )
            }
        }
        return base(resource, init)
    }) as typeof fetch
}
