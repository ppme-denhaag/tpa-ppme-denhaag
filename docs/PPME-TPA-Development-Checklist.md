# TPA PPME Den Haag — Development Kickoff Checklist

*Prepared 2 July 2026. Reflects all decisions confirmed to date in the PRD/TAD, plus the validated Figma Make prototype (15 screens, 3 roles: Ustadz, Orang Tua, Santri).*

*Status checkboxes updated as of this writing: `[x]` done, `[ ]` not started, `[~]` partially done (not standard GFM checkbox syntax — reads as literal text rather than a rendered checkbox, used deliberately where "done"/"not done" would be misleading; the item's own text explains what's actually built vs. missing).*

---

## 0. Confirmed Decisions (quick reference)

| Area | Decision |
|---|---|
| Platform | PWA on Netlify (no app store) |
| Auth | Google OAuth 2.0 |
| Database | Supabase, EU/Frankfurt region |
| Domain | Subdomain — `tpa.ppmedenhaag.nl` |
| Language | Bahasa Indonesia (primary) + Dutch (secondary), toggle in nav |
| Brand palette | Primary `#0D50A0`, dark variant `#0A3E7A`, gold accent `#C8A415`, success `#4CAF50`, danger `#D32F2F` |
| Student accounts | Hybrid — always linked to a Parent; 16+ students may additionally self-login (`Student.user_id`, nullable) |
| Board approval | Not required |
| Tutor compensation | Not tracked — tutors are volunteers |
| GDPR/DPIA ownership | PPME Den Haag IT team (operational); PPME Den Haag remains legal controller |
| UI reference | Figma Make prototype — validated, palette matches pixel-for-pixel |

Still open (non-blocking, can resolve in parallel): WhatsApp integration + budget, multi-branch timing, Yanbu'a curriculum variants. See §8.

**✅ Critical path resolved:** rather than waiting on PPME IT to provision accounts, the bootstrap-then-transfer approach removes the blocker — create the org/team containers now (named for PPME, not you), build under them immediately, and hand over ownership (invite PPME IT as owners, remove yourself) before real student data enters the system. See §1 for specifics. The one thing this doesn't remove: PPME IT should give an informal nod that this arrangement is the plan, since they remain the GDPR data controller's operational owner even during the bootstrap period.

---

## 1. Accounts & Infrastructure

*Approach: bootstrap now, transfer ownership later. Instead of waiting on PPME IT to create accounts, create the organization/team container on each platform now — named for PPME (e.g. `ppme-denhaag`), not personal — with you as the sole owner today. This unblocks development immediately. Before real student data enters the system, invite PPME IT as owners on each and remove yourself; because the work already lives inside a PPME-named container rather than your personal account, this is an ownership-role change, not a project migration — no downtime, no re-doing environment variables or DNS.*

