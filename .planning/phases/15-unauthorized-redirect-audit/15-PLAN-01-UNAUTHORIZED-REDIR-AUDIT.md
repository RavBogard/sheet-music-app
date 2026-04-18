---
wave: 1
files_modified:
  - "src/components/ui/unauthorized-state.tsx"
  - "src/app/(main)/settings/users/page.tsx"
  - "src/app/(main)/monitor/admin/page.tsx"
  - "src/app/(main)/manage/templates/page.tsx"
autonomous: true
---
# Phase 15, Wave 1: Unauthorized Redirect UI

**Phase:** 15 - Unauthorized Redirect Audit
**Status:** Approved for execution

## Goal
Replace generic fallback `redirect()` calls on Next.js server components with explicit, polished `UnauthorizedState` UI boundaries so users clearly understand *why* they cannot access a specific page instead of getting abruptly bounced to a dashboard.

## Context Extract
- `proxy.ts` handles the primary authentication walls perfectly.
- However, secondary sub-pages (like `/settings/users` or `/monitor/admin`) currently utilize `redirect('/manage')` if a user doesn't meet the precise required role to access them.
- We need to tighten this by using a dedicated unauthorized UI component.

## Implementation Details

```xml
<tasks>
  <task id="15-1" title="Create Unauthorized UI Component">
    <description>
    Create a new shared component `src/components/ui/unauthorized-state.tsx`.
    1. Base it on the existing `ErrorState` or Auth fallback aesthetics. 
    2. It should accept `title`, `description`, and `actionLabel`/`actionHref` props.
    3. The default aesthetic should be a centered lock icon, a clear "Access Denied" message, and a standard `Button` to return to the dashboard.
    </description>
  </task>

  <task id="15-2" title="Tighten Settings/Users Route">
    <description>
    Update `/src/app/(main)/settings/users/page.tsx`:
    1. Remove `import { redirect } from "next/navigation"`.
    2. Instead of `redirect("/manage")`, return the `<UnauthorizedState />` component if `!isLeader`.
    3. Customize the description: "Only Administrators and Band Leaders can manage user assignments."
    </description>
  </task>

  <task id="15-3" title="Tighten Monitor/Admin Route">
    <description>
    Update `/src/app/(main)/monitor/admin/page.tsx`:
    1. Remove `import { redirect }`.
    2. If `!isAdmin`, return `<UnauthorizedState />`.
    3. Customize the description: "Only Sound Engineers can configure monitor buses."
    </description>
  </task>

  <task id="15-4" title="Tighten Templates Route">
    <description>
    Update `/src/app/(main)/manage/templates/page.tsx`:
    1. Check if it currently uses `redirect`.
    2. If so, replace it with `<UnauthorizedState />`.
    3. Customize the description: "Only Band Leaders can manage global liturgical templates."
    </description>
  </task>
</tasks>
```

## Validation
1. Verify `npm run build` succeeds.
2. Ensure the UI compiles without errors and no `redirect` loops are introduced.
