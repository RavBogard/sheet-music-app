import { describe, it, expect } from "vitest"
import {
    pickLocalIp,
    pickBroadcastableInterfaces,
    __TEST_ONLY__,
    type NetworkInterfacesLike,
    type NetworkInterfaceInfoLike,
} from "../get-local-ip"

/**
 * Closes coder-6 bridge-analysis FINDINGS TOP-10 #10 (T-A4).
 *
 * The fix:
 *   - Old `getLocalIp` preferred `/ethernet|eth\d|en\d/i` which on
 *     Windows ALSO matches Hyper-V's `vEthernet (Default Switch)` and
 *     `vEthernet (WSL)` adapters. On a dev machine with Hyper-V
 *     enabled, the bridge could publish a virtual IP no iPad can reach.
 *   - New `pickLocalIp` filters virtual-adapter name shapes first, then
 *     ranks real Ethernet > WiFi > non-virtual fallback.
 *
 * `pickLocalIp` takes `networkInterfaces` as an injected callable so
 * tests drive it with synthetic shapes — no monkey-patching of `os`.
 */

function iface(
    address: string,
    family: "IPv4" | "IPv6" | 4 | 6 = "IPv4",
    internal = false,
): NetworkInterfaceInfoLike {
    return { address, family, internal, netmask: "255.255.255.0" }
}

function fromMap(map: NetworkInterfacesLike): () => NetworkInterfacesLike {
    return () => map
}

