# Hustle · iOS

Native SwiftUI companion to the Hustle dashboard. Same data, same passcode; adds a
priority-ordered task queue, one shared 30-minute pomodoro, and a lock-screen Focus mode
with a Live Activity / Dynamic Island countdown.

Design reference: the "Hustle 手机版" canvas in Claude (Today / Quick log / Focus / Lock mode / Stats / Vault).
Product spec: the "Hustle 手机版 PRD" doc.

## Open in Xcode

```bash
brew install xcodegen          # once
cd ios
xcodegen generate              # writes Hustle.xcodeproj from project.yml
open Hustle.xcodeproj
```

Then in Xcode:

1. Select the **Hustle** target → Signing & Capabilities → pick your Team (both targets:
   `Hustle` and `HustleWidgets`). Bundle ids are `app.hustle.ios` and `app.hustle.ios.widgets`;
   change both in `project.yml` if they collide with something you own, then re-run `xcodegen`.
2. Run on a real device (iOS 17+). Live Activities do not show in the simulator's lock screen
   reliably; the Dynamic Island preview does work on iPhone 15/16 Pro simulators.
3. First launch: tap **Locked** on Today and enter the dashboard passcode. The session cookie
   is the same 30-day one the web uses.

Server URL defaults to `https://hustle-beta-i.vercel.app` (`APIClient.defaultBaseURL`). A
different one can be stored under the `hustle.baseURL` user default; a settings screen for it
is not built yet.

## Backend changes that ship with this

The app needs the `app_state` table and `/api/state/*` routes added in the same commit:

```bash
npm run migrate-app-state      # creates app_state (idempotent); also in setup-db
npm test                       # lib/app-state.test.ts covers the validators
```

`/api/state/queue-order` holds the user's priority order (TickTick task ids, top first).
`/api/state/focus-session` holds the one running pomodoro so web, desktop and phone can
show — and take over — the same countdown. Both are gated by the dashboard cookie and use
`ifVersion` for optimistic concurrency (409 when another device wrote first).

## How the pieces fit

| Folder | What lives there |
| --- | --- |
| `Hustle/App` | Entry point, tab root, theme, `DashboardStore` (today/records/tokens/vault; vault math is a port of `lib/vault.ts`) |
| `Hustle/API` | `APIClient` (thin wrapper over the existing Next.js routes) and Codable models matching their JSON |
| `Hustle/Auth` | Passcode session + unlock sheet |
| `Hustle/Focus` | `FocusEngine` — a port of `desktop/engine.mjs`: queue, one round, segments per task; `FocusStore` — ticks it, syncs with the server, uploads finished segments to TickTick |
| `Hustle/Views` | Today, Quick log, Vault, Focus queue (drag to reorder), Stats (Swift Charts), Lock mode |
| `Hustle/LiveActivity` | Starts/updates/ends the Live Activity |
| `HustleWidgets` | The widget extension that draws the Live Activity (lock screen card + Dynamic Island) |
| `Shared` | `FocusActivityAttributes` and the list colour palette, compiled into both targets |

### The pomodoro rule

One clock, 30 minutes, never reset by a task switch. `FocusEngine.tick` credits elapsed time
to the currently selected task as a *segment*; `select` closes the open segment and the next
tick opens a new one for the new task. The ring colours each segment by its list. When the
round ends, every segment ≥ 60 s with a task id is posted to `/api/ticktick/focus` as its own
TickTick pomodoro (retry queue in UserDefaults), and the sync script folds those into the
day's `focus_minutes_ticktick` as before — nothing is written to `daily_records` directly.

### Lock mode vs. Live Activity

*Lock mode* is the in-app full-screen view (keeps the screen awake, swipe up/down switches
task). The *Live Activity* is what the real iOS lock screen and Dynamic Island show when the
phone is locked: countdown, current task, up next. The countdown there is rendered by the
system from `endsAt`, so it stays live without the app running.

## Known gaps

- Daily Word is stored on the phone only (`@AppStorage`) — the web version has no API for it yet.
- Focus-session takeover from another device is polled on foreground; there is no push.
- No settings screen (server URL, pomodoro length). Length is fixed at 30 minutes on purpose.
- App icon uses the Hustle Pop Art glove. Regenerate it with `npm --prefix desktop run build:icons` from the repository root.
