# Feature Research: Musician Platforms (Auth & Access)

**Domain:** Music Collaboration & Worship Management
**Researched:** 2026-03-13
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Tiered RBAC** | Different needs for Band Leaders vs. Musicians vs. Tech Crew. | MEDIUM | Standard: Admin, Editor, Scheduler, Viewer. |
| **Setlist Management** | Core utility of the platform. | MEDIUM | Must support reordering, song keys, and rehearsal notes. |
| **Song Library** | Centralized repository for all charts and media. | MEDIUM | Integration with cloud storage (Drive/Firebase) is standard. |
| **Mobile-First Viewer** | Musicians use tablets/phones on stage. | HIGH | Needs to be responsive, fast, and support "Performance Mode." |
| **Auth Integration** | Secure but simple login (Google/SSO). | LOW | Frictionless onboarding is critical for volunteers. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Frictionless Public Links** | Instant access for community/guests without login. | MEDIUM | Unique to this project; competitors (Planning Center/MultiTracks) gate this heavily. |
| **X32 Monitor Bridge** | Direct control of monitor mixes from the chart view. | HIGH | Massive value for musicians; usually requires separate apps (M-Air/X32-Mix). |
| **AI Transposition** | Instant, accurate chord shifting via LLM/Math. | MEDIUM | Standard tools often struggle with complex formatting; Gemini-powered is a win. |
| **Feature Filtering UI** | UI that hides (not just disables) irrelevant tools. | LOW | Keeps the interface clean for non-technical users. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Public PDF Hosting** | Easy sharing of sheet music. | **Legal/Copyright Risk** | Link to official sources or use restricted "Musician" view for copyrighted files. |
| **In-App DAW Editing** | Full audio editing in-browser. | Extreme complexity; performance issues. | Stems playback with basic volume/mute only. |
| **Open "Edit" for All** | "We're all a team, everyone should edit." | Versioning chaos; accidental deletions. | Role-based "Request Edit" or "Local Version" (MultiTracks style). |

## Feature Dependencies

```
[Public Link Access] ──requires──> [Song Metadata/Public Flag]
                                   └──requires──> [Public Domain Filter]

[Monitor Mixing] ──requires──> [User-to-Bus Mapping]
                               └──requires──> [X32 Network Bridge]

[AI Transposition] ──requires──> [Structured Text Format (ChordPro)]
```

### Dependency Notes

- **Public Link Access requires Public Flag:** To avoid copyright issues, songs must be explicitly marked as "Public" or "Public Domain" before being visible via unauthenticated links.
- **Monitor Mixing requires Bus Mapping:** A user shouldn't see monitor controls unless their account is mapped to a specific hardware bus (1-16).
- **AI Transposition requires ChordPro:** The engine works best on text-based chord charts rather than static PDFs.

## MVP Definition (Auth & Access Focus)

### Launch With (v1 / Audit Phase)

Minimum viable product — what's needed to validate the "Bulletproof Auth" concept.

- [x] **Strict RBAC Enforcement** — Admins see Edit; Musicians see Performance; Members see Public.
- [x] **Public Setlist Link** — Token-based URL that bypasses login for "Public" marked songs.
- [x] **Google OAuth Hardening** — Handle session expiration and account switching gracefully.
- [x] **Monitor Visibility Filter** — Hide X32 controls if no bus is assigned.

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **"Sound Engineer" Role** — A specific role that can manage monitor assignments for everyone.
- [ ] **Audit Logs** — Track who changed keys or reordered setlists.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Offline Mode PWA** — Access charts without internet (requires complex caching).
- [ ] **Automated CCLI Reporting** — Sync with CCLI API for legal compliance.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Role-based UI Filtering | HIGH | LOW | P1 |
| Public Link Access | HIGH | MEDIUM | P1 |
| Monitor Bus Security | MEDIUM | LOW | P1 |
| Admin-only Edit View | HIGH | LOW | P1 |
| Session Hardening | MEDIUM | MEDIUM | P2 |
| Audit Logging | LOW | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | Planning Center | MultiTracks | CentralReform.live |
|---------|-----------------|-------------|--------------|
| **Public Access** | Order of Service only | None (Paid Seats only) | **Full Chart access (Public songs)** |
| **Monitor Control** | No (External link only) | No | **Integrated X32 Bridge** |
| **Transposition** | Native (Manual edit) | Dynamic (Proprietary) | **Gemini AI + Math** |
| **Role Limits** | Tiered (Viewer-Admin) | Org/Team Roles | **Simplified Assignment-based** |

## Sources

- Planning Center Services Documentation (User Permissions)
- MultiTracks ChartBuilder Feature Guide
- US Copyright Law Section 110 (Religious Service Exemption)
- CCLI Music Reproduction License Guidelines

---
*Feature research for: Sheet Music App (Auth & Access Audit)*
*Researched: 2026-03-13*
