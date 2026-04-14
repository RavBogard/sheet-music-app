# 05-03 Touch-Target Audit

Generated: 2026-04-14T20:24:03.062Z
Files scanned: 78
Interactive elements found: 211

- COMPLIANT: 37
- OFFENDER: 29
- UNKNOWN: 145

## OFFENDERs (<44px target)

| file | line | tag | className | reason |
|---|---|---|---|---|
| src/components/setlist/importer/ImporterModal.tsx | 157 | Link | `h-4 w-4 text-blue-500` | has <44px sizing token and no ≥44px override |
| src/components/setlist/importer/ImporterModal.tsx | 311 | Link | `h-3.5 w-3.5 shrink-0 mt-0.5` | has <44px sizing token and no ≥44px override |
| src/components/setlist/modals/AddSongsModal.tsx | 137 | Button | `h-9 text-xs bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-foreground` | has <44px sizing token and no ≥44px override |
| src/components/setlist/SetlistHistoryPanel.tsx | 154 | Button | `h-6 px-2 text-xs` | has <44px sizing token and no ≥44px override |
| src/components/setlist/SetlistToolbar.tsx | 39 | Button | `h-9 w-9` | has <44px sizing token and no ≥44px override |
| src/components/setlist/SetlistToolbar.tsx | 50 | Button | `h-9 w-9 transition-all` | has <44px sizing token and no ≥44px override |
| src/components/setlist/SetlistToolbar.tsx | 59 | Button | `h-9 w-9 transition-all` | has <44px sizing token and no ≥44px override |
| src/components/setlist/SetlistToolbar.tsx | 68 | Button | `h-9 w-9 transition-all` | has <44px sizing token and no ≥44px override |
| src/components/setlist/TrackPrintOptionsList.tsx | 131 | Button | `h-7 w-7 text-muted-foreground hover:text-foreground` | has <44px sizing token and no ≥44px override |
| src/components/setlist/TrackPrintOptionsList.tsx | 148 | Button | `h-7 w-7 text-muted-foreground hover:text-foreground` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/AddGuestForm.tsx | 50 | Button | `h-7 text-xs` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/AddGuestForm.tsx | 53 | Button | `h-7 text-xs` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/BatchActionBar.tsx | 64 | Button | `h-8 w-8 ml-1` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/MusicianPicker.tsx | 376 | Button | `h-7 text-xs gap-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/MusicianPicker.tsx | 394 | Button | `h-7 text-xs gap-1.5 border-brand/30 text-brand hover:bg-brand/10` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/MusicianPicker.tsx | 499 | Button | `h-6 text-[11px] gap-1 text-brand hover:text-brand ml-auto` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/OverflowMenu.tsx | 68 | Button | `h-10 w-10 shrink-0` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/SetlistMatrixView.tsx | 160 | Button | `h-7 text-[10px] text-blue-500 hover:text-blue-600 font-bold` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/SetlistTopBar.tsx | 51 | Button | `h-10 w-10 shrink-0` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/SetlistTopBar.tsx | 83 | Button | `h-8 w-8` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/SetlistTopBar.tsx | 95 | Button | `h-8 w-8` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/SetlistTopBar.tsx | 110 | Button | `h-8 gap-1.5 text-muted-foreground hover:text-foreground` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/SetlistTopBar.tsx | 124 | Button | `h-8 gap-1.5 bg-brand hover:bg-brand/90 text-white shadow-sm` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/TrackSheet.tsx | 290 | Button | `h-9 w-9` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/TrackSheet.tsx | 302 | Button | `h-9 w-9` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/TrackSheet.tsx | 313 | Button | `text-xs h-7` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/TrackSheet.tsx | 383 | Button | `h-9` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/TrackSheet.tsx | 397 | Button | `h-9` | has <44px sizing token and no ≥44px override |
| src/components/setlist/v2/TrackSheet.tsx | 409 | Button | `h-9 text-green-600 dark:text-green-400` | has <44px sizing token and no ≥44px override |

## UNKNOWNs (manual inspection required)

| file | line | tag | className | reason |
|---|---|---|---|---|
| src/components/performance/Metronome.tsx | 59 | Button | `relative overflow-hidden px-1.5 py-0.5 h-auto rounded text-[10px] font-medium select-none bg-white/10 text-white/90 ring` | shadcn Button — default variant height depends on size prop |
| src/components/performance/PerformanceIntro.tsx | 56 | Button | `w-full py-3 rounded-xl` | shadcn Button — default variant height depends on size prop |
| src/components/performance/PerformanceToolbar.tsx | 93 | Button | `text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg h-11 w-11 h-10 w-10` | mixed sizing (e.g., h-full with h-10 inner) — manual inspection |
| src/components/performance/PerformanceToolbar.tsx | 111 | Button | `text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg h-11 w-11 h-10 w-10` | mixed sizing (e.g., h-full with h-10 inner) — manual inspection |
| src/components/performance/PerformanceToolbar.tsx | 130 | Button | `rounded-xl fluid-interaction glass-card text-foreground/80 hover:text-foreground flex items-center justify-center h-11 w` | mixed sizing (e.g., h-full with h-10 inner) — manual inspection |
| src/components/performance/PerformanceToolbar.tsx | 164 | Button | `rounded-xl font-semibold fluid-interaction flex items-center h-11 px-3 text-xs gap-1.5 h-10 px-4 text-xs font-bold gap-2` | mixed sizing (e.g., h-full with h-10 inner) — manual inspection |
| src/components/performance/PublicSetlistListing.tsx | 72 | Link | `block rounded-2xl border border-border/50 bg-card/50 p-4 hover:bg-muted/50 transition-colors` | link — hit area depends on rendered content |
| src/components/performance/RehearsalToolbar.tsx | 217 | Button | `fixed bottom-24 right-4 md:bottom-20 z-40 p-3 rounded-full shadow-[0_0_20px_oklch(0.50_0.20_275/0.3)] hover:scale-105 bo` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 234 | Button | `text-muted-foreground hover:text-foreground hover:bg-muted` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 242 | Button | `rounded-full p-2.5 shadow-lg shadow-brand/20` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 247 | Button | `text-muted-foreground hover:text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 298 | Button | `text-[10px] font-bold bg-muted text-foreground text-muted-foreground hover:text-foreground hover:bg-muted` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 317 | Button | `flex-1 text-[10px] font-bold py-1.5 border bg-brand/20 text-brand border-brand/30 bg-muted/80 border-transparent text-mu` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 336 | Button | `py-2 rounded-lg text-xs font-semibold border bg-amber-500/10 border-amber-500/30 text-amber-500 bg-amber-500/5 border-am` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 355 | Button | `py-2 rounded-lg text-xs font-semibold border bg-red-500/10 border-red-500/30 text-red-400 bg-muted/80 border-transparent` | shadcn Button — default variant height depends on size prop |
| src/components/performance/RehearsalToolbar.tsx | 394 | Button | `h-auto p-0 text-[10px] text-amber-500/80 hover:text-amber-400` | shadcn Button — default variant height depends on size prop |
| src/components/performance/SetlistDrawer.tsx | 165 | button | `h-10 w-10 lg:h-12 lg:w-12 flex items-center justify-center rounded-xl transition-all hover:bg-muted text-muted-foregroun` | mixed sizing (e.g., h-full with h-10 inner) — manual inspection |
| src/components/performance/SetlistDrawer.tsx | 196 | button | `bg-muted hover:bg-card border border-border hover:border-border rounded-xl p-4 text-left transition-all group flex items` | no sizing classes; hit area depends on parent/content |
| src/components/performance/SetlistDrawer.tsx | 230 | button | `shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-muted hover:bg-accent text-muted-foreground hover:text-foregr` | no sizing classes; hit area depends on parent/content |
| src/components/performance/SwapPicker.tsx | 131 | button | `w-full flex items-center gap-3 px-4 py-3 min-h-[56px] cursor-pointer border-b border-border/30 transition-colors text-le` | no sizing classes; hit area depends on parent/content |
| src/components/performance/SwipeOverlay.tsx | 42 | Button | `mt-6 px-8 py-3 bg-white hover:bg-white/90 text-black rounded-full font-bold` | shadcn Button — default variant height depends on size prop |
| src/components/nav/DesktopHeader.tsx | 100 | Link | `flex items-center gap-3 group` | link — hit area depends on rendered content |
| src/components/nav/DesktopHeader.tsx | 109 | Link | `px-4 py-1.5 rounded-full text-sm font-medium transition-all fluid-interaction bg-brand/15 text-foreground shadow-[0_0_10` | link — hit area depends on rendered content |
| src/components/nav/DesktopHeader.tsx | 133 | Button | `gap-2 rounded-full transition-colors bg-brand text-brand-foreground hover:bg-brand/90 shadow-md text-muted-foreground ho` | shadcn Button — default variant height depends on size prop |
| src/components/nav/DesktopHeader.tsx | 159 | button | `w-full text-left px-3 py-2 rounded-lg hover:bg-brand/10 transition-colors group` | no sizing classes; hit area depends on parent/content |
| src/components/nav/DesktopHeader.tsx | 179 | Button | `text-muted-foreground hover:text-foreground rounded-full overflow-hidden transition-all ring-2 ring-red-500` | shadcn Button — default variant height depends on size prop |
| src/components/nav/DesktopHeader.tsx | 198 | Link | `—` | no className (inherits from parent) |
| src/components/nav/DesktopHeader.tsx | 206 | Link | `—` | no className (inherits from parent) |
| src/components/nav/DesktopHeader.tsx | 220 | Button | `border-border hover:bg-accent hover:text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/nav/MobileHeader.tsx | 19 | Button | `rounded-full transition-colors text-brand bg-brand/15 text-muted-foreground hover:text-brand hover:bg-brand/5` | shadcn Button — default variant height depends on size prop |
| src/components/nav/MobileHeader.tsx | 33 | Link | `flex items-center gap-2 group` | link — hit area depends on rendered content |
| src/components/nav/MobileMenuDrawer.tsx | 72 | Link | `flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors bg-brand/10 text-foreground border-` | link — hit area depends on rendered content |
| src/components/nav/MobileMenuDrawer.tsx | 152 | Button | `w-full justify-start gap-3 px-4 py-3 h-auto rounded-xl text-red-500 hover:bg-red-500/10 hover:text-red-500` | shadcn Button — default variant height depends on size prop |
| src/components/nav/MobileTabBar.tsx | 187 | button | `w-full text-left px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors truncate` | no sizing classes; hit area depends on parent/content |
| src/components/nav/NotificationBell.tsx | 78 | Button | `relative` | shadcn Button — default variant height depends on size prop |
| src/components/nav/NotificationBell.tsx | 100 | Button | `h-auto p-0 text-xs text-muted-foreground hover:text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/nav/NotificationBell.tsx | 125 | Button | `w-full h-auto items-start gap-3 px-4 py-3 rounded-none justify-start text-left hover:bg-accent/50` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/AudioFilePicker.tsx | 34 | Button | `<dynamic>` | className is fully dynamic |
| src/components/setlist/AudioFilePicker.tsx | 67 | button | `w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/ChatPanel.tsx | 441 | Button | `text-muted-foreground hover:text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/ChatPanel.tsx | 490 | Button | `bg-amber-600 hover:bg-amber-500 text-white` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/ChatPanel.tsx | 498 | Button | `text-muted-foreground hover:text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/ChatPanel.tsx | 537 | Button | `bg-primary hover:bg-primary/90 text-primary-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/importer/ImporterModal.tsx | 205 | Button | `gap-2 shrink-0 bg-blue-600 hover:bg-blue-500` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/importer/ImporterModal.tsx | 334 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/importer/ImporterModal.tsx | 337 | Button | `bg-blue-600 hover:bg-blue-500 gap-2` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/AddSongsModal.tsx | 159 | button | `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-all border bg-blue-600 border-blue-500 te` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/modals/AddSongsModal.tsx | 191 | button | `w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 bg-blue-600 text-foreground bg-muted border bo` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/modals/EditDetails.tsx | 109 | Button | `w-full justify-start text-left font-normal bg-background/50 border-border text-muted-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/EditDetails.tsx | 137 | SelectTrigger | `bg-background/50` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/modals/EditDetails.tsx | 163 | Button | `flex-1 sm:flex-none` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/EditDetails.tsx | 164 | Button | `flex-1 sm:flex-none` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/MatchFileModal.tsx | 125 | Button | `w-full h-auto flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-left` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/MatchFileModal.tsx | 161 | Button | `w-full h-auto text-left p-3 rounded-lg flex items-center gap-3 active:scale-100 whitespace-normal bg-muted border border` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/NamePrompt.tsx | 64 | Button | `w-full justify-start text-left font-normal bg-background/50 border-border text-muted-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/NamePrompt.tsx | 90 | Button | `flex-1 sm:flex-none` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/modals/NamePrompt.tsx | 91 | Button | `flex-1 sm:flex-none` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/PrintModal.tsx | 368 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/PrintModal.tsx | 430 | button | `flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors cursor-pointer` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/PrintModal.tsx | 442 | button | `flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors cursor-pointer` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/PrintModal.tsx | 526 | Button | `flex-1` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/PrintModal.tsx | 529 | Button | `flex-[2] gap-2 transition-all` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/PrintModal.tsx | 541 | Button | `flex-1 gap-2` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/PrintModal.tsx | 551 | Button | `w-full gap-2 text-muted-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/PrintModeSelector.tsx | 94 | Button | `h-auto p-0 text-xs text-muted-foreground hover:text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/PrintModeSelector.tsx | 103 | Button | `h-auto p-0 text-xs text-muted-foreground hover:text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/PublishDialog.tsx | 175 | button | `flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-sm` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/PublishDialog.tsx | 243 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/PublishDialog.tsx | 246 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/PublishDialog.tsx | 292 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/SetlistCards.tsx | 136 | Button | `flex-1 rounded-xl font-bold bg-muted hover:bg-muted/80 text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/SetlistCards.tsx | 255 | Button | `flex-1 rounded-xl font-bold bg-muted hover:bg-muted/80 text-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/SetlistCards.tsx | 291 | Button | `h-auto border-2 border-dashed border-brand/10 hover:border-brand/30 hover:bg-brand/5 rounded-2xl p-4 md:p-6 text-left wh` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/SetlistDashboard.tsx | 66 | Button | `gap-2 hidden md:flex hover:bg-muted` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/SetlistDashboard.tsx | 75 | Button | `gap-2 border-brand/30 text-brand hover:bg-brand/10` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/SetlistDashboard.tsx | 114 | Button | `gap-2 bg-brand hover:bg-brand/90 shadow-lg shadow-brand/20 px-6` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/SetlistDashboard.tsx | 121 | Button | `gap-2 bg-brand hover:bg-brand/90` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/SetlistHistoryPanel.tsx | 111 | button | `p-1 hover:bg-accent rounded` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/SetlistToolbar.tsx | 96 | button | `px-2.5 py-1 rounded-full text-xs transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/SetlistToolbar.tsx | 104 | button | `px-2.5 py-1 rounded-full text-xs transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/TrackPrintOptionsList.tsx | 46 | Button | `bg-muted text-muted-foreground hover:text-foreground hover:bg-accent px-3` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/TrackPrintOptionsList.tsx | 54 | Button | `bg-muted text-muted-foreground hover:text-foreground border border-border hover:bg-destructive/10 px-3` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/TrackPrintOptionsList.tsx | 67 | Button | `bg-muted text-muted-foreground hover:text-foreground hover:bg-accent` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/TrackPrintOptionsList.tsx | 77 | Button | `bg-muted text-muted-foreground hover:text-foreground hover:bg-accent` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/BandSuggestionsPanel.tsx | 46 | button | `text-muted-foreground hover:text-foreground` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/BandSuggestionsPanel.tsx | 72 | button | `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition-all` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/BatchActionBar.tsx | 33 | Button | `text-xs` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/BatchActionBar.tsx | 42 | Button | `text-xs gap-1` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/BatchActionBar.tsx | 53 | Button | `text-xs gap-1 text-red-500 hover:text-red-400 hover:bg-red-500/10` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 92 | Button | `gap-1.5 text-xs` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 102 | Button | `gap-1.5 text-xs` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 113 | Button | `gap-1.5 text-xs` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 125 | Button | `gap-1.5 text-xs` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 136 | Button | `gap-1.5 text-xs text-destructive hover:text-destructive` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 222 | Button | `gap-1.5 text-xs` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 234 | Button | `gap-1.5 text-xs` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/InlineFields.tsx | 245 | Button | `gap-1.5 text-xs text-destructive hover:text-destructive` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/MusicianChip.tsx | 53 | button | `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm transition-all duration-150 border` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/MusicianChip.tsx | 146 | button | `w-full text-left px-2.5 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/MusicianPicker.tsx | 325 | button | `w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/MusicianPicker.tsx | 365 | button | `flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/MusicianPicker.tsx | 474 | button | `ml-auto p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/MusicianPicker.tsx | 527 | button | `text-muted-foreground hover:text-foreground` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/MusicianPicker.tsx | 533 | button | `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition-all` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/MusicianPicker.tsx | 591 | button | `flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/OverflowMenu.tsx | 168 | DropdownMenuSubTrigger | `—` | no className (inherits from parent) |
| src/components/setlist/v2/SearchOverlay.tsx | 91 | Button | `shrink-0` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/SearchOverlay.tsx | 111 | TabsTrigger | `—` | no className (inherits from parent) |
| src/components/setlist/v2/SearchOverlay.tsx | 112 | TabsTrigger | `—` | no className (inherits from parent) |
| src/components/setlist/v2/SearchOverlay.tsx | 141 | button | `w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/SearchOverlay.tsx | 181 | Button | `shrink-0 text-xs opacity-70 hover:opacity-100` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/SetlistChangedBanner.tsx | 26 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/SetlistChangedBanner.tsx | 29 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/SetlistTopBar.tsx | 67 | button | `text-lg font-semibold truncate block w-full text-left hover:text-foreground/80 transition-colors` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/SongRow.tsx | 122 | Button | `h-auto p-0 text-inherit hover:text-blue-500 dark:hover:text-blue-400` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/SongRow.tsx | 139 | a | `—` | no className (inherits from parent) |
| src/components/setlist/v2/SwipeToDelete.tsx | 101 | button | `px-3 py-1.5 text-xs font-medium text-white/90 bg-white/20 rounded-md` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/SwipeToDelete.tsx | 107 | button | `px-3 py-1.5 text-xs font-medium text-white bg-white/30 rounded-md` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/TrackSheet.tsx | 214 | SelectTrigger | `—` | no className (inherits from parent) |
| src/components/setlist/v2/TrackSheet.tsx | 262 | button | `text-xs text-muted-foreground hover:text-foreground transition-colors pl-0.5` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/TrackSheet.tsx | 319 | button | `text-xs text-muted-foreground hover:text-foreground` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/v2/TrackSheet.tsx | 473 | Button | `text-red-500 hover:text-red-400 hover:bg-red-500/10` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx | 160 | button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx | 161 | button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx | 162 | button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx | 197 | button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx | 198 | button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx | 199 | button | `—` | no className (inherits from parent) |
| src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx | 205 | button | `—` | no className (inherits from parent) |
| src/components/setlist/wizard/CreationWizard.tsx | 62 | SelectTrigger | `bg-background/50` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/wizard/CreationWizard.tsx | 115 | Button | `w-full justify-start text-left font-normal bg-background/50 text-muted-foreground` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/wizard/CreationWizard.tsx | 142 | SelectTrigger | `bg-background/50` | no sizing classes; hit area depends on parent/content |
| src/components/setlist/wizard/CreationWizard.tsx | 157 | Button | `—` | no className (inherits from parent) |
| src/components/setlist/wizard/CreationWizard.tsx | 160 | Button | `gap-1.5 bg-brand hover:bg-brand/90` | shadcn Button — default variant height depends on size prop |
| src/components/setlist/__tests__/print-modal.test.tsx | 93 | button | `—` | no className (inherits from parent) |
| src/components/setlist/__tests__/print-modal.test.tsx | 94 | button | `—` | no className (inherits from parent) |
| src/components/setlist/__tests__/print-modal.test.tsx | 95 | button | `—` | no className (inherits from parent) |
| src/components/setlist/__tests__/print-modal.test.tsx | 96 | button | `—` | no className (inherits from parent) |
| src/components/setlist/__tests__/print-modal.test.tsx | 97 | button | `—` | no className (inherits from parent) |
| src/app/perform/error.tsx | 23 | Button | `border-border bg-transparent text-foreground hover:bg-muted` | shadcn Button — default variant height depends on size prop |
| src/app/perform/error.tsx | 26 | Button | `bg-foreground text-background hover:bg-secondary` | shadcn Button — default variant height depends on size prop |
| src/app/perform/setlist/[id]/page.tsx | 122 | Link | `—` | no className (inherits from parent) |
| src/app/perform/setlist/[id]/page.tsx | 155 | Link | `—` | no className (inherits from parent) |
| src/app/perform/setlist/[id]/page.tsx | 218 | Link | `—` | no className (inherits from parent) |
| src/app/perform/[fileId]/page.tsx | 36 | Button | `—` | no className (inherits from parent) |

## COMPLIANT (for reference)

| file | line | tag | className | reason |
|---|---|---|---|---|
| src/components/performance/MetronomeControl.tsx | 36 | Button | `h-11 min-w-11 px-3 sm:px-4 rounded-lg cursor-pointer border bg-card lg:bg-background/50 border-red-500/50 border-border ` | has ≥44px sizing token |
| src/components/performance/PerformanceToolbar.tsx | 129 | PopoverTrigger | `—` | asChild — child button is the real target |
| src/components/performance/PerformanceToolbar.tsx | 163 | PopoverTrigger | `—` | asChild — child button is the real target |
| src/components/performance/PerformanceToolbar.tsx | 209 | Button | `h-12 px-4 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2` | has ≥44px sizing token |
| src/components/performance/PerformanceToolbar.tsx | 234 | Button | `h-11 px-4 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2` | has ≥44px sizing token |
| src/components/performance/SetlistDrawer.tsx | 164 | SheetTrigger | `—` | asChild — child button is the real target |
| src/components/performance/SetlistDrawer.tsx | 296 | button | `flex items-center gap-4 h-full px-4 rounded-xl transition-all text-left w-full bg-blue-600 text-white shadow-lg hover:bg` | has ≥44px sizing token |
| src/components/performance/SetlistDrawer.tsx | 357 | Button | `w-full h-12 text-lg font-bold border-border hover:bg-muted text-foreground` | has ≥44px sizing token |
| src/components/performance/SetlistRow.tsx | 79 | button | `flex items-center gap-3 px-4 min-h-11 w-full text-left my-1 cursor-pointer` | has ≥44px sizing token |
| src/components/performance/SetlistRow.tsx | 169 | button | `h-11 w-11 flex items-center justify-center rounded-lg shrink-0` | has ≥44px sizing token |
| src/components/performance/SongNavigation.tsx | 27 | Button | `text-muted-foreground hover:text-foreground hover:bg-brand/10 rounded-full h-14 w-14 shrink-0 transition-transform activ` | has ≥44px sizing token |
| src/components/performance/SongNavigation.tsx | 47 | Button | `text-foreground hover:bg-brand/10 rounded-full h-14 w-14 shrink-0 transition-transform active:scale-95 bg-brand/10 borde` | has ≥44px sizing token |
| src/components/performance/SwapPicker.tsx | 97 | button | `h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0 cursor-pointer` | has ≥44px sizing token |
| src/components/nav/DesktopHeader.tsx | 178 | DropdownMenuTrigger | `—` | asChild — child button is the real target |
| src/components/nav/MobileTabBar.tsx | 141 | PopoverTrigger | `—` | asChild — child button is the real target |
| src/components/nav/MobileTabBar.tsx | 142 | button | `flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group text-brand text-muted-foregro` | has ≥44px sizing token |
| src/components/nav/MobileTabBar.tsx | 201 | button | `flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group text-muted-foreground hover:t` | has ≥44px sizing token |
| src/components/nav/MobileTabBar.tsx | 221 | button | `flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group cursor-pointer text-brand tex` | has ≥44px sizing token |
| src/components/nav/MobileTabBar.tsx | 254 | PopoverTrigger | `—` | asChild — child button is the real target |
| src/components/nav/MobileTabBar.tsx | 255 | button | `flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group text-brand text-muted-foregro` | has ≥44px sizing token |
| src/components/setlist/AudioFilePicker.tsx | 32 | DialogTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/modals/AddSongsModal.tsx | 223 | Button | `w-full h-12 text-lg font-bold shadow-lg` | has ≥44px sizing token |
| src/components/setlist/modals/EditDetails.tsx | 108 | PopoverTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/modals/NamePrompt.tsx | 63 | PopoverTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/SetlistCards.tsx | 82 | DropdownMenuTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/SetlistCards.tsx | 211 | DropdownMenuTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/SetlistDashboard.tsx | 57 | Button | `h-12 w-12` | has ≥44px sizing token |
| src/components/setlist/SetlistDashboard.tsx | 74 | DropdownMenuTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/v2/AddBar.tsx | 22 | DropdownMenuTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/v2/AddBar.tsx | 23 | Button | `w-full sm:w-64 h-11 gap-2 rounded-xl shadow-md bg-brand hover:bg-brand/90 text-primary-foreground` | has ≥44px sizing token |
| src/components/setlist/v2/OverflowMenu.tsx | 67 | DropdownMenuTrigger | `—` | asChild — child button is the real target |
| src/components/setlist/wizard/CreationWizard.tsx | 114 | PopoverTrigger | `—` | asChild — child button is the real target |
| src/app/perform/setlist/[id]/page.tsx | 121 | Button | `—` | asChild — child button is the real target |
| src/app/perform/setlist/[id]/page.tsx | 132 | Link | `h-11 w-11 flex items-center justify-center rounded-xl hover:bg-muted transition-colors shrink-0` | has ≥44px sizing token |
| src/app/perform/setlist/[id]/page.tsx | 148 | Button | `h-11 min-w-11 gap-1.5 text-muted-foreground` | has ≥44px sizing token |
| src/app/perform/setlist/[id]/page.tsx | 154 | Button | `h-11 min-w-11 gap-1.5 text-muted-foreground` | asChild — child button is the real target |
| src/app/perform/setlist/[id]/page.tsx | 217 | Button | `mt-4` | asChild — child button is the real target |