describe("pickLocalIp — single-adapter shapes", () => {
    it("Ethernet only → picks the Ethernet address", () => {
        const ip = pickLocalIp(fromMap({
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(ip).toBe("192.168.1.42")
    })

    it("Wi-Fi only → picks the Wi-Fi address", () => {
        const ip = pickLocalIp(fromMap({
            "Wi-Fi": [iface("192.168.1.55")],
        }))
        expect(ip).toBe("192.168.1.55")
    })

    it("Linux eth0 only → picks the eth0 address", () => {
        const ip = pickLocalIp(fromMap({
            eth0: [iface("10.0.0.10")],
        }))
        expect(ip).toBe("10.0.0.10")
    })

    it("macOS en0 only → picks the en0 address", () => {
        const ip = pickLocalIp(fromMap({
            en0: [iface("10.0.0.20")],
        }))
        expect(ip).toBe("10.0.0.20")
    })
})

describe("pickLocalIp — ranking among physical adapters", () => {
    it("Ethernet + Wi-Fi → prefers Ethernet", () => {
        const ip = pickLocalIp(fromMap({
            "Wi-Fi": [iface("192.168.1.55")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(ip).toBe("192.168.1.42")
    })

    it("Linux eth0 + wlan0 → prefers eth0", () => {
        const ip = pickLocalIp(fromMap({
            wlan0: [iface("10.0.0.30")],
            eth0: [iface("10.0.0.10")],
        }))
        expect(ip).toBe("10.0.0.10")
    })

    it("predictable Linux enp0s3 + wlp3s0 → prefers enp0s3", () => {
        const ip = pickLocalIp(fromMap({
            wlp3s0: [iface("10.0.0.30")],
            enp0s3: [iface("10.0.0.10")],
        }))
        expect(ip).toBe("10.0.0.10")
    })

    it("multiple Ethernet entries → first one wins (deterministic-within-OS)", () => {
        const ip = pickLocalIp(fromMap({
            Ethernet: [iface("192.168.1.42")],
            "Ethernet 2": [iface("192.168.5.7")],
        }))
        expect(ip).toBe("192.168.1.42")
    })
})

describe("pickLocalIp — rejects Windows Hyper-V virtual adapters", () => {
    it("Hyper-V vEthernet (Default Switch) + Wi-Fi → picks Wi-Fi (NOT Hyper-V)", () => {
        // This is the regression-shape coder-6's FINDING called out: the
        // old `/ethernet/i` regex matched `vEthernet (Default Switch)` so
        // the bridge published a 172.x Hyper-V IP iPads can't reach.
        const ip = pickLocalIp(fromMap({
            "vEthernet (Default Switch)": [iface("172.30.16.1")],
            "Wi-Fi": [iface("192.168.1.55")],
        }))
        expect(ip).toBe("192.168.1.55")
    })

    it("Ethernet + Hyper-V vEthernet → prefers real Ethernet", () => {
        const ip = pickLocalIp(fromMap({
            "vEthernet (Default Switch)": [iface("172.30.16.1")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(ip).toBe("192.168.1.42")
    })

    it("Hyper-V only (no real adapter) → returns null (do NOT publish virtual)", () => {
        // The bridge logs "iPads will use last saved URL" on null; the
        // ONLY thing that must not happen is publishing a virtual IP.
        const ip = pickLocalIp(fromMap({
            "vEthernet (Default Switch)": [iface("172.30.16.1")],
            "vEthernet (WSL)": [iface("172.20.32.1")],
        }))
        expect(ip).toBeNull()
    })
})

describe("pickLocalIp — rejects other virtual adapters", () => {
    it("Wi-Fi + WSL bridge → prefers Wi-Fi", () => {
        const ip = pickLocalIp(fromMap({
            "vEthernet (WSL)": [iface("172.20.32.1")],
            "Wi-Fi": [iface("192.168.1.55")],
        }))
        expect(ip).toBe("192.168.1.55")
    })

    it("Ethernet + Docker → prefers Ethernet (docker0)", () => {
        const ip = pickLocalIp(fromMap({
            docker0: [iface("172.17.0.1")],
            eth0: [iface("10.0.0.10")],
        }))
        expect(ip).toBe("10.0.0.10")
    })

    it("Ethernet + VirtualBox host-only → prefers Ethernet", () => {
        const ip = pickLocalIp(fromMap({
            vboxnet0: [iface("192.168.56.1")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(ip).toBe("192.168.1.42")
    })

    it("Ethernet + VMware vmnet8 → prefers Ethernet", () => {
        const ip = pickLocalIp(fromMap({
            vmnet8: [iface("192.168.157.1")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(ip).toBe("192.168.1.42")
    })

    it("Ethernet + Tailscale → prefers Ethernet", () => {
        const ip = pickLocalIp(fromMap({
            Tailscale: [iface("100.64.1.5")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(ip).toBe("192.168.1.42")
    })

    it("Ethernet + macOS utun (VPN) → prefers Ethernet", () => {
        const ip = pickLocalIp(fromMap({
            utun0: [iface("10.8.0.2")],
            en0: [iface("192.168.1.42")],
        }))
        expect(ip).toBe("192.168.1.42")
    })
})

describe("pickLocalIp — degenerate inputs", () => {
    it("empty interfaces map → null", () => {
        expect(pickLocalIp(fromMap({}))).toBeNull()
    })

    it("loopback only → null (internal flag filters lo / 127.0.0.1)", () => {
        const ip = pickLocalIp(fromMap({
            lo: [iface("127.0.0.1", "IPv4", /*internal*/ true)],
        }))
        expect(ip).toBeNull()
    })

    it("Windows Loopback Adapter (named, not flagged internal) → still rejected", () => {
        // Some Windows drivers report the Microsoft Loopback Adapter
        // without the `internal:true` flag; the name pattern catches it.
        const ip = pickLocalIp(fromMap({
            "Microsoft Loopback Adapter": [iface("169.254.1.1", "IPv4", /*internal*/ false)],
        }))
        expect(ip).toBeNull()
    })

    it("IPv6-only interface → skipped (we only publish IPv4 to iPads)", () => {
        const ip = pickLocalIp(fromMap({
            Ethernet: [iface("fe80::1", "IPv6")],
        }))
        expect(ip).toBeNull()
    })

    it("legacy family format (`family: 4` instead of `\"IPv4\"`) still detected", () => {
        // Node <18 typed family as numeric; the bridge currently builds
        // on Node 18+ but the predicate stays tolerant.
        const ip = pickLocalIp(fromMap({
            Ethernet: [iface("10.0.0.10", 4)],
        }))
        expect(ip).toBe("10.0.0.10")
    })

    it("undefined adapter (Object.entries can yield undefined values) → skipped", () => {
        const ip = pickLocalIp(fromMap({
            "Ghost Adapter": undefined,
            Ethernet: [iface("10.0.0.10")],
        }))
        expect(ip).toBe("10.0.0.10")
    })

    it("non-virtual non-Ethernet non-WiFi (e.g. some Surface LTE) → still picked (tier 3)", () => {
        // If a user has a cellular modem the OS named something exotic,
        // we'd rather publish that than null.
        const ip = pickLocalIp(fromMap({
            "Mobile Broadband": [iface("10.45.6.78")],
        }))
        expect(ip).toBe("10.45.6.78")
    })
})

describe("pickLocalIp — predicate set hygiene (regression guard)", () => {
    it("Ethernet name pattern does NOT match `vEthernet` (the original bug)", () => {
        const ethRe = __TEST_ONLY__.ETHERNET_NAME_PATTERNS
        const hits = ethRe.filter(re => re.test("vEthernet (Default Switch)"))
        expect(hits).toEqual([])
    })

    it("virtual name pattern catches `vEthernet (Default Switch)`", () => {
        const virRe = __TEST_ONLY__.VIRTUAL_NAME_PATTERNS
        const hits = virRe.filter(re => re.test("vEthernet (Default Switch)"))
        expect(hits.length).toBeGreaterThan(0)
    })

    it("Ethernet pattern matches real `Ethernet` (Windows)", () => {
        const ethRe = __TEST_ONLY__.ETHERNET_NAME_PATTERNS
        const hits = ethRe.filter(re => re.test("Ethernet"))
        expect(hits.length).toBeGreaterThan(0)
    })

    it("Ethernet pattern matches `Ethernet 2` (Windows multi-NIC)", () => {
        const ethRe = __TEST_ONLY__.ETHERNET_NAME_PATTERNS
        const hits = ethRe.filter(re => re.test("Ethernet 2"))
        expect(hits.length).toBeGreaterThan(0)
    })

    it("WiFi pattern matches `Wi-Fi` and `WiFi`", () => {
        const wifiRe = __TEST_ONLY__.WIFI_NAME_PATTERNS
        expect(wifiRe.some(re => re.test("Wi-Fi"))).toBe(true)
        expect(wifiRe.some(re => re.test("WiFi"))).toBe(true)
    })
})

/**
 * `pickBroadcastableInterfaces` is the sibling helper consumed by
 * x32-client.ts's `/xinfo` discovery loop (replaces the inline
 * `os.networkInterfaces()` iteration at L842). It must apply the SAME
 * virtual-adapter rejection that `pickLocalIp` already does (so the
 * bridge doesn't broadcast onto a Hyper-V virtual subnet that can't
 * reach the X32) and return ALL physical IPv4 interfaces sorted by
 * tier (Ethernet > WiFi > other-physical), with netmask attached so
 * the caller can compute `ip | ~netmask` for each subnet.
 */
describe("pickBroadcastableInterfaces — single-adapter shapes", () => {
    it("Ethernet only → returns one Ethernet entry", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(targets).toEqual([
            { name: "Ethernet", address: "192.168.1.42", netmask: "255.255.255.0" },
        ])
    })

    it("WiFi only → returns one WiFi entry", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            "Wi-Fi": [iface("192.168.1.55")],
        }))
        expect(targets).toEqual([
            { name: "Wi-Fi", address: "192.168.1.55", netmask: "255.255.255.0" },
        ])
    })

    it("Mobile Broadband (other-physical tier) → still included", () => {
        // Mirrors pickLocalIp's tier-3 fallback so a cellular modem
        // doesn't lose its broadcast either.
        const targets = pickBroadcastableInterfaces(fromMap({
            "Mobile Broadband": [iface("10.45.6.78")],
        }))
        expect(targets.map(t => t.address)).toEqual(["10.45.6.78"])
    })
})

describe("pickBroadcastableInterfaces — tier ordering", () => {
    it("Ethernet + WiFi → Ethernet first, WiFi second", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            "Wi-Fi": [iface("192.168.1.55")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(targets.map(t => t.name)).toEqual(["Ethernet", "Wi-Fi"])
    })

    it("Linux eth0 + wlan0 → eth0 first, wlan0 second", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            wlan0: [iface("10.0.0.30")],
            eth0: [iface("10.0.0.10")],
        }))
        expect(targets.map(t => t.name)).toEqual(["eth0", "wlan0"])
    })

    it("Ethernet + WiFi + Mobile Broadband → tier 0/1/2 in order", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            "Mobile Broadband": [iface("10.45.6.78")],
            "Wi-Fi": [iface("192.168.1.55")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(targets.map(t => t.name)).toEqual([
            "Ethernet",
            "Wi-Fi",
            "Mobile Broadband",
        ])
    })

    it("multiple Ethernet entries → stable order (deterministic-within-OS)", () => {
        // Stable sort preserves Object.entries order within a tier — same
        // determinism contract pickLocalIp relies on for multi-NIC boxes.
        const targets = pickBroadcastableInterfaces(fromMap({
            Ethernet: [iface("192.168.1.42")],
            "Ethernet 2": [iface("192.168.5.7")],
        }))
        expect(targets.map(t => t.address)).toEqual(["192.168.1.42", "192.168.5.7"])
    })
})

describe("pickBroadcastableInterfaces — rejects virtual adapters", () => {
    it("Ethernet + Hyper-V vEthernet (Default Switch) → only Ethernet", () => {
        // The cousin shape of pickLocalIp's regression — broadcasting on
        // Hyper-V's 172.30.x synthetic subnet can't reach a real X32.
        const targets = pickBroadcastableInterfaces(fromMap({
            "vEthernet (Default Switch)": [iface("172.30.16.1")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(targets.map(t => t.name)).toEqual(["Ethernet"])
    })

    it("Ethernet + Wi-Fi + vEthernet + Docker + Tailscale → only Ethernet + Wi-Fi", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            "vEthernet (Default Switch)": [iface("172.30.16.1")],
            docker0: [iface("172.17.0.1")],
            Tailscale: [iface("100.64.1.5")],
            "Wi-Fi": [iface("192.168.1.55")],
            Ethernet: [iface("192.168.1.42")],
        }))
        expect(targets.map(t => t.name)).toEqual(["Ethernet", "Wi-Fi"])
    })

    it("Only virtual adapters → empty array (NOT null — broadcast loop will just skip)", () => {
        // x32-client.ts's caller iterates the result; an empty array
        // means "no subnet broadcasts to send" and the global
        // 255.255.255.255 broadcast at the call site remains the only
        // path. Returning [] (not null) keeps that loop type-clean.
        const targets = pickBroadcastableInterfaces(fromMap({
            "vEthernet (Default Switch)": [iface("172.30.16.1")],
            "vEthernet (WSL)": [iface("172.20.32.1")],
            docker0: [iface("172.17.0.1")],
        }))
        expect(targets).toEqual([])
    })

    it("VirtualBox host-only + VMware vmnet + macOS utun → all rejected", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            vboxnet0: [iface("192.168.56.1")],
            vmnet8: [iface("192.168.157.1")],
            utun0: [iface("10.8.0.2")],
        }))
        expect(targets).toEqual([])
    })
})

describe("pickBroadcastableInterfaces — degenerate inputs", () => {
    it("empty interfaces map → empty array", () => {
        expect(pickBroadcastableInterfaces(fromMap({}))).toEqual([])
    })

    it("loopback only (internal:true) → empty array", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            lo: [iface("127.0.0.1", "IPv4", /*internal*/ true)],
        }))
        expect(targets).toEqual([])
    })

    it("Microsoft Loopback Adapter (named, not flagged internal) → still rejected", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            "Microsoft Loopback Adapter": [iface("169.254.1.1", "IPv4", /*internal*/ false)],
        }))
        expect(targets).toEqual([])
    })

    it("IPv6-only interface → skipped", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            Ethernet: [iface("fe80::1", "IPv6")],
        }))
        expect(targets).toEqual([])
    })

    it("legacy family format (numeric 4) accepted", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            Ethernet: [iface("10.0.0.10", 4)],
        }))
        expect(targets.map(t => t.address)).toEqual(["10.0.0.10"])
    })

    it("undefined adapter value → skipped (Object.entries can yield undefined)", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            "Ghost Adapter": undefined,
            Ethernet: [iface("10.0.0.10")],
        }))
        expect(targets.map(t => t.address)).toEqual(["10.0.0.10"])
    })

    it("interface missing netmask → skipped defensively", () => {
        // Real Node always supplies a netmask; the type marks it
        // optional, so we belt-and-suspenders skip on missing rather
        // than emit `{ ..., netmask: undefined }` that the caller
        // would crash on at `.split(".")`.
        const targets = pickBroadcastableInterfaces(fromMap({
            Ethernet: [{ address: "192.168.1.42", family: "IPv4", internal: false }],
            "Wi-Fi": [iface("192.168.1.55")],
        }))
        expect(targets.map(t => t.name)).toEqual(["Wi-Fi"])
    })

    it("netmask is propagated to the result (caller uses it for broadcast calc)", () => {
        const targets = pickBroadcastableInterfaces(fromMap({
            Ethernet: [{
                address: "10.0.0.10",
                family: "IPv4",
                internal: false,
                netmask: "255.255.0.0",
            }],
        }))
        expect(targets).toEqual([
            { name: "Ethernet", address: "10.0.0.10", netmask: "255.255.0.0" },
        ])
    })
})