- [ ] **GitHub** — Organization created (e.g. `ppme-denhaag`), private repo inside it, you as sole owner for now
- [ ] **Netlify** — Team created (named for PPME), site inside it, EU region confirmed, connected to the GitHub repo
- [ ] **Supabase** — Organization created (named for PPME), project inside it, **Frankfurt (eu-central-1)** explicitly selected at creation (not default)
- [ ] **Supabase DPA** — reviewed/signed by PPME IT team once they're in the loop (TAD open question #1) — this can happen in parallel with bootstrap, doesn't block building
- [ ] **Google Cloud Console** — create your own project for now (OAuth 2.0 client, Web application type); confirm with PPME IT whether they already have a Workspace/Cloud project you should use instead once you're in touch — if so, migrating an OAuth client later is low-effort (new client ID/secret, update env vars)
- [ ] **OAuth redirect URIs** configured for Supabase Auth callback + Netlify preview/prod domains
- [ ] **Google Workspace service account** — confirm need once server-side operations require it (TAD open question #4); not a bootstrap blocker
- [ ] **DNS** — still PPME IT's responsibility regardless of the bootstrap approach, since it touches their existing `ppmedenhaag.nl` domain. Send them the exact CNAME record once the Netlify site is provisioned; runs in parallel, not on the critical path
- [~] **VAPID key pair** — generated for Web Push, stored as Netlify env vars (never committed to repo). A **development** pair has been generated and used to verify the pipeline locally; the production/preview pairs are still PPME's to generate and set. Three variables, not two: `VAPID_PRIVATE_KEY` (secret), `VAPID_PUBLIC_KEY`, and `VITE_VAPID_PUBLIC_KEY` (same public value — the browser needs it to subscribe, and only `VITE_`-prefixed vars reach the bundle). Rotating the pair silently invalidates every stored subscription, so generate once per environment. See README "Web Push notifications"
- [ ] **Webhook shared secret** — `NOTIFY_WEBHOOK_SECRET` in Netlify, and the *same value* in Supabase Vault as `notify_webhook_secret`, plus `notify_webhook_base_url` for the environment. Without both Vault secrets the absence webhook is a silent no-op (which is deliberate — it is what keeps CI and fresh local stacks quiet). Generate with `openssl rand -base64 32`
- [ ] **WhatsApp Business API** — deferred until Phase 3 budget decision (~€300/mo) is made
- [ ] **Ownership handoff (before real student data)** — invite PPME IT as Owner on GitHub Org, Netlify Team, and Supabase Org; remove yourself once confirmed; get an informal sign-off from PPME leadership that the bootstrap arrangement was the plan all along, for the DPIA record

## 2. Repository & Environments

- [ ] Repo scaffolded: React + Vite (or Next.js static export) + TypeScript + Tailwind
- [ ] Tailwind theme tokens set to the confirmed brand palette (§0)
- [ ] Netlify deploy contexts: Preview (per-PR) and Production (main branch); branch protection rules set
- [ ] Environment variables documented (`.env.example`): Supabase URL/anon key, VAPID keys, (later) WhatsApp API keys — separate values per environment
- [ ] Local dev setup via Supabase CLI (local Postgres + Auth emulation), so devs aren't hitting Frankfurt prod DB
- [ ] `react-i18next` scaffolded with `id`/`nl` locale files; Islamic/Arabic terms (Murajaah, Yanbu'a, Surah, Ayah, etc.) marked as untranslated in both

## 3. Database Build-out

- [x] SQL migrations written for all 10 entities: User, Student, Class, Session, Attendance, Assignment, AssignmentStatus, YanbuaProgress, QuranProgress, MurajaahAssignment, MurajaahLog
- [x] `Student.user_id` (nullable) FK implemented for 16+ self-login students, separate from `Student.parent_id`
- [x] All enums implemented as Postgres enum types: `user_role`, `locale`, `attendance_status`, `assignment_status`, `yanbuah_mastery`, `quran_quality`, `murajaah_quality`, `murajaah_frequency`
- [x] **RLS policies written and tested per table** — highest-risk item; a misconfigured policy leaks children's data across families. At minimum: Parent (own children only), Tutor (own assigned classes only), Student 16+ (own data only, read-only), Admin (all)
- [x] Automated RLS tests: assert Parent A cannot query Parent B's child data, Student cannot query siblings' data, etc. — 38 pgTAP assertions (RLS-01..21), CI-gated
- [x] Seed data: 114 Surahs (name, Arabic, transliteration, ayah count) and 7 Jilid (page counts) — version-controlled seed file (migration 004)
- [x] Database webhooks configured (Supabase → Netlify Functions) for absence notifications **and jilid-completion detection** — both done, plus surah-memorized, new-homework and report-published. Written as migrations rather than configured in the Supabase dashboard, so they are version-controlled and reproduced by `db reset`; per-environment target read from Vault, no-op when unconfigured. Jilid completion is now detected **server-side** by `notify-milestone`, which *imports* `src/lib/yanbua.ts#isJilidComplete` rather than restating it — the client-side detection in the Yanbu'a screen remains, using the same function, so there is one rule with two callers rather than two rules
- [x] Migration 009 added: `fn_notify_absence()` + `trg_notify_absence` + `fn_webhook_config()`. Covered by pgTAP cases WH-01…WH-06 asserting the trigger fires on the transition into `absent` and *only* that, is silent when unconfigured, carries the row id and never the absence `reason`, and that no client role can execute `fn_webhook_config()` to read the shared secret
- [x] Migration 010 added: `fn_post_webhook()` (the shared sender, extracted once four more triggers needed it) plus triggers on `yanbua_progress`, `murajaah_assignments`, `assignments` and `year_end_reports`. Covered by WH-07…WH-12 — including that the Yanbu'a trigger is *deliberately unselective* (so the completion rule has one implementation), that re-activating a murajaah target and re-publishing a report both notify nobody, that the assignment title never leaves the database, and that a broken webhook path cannot fail the write it observes
- [ ] Backup/PITR policy confirmed for chosen Supabase tier
- [x] Migration 008 added: `fn_pending_registrations()` — not in the original 10-entity scope, added to support admin enrollment (see §10)

## 4. API & Netlify Functions

- [x] Convention documented for when to call PostgREST directly vs. via a Netlify Function wrapper — emerged in practice rather than being decided upfront: plain CRUD goes straight through PostgREST from the client; anything needing the service-role key (bypassing RLS) goes through a Function that independently re-verifies the caller's authorization in code (see `invite-user.mts`)
- [x] 5 custom functions built — **seven exist, and the list itself changed**. Built: `push-subscribe`, `notify-absence`, `notify-milestone` (parts 1/2a), `notify-assignment` and `notify-report-ready` (2a, added because the Notification Spec had rows with no Function against them), and the three scheduled jobs below. Two from the original five are deliberately **not** built and are recorded as superseded rather than dropped: `streak-status`, which would return an integer every caller can already compute from rows it has (ADR-016(c), and `openapi.yaml` keeps the path with that reasoning), and `send-reminder`, which was a generic "send a reminder" wrapper the three specific scheduled jobs make redundant
- [x] 4 scheduled functions built with correct cron — **three built, the fourth superseded** (part 2b). `send-murajaah-reminders` (18:00), `homework-due-reminders` (08:00) and `weekly-progress-digest` (Friday 08:00) all run on `0 * * * *` and gate on the local hour in `Europe/Amsterdam` (`isAmsterdamHour`), rather than a fixed UTC hour that would be an hour wrong throughout CEST — which is what the TAD's original cron column would have produced. `calculate-streak-resets` is superseded by ADR-016(a)/(b): its only job was zeroing stale stored streaks, and there is no stored streak any more. Verified live on both a CET and a CEST date, including the second idempotent run, via `scripts/invoke-scheduled.mjs`, which pins the clock from outside the process — there is deliberately no test hook in the Function
- [x] Notification deduplication-by-tag logic implemented and tested — tag is `(event, user, **child**, local date)`, asserted in unit tests and confirmed live (two identical events → one notification, not two; two children → two notifications, not one). The child was added in part 2b: keyed without it, a parent of two absent children received one notification naming one child, because the second silently replaced the first on the lock screen. Part 1 recorded that as accepted; it should not have been (ADR-016(f))
- [x] Streak calculation logic — every edge case defined and unit-tested (TAD ADR-016(a), `computeStreak` in `src/lib/murajaah.ts`). A streak counts consecutive *periods* the target's `frequency` asks for: a day for `daily`, a Mon–Sun week needing three confirmations for `3x_week`, a week needing one for `weekly`. Counting runs backwards from the current period if it is already met and otherwise from the previous one, so today being unconfirmed does not break a run but a day that is over and was missed does (PRD AC-003). The week a target is assigned in asks only for as many confirmations as there were days to give them — the "assignment created mid-week" case — never fewer than one. Migration 011 drops `murajaah_log.streak_count` and `fn_set_streak_count`, which could only change on INSERT and so could not tell a live run from a broken one, and counted days even for a weekly target
- [x] Notification payload builder with the DPIA R6 content limits (child's first name + event type only), driven by the *recipient's* `users.locale`. Enforced structurally — the builder accepts no parameter that could carry a reason, grade or position — and mechanically, by a test that rejects any push string interpolating a placeholder other than `{{name}}`
- [x] Recipient derivation shared by every sender (`netlify/functions/lib/notifyStudent.ts`) rather than written per Function. Sending one family a notification about another family's child is the worst thing this product could do, and the realistic way it happens is the fourth Function to need recipients writing its own slightly different query. One query, one mapping function, unit-tested exhaustively (including a two-family class roster) and re-confirmed live on every event
- [x] Class-scale fan-out with bounded concurrency: one assignment reaches a whole roster, so sends run in parallel up to a cap — sequentially it could run the Function into its timeout with half the class notified, and unbounded it would open a socket per family. One dead subscription never costs the rest of the class their notification (unit-tested; that failure cannot be produced on demand against a real push service)
- [x] A second authorization shape for Functions with **no caller** (`netlify/functions/lib/webhookAuth.ts`): shared-secret channel authentication, constant-time, failing closed when unconfigured. `callerAuth.ts` does not fit a webhook or a scheduled job, and inventing a service-account JWT to make it fit would have been worse. Proving the channel does not decide recipients — `notify-absence` re-reads the row from the database and derives the parent from `students.parent_id`, never from the request
- [x] `invite-user.mts` built — the project's **first real Function**, landed ahead of the 5 above and not part of the original spec (admin email-invite, see §10 and TAD's Netlify Functions table). Since TAD ADR-018 it also sends the branded role-aware invitation email
- [~] **Transactional email (Resend)** — utility, templates and one call site built (ADR-018). `lib/email.ts` never throws and fails open; `lib/emailTemplates.ts` holds the invitation copy keyed role → locale, in the formal register PPME's own correspondence uses. Wired into `invite-user` only; the event notifications (absence, milestone, reminder, report-ready) stay push-only and get their own templates later on this same pattern. Three things keep this at `[~]` rather than done: **the sending domain is not verified**, **the EU region is not confirmed selected**, and **no real email has ever been sent or seen in a client** — all three need the Resend account, and the first two are prerequisites before any real family is invited. Also open: `invite-user` now sends *two* emails (GoTrue's magic link and this one), which ADR-018(b) records rather than resolves, and the second user-creation path (`registerUser` in `src/features/admin/api.ts`, used when someone signed in before an admin registered them) is a client-side insert that cannot reach a server-side key, so it sends nothing
- [x] `generate-year-end-drafts.mts`, `publish-report.mts`, `report-pdf.mts` built (§9) — the 2nd–4th Functions, and the 2nd–4th holders of the service-role key. Their shared authorization shape (validate the JWT with an anon-key client, then look the role up independently with the service-role client) is now factored into `netlify/functions/lib/callerAuth.ts` rather than copied per Function

## 5. Frontend / PWA (build against the validated prototype)

- [x] `manifest.json` + icon set using the real PPME logo — configured (192/512/maskable) in `vite.config.ts`, now generated from the **high-resolution vendor masters** in `assets/brand/` (3564×1844) by `scripts/generate-brand-assets.py`, replacing the ~3.7x upscale from a 135×70px source. The square icons carry the **globe mark alone** rather than a letterboxed wordmark, so they stay readable at 48px; the maskable variant is scaled to 58% so its furthest pixel sits inside the 80% safe zone under any launcher mask. Also generated: `public/logo.png` (full colour), `public/logo-white.png` (reversed, for the blue top bar — the white pill behind the old logo is gone), 16/32px favicons, and `icons/badge-96.png` — the Android notification badge, which must be a **transparent monochrome silhouette** because Android masks that slot by its alpha channel and repaints it (an opaque icon shows as a white block, and no badge at all shows Chrome's logo; both were live until a real device caught it)
- [~] Service worker via Workbox: app-shell precaching done (`vite-plugin-pwa`, `generateSW`); runtime caching per route and **background sync queue for offline attendance/murajaah submissions not built** — attendance currently requires being online
- [ ] IndexedDB offline queue tested for conflict resolution (e.g., tutor marks attendance offline on two devices before sync)
- [x] Role-based routing/dashboards for the 3 roles shown in the prototype: **Ustadz** (Hadir/Tugas/Yanbu'a/Al-Quran/Murajaah — class roster views), **Orang Tua** (same 5 tabs — single child's data), **Santri** (same 5 tabs — self view, 16+ only) — built for all 5 tabs (**Hadir + Tugas + Yanbu'a + Al-Quran + Murajaah**). A 4th role (**Admin**) was also built (§10); since ADR-014 it uses the *same* five tabs and the same class-shaped tutor views on every class, rather than the separate replacement nav it had originally
  - [x] Note: prototype's top "Pilih Peran" switcher is **prototype-only** — production derives role from authenticated user via Supabase Auth + RLS, not a manual toggle — confirmed correct in the shipped `AuthContext`/RLS implementation
- [x] Bottom tab nav built in confirmed order: Hadir | Tugas | Yanbu'a | Al-Quran | Murajaah — **the same five for every role including admin** since ADR-014. The admin-only tab set that used to *replace* them (Pendaftaran | Kelas | Santri | Rapor) is gone: 5 + 4 will not fit a mobile bottom nav at 44px tap targets, and the 5 above are the prototype-validated set. The enrollment screens sit one level down behind a single "Kelola" entry (a dashboard tile, plus a sixth tab on desktop where there is room), with an `AdminSectionNav` pill strip inside `/admin/*` to move between them. Order unchanged, so no re-validation against the Figma Make prototype was needed — a unit test (`tests/unit/tabs.test.ts`) now pins it
- [x] Top nav: logo left, language toggle (globe icon), notification bell with badge — **all three now built**. The bell waited for the in-app notification centre it opens (TAD ADR-015 part 3 / ADR-017), because a bell with a badge promises a stored, readable list and there was no table behind it until migration 012. It renders for parents and 16+ students only: a tutor or admin receives no notifications and can read nobody else's, so a bell for them would be a permanently empty control that also implied an admin inbox of every family's messages exists
- [x] Attendance check-in UI: 3-state per student (✓ present / clock late / ✕ absent), matching `attendance_status` enum
- [x] Streak/gold-accent treatment reserved specifically for achievement moments (Murajaah flame counter, "Sudah Hafal" badges) — not used elsewhere — followed for Yanbu'a's jilid-complete banner and now Murajaah's streak number + "mark memorized"/portfolio badges (§13)
- [ ] Accessibility pass: 44px minimum tap targets, tested on real Android 8+/iOS 13+ devices — 44px enforced in CSS (`min-h-11` convention) but never verified on real hardware
- [ ] **iOS Web Push tested specifically** — requires "Add to Home Screen" first on iOS 16.4+; not a given even though iOS technically supports it. **Still unverified: there is no iOS device available to this project.** What exists is the handling — an iPhone in a Safari tab is detected as `ios-install-required` (iPadOS's "I am a Mac" user-agent included, via the touch-point check) and shown the install steps, rather than the flat "your browser doesn't support notifications" that the missing `PushManager` would otherwise produce. That branch is unit-tested against each platform's shape; it is not the same thing as having watched a notification land on an iPhone, and must not be recorded as such
- [x] Notification permission / subscribe UI + settings screen (`/settings/notifications`) — built for every role, reached from the dashboard. Handles permission-denied (explains where to undo it, rather than re-prompting into a wall), unsupported browsers, iOS-not-installed, and a push service that does not respond. Shows enabled/disabled from **server** state, not the browser's, so a subscription the server has dropped cannot be displayed as working
- [~] Notification center/list screen — **built** (`/notifications`, TAD ADR-017) and **reviewed against §1's design direction**, with every finding applied. A PPME prototype-batch review is still outstanding, which is why this stays `[~]`.

  The review was done against the rendered screen at 390px in both locales, not against the code. Findings:

  - **The screen used none of the palette's meaning.** An absence, a finished jilid and a weekly summary rendered as three identical grey cards. §1 assigns these colours jobs — danger for "absence markers", gold for "milestone/celebration moments" — and the centre carries the only celebration content in the app outside Murajaah's streak and the "Sudah Hafal" badges, yet rendered it grey. Fixed with a three-tone system (`src/features/notifications/eventStyle.ts`): danger for absence, accent for the two milestones, primary for everything informational, each with a glyph drawn from the tab bar's own vocabulary. Three tones, not eight: eight colours is decoration, three is a language. Unit-tested so gold cannot leak to a non-celebration event and red cannot leak past absence
  - **The unread state was too weak to survive a phone in daylight** — a 2px dot and a 5%-opacity tint. Now also a left rule in the primary colour
  - **Verified, no change needed:** the last row clears the fixed bottom tab bar; rows are full-width links well past the 44px minimum; the icon is `aria-hidden` so a screen reader gets the sentence, not the decoration; Dutch copy (longer than Indonesian throughout) wraps to three lines without truncation or overflow; the non-recipient state renders correctly for a tutor
  - **Left alone deliberately:** the child's name sits mid-sentence rather than in a chip. For a parent with three children that is the weakest part of scanning the list, but every string already names the child (enforced by test), so a chip would print the name twice. Worth putting to PPME rather than deciding here
  - **Noted:** the bell's unread count uses danger red, where §1 assigns red to absence and overdue items. Kept, because a red count badge is near-universal and the alternatives read as decoration, but it is a deliberate departure rather than an oversight What changed is the risk of building it first. The schema records domain events and nothing about presentation, so a review can regroup by child, split read from unread, add filters or dismissal, or reword everything, without a migration — and the screen itself deliberately reuses the Murajaah/Quran card-list pattern rather than inventing a layout, so a review has something conventional to react to. The in-app copy it uses was already drafted (`notifications.*`); two of those strings did not name the child, which a parent of two needs, and now all of them do

## 6. Security & Compliance

- [ ] Privacy Policy drafted (NL + ID), owned by PPME IT team, linked before any authentication step
- [ ] DPIA completed for children's data (PPME IT team ownership)
- [~] Right-to-erasure flow: cascade delete of student + all related records is in place at the DB layer, and the **manual** procedure is now written down step by step (README "Right to erasure"), including deleting the year-end report PDF from Storage first — `on delete cascade` never reaches Storage. Still no admin-facing UI or automated flow
- [ ] GDPR Article 20 data export (CSV) implemented for parents
- [ ] Consent flow for under-16 students confirmed against the hybrid account model
- [~] Basic OWASP Top 10 check on public Netlify Functions (input validation, rate limiting on endpoints like `push-subscribe`) — done for the two Functions added with notifications, not yet as a sweep across all of them. `push-subscribe` validates the subscription shape (HTTPS endpoint, both keys present, length bounds) before anything reaches the untyped `jsonb` column, stores only the three fields it uses, and rate-limits per caller. `notify-absence` authenticates its channel in constant time and fails closed. **The rate limiter's honest scope**: it counts per warm function instance, in memory, so it stops a looping client or a retry storm but not an attacker spreading requests across cold starts. Anything stronger needs shared state (Postgres or a KV store) this project has no place for yet — recorded in TAD ADR-015 rather than left implied
- [ ] **PPME IT sign-off on the super-admin role (ADR-014) before real student data is entered.** The `admin` role now reads *and* writes every child's operational data across the whole TPA. Nothing about that is new at the database layer (RLS has always granted admin `ALL`), but it is new in practice, and it changes the blast radius of a compromised or offboarded admin account from "enrollment records" to "everything". Three things IT should decide and record: (1) how many admin accounts exist and who holds them — keep the number small and named, not shared; (2) 2FA required on the Google accounts behind them (the app has no password of its own — DPIA R2); (3) admin offboarding must be as prompt as tutor offboarding, and is more urgent (DPIA R8 vs R11). Also worth noting for the record: the app keeps no audit log, so an admin edit to a report or an attendance row is not attributable after the fact beyond the `tutor_id` on rows it creates

## 7. Testing & Monitoring

- [x] Vitest unit tests for streak/mastery/notification logic — all three covered. Notifications: payload building in both locales, R6 content limits, dedup tags including the sibling case, DST/local-time helpers, subscription validation, rate limiting, the service worker's own push/click handlers, platform capability detection, recipient derivation + fan-out dispatch, and that no Function response can carry an identifier. Streaks: every frequency, the missed-period reset, the mid-week assignment, both 2026 DST switchovers and a year boundary. Plus the scheduled-Function gate itself, on a CET and a CEST date. 172 unit tests, up from 116
- [ ] Playwright E2E covering the 5 primary flows: attendance, homework, Yanbu'a, Al-Quran, Murajaah. Note for whoever picks this up: the CI `e2e` job runs against a bare dev server with no Supabase, which is why the suite is still the sign-in scaffold. The notification flow is instead verified by `scripts/verify-push.mjs`, which needs Docker + a loaded fixture + `netlify dev` and so cannot run in that job either — it is run by hand and its results are recorded in test-plan §6
- [x] RLS policy tests automated in CI — 104 pgTAP assertions (RLS-01…RLS-27, WH-01…WH-12, NC-01…NC-11), up from 93. The NC cases cover the notification centre: cross-family invisibility, that no client role can insert or delete a notification at all, that a recipient can write `read_at` and nothing else, that neither admin nor tutor reads any, and that `TRUNCATE` — which RLS does not filter — is no longer held by `anon`/`authenticated` on any table
- [ ] Netlify Analytics + Supabase Dashboard monitoring wired up; define who's alerted on scheduled function failures (silent otherwise). **More urgent again after part 2b**, which added three jobs that run 72 times a day between them and that nobody would notice failing: a family who stops getting reminders has no way to tell that from a quiet week. A failure is also *silent by design* elsewhere — `fn_notify_absence` swallows its own errors so a notification problem can never fail a tutor's attendance save, and pg_net delivers asynchronously. The scheduled jobs return their counts in the response body and a 500 with the message on failure, both of which land in Netlify's function log; `net._http_response` in Postgres is the other place to look (see README). Nobody is alerted by either today

## 8. Still Open — Resolve in Parallel, Non-Blocking

- [ ] **WhatsApp integration & budget** — Phase 3 feature (~€300/mo), not needed for MVP; push-only fallback already scoped
- [ ] **Multi-branch timing** — single-tenant recommended for Phase 1 (Den Haag only); revisit if PPME expands
- [ ] **Yanbu'a curriculum variants** — confirm whether the standard 7-jilid structure is universal at PPME, or if seed data needs adjusting

## 9. Year-End Curriculum Reports (New Feature, Milestone 6)

Built against the existing schema/RLS (migration 005 already covered
`year_end_reports`, the enums, the policies and the `reports` bucket; no new
migration needed) — same "verify against a real local Postgres+RLS stack" bar
as Milestones 1–4, plus a `netlify dev` layer this time, since the three
Functions below hold the service-role key and can't be exercised through
plain PostgREST calls the way the RLS-only features could.

- [x] Migration 005 applied (`year_end_reports` table, `report_status`/`report_grade` enums, RLS, `reports` Storage bucket)
- [x] `pdfkit` added as a dependency for the `publish-report` Function (ADR-011) — 8.2 MB installed (mostly standard-font metrics), well inside Netlify's 50 MB zipped / 250 MB unzipped Function limits, and no headless browser to cold-start; a report renders in well under a second locally
- [x] PDF template designed: brand header band, attendance stats table, subject grades table, narrative section, footer (tutor name + publish date) — labels are **bilingual ID/NL in one document** rather than rendered per recipient locale, so there is exactly one current PDF per report (FR-006) and no ambiguity about which language the stored object is in. The header now draws the **real reversed wordmark** (`doc.image()`), no longer a typographic stand-in: the high-resolution master exists, and the bundling problem was solved by inlining the PNG as base64 in `netlify/functions/lib/logoAsset.ts` rather than via `included_files` — a string constant is bundled by esbuild and behaves identically under `netlify dev` and on deployed Netlify, where runtime *file* resolution does not. The typographic header is kept as a fallback if the asset fails to decode, so a publish can never fail over branding (both paths unit-tested)
- [x] New "Reports" screen for Parent and Student 16+ (`FamilyReportsView`, reached from the dashboard tile — the 5-tab nav order is prototype-validated and deliberately unchanged); staff review/publish screen (`TutorReportsView` → `ReportEditor`). The admin generate-only screen at `/admin/reports` was **removed by ADR-014**: admin now uses the same `TutorReportsView` on every class, with bulk generation as a `GenerateDraftsPanel` above the list, so a deliberately content-blind screen had nothing left to protect
- [x] `generate-year-end-drafts`, `publish-report`, `report-pdf` Functions implemented per the OpenAPI contract, which was updated where the build found it wrong: `skipped_no_tutor` added to the generate response (a student with no class, or a class with no tutor, can't have an author — `tutor_id` is NOT NULL), `publish-report` narrowed to the authoring tutor only (ADR-013) and given a 400 for an empty narrative, `report-pdf` documented as denying admin
- [~] **Decision on the "Admin-triggered" generation call (TAD ADR-013)** — half of it superseded by ADR-014. Still true: bulk generation needs an enrollment-wide view, so the trigger is admin's, and **publishing is authoring-tutor-only**, admin included. No longer true: admin now reads and edits report content, `report-pdf` serves admin any report (draft or published), and the content-blind `/admin/reports` screen is gone. The one edge this created is handled explicitly — an admin edit to a *published* report cannot regenerate the PDF (that call 403s), so the editor hides the publish button for admin and shows "the PDF will not update until *[tutor]* re-publishes" rather than silently shipping a stored PDF that disagrees with the app
- [x] **Decision on the Storage path**: `{student_id}/{academic_year with / → -}.pdf`. The TAD's literal `{academic_year}.pdf` would nest each report a directory deeper, since Storage reads `/` as a separator. Deterministic per student+year, which is what makes re-publish overwrite in place rather than accumulate versions
- [ ] Report-ready push notification (FR-007) — deliberately out of scope for this milestone, same reasoning as Homework's FR-005, the Quran milestone celebration and Murajaah's FR-006; needs Netlify Scheduled Functions/webhook infra, which don't exist yet for anything in this project (see §4, §8). Publishing notifies nobody; `reports.notification` stays drafted-but-unused in both locales
- [x] i18n: `reports` namespace was pre-drafted at **30 keys per locale** (not the 172 this line previously claimed — corrected after counting); 19 genuinely-missing keys added for the review/publish/generate forms (`academicYearLabel`, `academicYearInvalid`, `classScope`, `allClasses`, `skippedExisting`, `skippedNoTutor`, `adminScopeNote`, `subjectYanbua`, `subjectQuran`, `subjectMurajaah`, `subjectNotes`, `notGraded`, `narrativeRequired`, `readOnlyOtherTutor`, `noDraftsForClass`, `republish`, `progressContext`, `murajaahTargets`, `saved`) → **49 per locale, parity-checked by the existing CI test**. `confirmPublish` was also reworded in both locales to stop promising a notification that FR-007 doesn't send. `reviewDraft`, `editPublished`, `notPublishedYet` and `notification` remain unused. *Since ADR-014: `adminScopeNote` was deleted (it described the content-blind admin screen that no longer exists) and three keys added — `adminCannotPublish`, `adminEditPdfStale`, `authoringTutor` — so the namespace stands at 51 per locale*
- [x] RLS tests RLS-15 through RLS-21 passing — unchanged by this milestone (no migration), re-run green as part of the full 38-assertion suite against a fresh local stack before and after the build
- [x] Right-to-erasure procedure updated to explicitly delete the student's Storage PDF object, not just the DB row (cascade delete doesn't reach Storage) — concrete runbook in README ("Right to erasure"), referenced from TAD "Other Artifacts" and test-plan.md §8
- [x] Unit tests for the §4.4 assertions (`tests/unit/reports.test.ts`, 15 cases): hand-computed stats accuracy, duplicate-generation skip counts, publish atomicity (an injected PDF-render failure and an injected Storage failure both leave `markPublished` uncalled), re-publish overwriting one object, and a PDF text-extraction smoke test for name/year/attendance rate/grades/tutor
- [x] Verified against a local Postgres+PostgREST+RLS stack **plus `netlify dev`**: 53 assertions via curl with minted JWTs for admin/two tutors/two parents/16+ student — non-admin generate rejected (403), invalid academic year rejected, first run creates 3 for one class, stats matching hand-computed 92.30/100.00/84.60 with an out-of-window session correctly excluded, re-run creating 0 and skipping 3, all-classes run adding only the remaining student, drafts invisible to parent and 16+ student via PostgREST, publish rejected with an empty narrative (status still `draft`), co-tutor and parent publish attempts rejected, publish → PDF in the bucket → status flipped, parent/tutor/16+-student signed URLs served and cross-family/admin/draft cases refused, then an edit + re-publish overwriting the same object with the same `published_at` and the corrected text inside the regenerated PDF. Also a scripted Playwright click-through of E2E-09/E2E-10 against `netlify dev` + `DevAuthSwitcher` (admin generate → tutor review/grade/publish → parent view + PDF download → admin blocked from `/reports`) with zero browser console errors; not committed to CI, which has neither the Functions runtime nor fixture data
- [ ] Dry run: one real tutor publishes one real report before the actual year-end rollout, to catch UX/content issues early

## 10. Admin Enrollment (New Feature — built ahead of schedule, not in the original numbered order)

Not part of the original PRD/TAD feature list or this checklist's build order — built in response to a direct need (someone has to be able to get users into the system) rather than as a scheduled milestone. Scope was deliberately narrowed to enrollment/setup only (TAD ADR-012); **ADR-014 has since reversed that narrowing** — admin is a super admin with full read/write access to every operational screen, and the enrollment screens below are simply the part of its job that no other role shares.

- [x] `/admin/registrations`, `/admin/classes`, `/admin/students` built (`src/features/admin/`)
- [x] Migration 008: `fn_pending_registrations()` — admin-only (enforced in the function itself), the only way to discover a Google sign-in with no `public.users` profile yet
- [x] Email invite flow: `netlify/functions/invite-user.mts` — creates `auth.users` + `public.users` together in one admin action, via `auth.admin.inviteUserByEmail()` under the service-role key
- [x] ~~Admin nav is exclusive, not additive~~ — **reversed by ADR-014.** `ADMIN_NAV_TABS` (which replaced the operational tabs) is now `ADMIN_SECTION_TABS`, a secondary pill strip *inside* `/admin/*`; admin gets the same five operational tabs as everyone else plus one "Kelola" entry point. `AdminRestricted.tsx` and its two i18n keys are deleted. `RequireAdmin.tsx` is unchanged and still guards every `/admin/*` route — including the new `/admin` index, which redirects to `/admin/registrations`
- [x] Dev-only fixture sign-in panel (`src/dev/DevAuthSwitcher.tsx`) + `supabase/dev-fixture.sql` — lets the whole admin flow (and Milestone 1) be exercised locally without real Google OAuth. The panel now also offers the fixture's **second tutor** (Ustadz Baru, assigned to Kelas B only), which the fixture always contained but the panel never listed — it is the only way to check a tutor's class scoping from the browser rather than with a hand-minted JWT, and that check got more important once admin stopped being the only role whose scope was worth re-testing
- [ ] No standalone "remove/deactivate a student" flow
- [ ] No CSV export. ADR-012's objection no longer applies (admin may read this data), so what's left to settle is GDPR art. 20 scope and DPIA risk R4: an export must leave out the absence-`reason` free-text field, which can carry health data
- [ ] Supabase Auth's Site URL / Redirect URLs allow-list needs to be correct on the live project for invite emails to land on the right domain — `invite-user.mts` passes an explicit `redirectTo` (Netlify's own `URL` env var) so this is no longer solely dependent on that dashboard setting, but the target must still be on the allow-list

## 11. Homework Assignments — Tugas (New Feature, Milestone 2)

Built against the existing schema/RLS (migrations 002/003 already covered `assignments`/`assignment_status`; no new migration needed) — same "verify against a real local Postgres+RLS stack" bar as Milestone 1.

- [x] Tutor view (`TutorAssignmentsView`): class roster → create assignment (title/description/due_date) → assign to the whole class or a hand-picked subset of students (checkbox list, all checked by default) → per-student status marking (Pending/Completed/Incomplete/Partial) with optional notes, same drill-down shape as `TutorYanbuaView`
- [x] Family view (`FamilyAssignmentsView`): parent/student list with Pending/Completed/Incomplete/Partial/**Overdue** badges — Overdue is computed client-side (`src/lib/assignments.ts#computeDisplayStatus`), not a stored value: `assignment_status_enum` has no `overdue` member, so a row still `pending` past its assignment's `due_date` is the only case that maps to it; once a tutor marks a verdict, it stands even past the due date
- [x] Wired into the existing `/assignments` route in `src/App.tsx` (was `FeaturePlaceholder`); `AssignmentsPage` blocked admin the same way Attendance/Yanbu'a did (`AdminRestricted`) — **removed by ADR-014**, which routes admin to the tutor view here like every other class-shaped screen
- [x] Two new i18n keys added (`assignments.statusOverdue`, `assignments.notes`) — the rest of the `assignments` namespace was already drafted ahead of this build and reused as-is
- [x] Unit tests for `computeDisplayStatus` (`tests/unit/assignments.test.ts`)
- [x] Verified against a local Postgres+PostgREST+RLS stack: full create → assign-to-subset → mark-complete → parent-sees-update flow exercised via curl with minted JWTs for the fixture tutor/two parents/16+ self-login student, confirming cross-family isolation on `assignment_status` (empty result, not just filtered), a parent's write attempt resolving to 0 rows (no parent write policy exists), and a cross-class tutor's `assignments` INSERT rejected with 403
- [ ] FR-005 (due-date reminder notifications) — deliberately out of scope for this milestone; needs Netlify Scheduled Functions, which don't exist yet for anything in this project (see §4, §8)

## 12. Quran Recitation Progress Tracking — Al-Quran (New Feature, Milestone 3)

Built against the existing schema/RLS (migrations 002/003/004 already covered `quran_progress`/`surahs`; no new migration needed) — same "verify against a real local Postgres+RLS stack" bar as Milestones 1–2.

- [x] Tutor view (`TutorQuranView`): class roster → select student → record recitation session (surah via a searchable native `<select>` against the seeded `surahs` reference table, ayah_from/ayah_to range, `quran_quality` rating, optional tajweed notes), same roster-drill-down shape as `TutorYanbuaView`/`TutorAssignmentsView`
- [x] Family view (`FamilyQuranView`): parent/student current-position summary (surah, ayah reached, approximate whole-Quran completion %) + chronological recitation history with quality badges, mirroring `FamilyYanbuaView`'s `CurrentLevelCard`/timeline shape
- [x] **Decision on `students.current_surah`/`current_ayah`** (migration 002, never written by any prior code): current position is derived client-side from the latest `quran_progress` row rather than maintained as a second write path — see `src/lib/quran.ts`'s docstring and the TAD domain model footnote. Matches Yanbu'a's client-side jilid-completion detection (README "Known gaps") rather than introducing a new denormalization-sync pattern
- [x] Wired into the existing `/quran` route in `src/App.tsx` (was `FeaturePlaceholder`); `QuranPage` blocked admin the same way Attendance/Yanbu'a/Assignments did (`AdminRestricted`) — **removed by ADR-014**, which routes admin to the tutor view here like every other class-shaped screen
- [x] Four new i18n keys added (`quran.fieldSurah`, `quran.fieldQuality`, `quran.searchSurah`, `quran.savedMessage`) — the rest of the `quran` namespace was already drafted ahead of this build and reused as-is, including previously-unused keys (`surahNumber`, `percentQuran`, `lastSession`) now wired into `CurrentPositionCard`
- [x] Unit tests for `computeQuranPercent`/`findSurah` (`tests/unit/quran.test.ts`)
- [x] Verified against a local Postgres+PostgREST+RLS stack: tutor insert for own-class student, tutor `tutor_id` impersonation rejected, cross-class tutor insert rejected, parent read of own child, parent cross-family read returns empty (not just filtered), parent write attempt rejected (no parent INSERT policy exists on `quran_progress`), 16+ self-login student reads own rows only (not a classmate's), student write attempt rejected, and anonymous read returns empty — 11 cases via curl with minted JWTs for the fixture tutor/second tutor/two parents/16+ self-login student
- [ ] Milestone/celebration notification for reaching a juz or completing the Quran — deliberately out of scope for this milestone, same reasoning as Homework's FR-005; needs Netlify Scheduled Functions/webhook infra, which don't exist yet for anything in this project (see §4, §8)

## 13. Murajaah (Memorization) Tracking (New Feature, Milestone 4)

Built against the existing schema/RLS (migrations 002/003/004 already covered `murajaah_assignments`/`murajaah_log`, plus the `fn_set_streak_count` streak trigger; no new migration needed) — same "verify against a real local Postgres+RLS stack" bar as Milestones 1–3. Unlike Yanbu'a/Quran's single-table shape, this is a two-table model (tutor-set target + parent-confirmed log), which also means it's the first of these four builds where the tutor's create/manage screen and the parent's confirm screen touch genuinely different tables under different RLS policies rather than the same one.

- [x] Tutor view (`TutorMurajaahView`), two tabs — not a single roster-drill-down like Yanbu'a/Quran, since FR-004 needs a different shape than FR-001/FR-005/FR-007:
  - [x] "Tetapkan Target" (`TutorAssignView`): class roster → select student → assign a target (surah via the reused `SurahSelect`/`fetchSurahs`, ayah range, `murajaah_frequency`), same roster-drill-down shape as `TutorYanbuaView`/`TutorQuranView`; also shows the student's active target(s) with a "Tandai Sudah Hafal" action and their memorized-target portfolio + read-only confirmation history
  - [x] "Ringkasan Kelas" (`TutorOverviewView`, FR-004): whole-class-at-once view of which students have/haven't confirmed today, plus a this-week confirmed-day count — same roster-at-once shape as `TutorAttendanceView`, unlike the drill-down above
- [x] Family view (`FamilyMurajaahView`): current active target(s) with streak display + one-tap "✓ Selesai Murajaah" confirmation (optional quality rating, parent role only), memorized-target portfolio, and chronological confirmation history — mirrors `FamilyQuranView`'s current-position/timeline shape
- [x] **Decision on "current streak" display — revised in Milestone 7 (TAD ADR-016(a)).** It originally read: the trigger-written `murajaah_log.streak_count` only changes on INSERT, so a live figure can't be verified between confirmations, and the UI therefore showed the latest log's stored count with its date rather than asserting a current streak. That was the right call while there was no way to compute one — and the wrong shape once there was. Migration 011 drops the column and its trigger; `computeStreak` derives the streak from the log at read time, in the period the target's `frequency` asks for, and the card shows a live number in the right unit (days for `daily`, weeks for `3x_week`/`weekly`). It also fixes a bug the stored count always had: a `3x_week` target confirmed Mon/Wed/Fri every week for a year read a streak of 1
- [x] **Decision on FR-005/FR-007's tutor TPA assessment**: there is no RLS write path from a tutor into `murajaah_log` (`mlog_tutor_read` is read-only; only `mlog_parent_insert`, scoped to the parent's own children, can write) and `murajaah_assignments` has no quality/assessment column — "if Hafal Lancar, mark as Memorized and assign next portion" resolves entirely through `murajaah_assignments.active` (tutor already has full RW there), applied as a tutor action rather than persisted as a separate assessment record — see `src/features/murajaah/api.ts`'s docstring and the TAD domain model footnote
- [x] Wired into the existing `/murajaah` route in `src/App.tsx` (was `FeaturePlaceholder`); `MurajaahPage` blocked admin the same way Attendance/Yanbu'a/Assignments/Quran did (`AdminRestricted`) — **removed by ADR-014**, which routes admin to the tutor view here like every other class-shaped screen
- [x] Nine new i18n keys added (`murajaah.fieldQuality`, `assignNew`, `targetAssigned`, `markMemorized`, `portfolio`, `noActiveTarget`, `tabAssign`, `tabOverview`, `history`) — the rest of the `murajaah` namespace was already drafted ahead of this build and reused as-is; `murajaah.assignedBy` and `murajaah.reminder` remain unused (the former needs a `users` read policy exposing a tutor's name to parents that doesn't exist — no other feature shows a "recorded by" name to families either — and the latter is FR-006, deferred with the rest of notifications)
- [x] Unit tests for `isStreakCurrent`/`startOfWeekLocalDate`, and since Milestone 7 for `computeStreak`/`computeBestStreak`/`currentPeriod`/`needsReminder` across all three frequencies, both 2026 DST switchovers and the mid-week-assignment case (`tests/unit/murajaah.test.ts`, 41 tests)
- [x] Verified against a local Postgres+PostgREST+RLS stack: tutor own-class insert, tutor `tutor_id` impersonation rejected, cross-class tutor insert rejected, tutor `active` PATCH (mark memorized) on own-class vs. cross-class (0 rows, not an error), parent read of own child, parent cross-family read returns empty, parent write attempt on `murajaah_assignments` rejected (no parent write policy), parent confirms `murajaah_log` for own child, parent `confirmed_by` impersonation rejected, parent cross-family `murajaah_log` insert rejected, tutor `murajaah_log` write attempt rejected (read-only), tutor read of own-class log, 16+ self-login student reads own rows only, student write attempt rejected, anonymous read returns empty, duplicate same-day confirmation rejected (unique violation) — plus a dedicated streak-trigger sequence confirming two consecutive days yields `streak_count=2` and a gap day resets it to 1 — 18 cases via curl with minted JWTs, plus a full click-through via `netlify dev`-equivalent (`npm run dev` + `DevAuthSwitcher`) as tutor and parent with zero browser console errors
- [ ] FR-006 (daily practice reminders) — deliberately out of scope for this milestone, same reasoning as Homework's FR-005 and the Quran milestone-celebration notification; needs Netlify Scheduled Functions/webhook infra, which don't exist yet for anything in this project (see §4, §8)

---

## Suggested Build Order

1. Repo + environments (§2) → 2. Database + RLS (§3) → 3. Auth flow (Google OAuth + role derivation) → 4. Ustadz attendance flow end-to-end (simplest, highest-value) → 5. Remaining Ustadz flows (Tugas, Yanbu'a, Al-Quran, Murajaah) → 6. Orang Tua views (read-mostly, reuses most backend work) → 7. Santri self-login (16+) → 8. Notifications/Functions (§4) → 9. PWA/offline polish (§5) → 10. Compliance docs finalized before any real student data is entered (§6)

**Status update (notifications, TAD ADR-015 part 2a):** every
*event-driven* notification is now built and verified — absence, jilid
completed, surah memorized, new homework assigned, and year-end report
published (PRD FR-007). Four of the five features that were waiting on
notification infrastructure are unblocked; the two that remain
(Homework's FR-005 due-date reminders and Murajaah's FR-006 daily
practice reminders) are both **scheduled**, and wait on part 2b along
with the weekly digest, `streak-status`, and the streak-reset decision.
Part 2 was split into 2a and 2b during the build — 2b introduces a
runtime this project has never run *and* the one real design decision
left (`3x_week`/`weekly` streak semantics), which has nothing to do with
the four event senders in 2a. The two Functions in 2a that were not in
the original five-Function list — `notify-assignment` and
`notify-report-ready` — exist because the Notification Spec had rows with
no Function against them.

**Status update (notifications, TAD ADR-015 part 2b + ADR-016):** every
notification in the Notification Spec is now built, and step 8's
notification half is done. The three scheduled Functions
(`send-murajaah-reminders`, `homework-due-reminders`,
`weekly-progress-digest`) close Homework's FR-005 and Murajaah's FR-006,
the last two features that were waiting on infrastructure. Two of the
originally-planned Functions were **not** built and are recorded as
superseded rather than quietly dropped — `calculate-streak-resets`,
because streaks became derived and cannot go stale, and `streak-status`,
because it would return an integer its callers already compute. What
remains of §4 is part 3, the in-app notification centre, which needs a
new table and a design review it has never had.

**Status update (notifications, ADR-015 part 3 + ADR-017):** Milestone 7
is complete. The notification centre is built — `public.notifications`
(migration 012), the `/notifications` screen, and the TopNav bell that
closes §5's last outstanding top-nav row. Every sender now writes a row
as well as pushing, including for families who have push switched off,
which is who the centre is mostly for.

Its **design is still unreviewed**, and the §5 row above is deliberately
left at `[~]` rather than ticked. What changed is not that the review
happened but that building first stopped being risky: the table records
domain events and nothing about presentation, so a review can regroup,
reorder, filter, split or reword the screen without a migration.

Three more things were fixed on the way, none of them part 3's brief.
Two of the drafted in-app strings did not name the child, which a parent
of two cannot use. `authenticated` and `anon` held **TRUNCATE** on every
table in `public` — a privilege RLS does not filter, confirmed by
emptying `attendance` from a `set role authenticated` session — inherited
from Supabase's own role bootstrap rather than from migration 007; not
reachable through PostgREST, which has no TRUNCATE verb, but revoked on
least-privilege grounds (NC-11). And the centre's "you receive none"
notice for a tutor rendered the raw i18n key, because the DB role enum
and the copy's key names deliberately differ.

Three things were fixed on the way through that were not part of the
brief, because they were bugs rather than gaps. A parent of two children
received **one** notification when both were absent — the dedup tag had
no child in it, so the second silently replaced the first; part 1 had
pinned that in a test as accepted. Every Function's response body
carried the dedup tags, each of which is a user id plus a student id,
on endpoints that under `netlify dev` answer unauthenticated requests.
And the 30-second bound on `pushManager.subscribe()` was tighter than
FCM's own latency — a subscription that FCM served perfectly well was
measured taking 32 seconds, so a family on a slow day was told the
feature was broken.

**Status update (notifications, TAD ADR-015 part 1):** step 8 is now
genuinely started rather than "barely". The push pipeline exists end to
end and the absence notification (PRD Feature 1 FR-005 / AC-002) is live:
VAPID, `push-subscribe`, the payload builder, the service-worker
handlers, the notification-settings screen, migration 009's database
webhook and `notify-absence`. It was **deliberately not built as one
milestone** — full §4 is nine Functions, webhooks, three pieces of UI, a
migration and eight documents, which is more than any milestone here has
shipped at once, and part of it (test-plan §6's real-device matrix)
cannot be verified from a development machine at all. Parts 2 and 3 are
scoped in ADR-015: the four scheduled Functions + `notify-milestone` +
`streak-status` + the `calculate-streak-resets` consequences, then the
notification centre once its design has been reviewed. The five features
that were waiting on this infrastructure are still waiting on part 2 —
homework FR-005, the Quran milestone celebration, Murajaah FR-006, and
the year-end report's FR-007 — but they are now waiting on a Function
each, not on infrastructure that does not exist.

**Where Milestone 7 left things (current):** step 8's notification half
is **done** — the push pipeline, all eight notification types, four
scheduled Functions, and the in-app notification centre with its TopNav
bell. Two originally-planned Functions were superseded rather than built
(`calculate-streak-resets`, `streak-status` — ADR-016), and one screen is
built but **still awaiting design review** (the notification centre —
ADR-017, §5). What is still genuinely open across the project: the
real-device matrix (test-plan §6, no Android or iOS hardware available),
offline/background-sync (§5), monitoring and alerting (§7), the retention
window for progress data (§6, `[IT TEAM]` N=3), and step 9/10.

**Status as of the milestone before that** (kept for the record; §4/§5/§7/§8's own rows above carry the current state): 1–3 done. 4 done (Hadir). 5 done (Tugas + Yanbu'a + Al-Quran + Murajaah, all built). 6 done for all five built flows plus the Reports screen (Hadir + Tugas + Yanbu'a + Al-Quran + Murajaah + Rapor). 7 works structurally (RLS + the family views already handle `role=student`, and the 16+ student's own year-end report read + PDF download were exercised end-to-end against the local stack) but still hasn't been through a real Google 16+ self-login account. 8 barely started — `invite-user.mts` plus the three year-end-report Functions (`generate-year-end-drafts`, `publish-report`, `report-pdf`) exist, but none of the 5 originally-planned notification/streak Functions do; FR-005 (homework due-date reminders), the Quran milestone-celebration notification, Murajaah's FR-006 (daily practice reminders) and the year-end report's FR-007 (report-ready push) are all deliberately deferred with the rest of notifications, same reasoning as Milestone 1. 9 not started, though the icon/manifest half of it is now done properly (§5 — real high-resolution brand assets replaced the upscaled placeholders). 10 not started, and it grew one item: the super-admin role needs PPME IT sign-off before real student data is entered (§6). Admin enrollment (§10) and Homework Assignments (§11) both landed out of the numbered order, in response to practical need rather than as scheduled milestones; Quran (§12) and Murajaah (§13) both landed in their intended §5 slot; Year-End Curriculum Reports (§9) is the first milestone to need Netlify Functions with the service-role key, and so the first that had to be verified through `netlify dev` rather than PostgREST alone. Every route in `src/App.tsx` resolves to a real feature — `FeaturePlaceholder` was deleted with the last one.

**Post-milestone change (TAD ADR-014, no new milestone):** the `admin` role became a real super admin — full read *and* write access to all six features on every class, using the same class-shaped views a tutor gets, with the enrollment screens moved behind a single "Kelola" entry point. No migration and no RLS change was involved: migrations 003/005 always granted admin `ALL`, and the restriction was purely application-layer. Two boundaries were kept deliberately — a report can still only be published by its authoring tutor, and Murajaah home practice can still only be confirmed by a parent. Landed together with the real high-resolution brand assets (§5, §9), since both touched the same documents.
