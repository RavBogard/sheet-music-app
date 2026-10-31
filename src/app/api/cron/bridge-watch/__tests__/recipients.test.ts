import { describe, expect, it } from "vitest"
import { bridgeAlertRecipients } from "../recipients"

describe("bridge alert recipients (MIXER-11)", () => {
    const members = [
        { uid: "daniel", role: "admin" },
        { uid: "drew", role: "musician", soundEngineer: true },
        { uid: "bryn", role: "band_leader" },
        { uid: "rando", role: "musician" },
        { uid: "newbie", role: "pending", soundEngineer: true },
    ]

    it("reaches admins and sound-engineer flag holders, not band leaders or pending accounts", () => {
        expect(bridgeAlertRecipients(members, undefined).sort()).toEqual(["daniel", "drew"])
    })

    it("adds the configured recipient uids from config/monitor, once", () => {
        const got = bridgeAlertRecipients(members, { bridgeAlertRecipients: ["michael", "daniel", "", 7] })
        expect(got.sort()).toEqual(["daniel", "drew", "michael"])
    })

    it("still reaches configured recipients when the member lookup failed", () => {
        expect(bridgeAlertRecipients([], { bridgeAlertRecipients: ["michael"] })).toEqual(["michael"])
    })
})
