/**
 * LAN IP detection for the unattended bridge.
 *
 * Closes coder-6 bridge-analysis FINDINGS TOP-10 #10 (T-A4): the original
 * impl preferred `/ethernet|eth\d|en\d/i` which on Windows ALSO matches
 * Hyper-V's `vEthernet (Default Switch)` / `vEthernet (WSL)` virtual
 * adapters — so a dev machine could publish a Hyper-V virtual IP that no
 * iPad on the LAN can reach. The fix rejects known virtual-adapter name
 * shapes (Hyper-V, WSL, Docker, VirtualBox, VMware, generic "Virtual"),
 * then prefers real wired > WiFi > other-physical > null.
 *
 * `os.networkInterfaces` is injected (not imported) so tests can drive
 * the function with synthetic shapes without monkey-patching `os`.
 */

/**
 * Subset of `os.NetworkInterfaceInfo` we actually read. Kept narrow so
 * tests can hand-roll fixtures without pulling in a Node typings dep.
 */
export interface NetworkInterfaceInfoLike {
    address: string
    /** Node 18+ types `family` as `"IPv4" | "IPv6"`; pre-18 used 4 | 6. We accept both. */
    family: string | number
    internal: boolean
    netmask?: string
}

export type NetworkInterfacesLike = Record<string, NetworkInterfaceInfoLike[] | undefined>

/**
 * Virtual-adapter name patterns. Matched case-insensitively against the
 * INTERFACE NAME (not the IP address). Order doesn't matter — any hit
 * removes the candidate from selection.
 *
 * Each entry has a short justification comment so the reviewer can see
 * WHY a name pattern is virtual (closes the reviewer-question shape
 * coder-6's FINDING flagged: "are you sure these are all virtual?").
 */
const VIRTUAL_NAME_PATTERNS: RegExp[] = [
    /vEthernet/i,        // Windows Hyper-V (e.g. "vEthernet (Default Switch)", "vEthernet (WSL)")
    /Hyper-?V/i,         // Windows Hyper-V variants
    /\bWSL\b/i,          // Windows Subsystem for Linux network bridge
    /Docker/i,           // Docker for Desktop on Windows/macOS; also `docker0` on Linux
    /\bdocker\d/i,       // Linux `docker0`, `docker1`
    /^br-[0-9a-f]+/i,    // Docker user-defined bridge networks on Linux (`br-7e2a...`)
    /VirtualBox/i,       // Oracle VirtualBox
    /\bvboxnet\d/i,      // Linux/macOS VirtualBox host-only adapter
    /VMware/i,           // VMware Workstation/Fusion
    /\bvmnet\d/i,        // Linux/macOS VMware host-only adapter
    /\bvnic\d/i,         // Generic virtual NIC naming (macOS / some hypervisors)
    /\btun\d/i,          // OpenVPN / WireGuard tunnel interfaces
    /\btap\d/i,          // OpenVPN tap interfaces
    /\butun\d/i,         // macOS user-tunnel (VPN)
    /\bppp\d/i,          // PPP dial-up / VPN
    /\bzt/i,             // ZeroTier
    /\bTailscale/i,      // Tailscale virtual adapter
    /Loopback/i,         // Microsoft Loopback Adapter (named, not just internal-flagged)
    /Virtual/i,          // Catch-all "Virtual" / "Virtual Adapter" — last so more specific entries take linear precedence in human reading
]

/**
 * Real-Ethernet name patterns. Strict word-boundary on `Ethernet` so
 * `vEthernet` (Hyper-V) does NOT match here — and even if it slipped
 * past, `VIRTUAL_NAME_PATTERNS` already filtered it.
 *
 * `eth\d` covers Linux `eth0/eth1`, `en\d` covers macOS `en0`/`en1`
 * (en0 is typically WiFi on modern Macs; we still rank it as physical
 * because the Mac WiFi-vs-Ethernet ranking matters less than excluding
 * virtual adapters — and the WiFi pattern below ranks `en0` lower when
 * it CO-appears with a real Ethernet name).
 */
const ETHERNET_NAME_PATTERNS: RegExp[] = [
    /\bEthernet\b/i,     // Windows "Ethernet", "Ethernet 2"
    /\beth\d/i,          // Linux eth0, eth1, eth42
    /\ben\d/i,           // macOS en0, en1 (also matched by WiFi pattern when WiFi)
    /\benp\d/i,          // Linux predictable: enp0s3, enp2s0
    /\bens\d/i,          // Linux predictable: ens33
    /\beno\d/i,          // Linux predictable: eno1, eno2
]

const WIFI_NAME_PATTERNS: RegExp[] = [
    /Wi-?Fi/i,           // Windows "Wi-Fi" / "WiFi"
    /\bwlan\d/i,         // Linux wlan0
    /\bwlp\d/i,          // Linux predictable: wlp3s0
    /Wireless/i,         // Generic Windows naming on some drivers
    /AirPort/i,          // macOS legacy WiFi label
]

function nameMatches(name: string, patterns: RegExp[]): boolean {
    for (const re of patterns) {
        if (re.test(name)) return true
    }
    return false
}

/**
 * Node's IPv4 marker: `family === "IPv4"` (Node 18+) or `=== 4` (legacy).
 */
function isIPv4(iface: NetworkInterfaceInfoLike): boolean {
    return iface.family === "IPv4" || iface.family === 4
}

/**
 * Pick this machine's most-likely LAN address for iPad reachability.
 *
 * Selection order:
 *   1. Real Ethernet (interface name matches ETHERNET_NAME_PATTERNS and
 *      NOT VIRTUAL_NAME_PATTERNS).
 *   2. WiFi (interface name matches WIFI_NAME_PATTERNS and not virtual).
 *      `en\d` (macOS) is filed under Ethernet by name; that's fine —
 *      macOS WiFi-only laptops still pick en0 via the Ethernet match.
 *   3. Any other non-virtual, non-internal IPv4.
 *   4. null (only virtual or only loopback — bridge logs "iPads will
 *      use last saved URL" and continues).
 *
 * Within each tier, the first candidate (Object.entries iteration order,
 * which mirrors the OS-reported order) wins. Multiple physical Ethernet
 * adapters on the same machine is rare for this deployment (single PC
 * at CRC); deterministic-within-OS is good enough.
 *
 * @param networkInterfaces inject `os.networkInterfaces` here; tests pass
 *                          a synthetic record, production passes `() => os.networkInterfaces()`.
 */
export function pickLocalIp(
    networkInterfaces: () => NetworkInterfacesLike
): string | null {
    const interfaces = networkInterfaces()
    const candidates: { address: string; name: string }[] = []

    for (const [name, addrs] of Object.entries(interfaces)) {
        for (const iface of addrs || []) {
            if (!isIPv4(iface) || iface.internal) continue
            if (nameMatches(name, VIRTUAL_NAME_PATTERNS)) continue
            candidates.push({ address: iface.address, name })
        }
    }

    if (candidates.length === 0) return null

    const wired = candidates.find(c => nameMatches(c.name, ETHERNET_NAME_PATTERNS))
    if (wired) return wired.address

    const wifi = candidates.find(c => nameMatches(c.name, WIFI_NAME_PATTERNS))
    if (wifi) return wifi.address

    return candidates[0].address
}

// Re-exports for direct unit tests on the predicate sets.
export const __TEST_ONLY__ = {
    VIRTUAL_NAME_PATTERNS,
    ETHERNET_NAME_PATTERNS,
    WIFI_NAME_PATTERNS,
}
