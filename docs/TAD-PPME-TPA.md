# Technical Architecture Document: PPME - TPA

**Product:** PPME - TPA
**Author:** Solution Architect
**Date:** 2026-06-29
**Status:** Draft
**Related PRD:** PRD-PPME-TPA.md

---

## Table of Contents
- [Requirements Overview](#requirements-overview)
- [Scope](#scope)
- [Assumptions](#assumptions)
- [Dependencies](#dependencies)
- [High-Level Components](#high-level-components)
- [Key Architecture Decisions](#key-architecture-decisions)
- [Impact](#impact)
  - [Domain Model](#domain-model)
  - [API Spec](#api-spec)
  - [Batch Files Spec](#batch-files-spec)
  - [Notification Spec](#notification-spec)
  - [Flows](#flows)
  - [Database](#database)
  - [Billing](#billing)
  - [CS Tools](#cs-tools)
  - [Scheduler](#scheduler)
- [Other Artifacts](#other-artifacts)
- [Questions](#questions)
- [References](#references)

---

# Requirements Overview

Build a Progressive Web App (PWA) for PPME Den Haag's TPA (Taman Penitipan Al-Quran) program that enables:

1. **Attendance Tracking** — Tutors record daily student presence/absence; parents receive notifications and view history
2. **Homework Assignments** — Tutors create and assign homework; parents/students view and track completion
3. **Yanbu'a Progress Tracking** — Record student progression through the 7-jilid Yanbu'a curriculum with mastery assessments
4. **Quran Recitation Tracking** — Track surah/ayah progress with tajweed quality ratings
5. **Murajaah (Memorization) Tracking** — Assign memorization targets, enable parent-confirmed home practice with streaks, tutor assessment

**Key Non-Functional Requirements:**
- GDPR-compliant (EU data residency, encrypted storage, children's data protection)
- Google OAuth 2.0 authentication
- Hosted on Netlify (EU region)
- European technology providers preferred
- Affordable/free-tier cost model suitable for community organization
- Mobile-first PWA with offline support
- Bilingual: Bahasa Indonesia (primary) + Dutch (secondary)

# Scope

### In Scope (Phase 1 — MVP)
* Attendance management (present/absent/late with reasons)
* Yanbu'a progress recording (jilid, page, mastery level)
* Google OAuth 2.0 authentication for all user roles
* Role-based access control (Tutor, Parent, Student, Admin)
* PWA with offline-first capability and background sync
* Netlify deployment (EU region)
* Push notifications for absence alerts

### In Scope (Phase 2)
* Homework assignment module
* Parent dashboard with progress overview
* Quran recitation progress tracking

### In Scope (Phase 3)
* Murajaah home practice with parent confirmation
* Streak tracking and milestone celebrations
* Daily reminder notifications (push + optional WhatsApp)
* Reporting dashboards for TPA Admin

### Out of Scope
* Payment/fee management
* Audio/video recording of recitations
* AI-based tajweed assessment
* Gamification/leaderboards
* Multi-branch PPME deployment (future phase)
* Native mobile apps (iOS/Android app store)

# Assumptions

* All tutors, parents, and students (where applicable) have access to a Google account for authentication
* PPME Den Haag (Medlerstraat 4) has reliable WiFi during TPA sessions
* Parents have smartphones with modern browsers (Android 8+/iOS 13+)
* The standard 7-jilid Yanbu'a curriculum is used universally at PPME
* PPME Den Haag serves up to ~200 students and ~20 tutors maximum
* Tutors are volunteers and not compensated via this platform
* The TPA committee designates an Admin user to manage enrollment data
* The app will be accessed primarily from CET/CEST timezone (Netherlands)
* Netlify free tier or Pro tier ($19/mo) is sufficient for initial traffic volumes
* The PPME board approves use of Google services for member data (per GDPR assessment)

# Dependencies

| Dependency | Provider | Purpose |
|---|---|---|
| Google OAuth 2.0 | Google (Identity Platform) | Authentication for all users — no custom password management |
| Netlify | Netlify Inc. (EU region) | Frontend hosting, CDN, serverless functions, scheduled functions |
| Supabase (EU) | Supabase (Frankfurt region) | PostgreSQL database, Row Level Security, real-time subscriptions, file storage |
| Supabase Auth | Supabase | Google OAuth integration layer, session management |
| Web Push API | Browser-native (VAPID) | Push notifications to subscribed devices |
| WhatsApp Business API | Meta (optional Phase 3) | Reminder notifications via WhatsApp for Murajaah |
| Quran Reference Data | Open-source (quran.com API or static JSON) | 114 Surahs with ayah counts — loaded as seed data |
| Yanbu'a Curriculum Data | Manual seed | 7 Jilid with page counts — pre-loaded reference data |

# High-Level Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (PWA)                                   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────┐ │
│  │Attendance │ │ Homework  │ │  Yanbu'a  │ │   Quran   │ │Murajaah│ │
│  │  Module   │ │  Module   │ │  Module   │ │  Module   │ │ Module │ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │              Shared: Auth, Offline Cache, Notifications          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  Framework: Next.js (Static Export) / React + Vite                   │
│  Styling: Tailwind CSS (PPME brand theme)                            │
│  PWA: Service Worker + Workbox                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS (TLS 1.3)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     HOSTING & EDGE (Netlify EU)                       │
│  ┌───────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │  Static CDN   │  │ Netlify Functions   │  │ Scheduled Functions │  │
│  │  (PWA assets) │  │ (API edge handlers) │  │ (Daily reminders)  │  │
│  └───────────────┘  └────────┬───────────┘  └────────┬───────────┘  │
└──────────────────────────────┼────────────────────────┼──────────────┘
                               │                        │
                               ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Supabase — Frankfurt EU)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  PostgreSQL   │  │  Auth (GoTrue)│  │   Storage    │              │
│  │  (encrypted)  │  │  Google OAuth │  │  (avatars)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐                                 │
│  │  Row Level    │  │  Realtime     │                                │
│  │  Security     │  │  (WebSocket)  │                                │
│  └──────────────┘  └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Web Push     │  │  WhatsApp    │  │  Google      │              │
│  │  (VAPID)      │  │  Business API│  │  Identity    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

**Technology Stack Summary:**

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + Vite (or Next.js static export) | Fast, lightweight PWA; excellent DX; static export for Netlify |
| Styling | Tailwind CSS | Utility-first; easy to apply PPME brand tokens; small bundle |
| PWA | Workbox (Service Worker) | Offline caching, background sync, push notification support |
| Hosting | Netlify (EU) | Free/affordable; automatic deployments from Git; serverless functions; scheduled functions |
| Backend/DB | Supabase (Frankfurt, EU) | PostgreSQL with Row Level Security; built-in Auth; real-time; free tier generous (500MB DB, 1GB storage) |
| Auth | Google OAuth 2.0 via Supabase Auth | Trusted provider; no password management; PPME members have Google accounts |
| Notifications | Web Push API (VAPID) | Browser-native; no third-party dependency; free |
| Language | TypeScript | Type safety across frontend and serverless functions |
| Testing | Vitest + Playwright | Unit + E2E testing; fast CI on Netlify |

# Key Architecture Decisions

| # | Decision | Rationale | Alternatives Considered |
|---|---|---|---|
| ADR-001 | **PWA (not native app)** | No app store approval needed; single codebase; instant updates via Netlify; "Add to Home Screen" gives native-like experience; most cost-effective | React Native (too complex for community project); Flutter (added complexity) |
| ADR-002 | **Supabase (Frankfurt) as backend** | EU data residency (GDPR); PostgreSQL with Row Level Security; built-in Google OAuth; real-time subscriptions; generous free tier (up to 500MB DB); open-source | Firebase (US-centric data by default; Google lock-in); PlanetScale (no RLS); self-hosted Postgres (ops overhead) |
| ADR-003 | **Google OAuth 2.0 only (no password auth)** | Eliminates password storage liability; PPME members already have Google accounts; reduces security attack surface; simpler UX | Email+password (password management burden); Magic links (email deliverability issues); Phone OTP (SMS costs) |
| ADR-004 | **Netlify (EU) for hosting** | Automatic Git-based deployments; CDN for fast global delivery; serverless functions for API logic; scheduled functions for reminders; affordable Pro tier; EU edge nodes | Vercel (similar but less EU focus); AWS Amplify (over-engineered for community app); self-hosted (ops burden) |
| ADR-005 | **Offline-first with Workbox** | TPA sessions may have intermittent WiFi; parents log Murajaah anywhere; service worker caches app shell + recent data; background sync when online | Online-only (poor UX for mobile users); SQLite WASM (too complex) |
| ADR-006 | **Row Level Security (RLS) at database level** | Parents can ONLY see their children's data; tutors can ONLY access their assigned classes; enforced at DB layer regardless of API bugs; GDPR data minimization principle | Application-level auth only (single point of failure); API middleware checks (bypassable if misconfigured) |
| ADR-007 | **Tailwind CSS with PPME brand tokens** | Matches ppmedenhaag.nl look and feel; royal blue (#0D50A0) + gold + white palette (sampled from PPME logo) encoded as CSS variables; responsive mobile-first; tiny production bundle | Material UI (too generic); Bootstrap (dated); Custom CSS (maintenance overhead) |
| ADR-008 | **Supabase Realtime for live updates** | When tutor submits attendance, parent sees it instantly; Murajaah confirmations reflect immediately for tutors; WebSocket-based, included in Supabase free tier | Polling (wasteful, delayed); Server-Sent Events (less browser support); Firebase Realtime DB (non-EU) |
| ADR-009 | **Web Push (VAPID) for notifications** | Free; no third-party service needed; browser-native; works on Android and desktop; iOS 16.4+ supports web push | FCM (Google dependency); OneSignal (extra service); WhatsApp only (not all parents use it) |
| ADR-010 | **Netlify Scheduled Functions for reminders** | Cron-based daily Murajaah reminders; no separate scheduler infrastructure; runs in EU region; included in Netlify plan | Supabase pg_cron (limited); External cron service (extra dependency); AWS Lambda (overkill) |
| ADR-011 | **pdfkit for year-end report PDF generation** | Pure-JS, no headless browser — fits comfortably within Netlify Functions' package-size and execution-time limits; sufficient for a structured single/two-page report (header, stats table, grades table, narrative) | Puppeteer/Playwright + Chromium (HTML→PDF gives more layout flexibility but the Chromium binary is heavy for serverless — tight fit on free tier, slower cold starts); @react-pdf/renderer (viable alternative, similar tradeoffs to pdfkit but React-based — reconsider if design needs grow past what pdfkit's imperative API comfortably supports) |
| ~~ADR-012~~ | ~~**Admin role scoped to enrollment/setup only, not operational data**~~ — **SUPERSEDED by ADR-014** | Explicit product decision during the admin UI build: admin manages users/classes/students but cannot view attendance, Yanbu'a/Quran/Murajaah progress, homework, or reports — those nav tabs are hidden for admin and the routes redirect if visited directly (`AdminRestricted.tsx`). This is an **application-layer** restriction only — RLS still grants admin `ALL` at the DB layer per ADR-006/the RLS policy table below, kept for legitimate support/data-recovery needs. Narrows the "CS Tools → Admin Dashboard" scope below from the original spec (which included Attendance Reports and Progress Overview). *Kept on the record because Milestones 1–6 were all built around it — `AdminRestricted.tsx`, the exclusive admin nav, and `report-pdf`'s admin denial all existed because of this row.* | Full CS Tools scope as originally specced (rejected at the time: puts student progress/attendance data in front of a role with no pedagogical relationship to the student, beyond what enrollment administration requires — **this is the alternative ADR-014 ultimately adopted**) |
| ~~ADR-013~~ | ~~**Year-end draft generation is admin-triggered; everything about a report's content stays with the tutor**~~ — **PARTLY SUPERSEDED by ADR-014** (the content-blindness half; the publishing half stands) | Resolved the one apparent conflict between the Netlify Functions table below (which describes `generate-year-end-drafts` as "Admin-triggered") and ADR-012. Bulk-creating one draft per enrolled student for a whole academic year genuinely needs an enrollment-wide view, which only admin has — so the *trigger* is admin's, exposed at `/admin/reports` as a form with two inputs (academic year, optional class) whose only output is `created_count` / `skipped_existing` / `skipped_no_tutor`. That screen never listed the drafts, never showed a narrative or grade, and offered no route to one; `/reports` blocked admin via `AdminRestricted`, and `report-pdf` refused admin outright even though RLS grants admin ALL. **The one part of this row that ADR-014 leaves exactly as written**: `publish-report` accepts **only the authoring tutor**, not admin, matching what `yer_tutor_rw`'s WITH CHECK (`tutor_id = auth.uid()`) already allows through PostgREST | Admin able to browse/review report content (rejected then as the pedagogical data ADR-012 excluded — **adopted by ADR-014**); tutor-triggered generation (rejected, and still rejected: a tutor sees only their own classes, so nobody could generate for the whole TPA in one action, and per-class triggers would silently miss students whose class has no tutor assigned); admin allowed to publish as a break-glass (rejected then and now: publishing is what makes a report visible to a family — an authoring judgement, not an enrollment operation) |
| ADR-014 | **`admin` is a super admin: full read *and* write access to every feature, on every class** | Reverses ADR-012 and the content-blind half of ADR-013 at PPME's request. An administrator of a ~200-student TPA needs to be able to see and fix operational data — cover a session when a tutor is away, correct a mis-recorded absence, finish a report — and the previous fence made the only account with an org-wide view the one account that could do none of that.<br><br>**No migration and no RLS change.** Migration 003 has always granted admin `ALL` on every table (`*_admin_all` policies plus the `or fn_is_admin()` branches on the tutor policies) and migration 005 does the same for `year_end_reports` (`yer_admin_all`), so the fence was only ever application-layer. The whole change is the removal of `AdminRestricted.tsx`, the six `role === 'admin'` guards in the feature pages, and `report-pdf`'s `default: return false`. An unchanged-green pgTAP run is the evidence RLS was untouched; RLS-22…RLS-27 were added to assert the admin writes land *and* that no other role's scope widened.<br><br>Five decisions inside it:<br>**(a) Class-shaped, not family-shaped.** Admin gets the tutor view of every screen (class picker → roster → drill-down). `useMyClasses` already returns all classes for admin, so this needed no new query. The family views are child-scoped and their `useMyStudents` query has no `parent_id` predicate for admin — a ChildPicker would list all ~200 students as though they were the admin's own children.<br>**(b) `tutor_id` records the admin's own id.** Six tables carry a NOT NULL `tutor_id` FK meaning "who recorded this row". An admin write stores the admin's id: simplest, and honest — it really was the admin. The consequence is that `tutor_id` no longer implies membership of `classes.tutor_ids`, which nothing downstream may assume (asserted as RLS-24). `year_end_reports.tutor_id` is unaffected: it is set once at draft generation from the class's first tutor and is the authorship record that `publish-report` checks.<br>**(c) Home-practice confirmation stays with parents.** `murajaah_log.confirmed_by` means "the parent who watched the child recite"; a confirmation from an administrator is a claim nobody witnessed. `mlog_admin_all` permits the insert at the DB layer (RLS-25 asserts it still does) — the app simply never offers the control, since it lives only in `FamilyMurajaahView`. Every other operational write being available is what makes this exception meaningful rather than arbitrary.<br>**(d) Nav: the five operational tabs stay, the enrollment screens move down a level.** 5 operational + 4 admin tabs will not fit a mobile bottom nav at 44px tap targets, and the 5-tab order is prototype-validated (checklist §5). Admin now gets exactly the same bottom nav as everyone else, plus one "Kelola" entry point (dashboard tile + a sixth desktop tab) into `/admin/*`, where a secondary tab strip (`AdminSectionNav`) moves between Pendaftaran/Kelas/Santri. `RequireAdmin` still guards those routes.<br>**(e) Reports: read and edit yes, publish no.** Admin sees every report including drafts, edits narratives and grades, and downloads PDFs (`report-pdf` gained an admin branch). Publishing stays authoring-tutor-only per ADR-013. That combination has a sharp edge: editing does not regenerate the PDF (the client calls `publish-report` afterwards, which 403s for admin), so an admin edit to a published report leaves the stored PDF stale. The editor hides the publish button for admin and shows "the PDF will not update until *[tutor]* re-publishes" — the mismatch is made visible rather than silently produced or prevented. `/admin/reports` (the counts-only generation screen) folded into the admin's own Reports view as a panel, since a deliberately content-blind screen had nothing left to protect | A 5th `user_role` enum value, so PPME could have both a narrow enrollment admin and a super admin (rejected: no concrete need for both was identified, and it would mean a migration, an RLS rewrite and a fixture change for a distinction nobody asked for — revisit if PPME ever wants a volunteer registrar who is not a full administrator); read-only super admin (rejected: the stated need is to *fix* things, and RLS already permits the writes); letting the admin pick which tutor an entry is attributed to (rejected as more UI for a worse record — it invites putting a tutor's name on something they did not do; better records here would mean a separate `recorded_by` column, which is a schema change, not this one); blocking admin edits on published reports to avoid the stale PDF (rejected: it takes away the one repair the role most obviously needs, at year-end when the authoring tutor may be unreachable); letting admin publish as a break-glass (rejected — see ADR-013) |
| ADR-015 | **Web Push pipeline: family-facing recipients, lock-screen-minimal copy, a database webhook as the trigger, and timezone handled in code rather than in cron** | The notification work in checklist §4 is larger than any single milestone this project has shipped, and part of it (the real-device matrix, test-plan §6) cannot be verified from a development machine at all. It is therefore being delivered in three parts; this row records the decisions that all three depend on, taken while building the first.<br><br>**Part 1:** VAPID + `web-push`, `push-subscribe`, the payload builder, the service-worker handlers, the notification-settings screen, and `notify-absence` end to end — the highest-value single flow, and the one that exercises every layer of the pipeline once. **Part 2a:** the remaining *event-driven* notifications over that same proven webhook path — jilid completed, surah memorized, new homework assigned, year-end report published (migration 010, `notify-milestone`, `notify-assignment`, `notify-report-ready`). **Part 2b:** the *scheduled* Functions, `streak-status`, and the `calculate-streak-resets` consequences (`src/lib/murajaah.ts`'s docstring, the domain-model footnote and checklist §13 all described a system with no streak-reset job, and had to be rewritten *together with* whatever invalidated them). **Delivered — see ADR-016**, which resolved it in the other direction: three scheduled Functions built, and `calculate-streak-resets` and `streak-status` superseded rather than built, because deriving the streak removes the reason for either to exist. **Part 3:** the in-app notification centre, which needs a new table, RLS policies and pgTAP cases — and whose screen §5 records as never having been design-reviewed in the prototype batch. Deferring it was not a scheduling convenience: building an unreviewed screen and a migration together is how a schema gets locked in around a design nobody agreed to. **Delivered — see ADR-017**, which answers that risk rather than accepting it: the table records domain events and nothing about presentation, so any reviewed design can be built on it without a migration. The screen still has not been reviewed, and says so in its own docstring.
| ADR-016 | **Streaks are derived, not stored; two of the four planned scheduled Functions are therefore not built; and the dedup tag gains the child** | ADR-015 part 2b: the three time-driven notifications, plus the one genuine design decision the notification work had left open.<br><br>**(a) A streak is computed from the log, in the period its frequency asks for.** `murajaah_log.streak_count` (migration 002) was written by a trigger on INSERT and so could only change when a *new* confirmation arrived: a row from three days ago reading 7 described a run that had already been broken, and the database had no way to know. It also counted only *days*, while a target carries a `frequency` — a `3x_week` target confirmed every Monday, Wednesday and Friday for a year had a stored streak of 1, because no two confirmations were ever consecutive. `computeStreak` (`src/lib/murajaah.ts`) answers both at read time over the right period: a day for `daily`, a Mon–Sun week needing three confirmations for `3x_week`, a week needing one for `weekly`. Counting runs backwards from the current period if it is already met and otherwise from the previous one, so a family who has not practised *yet today* has not lost anything, and a day that is over and was missed ends the run — PRD AC-003, which the stored column could not express. The week a target is assigned in asks only for as many confirmations as there were days to give them (test-plan §4.1's "assignment created mid-week"), never fewer than one. Migration 011 drops the column and `fn_set_streak_count` rather than leaving a second, wrong answer in the table.<br>**(b) `calculate-streak-resets` is superseded, not deferred.** Its entire job was to go and zero stored streaks that had gone stale overnight. A derived streak cannot go stale, so the job has nothing to do. Recorded here rather than deleted from the Scheduler table.<br>**(c) `streak-status` is not built, and is a five-line addition if PPME ever wants it.** It would return a number computed from rows the caller already has: both screens that show a streak (`FamilyMurajaahView`, `TutorOverviewView`) fetch the confirmation history anyway, and now run the same shared function over it that the reminder job runs. An endpoint would add a network round trip, a second authorization path and a second implementation of the same rule, to deliver an integer the client can compute. `openapi.yaml` keeps the path, marked not built, with this reasoning.<br>**(d) A scheduled Function authenticates nothing, and is built so that it does not need to.** `webhookAuth`'s shared secret works for the database webhooks because Postgres can be told to send a header; Netlify's scheduler cannot, so requiring one would mean the scheduler could never run the job. Instead: Netlify documents a scheduled function as not reachable over HTTP (its own `@netlify/functions` types say so) — **which this project has not been able to confirm on a deployed site**, because the only deployed environment available here is a password-protected deploy preview that 401s every path including `health`. So that documented guarantee is treated as an unverified claim and carries none of the weight on its own. What the design actually rests on is the rest: the handler reads **nothing** from the request — not the body, not the query, not a header, and `run` is never even given the `Request` — so every input comes from the database and the clock; outside its Amsterdam hour it returns before opening a database connection; and every notification it sends is idempotent per (recipient, event, child, local date), so a replay sends nothing new. The reasoning holds only because these jobs write nothing, and does not transfer to one that does. **Locally the platform boundary is definitely absent:** under `netlify dev` a scheduled Function is an ordinary HTTP endpoint on both GET and POST, confirmed by curl (README). That is why the design assumes no boundary at all, and why (e) matters.<br>**(e) A Function's response carries counts, never dedup tags.** A tag is `event:userId:studentId:date`. Returning the tag list — which every sender did — hands the caller two internal identifiers per delivery, through a channel whose purpose is to report a number, on endpoints that in at least one environment answer unauthenticated requests. `reportable()` strips them; the counts, which are not personal data, are what a Netlify log is read for.<br>**(f) The dedup tag gains the child.** Part 1 keyed it on (user, event, date) and pinned the consequence in a test as accepted: a parent of two absent children got **one** notification, naming one child, because the second silently replaced the first. That should not have been accepted — it is a parent not being told their child was missing from class — and 2b's senders fan out per child by design, so it would have stopped being an edge case. Adding the child narrows the key, so every idempotency property is preserved.<br>**(g) The weekly digest needed somewhere to land, so the dashboard got a weekly summary card.** The Scheduler table describes the digest as a push carrying "attendance %, new progress". DPIA R6 forbids that on a lock screen — it is the one figure a family would least like read over their shoulder. Applying ADR-015(b)'s two-tier model leaves the push saying only that a summary is ready, which is an invitation to look at nothing unless the summary exists. `src/features/dashboard/WeeklySummary.tsx` is it, sharing `fetchWeeklyActivity` with the Function so the notification and the screen can never disagree. A week with no activity at all sends nothing.<br>**(h) Reminders are sent on the last day they can still be acted on.** `daily` is every evening practice is unconfirmed (FR-006 as written); `3x_week` is the evening the days left drop to the confirmations still owed (Friday if none are done, Sunday if two are); `weekly` is Sunday. A family comfortably on track is not interrupted, which is the difference between a reminder and nagging — and the reason notifications stay switched on, which every other notification in the system depends on | A nightly `calculate-streak-resets` writing zeros into the log (rejected — see (a)/(b): it fixes staleness by scheduling more writes, and cannot fix the frequency bug at all); keeping `streak_count` as a cache alongside the derived value (rejected: two answers to one question, and the wrong one is the one a future query will find); prorating a mid-week assignment's streak to zero rather than to a reduced target (rejected: it punishes a family for the day the tutor happened to set the target); a shared secret on the scheduled Functions (rejected: Netlify's scheduler cannot send one, so the job would simply never run); a query parameter or header to move the clock for testing (rejected: it would be a way for whatever can reach the endpoint to move it — `scripts/invoke-scheduled.mjs` moves it from outside the process instead); putting the attendance percentage in the digest payload (rejected: DPIA R6); reminding every family every evening regardless of frequency (rejected — see (h)); leaving the dedup tag as it was and documenting the sibling collision (rejected — see (f)) |
| ADR-017 | **The in-app notification centre stores domain events, not a screen — and is the one place ADR-014's super admin does not reach** | ADR-015 part 3, the last of the notification work. Held back after parts 1 and 2 for a stated reason: the notification centre screen has never been through the prototype design review (PRD §71 still lists it as an open follow-up), and shipping a migration alongside an unreviewed screen is how a schema gets locked around a design nobody agreed to.<br><br>**(a) The schema is display-agnostic, which is how that risk was answered rather than accepted.** `public.notifications` (migration 012) records *this recipient was told this thing about this child on this day* — `user_id`, `student_id`, `event`, a `context` object, `event_date`, `read_at`. There is no ordering key, no category, no grouping, no icon, no pinned flag and no rendered string. Every sentence the screen shows is built at read time from `event` + `context` against the i18n copy. A design review can therefore regroup the list by child, split read from unread, add filters, add per-row dismissal or reword everything, and **none of it needs a migration**. The domain the table does encode — the Notification Spec's event list — *is* reviewed. What could not be de-risked this way is the screen itself, and it is deliberately built from the card-list pattern the Murajaah and Quran timelines already use rather than from a new idea, so a review has something conventional to react to.<br>**(b) A row is written for every recipient, whether or not they can be pushed to.** The centre's main audience is families who declined push, or whose browser never supported it — so recording cannot live inside `dispatch`, which by construction only iterates recipients holding a subscription. `buildAudiences` no longer drops an unsubscribed account; it returns them with `subscription: null`, and only the push half filters on that. `recorded` and `sent` are reported separately for exactly this reason, and `recorded` is normally the larger of the two. Recording also happens **before** the push: the push depends on a third party, and a family's own record of what they were told should not.<br>**(c) The unique key is the dedup tag.** `(user_id, student_id, event, event_date)` is the same tuple `dedupTag()` builds for the lock screen (ADR-016(f)), upserted rather than inserted. One concept of "the same notification" in both places, which is what makes the hourly scheduled Functions safe here too — the second run of `homework-due-reminders` must not leave a family with two identical lines.<br>**(d) Admin reads nobody's notifications.** The single place ADR-014's super admin stops. ADR-014 gave admin every *operational* screen on every class because running the TPA needs that; a notification is a message addressed to a named parent, an admin inbox of every family's messages adds nothing to running the TPA, and it would be hard to defend under data minimisation. Admin also receives none, by ADR-015(a). There is no admin policy on the table, asserted as NC-09.<br>**(e) The client can mark read and nothing else.** RLS has no column granularity, so a policy alone would let a recipient rewrite `event` or `context` on their own rows and make the app render something that never happened. Migration 012 revokes the blanket write grants and grants `update (read_at)` only — the database, not the app, is what makes that true (NC-04/NC-05). There is no client INSERT at all: a client that could insert here could put words in the TPA's mouth on another parent's screen.<br>**(f) Ninety-day retention, in its own job.** The centre is the first table here that grows because *time passed* rather than because someone recorded something — DPIA R5. `prune-notifications` deletes past 90 days, a window chosen to outlast the longest-lived reason to open the list (a year-end report notification a parent may not act on for weeks). Folding it into `weekly-progress-digest`, which already runs weekly, was rejected: retention is a legal obligation and the digest is a courtesy, so a Friday the digest skips would silently be a Friday nothing was deleted.<br>**(g) The child's name is joined, never stored.** A row carries `student_id`; the name is read through it. A corrected name therefore corrects every notification already written, and the name is not copied across hundreds of rows. `context` carries only what the copy interpolates beyond it — the jilid number, the surah, the assignment title and deadline — typed as scalars so a sender cannot casually widen what the centre stores about a child.<br>**(h) DPIA R6 does not apply here, and that is the point.** R6's threat model is a lock screen. These rows are read only by an authenticated recipient, so they carry the richer wording the Notification Spec originally drafted — which is what ADR-015(b) promised when it split the copy in two. The unit suite asserts the two blocks stay separate, and in particular that no `{{number}}`, `{{surah}}`, `{{title}}`, `{{date}}` or `{{count}}` ever appears in a push string | Storing the rendered sentence instead of `event` + `context` (rejected: it freezes the copy at write time, so a family switching language re-reads their history in the old one, and a reworded string never reaches rows already written); a `read` boolean rather than `read_at` (rejected: the timestamp costs the same and answers "when", which a subject access request may ask); giving admin read access for support purposes (rejected — see (d); an admin helping a parent can ask them what they received); letting a recipient delete their own rows (rejected: retention is central, and a per-user delete is a path by which the record of what a family was told disappears early); a realtime subscription for the badge (rejected: an open socket on every screen for every family, to make a count that only has to be right when someone looks at it); folding retention into an existing scheduled job (rejected — see (f)); building the screen first and the table around it (rejected — see (a), and it is the specific thing ADR-015 held part 3 back to avoid) |
| ADR-018 | **Transactional email via Resend, as a second channel alongside Web Push — and the two-emails problem that comes with it** | Web Push is not a channel every family actually has. On iOS it works only after the PWA is added to the Home Screen (checklist §5), an adoption step many families will never take, and one this project has never verified on an iOS device at all (test-plan §6). Email reaches the people push cannot.<br><br>**(a) Resend, not Supabase Auth's SMTP.** Supabase's built-in mail is rate-limited and documented as unsuitable for production transactional volume. It stays in use for exactly one thing — `inviteUserByEmail`, which is how the `auth.users` row gets created — but that is an *auth* mechanism, not a notification channel.<br>**(b) There are now two invitation emails, and that is recorded rather than hidden.** Wiring the branded invitation onto `invite-user` means a new user receives GoTrue's magic-link invite *and* our onboarding email. The obvious fix — drop the GoTrue one — is not an email change: `inviteUserByEmail` is what creates the `auth.users` row the profile insert depends on, so replacing it means moving to `auth.admin.createUser` and taking on the sign-in flow that invite link currently provides. That is an auth decision with its own risks, and it should be taken deliberately rather than as a side effect of adding a template. **Open**, and the first thing to settle if PPME finds the duplication confusing.<br>**(c) Email is additive and can never block what it accompanies.** `sendEmail` never throws; every failure is a returned value. It is called *after* the profile insert, and its result is reported in the response (`invitation_email`) rather than acted on. A mail provider having a bad minute must not turn a successful invite into a failed one — the same rule ADR-015(c) applies to push, for the same reason.<br>**(d) It fails *open*, unlike the webhook secret.** A missing `RESEND_API_KEY` logs and returns `not-configured`; a missing `NOTIFY_WEBHOOK_SECRET` refuses the request outright (ADR-015(d)). The asymmetry is deliberate: an unauthenticated endpoint is a security failure, an unsent courtesy email is a degraded feature.<br>**(e) Templates are keyed role → locale, in their own file.** Four roles because the invitation is genuinely four different messages — a parent is invited to follow their child, a 16+ student to follow their own progress, a tutor to record a class's work, an admin to run the platform. Locale from `users.locale`, role from `users.role`, the same two columns the push payload builder reads. They live in `lib/emailTemplates.ts` rather than inline in a Function because the people most likely to reword a sentence are not the people editing the Function. Values are HTML-escaped on substitution: a full name is user-supplied data going into an HTML document.<br>**(f) EU region, and a domain that must be verified.** Resend's EU region is selected in its dashboard, consistent with Frankfurt (ADR-002) and Netlify EU (ADR-004) — mail carries a parent's address and a child's name, so the same residency reasoning applies, and it cannot be applied retroactively to mail already sent. Separately, `tpa.ppmedenhaag.nl` must be verified in Resend before anything sends; until then Resend allows only `onboarding@resend.dev` to the account owner. Both are deployment prerequisites, not code defects — the `from` address is deliberately the real intended one so a misconfigured deploy fails loudly rather than sending from a sandbox nobody recognises | Supabase Auth SMTP for transactional mail (rejected — rate-limited, not intended for it); dropping GoTrue's invite email in this change (rejected — see (b): it is an auth change wearing an email change's clothes); throwing on mail failure (rejected — see (c)); failing closed on a missing key (rejected — see (d)); one template with the role interpolated into a sentence (rejected: it produces copy that fits none of the four); inlining the copy in `invite-user.mts` (rejected — see (e)); sending real email during development (rejected: test-plan's "no real student data in any test environment, ever" extends to not putting mail in real inboxes, so the transport is injected and every test uses a fake) |
| ADR-019 | **One person can hold several relationships at once. The database already handles it correctly; capabilities are derived app-side, and two hooks stop letting RLS answer a wider question than the screen asked** | `users.role` holds one value, but a real person at the TPA is often several things: a tutor whose own child attends, an admin who also teaches. Nothing prevented that state — `students.parent_id` is a plain FK to `users(id)` with no role constraint, and while the admin UI has no way to set it up, the API always has. This row is the first of three changes making it work, and it is foundation only: no existing single-role user sees anything different.<br><br>**(a) The claim was proven before anything was built on it.** Migration 003 writes every family/tutor policy against a *relationship* — `parent_id = auth.uid()`, `auth.uid() = any (tutor_ids)`, `user_id = auth.uid()` — and across all 42 policies `fn_is_admin()` is the only role check. Permissive policies are OR-ed, so a person holding two relationships already gets the union of two grants, with no schema change and no policy change. RLS-28…RLS-34 assert this rather than assume it (39 new assertions, 104 → 143): a tutor-parent sees exactly their class plus their own child — not their child's classmates, not another family — and the same shape holds whether their `users.role` says `tutor` or `parent`. **The union is not a promotion**, which is the half worth having tests for: they can record Yanbu'a for a student in their class but not for their own child; they can confirm home practice for their own child but not for a student in their class; they see the draft report of a student they teach and still cannot see their own child's draft, only its published version. Nobody else's visibility widens, and `anon` still sees nothing.<br><br>**The model is n-ary, not dual, and RLS-34 says where that stops.** Nothing caps the number of relationships at two and the derivation is four independent booleans, so a triple-role person — `role='admin'`, tutor of one class, parent of a child in another — holds all three at once, each still derived its own way: `fn_is_admin()` true, `fn_my_classes()` exactly the class they are named in, `fn_my_children()` exactly their own child. But `fn_is_admin()` is an unconditional `ALL` (ADR-014), so once admin is in the union it swallows the other two whole: that person *does* see all four unrelated fixture children, *can* record Yanbu'a for their own child and *can* confirm home practice for a student they teach — each one the mirror image of a refusal in RLS-31/RLS-32. "The union is bounded by the relationships you hold" is true of every combination that does not include admin, and the assertions say so in both directions rather than leaving the reader to assume the pleasant half generalises.<br><br>**(b) Capabilities are derived in the app, with no migration.** `src/lib/capabilities.ts` derives four booleans — `isParentOfAnyone`, `isTutorOfAnyClass`, `isSelfStudent`, `isAdmin` — from the same predicates the policies use. A SQL helper was the obvious alternative and was rejected: the existing helpers are `security definer`, and a new `fn_my_capabilities()` would be a *second* definition of "who is a parent" living beside the policies, free to drift from them. The three queries behind the derivation are ordinary RLS-permitted selects the app is already entitled to make. And the distinction that settles it — a capability decides which screen is worth offering, never what data comes back, so a capability that said yes where RLS says no produces an empty screen, not a leak. A migration would mean changing the production database for no security gain. `isAdmin` stays a role check because `fn_is_admin()` is one: ADR-014's super admin is a granted position, not a relationship anyone acquires by enrolling a child.<br><br>**(c) Two hooks stopped trusting RLS to narrow their results, which is where the actual bug was.** `useMyStudents` ran `select id, full_name from students` with no filter at all and relied on RLS returning only your children. That is true for a pure parent and false for everyone else: `students` carries four permissive SELECT policies, so for a tutor-parent the ChildPicker offered their whole class of ~25 as "my children", and `students_admin_all` has no `parent_id` predicate at all, so for an admin it would have offered the entire school — the risk `AttendancePage` has carried a comment about since ADR-014, closed now at the query rather than by routing admins away from the screen. It now filters `parent_id.eq.<me>,user_id.eq.<me>`; **both** halves matter, because a 16+ self-login student has no `parent_id` row of their own and a `parent_id`-only filter would silently empty every screen they have. `useMyClasses` had the same defect on the tutor side, found by clicking through the dual-role fixture rather than by reading: `classes_read` also grants the classes a caller's *children* are in, so a tutor whose child attends elsewhere was offered a class they do not teach — a dead end where the roster returns their own child alone and the save fails on `fn_my_classes()`. It now filters on `tutor_ids`, with an explicit all-classes branch for admin, who is in no `tutor_ids` array and would otherwise get an empty picker.<br><br>**(d) `useCapabilities` deliberately has no consumer yet.** Swapping the existing `role ===` checks for capabilities is a behaviour change, not a refactor — a `role='tutor'` account an admin has not yet put in a class would lose its screens — and *which* view a dual-role person lands on is a UI question this change does not answer. Two known consequences are recorded rather than fixed here: `WeeklySummary`'s `isFamily` gate hides the weekly card from a tutor-parent, and a dual-role person whose `users.role` is `tutor` has no route to their own child's family views at all. Both belong with role switching, in the third change. | A `roles[]` column or a `user_roles` join table (rejected: RLS never reads `role` in the first place, so it would be a UI-only column dressed as authorization, and a second source of truth to keep in step with the relationships that actually decide access); a `fn_my_capabilities()` SQL helper (rejected — see (b): a second definition of the same predicates, free to drift); leaving `useMyStudents` to RLS and gating the ChildPicker on role instead (rejected: it makes the query's correctness depend on which screen calls it, and the query is the thing that was wrong); fixing `useMyStudents` alone as briefed (rejected: `useMyClasses` is the same defect one table over, and shipping the known half of a pair is how the other half becomes permanent) |
| ADR-020 | **A 16+ student who also tutors may record for the class they teach — "students are read-only" was a description of a relationship, not a rule the database enforces** | Found while extending ADR-019's cases past two relationships, and confirmed by reading every policy in the schema: `fn_current_role()` is called in exactly one place, inside `fn_is_admin()`. **Nothing anywhere refuses a write because the caller's role column says `student`.** RLS-07 has asserted since the first milestone that a 16+ student cannot write, and it is correct — but what it tests is a student who holds *no other relationship*, and until somebody held both, "read-only because they are a student" and "read-only because they teach nothing" were indistinguishable.<br><br>**(a) PPME's decision is that this is wanted, not tolerated.** A student assistant — an older santri who helps with a younger class — should be able to record attendance and progress for that class, exactly as any other tutor of it does. So the behaviour is now pinned by RLS-35 rather than merely permitted by omission: they can record Yanbu'a, set a murajaah target and correct attendance for the class they teach.<br><br>**(b) The boundary comes with it, and is asserted in the same breath.** The tutor grant reaches their class and stops: they cannot record progress for **their own** record (teaching one class does not let a student grade themselves — the mirror of ADR-019's "the union is not a promotion"), and they cannot touch a class they do not teach. Nor does sitting in a class as a student reveal their classmates: `students_self_read` is `user_id = auth.uid()`, so the roster they are *enrolled* in stays invisible while the roster they *teach* is fully readable. RLS-07 is unchanged and still green, because the persona it tests still holds no tutor relationship.<br><br>**(c) Six documents said "read-only" flatly, and they were amended rather than left to contradict this.** The TAD's RLS policy table, the development checklist §3, the DPIA §3 and risk R7, the README's role table, and both language halves of the privacy policy now say what is actually true: a 16+ student sees their own record and nothing else, and writes nothing — *unless* they are also a tutor, in which case the tutor grant applies to their class in the ordinary way. This is the same correction ADR-019 made to "access is by role", applied to the one role that had been described as a capability rather than a position.<br><br>**(d) The application does not offer it yet, and that is the gap this row records.** Routing is still `users.role`-shaped, so a student assistant lands on the family views and never reaches a recording screen; the entitlement exists at the data layer and is unreachable in the product. Closing it is role switching, which belongs with ADR-019's other deferred UI consequences in the third change. The dev fixture seeds Aisyah for exactly this reason — signing in as her is how the gap stays visible instead of being forgotten.<br><br>**Refined by ADR-023** (not superseded): the decision stands in full, and the boundary this row states in prose — that the tutor grant does not reach back to the assistant's own record — turned out never to have been enforced. Migration 013 enforces it for the evaluative writes, by relationship rather than by role, which is why it is consistent with the alternative rejected here rather than a reversal of it. | Adding a `student` check to the write policies to make the old sentence true (rejected: it would encode a role into a schema that deliberately has none, and it would take away a capability PPME wants); leaving it undocumented on the grounds that no such account exists yet (rejected: an accurate-by-accident document is the kind that misleads the first person to create one — and it is the DPIA and the privacy policy that were saying it); building the routing change here (rejected: it is role switching, explicitly the third change's scope, and doing it halfway would ship an affordance nobody has reviewed) |
| ADR-021 | **The minimum age for a self-login is the identity provider's rule, not one this project encodes — and assisting a class is not age-gated at all** | Two questions that surfaced together while pinning the student assistant (ADR-020), answered by PPME: *may an under-16 santri have their own login?* and *may an under-16 assist a younger class?*<br><br>**(a) The login question is Google's, and we follow it.** Authentication is Google OAuth and nothing else (ADR-003), so whether a santri can obtain the account they would sign in with is settled before they ever reach this app: Google applies its own minimum age for a self-managed account, which tracks each country's digital-consent age under GDPR — and the Netherlands sits at the top of that range. This project therefore adds **no age check of its own**. `students.date_of_birth` stays a record, not a gate. **The honest limit of that**: it is a strong default, not a guarantee. A **supervised (Family Link) account is a real Google account** — a child below the threshold can hold one under a parent's supervision, and it can complete an OAuth sign-in, subject to whatever third-party sign-in controls that parent has set in Family Link. So "Google will not let them" describes the ordinary case rather than an enforced boundary.<br><br>**What actually bounds this app is the enrolment step, not the identity.** Signing in successfully is not access: a Google identity with no matching `public.users` row lands on the "contact admin" screen and reads nothing (`App.tsx`), that row can only be created by an admin (registration approval or `invite-user`), and linking it to a student record through `students.user_id` is admin-only as well. A supervised child can therefore *authenticate* and still see nothing until an administrator decides otherwise — which is the same gate every other account passes through, and the reason no age check is needed to keep this safe. **[IT TEAM]** should confirm Google's current threshold for the Netherlands rather than trust this row's summary of it, and decide whether a supervised child account may be linked at all (checklist §6).<br><br>**(b) Assisting is not age-gated, by PPME's decision.** An older santri may help with a younger class whatever their age. Nothing in the schema expresses age, so RLS-35 already covers this exactly: to the database an under-16 assistant and an eighteen-year-old assistant are the same row. No test was added for the distinction, deliberately — a case that varies only `date_of_birth` would assert nothing, and pretending otherwise is worse than saying so here.<br><br>**(c) Assisting and recording are different things, and the gap between them is normal.** Helping in the room needs no account. *Recording* needs `auth.uid()`, which needs a Google account, which is (a). So an under-16 assistant may genuinely assist and never record, with a tutor entering the class's rows as before — that is a supported state, not a defect waiting on a fix.<br><br>**(d) The "16+" badge on the admin students list was a claim nothing checked, and is gone.** It rendered on `user_id` being set — i.e. it meant "has a linked login" while saying "is sixteen", with `date_of_birth` sitting unread in the same row. Linking an account to a younger santri therefore labelled them 16+ on the one screen where the enrolment decision is made. It now reads "own account" / "eigen account", and the form's "Link self-login **(16+)**" label has lost the same suffix. Renamed rather than derived from `date_of_birth`, which would have meant inventing the age rule (a) had just declined to own. | A check constraint or trigger refusing `user_id` on an under-16 record (rejected: it encodes one country's threshold into the schema, needs maintenance every time that law moves, duplicates a rule the identity provider already applies, and still changes nothing — the Google account either exists or it does not); deriving the badge from `date_of_birth` (rejected — see (d): a local age rule by the back door); forbidding under-16 assistants (rejected at PPME's decision — the TPA's older santri helping with the younger group is the practice the app is meant to record, not one to design out); leaving the badge as it was (rejected: an unchecked assertion about a child's age, displayed to the person deciding whether to give them an account) |
| ADR-022 | **Who receives a notification about a child is a question about their relationship to that child, not about their role — superseding half of ADR-015(a)** | ADR-015(a) settled that notifications are family-facing, and encoded it as `RECIPIENT_ROLES = ['parent','student']`: `buildAudiences` skipped any user whose `users.role` was not one of the two, `push-subscribe` returned 403 to the rest, and the bell, the settings screen and the notification centre each asked the same role question of their own. ADR-019 had already established that a person here holds relationships rather than a role — a tutor whose own child attends, an admin who also teaches — and this is the first place that turned out to be load-bearing rather than theoretical: **such a person received nothing at all about their own child.** No push, no in-app row, and no way to store a subscription in the first place. Silent, and from the family's side indistinguishable from a quiet week, which is the failure mode this whole feature keeps producing and the reason ADR-015(h) exists.<br><br>**(a) The reasoning behind ADR-015(a) was right about a class and wrong about a child.** Subscribing one account to two hundred children's lock screens is indefensible under data minimisation, and a tutor genuinely does learn about an absence by recording it. None of that is true of their *own* child, whose absence they find out about the same way any other parent does. The row is superseded in the half that confused the two and kept in the half that did not.<br>**(b) The surviving half is now a property of the query rather than a check beside it.** `buildAudiences` resolves recipients per student from `students.parent_id` and `students.user_id`, so a tutor is not in either column for the children they teach and cannot be reached by a notification about them whatever any predicate says. The role filter could therefore only ever *subtract* from a correct answer — which is exactly what it did. `UserRow` no longer carries `role` and the users query no longer selects it, so restoring the bug would take restoring the data first.<br>**(c) One rule, one derivation, five gates.** `push-subscribe`, `buildAudiences`, the settings screen, the bell and the notification centre all answered the same question separately, and a screen that offers a toggle the Function then 403s is how a role ends up with a button that always fails. `canReceiveNotifications` is now a predicate over two booleans — `isParentOfAnyone`, `isSelfStudent` — derived once in `capabilities.ts#familyRelationships`; `Capabilities` extends that interface, so the screens pass the value they already hold and the Function derives it from the same query with a service-role client. The predicate itself imports nothing, which is what lets the browser bundle and `netlify/functions/` share one copy.<br>**(d) The database needed no migration, and ADR-017(d) is refined rather than reversed.** `notifications_own_read` is `user_id = auth.uid()` — a relationship, and always was. So an admin whose own child attends reads that child's notifications and still nobody else's: `public.notifications` is the one table with no admin policy at all, which is why a parent relationship widens an admin here by exactly one child instead of by the school. NC-09 said "an admin reads no notifications at all", which was true of an admin who is nobody's parent; the sentence that survives is "none addressed to somebody else", asserted as NC-14 from both directions. NC-12…NC-16 add the tutor-parent, the admin-parent, the student assistant and the unaffected ordinary parent.<br>**(e) The email channel keeps its role key, and the reason is the moment it runs.** ADR-018's one template is the invitation, sent by `invite-user` as the `public.users` row is created — when the person holds no relationships at all, because no student row could have named them yet. `users.role` there is not a stand-in for a relationship; it is the admin's statement of why this person is being invited, which is what the letter is about. **The rule recorded for the templates that follow**: event email is addressed to a person *about a child*, so it must be selected the way the push payload is — through `notifyStudents`, from the child's row — and never from `users.role`, which would reintroduce this bug in a second channel.<br>**(f) Proven live, because inferring delivery is what went wrong the first time.** `scripts/verify-push.mjs` §4m drives a real Chromium as a tutor-parent and as an admin-parent: each subscribes, is pushed a real absence about their own child, gets the in-app row, and then receives **nothing** when a pupil in the class they teach is marked absent — asserted alongside that pupil's own parent receiving it, so the negative cannot pass because the pipeline was silent. The endpoint suite asserts the same rule from both sides: 403 for a tutor and an admin with no child of their own, 201 for a tutor and an admin with one. | Leaving the role filter and adding an exception for tutors who are parents (rejected: two rules to keep in step, and the exception is the general case — the relationship *is* the rule); a SQL helper `fn_is_notification_recipient()` (rejected for ADR-019(b)'s reason: a second definition of "who is a parent", free to drift from the policies, for a question no policy asks); giving `notifications` an admin read policy so an admin-parent's rows come back through the admin grant (rejected: it would hand every admin every family's inbox to solve a problem `user_id = auth.uid()` already solves); keeping `role` on `UserRow` for future use (rejected — see (b): an unused column within reach of a future gate is how this returns); deferring the fix until the role-switching PR (rejected: the switcher decides which screen someone lands on, and a notification is delivered whether or not anyone is looking at a screen) |
| ADR-023 | **A student assistant may not evaluate themselves — ADR-020's stated boundary, enforced rather than described** | ADR-020 decided a 16+ santri who also tutors may record for the class they teach, and stated the boundary that came with it: the tutor grant "does not reach back to their own record, which stays as read-only as any other student's". That sentence was never true of the database. It held in RLS-35 only because the fixture puts the assistant's own record in a class they do not teach — and the *likely* arrangement is the opposite, since a 16+ santri assists the group they already attend. Assign them to their own class and `fn_my_class_students()` contains their own id, so the tutor grant let them grade their own Yanbu'a mastery, set their own memorization target, mark their own homework verified, author their own year-end report, and read that draft report about themselves. RLS-37 found it while sweeping the combination space; the whole class of defect is the same one ADR-019 and ADR-022 are about — a property that looked like a rule but was a property of the fixture.<br><br>**(a) The rule is a relationship, not a role.** Migration 013 adds `fn_my_recordable_students()` — the class roster minus `fn_my_student_id()` — and the five evaluative write policies use it. ADR-020 explicitly rejected "adding a `student` check to the write policies" because it would encode a role into a schema that deliberately has none, and because it would take away a capability PPME wants. This is neither: it reads a *link column*, exactly as every other policy here does, and it takes away nothing about the class they teach.<br><br>**(b) `is distinct from`, not `<>`.** `fn_my_student_id()` is null for every tutor who is not also a santri, and `id <> null` is null, which a WITH CHECK reads as a refusal — the obvious spelling would have refused every tutor write in the school. RLS-37 asserts the trap by name.<br><br>**(c) `attendance` is deliberately excluded, and this half is a trade rather than a fix.** The register is submitted as one upsert of the whole roster (`submitAttendance`), so a policy refusing one row refuses the save for the entire class — the assistant could no longer mark anybody, which is a worse failure than the hole. Closing it needs the register screen to leave their own record out of what it submits, and a product answer to "who marks the assistant present?" (a co-tutor or an admin, but not every class has one). Marking yourself present is also materially weaker than recording your own mastery. RLS-37 asserts the current behaviour explicitly so the gap stays visible.<br><br>**(d) One read closes with the writes.** `yer_tutor_rw` is `for all`, so its USING gated DELETE as well as SELECT and had to narrow too; the effect is that an assistant can no longer read a **draft** year-end report about themselves. That is the rule RLS-16 already applies to parents — drafts must never leak — and `yer_student_read` remains published-only. The reads lost on the other three tables are returned by the `*_student_read` policies that exist for exactly that. | Leaving it characterised and deciding later (rejected: it is a santri grading themselves, and the test that found it would have sat green describing the hole); narrowing every tutor write including attendance (rejected: breaks the register for the one persona ADR-020 exists to enable — see (c)); filtering the assistant's own record out of the roster in the UI instead (rejected as the *only* fix: an app-layer filter in front of a permissive policy is the shape ADR-019 was written against, though it is still the right way to close (c) on top of this) |
| ADR-024 | **A tutor who teaches the class their own child is in may record for that child, year-end report included** | The second of the two questions RLS-36 and RLS-37 surfaced, and the opposite answer to ADR-023's. Every dual-role fixture in this project separates the tutor half from the parent half by class, so `RLS-31` ("a tutor-parent cannot record for their own child") and `RLS-32` ("…and cannot see their own child's draft report") read like rules while holding only because of that separation. Overlap the halves — an ustadzah teaching the group her own son attends — and the tutor grant already contains the child, so both refusals invert. PPME's answer is that this is correct: at a school of ~200 with a handful of volunteer teachers, an ustadz or ustadzah teaches their own children, and a rule against it would be a rule against the way the TPA actually runs.<br><br>**(a) No migration, and that is the whole implementation.** The behaviour was always there; what changes is that it is now a decision on the record instead of a property of a fixture nobody had varied. RLS-36 asserts it, and asserts the boundary that still holds: the grant is per class, so the *same account* is refused for a second child enrolled in a class they do not teach. The union is still not a promotion — it is just that the overlap is a bigger union than the disjoint case, not a wider grant.<br><br>**(b) The year-end report is included, deliberately, and it is the sharpest part.** `yer_tutor_rw` is what lets a tutor read a draft, so a tutor-parent sees and authors their own child's report before publication — the one thing `RLS-16` says must never reach a parent. Narrowing `yer_tutor_rw` to exclude the caller's own children (the shape ADR-023 used for their own record) was offered and declined: for this child that account is the teacher, and writing the report is part of teaching them. RLS-16 is unchanged and still correct for a parent who does *not* teach the class, which is every parent the app has today.<br><br>**(c) It is not the same finding as ADR-023, and the two must not be collapsed.** They look structurally identical — an overlap that puts a record inside its own tutor grant — and they are different in kind. A student assistant grading themselves is a person assessing their own work, and it contradicted a boundary ADR-020 had already stated in prose, so it was a defect. A tutor grading their child is a teacher assessing a pupil who happens to be theirs. `fn_my_recordable_students()` therefore excludes the caller's own `students` record and **never** their children, and a future change to it should not "tidy" the two into one rule.<br><br>**(d) Two documents were saying the opposite, in three languages.** The privacy policy told families in both Dutch and Indonesian that *"teaching does not give access to your own child's unpublished report"*. That sentence was true of every account that existed when it was written and false for this arrangement; both halves now describe what actually happens, including that the report is visible before release. `supabase/dev-fixture.sql` seeds Bapak Hasan as the persona to sign in as | Refusing the overlap outright, by excluding own children from the tutor write policies (rejected: it would forbid the ordinary arrangement at a small TPA, and there is no second tutor for many classes); allowing progress but excluding the year-end report — see (b) (offered and declined by PPME); leaving it characterised and deciding later (rejected: the tests were already green describing the behaviour, and an undecided rule about who may grade a child is not something to leave sitting in a test file); a `recorded_by` audit column so a report on one's own child is at least attributable (not rejected on merit — out of scope here, and `tutor_id` already records who wrote it) |

*Part 2 was split into 2a and 2b while building it, for the same reason the milestone was split in the first place. 2b introduced a runtime this project had never run — a scheduled Function, including whatever it does under `netlify dev` — **and** the one genuine design decision left in the notification work: `3x_week`/`weekly` streak semantics were undefined (checklist §4, test-plan §4.1), and defining them changed the `fn_set_streak_count` trigger plus three documents that explained why no such job existed. That was an ADR of its own — **ADR-016**, above — and it had nothing to do with the four event-driven senders in 2a. Both halves are now delivered.*<br><br>Eight decisions:<br>**(a) ~~Recipients are families only~~ — the *reasoning* stands, the *rule* was wrong. PARTLY SUPERSEDED by ADR-022.** ~~`push-subscribe` returns 403 for `tutor` and `admin`, and `buildAudiences` skips any user whose `users.role` is not `parent` or `student`.~~ **What survives, and is now enforced somewhere better:** a tutor learns about an absence by recording it, and subscribing one account to two hundred children's lock screens is indefensible under data minimisation — ADR-014 does not change that for admin, because making admin a super admin granted access to *screens*, which is not the same thing. That property is now a consequence of the audience query itself, which pairs a child only with that child's own `parent_id`/`user_id`, rather than of a role test sitting beside it. **What was wrong:** it read "family" as a role. A tutor whose own child attends the TPA — and the TPA has several — therefore received nothing about their own child, and could not store a subscription to receive it with. See ADR-022. The settings screen still renders for everyone and still shows the lock-screen privacy note, which everyone has reason to be able to read; what it says to a non-recipient is now about the relationship rather than the role.<br>**(b) Push copy is minimal; the drafted richer copy becomes the in-app wording.** DPIA risk R6 limits a payload to the child's first name and the event type. Several strings drafted from the Notification Spec table interpolate more than that (jilid number, surah name, assignment title). Rather than choose between the DPIA and reviewed copy, the two are separated: `notifications.push.*` carries the lock-screen text (name and event type only) and the existing `notifications.*` strings become the in-app wording for Part 3's notification list, shown to someone already signed in. Enforced two ways — `buildPayload` accepts no parameter that *could* carry a reason, grade or position, so there is no channel for one; and the unit suite rejects any string under `notifications.push` that interpolates a placeholder other than `{{name}}`.<br>**(c) The trigger is a database webhook, written as a migration.** Attendance is written from the tutor screen, the admin screen and potentially any future import; a webhook fires for all of them without each write path remembering to ask, and a client that crashes mid-save cannot skip the notification. Supabase's dashboard "Database Webhooks" feature builds exactly this (a pg_net trigger) but by hand, per project, with the URL and secret baked into the trigger body. Migration 009 writes the trigger instead — version-controlled, reproduced by `db reset`, identical in CI — and reads the per-environment target from Supabase Vault at fire time. With no Vault configuration the trigger is a no-op, which is what keeps a fresh local stack and CI silent. It also never fails an attendance write: recording attendance is the product, the push is a courtesy.<br>**(d) A scheduled/webhook Function authenticates its channel, not a caller.** `callerAuth.ts` validates a user's JWT and looks up their role — the right shape when a signed-in person is asking for something, and the wrong one when the request comes from Postgres or from Netlify's scheduler. `webhookAuth.ts` is the counterpart: a shared secret (Netlify `NOTIFY_WEBHOOK_SECRET`, Vault `notify_webhook_secret`), compared in constant time, **failing closed** when unset — a misconfigured deploy that sends nothing is a visible bug; an endpoint that serves unauthenticated requests to real families is not. Proving the channel only earns the right to ask: `notify-absence` re-reads the attendance row from the database rather than trusting the posted body, and derives the recipient from `students.parent_id`. Nothing about who receives a notification comes from the request.<br>**(e) DST is handled in the Function, not the cron expression.** Netlify cron is UTC-only, and the Scheduler table's original entries were written against CET — `0 17 * * *` is 18:00 in winter and 19:00 through the whole CEST summer term. Rather than being wrong for half the year or hand-editing crons twice a year, the reminder Functions run **hourly** and decide for themselves whether it is the target hour in `Europe/Amsterdam`, using the runtime's IANA database (`isAmsterdamHour`). The dedup tag, keyed on the family's local date, makes a repeated run harmless. Cost: 24 invocations/day per scheduled Function — see Billing. (Helpers and their DST tests ship with Part 1; the crons themselves are Part 2.)<br>**(f) Push handlers are imported into the generated service worker.** `workbox.importScripts: ['/push-sw.js']` rather than switching vite-plugin-pwa to `injectManifest`, which would hand us a working precache/runtime-cache configuration to maintain by hand in order to add two event listeners.<br>**(g) One subscription per user, not per device.** `users.push_sub` is a single jsonb column (migration 002, and the Technical Implementation note below). Enabling notifications on a second device therefore *moves* them rather than adding one, and the settings screen says so instead of quietly overwriting. Multi-device would need a `push_subscriptions` table keyed on (user_id, endpoint) and a fan-out in every sender — a schema change worth making only if PPME reports families wanting it.<br>**(h) The settings screen reads server state, not the browser's.** A push service can invalidate an endpoint at any time; `notify-absence` clears `users.push_sub` when it does. The browser keeps its own subscription object regardless, so a screen keyed on `pushManager.getSubscription()` would tell a family notifications were on when nothing could ever arrive again — silent, and indistinguishable from a quiet week. This happened during live verification, which is how it was found | Calling `notify-absence` from the client after a successful attendance save (rejected — see (c): it would need re-adding to every write path, and a client could then fire notifications at will); configuring the webhook in the Supabase dashboard (rejected: not version-controlled, not reproducible in CI, and invisible to anyone reading the repo); baking the webhook URL into the migration (rejected: one migration cannot be right for a laptop, CI and Frankfurt at once); a service-account JWT for scheduled Functions (rejected: a long-lived credential with a real user identity, to solve a problem a shared secret solves without one); trusting the webhook body's `record` (rejected: it makes the trigger's payload security-relevant for no gain, since the Function has database access anyway); pinning the crons to CEST and accepting winter drift (rejected: the same bug in the other half of the year); two cron entries with a seasonal comment (rejected: nobody will remember to switch them); rewriting the drafted notification copy to be R6-safe (rejected in favour of (b) — the celebration in "Alhamdulillah! [name] finished Jilid 3" is worth keeping where it can safely be read); shipping the notification centre with a schema before its design review (rejected — see above) |

# Impact

| Component | Details |
|---|---|
| Domain Model | 12 core entities: User, Student, Class, Session, Attendance, Assignment, YanbuaProgress, QuranProgress, MurajaahAssignment, MurajaahLog, YearEndReport, Notification |
| API Spec | RESTful API via Supabase auto-generated endpoints + Netlify Functions for custom logic (notifications, reports, invites). Streak calculation is a shared pure function rather than an endpoint — ADR-016(c) |
| Batch Files Spec | N/A — no batch file processing required |
| Notification Spec | Web Push (VAPID) for absence alerts, homework reminders, milestone celebrations; optional WhatsApp via Business API (Phase 3). Every notification in the Spec below is built, plus a weekly digest the Scheduler table asked for, plus the in-app notification centre every one of them also writes to (ADR-017). **Email is a third channel** as of ADR-018 (Resend, EU region) — currently one template, the role-aware invitation sent on `invite-user`; the event notifications stay push-only for now |
| Flows | 5 primary flows: Attendance recording, Homework lifecycle, Yanbu'a entry, Quran entry, Murajaah assignment + daily confirmation |
| Database | PostgreSQL on Supabase (Frankfurt EU); encrypted at rest (AES-256); TLS in transit; Row Level Security; automated daily backups |
| Billing | Supabase Free Tier (500MB DB, 1GB storage, 50K monthly active users); Netlify Free/Pro ($0-$19/mo); Google OAuth (free); Total estimated: $0-$19/month |
| CS Tools | Admin dashboard for TPA committee: enrollment management, class management, user registration/invite — plus, since ADR-014, full read/write access to every operational screen (attendance, homework, Yanbu'a, Quran, Murajaah, year-end reports) on every class, using the same class-shaped views a tutor gets |
| Scheduler | Netlify Scheduled Functions: Murajaah reminders (18:00 Europe/Amsterdam), homework-due reminders (08:00), weekly digest (Friday 08:00). Built — ADR-015 part 2b. Crons run hourly with a local-time gate rather than at a fixed UTC hour, so they stay correct across DST. The originally-planned streak-reset job is superseded: streaks are derived, not stored (ADR-016) |
| Others | PWA manifest, Service Worker, i18n (Bahasa Indonesia + Dutch), PPME branding assets |

## Domain Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        CORE ENTITIES                             │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    User      │       │   Student    │       │    Class     │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (UUID)    │◄──────│ parent_id FK │       │ id (UUID)    │
│ google_id    │◄ ─ ─ ─│ user_id FK*  │       │ name         │
│ email        │       │ id (UUID)    │       │ schedule     │
│ full_name    │       │ full_name    │       │ tutor_ids[]  │
│ role (enum)  │       │ class_id FK  │──────►│ created_at   │
│ locale (enum)│       │ date_of_birth│       └──────────────┘
│ push_sub JSON│       │ enrollment_dt│
│ created_at   │       │ yanb_level   │
└──────────────┘       │ quran_pos    │
                        └──────────────┘
                        * user_id: set only when student is 16+
                          and self-registers with their own Google
                          account (role=student); NULL for under-16
     │                        │
     │ role=tutor             │
     ▼                        ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Session    │       │  Attendance  │       │  Assignment  │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (UUID)    │       │ id (UUID)    │       │ id (UUID)    │
│ class_id FK  │◄──────│ session_id FK│       │ class_id FK  │
│ date         │       │ student_id FK│       │ tutor_id FK  │
│ tutor_id FK  │       │ status (enum)│       │ title        │
│ created_at   │       │ reason       │       │ description  │
└──────────────┘       │ created_at   │       │ due_date     │
                       └──────────────┘       │ created_at   │
                                              └──────────────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │AssignmentStat│
                                              ├──────────────┤
                                              │ id (UUID)    │
                                              │ assignment_id│
                                              │ student_id   │
                                              │ status (enum)│
                                              │ notes        │
                                              │ updated_at   │
                                              └──────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│YanbuaProgress│       │QuranProgress │       │MurajaahAssign│
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (UUID)    │       │ id (UUID)    │       │ id (UUID)    │
│ student_id FK│       │ student_id FK│       │ student_id FK│
│ tutor_id FK  │       │ tutor_id FK  │       │ tutor_id FK  │
│ jilid (1-7)  │       │ surah_num    │       │ surah_num    │
│ page         │       │ ayah_from    │       │ ayah_from    │
│ mastery(enum)│       │ ayah_to      │       │ ayah_to      │
│ notes        │       │ quality(enum)│       │ frequency    │
│ recorded_at  │       │ tajweed_notes│       │ active       │
└──────────────┘       │ recorded_at  │       │ created_at   │
                       └──────────────┘       └──────────────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │ MurajaahLog  │
                                              ├──────────────┤
                                              │ id (UUID)    │
                                              │ assignment_id│
                                              │ confirmed_by │
                                              │ quality(enum)│
                                              │ date         │
                                              │ created_at   │
                                              └──────────────┘

┌────────────────────────────┐
│      YearEndReport         │
├────────────────────────────┤
│ id (UUID)                  │
│ student_id FK              │
│ academic_year (text)       │
│ tutor_id FK                │
│ status (enum: draft/pub)   │
│ narrative (text)           │
│ attendance_present/absent/ │
│   late (int), rate (numeric)│
│ yanbua_grade (enum)        │
│ yanbua_notes (text)        │
│ quran_grade (enum)         │
│ quran_notes (text)         │
│ murajaah_grade (enum)      │
│ murajaah_notes (text)      │
│ overall_grade (enum, null) │
│ pdf_path (text, nullable)  │
│ generated_at, published_at │
│ created_at, updated_at     │
│ UNIQUE(student_id, year)   │
└────────────────────────────┘

┌──────────────────────────────┐
│      Notification *****      │
├──────────────────────────────┤
│ id (UUID)                    │
│ user_id FK  (the recipient)  │
│ student_id FK (who it's about)│
│ event (enum: notification_   │
│   event, 8 values)           │
│ context (jsonb)              │
│ event_date (date, Amsterdam) │
│ created_at, read_at          │
│ UNIQUE(user_id, student_id,  │
│        event, event_date)    │
└──────────────────────────────┘

* stats snapshotted at draft generation; grades reuse the
  report_grade enum (same 5-level scale as quran_quality,
  kept separate so report grading isn't coupled to Quran-
  specific semantics)
** Student.quran_pos (current_surah/current_ayah) is a
   denormalized cache, never written by the Quran feature —
   current position is derived client-side from the latest
   quran_progress row instead (mirrors Yanbu'a's jilid-
   completion detection; see src/lib/quran.ts's docstring)
*** Murajaah has no stored streak. streak_count and its
    fn_set_streak_count trigger were dropped in migration 011:
    the column only changed on INSERT, so it could not tell a
    live run from a broken one, and it counted days even for a
    3x_week or weekly target. The streak is computed from the
    log at read time, in the period the frequency asks for, by
    computeStreak in src/lib/murajaah.ts — the same function
    the reminder job uses (ADR-016)
***** Notification stores a domain event, never a rendered
      sentence and nothing about presentation — no ordering
      key, category, icon or pinned flag — so the notification
      centre's design can change without a migration (ADR-017).
      The child's name is NOT a column: it is joined through
      student_id, so a corrected name corrects every past
      notification. `context` carries only what the in-app copy
      interpolates beyond the name (jilid number, surah,
      assignment title and deadline) — richer than a push
      payload may be, because DPIA R6's threat model is a lock
      screen and these rows need a signed-in reader. The unique
      key is the same tuple as the push dedup tag. Rows are
      written for every recipient, subscribed to push or not;
      admin can read none of them
**** FR-005/FR-007's tutor "mark as Memorized" assessment has
     no RLS write path into murajaah_log (parent-insert only)
     and murajaah_assignments has no quality column — resolved
     by flipping murajaah_assignments.active to false instead,
     the tutor's only lever on this table (see
     src/features/murajaah/api.ts's docstring)
***** YearEndReport.academic_year ('YYYY/YYYY') maps to a
      1 Aug – 31 Jul window for the attendance snapshot
      (src/lib/reports.ts#academicYearWindow) — deliberately
      wider than the teaching period so no session can fall
      between two years. The snapshot reuses the app's own
      computeAttendanceRate ('late' counts as attended), so a
      report can never disagree with the attendance screens.
      tutor_id is the first entry of the class's tutor_ids;
      a student with no class, or a class with no tutor, is
      reported back as skipped_no_tutor rather than given a
      report nobody can author. Bulk generation is admin-
      triggered (ADR-013); since ADR-014 admin also reads and
      edits the resulting reports, but publishing one remains
      the authoring tutor's alone
****** `tutor_id` on Session/Assignment/YanbuaProgress/
       QuranProgress/MurajaahAssignment means "who recorded
       this row", not "a tutor of this class" — an admin
       write stores the admin's own id, which is in no
       class's tutor_ids (ADR-014(b), asserted as RLS-24)
```

**Enums:**

| Enum | Values |
|---|---|
| user_role | `admin`, `tutor`, `parent`, `student` |
| locale | `id` (Indonesia), `nl` (Dutch) |
| attendance_status | `present`, `absent`, `late` |
| assignment_status | `pending`, `completed`, `incomplete`, `partial` — PRD FR-003's "Overdue" is not a 5th value here; it's derived client-side (`pending` past the assignment's `due_date`) since the underlying verdict a tutor records is always one of these 4 |
| yanbuah_mastery | `lancar`, `kurang_lancar`, `ulang` |
| quran_quality | `mumtaz`, `jayyid_jiddan`, `jayyid`, `maqbul`, `perlu_perbaikan` |
| murajaah_quality | `hafal_lancar`, `hafal_kurang_lancar`, `belum_hafal` |
| murajaah_frequency | `daily`, `3x_week`, `weekly` |
| report_status | `draft`, `published` |
| report_grade | `mumtaz`, `jayyid_jiddan`, `jayyid`, `maqbul`, `perlu_bimbingan` |

## API Spec

Supabase auto-generates RESTful endpoints from the PostgreSQL schema via PostgREST. Custom logic is handled by Netlify Functions.

### Supabase Auto-Generated Endpoints (PostgREST)

| Method | Endpoint | Description | RLS Policy |
|---|---|---|---|
| GET | `/rest/v1/students?parent_id=eq.{id}` | Parent views their children | Parent sees own children only |
| GET | `/rest/v1/attendance?session_id=eq.{id}` | Get attendance for a session | Tutor: own classes; Parent: own children |
| POST | `/rest/v1/attendance` | Record attendance | Tutor: own classes only |
| GET | `/rest/v1/assignments?class_id=eq.{id}` | Get class assignments | Tutor: own classes; Parent: own children's classes |
| POST | `/rest/v1/assignments` | Create assignment | Tutor: own classes only |
| PATCH | `/rest/v1/assignment_status?id=eq.{id}` | Update homework status | Tutor only |
| GET | `/rest/v1/yanbua_progress?student_id=eq.{id}` | Get Yanbu'a history | Tutor: own students; Parent: own children |
| POST | `/rest/v1/yanbua_progress` | Record Yanbu'a progress | Tutor only |
| GET | `/rest/v1/quran_progress?student_id=eq.{id}` | Get Quran history | Tutor: own students; Parent: own children |
| POST | `/rest/v1/quran_progress` | Record Quran progress | Tutor only |
| GET | `/rest/v1/murajaah_assignments?student_id=eq.{id}` | Get Murajaah assignments | Tutor + Parent |
| POST | `/rest/v1/murajaah_assignments` | Assign Murajaah | Tutor only |
| POST | `/rest/v1/murajaah_log` | Confirm daily practice | Parent only (own children) |
| GET | `/rest/v1/murajaah_log?assignment_id=eq.{id}` | Get practice log | Tutor + Parent |
| GET | `/rest/v1/year_end_reports?student_id=eq.{id}` | Get reports for a student | Tutor: own students (any status); Parent/Student 16+: own children/self, `status=eq.published` only |
| PATCH | `/rest/v1/year_end_reports?id=eq.{id}` | Edit narrative/grades (draft or published) | Authoring tutor, own students; admin, any report (ADR-014) |

### Netlify Functions (Custom API Logic)

| Method | Path | Description |
|---|---|---|
| POST | `/.netlify/functions/notify-absence` | **Built.** Invoked by the database webhook on `public.attendance` (migration 009), not by the client that saved the attendance — so it fires for a tutor write, an admin write (ADR-014) and any future import alike. Authenticates the *channel* with a shared secret (`webhookAuth.ts`), then trusts nothing else the request said: it re-reads the attendance row by id and derives the recipient from `students.parent_id`. Sends one push to that child's parent, in the parent's own locale, containing the child's first name and the event type only. Clears `users.push_sub` if the push service reports the endpoint gone |
| POST | `/.netlify/functions/notify-milestone` | **Built.** Serves both celebration rows, distinguished by the webhook envelope's `table`: `yanbua_progress` (applies `isJilidComplete`, imported from `src/lib/yanbua.ts` — the rule is not restated here) and `murajaah_assignments` (the `active` true → false transition, i.e. the tutor's own "Tandai Sudah Hafal" judgement, so nothing is inferred). One Function rather than two because the two differ only in which row to read; recipients, payload rules and dedup are identical |
| POST | `/.netlify/functions/notify-assignment` | **Built.** Not in the original 5-Function list — added because the Notification Spec's "New homework assigned" row had no Function against it. The only sender that fans out across a **class**: one assignment → every enrolled student → each student's parent and, for a 16+ self-login student, the student too. Sends with bounded concurrency so a large roster cannot run the Function into its timeout, and one dead subscription never costs the rest of the class their notification |
| POST | `/.netlify/functions/notify-report-ready` | **Built**, closing PRD Feature 6 FR-007. Also not in the original 5. Fires on the `draft → published` transition only: re-publishing after a correction (FR-006) leaves `status` at `published` and preserves `published_at`, and an admin edit does not regenerate the PDF at all (ADR-014(e)), so a second "your report is ready" would be announcing a file that had not changed |
| GET | `/.netlify/functions/streak-status` | **Not built, and superseded** — ADR-016(c). It would return an integer the caller can compute from rows it already has: every screen showing a streak fetches the confirmation history anyway and runs `computeStreak` (`src/lib/murajaah.ts`) over it, which is the same function `send-murajaah-reminders` uses. Adding the endpoint would add a round trip, a second authorization path and a second implementation of one rule |
| POST/DELETE | `/.netlify/functions/push-subscribe` | **Built.** POST stores the caller's own Web Push subscription in `users.push_sub`; DELETE clears it. Caller-authenticated (`callerAuth.ts`) and writes only to the id from the validated JWT. Returns 403 when no student row points at the caller — neither `students.parent_id` nor `students.user_id` (ADR-022): a notification is always about a child, so a push endpoint is not collected for an account nothing would send to. A **relationship**, not a role: a tutor or admin whose own child attends the TPA is accepted, and a tutor of a class with no child of their own is not. The check reads `students` with the caller's own id in both link columns — the same query and the same predicate the settings screen uses, so the screen and the endpoint cannot disagree. Validates the subscription shape — the column is untyped `jsonb` and the sender will POST to whatever is in it — and rate-limits per caller (checklist §6) |
| POST | `/.netlify/functions/send-reminder` | Not built (ADR-015 part 2) |
| POST | `/.netlify/functions/generate-year-end-drafts` | **Admin-only** (verified in-function via the caller's JWT + `public.users.role`, same as `invite-user`). Computes the attendance stats snapshot and inserts one draft `year_end_reports` row per enrolled student for the given `academic_year` (optionally scoped to `class_id`). Idempotent: students who already have a report for that year are skipped (unique constraint on `(student_id, academic_year)`), and the response is three counts — `created_count`, `skipped_existing`, `skipped_no_tutor`. Under ADR-013 that counts-only response was a privacy boundary; since ADR-014 it is just the shape of a bulk job, and the trigger lives on the admin's own Reports screen rather than a separate `/admin/reports` page |
| POST | `/.netlify/functions/publish-report` | **Authoring tutor only** (narrowed from "tutor or admin" by ADR-013 — it matches `yer_tutor_rw`'s WITH CHECK, so a co-tutor who cannot edit a report cannot publish it either. ADR-014 made admin a super admin over everything else and left this check exactly as it is, which is why an admin edit to a published report leaves the stored PDF stale until the authoring tutor re-publishes — surfaced as a notice in the report editor). Renders the PDF (pdfkit — ADR-011), uploads it to Storage, and only then flips `draft → published` and sets `pdf_path`/`published_at`; a failed render or upload leaves the row untouched (PRD 6.4 reliability). Requires a non-empty `narrative` (PRD 6.8 AC-003; grades stay optional). Also the FR-006 path — re-publishing after a post-publish edit overwrites the same object and preserves the original `published_at`. **The report-ready notification is not sent**: no push infrastructure exists yet (see Notification Spec) |
| GET | `/.netlify/functions/report-pdf` | Returns a short-lived signed URL (300s) for a report's PDF after verifying the caller is authorized — **admin: any report, any status** (ADR-014, mirroring `yer_admin_all`; was denied outright under ADR-012/ADR-013); tutor: own class, any status; parent: own children, published only; student 16+: self, published only. This check is load-bearing: a signed URL bypasses RLS and the bucket has no client read policy, so it is the only gate in front of the file |
| POST | `/.netlify/functions/invite-user` | **Admin-only** (verified in-function via the caller's JWT + `public.users.role`, not trusted from the client). Not part of the original 8-function spec — added to support inviting a user by email (§ ADR-012 area, admin enrollment). Calls `auth.admin.inviteUserByEmail()` under the service-role key and creates the matching `public.users` profile in the same request, collapsing the "sign in once, then get registered" two-step flow into one admin action. Requires `SUPABASE_SERVICE_ROLE_KEY` — the project's first Function to actually need it |

### Custom Postgres Functions (RPC)

Client-callable via PostgREST's `/rest/v1/rpc/{fn}`, distinct from the read-only internal helpers (`fn_is_admin()`, `fn_my_children()`, etc.) that only ever run inside RLS policy expressions:

| Method | Path | Description |
|---|---|---|
| POST | `/rest/v1/rpc/fn_pending_registrations` | Admin-only, enforced inside the function (`and public.fn_is_admin()` folded into its `WHERE` clause — empty result for anyone else, not an error). `security definer` — the only way to read `auth.users` (id/email/created_at only) from a client role, since that schema isn't otherwise PostgREST-exposed. Added in migration 008 to power the Registrations admin page's fallback path (someone signed in directly, wasn't invited) |

### Supabase Storage

A new infrastructure element for this feature — the `reports` bucket:

* **Bucket:** `reports`, **private** (not publicly readable)
* **Path convention:** `reports/{student_id}/{academic_year}.pdf`, with the academic year's slash replaced by a hyphen — `reports/{student_id}/2025-2026.pdf`. Storage reads `/` as a path separator, so the literal `2025/2026` would nest every report a directory deeper. The path is deterministic per (student, year), which is what makes FR-006's re-publish overwrite in place instead of accumulating versions (`src/lib/reports.ts#reportPdfPath`)
* **Access:** never served directly; always via `/.netlify/functions/report-pdf`, which checks the caller's authorization (mirroring the `year_end_reports` RLS rule) before minting a signed URL (recommended TTL: 5 minutes)
* **Storage policies:** service-role only for `INSERT`/`UPDATE` (PDF writes happen server-side in `publish-report`, not from the client); no direct client `SELECT`/read policy — signed URLs bypass RLS by design, which is why the function-level auth check is load-bearing here

### Authentication Flow

```
Client                    Supabase Auth              Google
  │                            │                       │
  │── signInWithOAuth('google') ──►│                   │
  │                            │── OAuth redirect ────►│
  │                            │                       │── User consents
  │                            │◄── Auth code ─────────│
  │                            │── Exchange for tokens │
  │◄── Session (JWT + refresh) ──│                     │
  │                            │                       │
  │── API calls with JWT ─────►│                       │
  │                            │── Validate JWT        │
  │                            │── Apply RLS policies  │
  │◄── Filtered data ─────────│                       │
```

## Batch Files Spec

Not applicable. The PPME - TPA does not process batch files. All data entry is real-time via the PWA interface.

## Notification Spec

### Web Push Notifications (VAPID)

The **Recipient** column is a relationship to the child the row is about, never a role (ADR-022): "Parent" means that child's own `students.parent_id`, and "Student" their own `students.user_id`. A person who is a tutor or an admin *and* a parent is a recipient through the second of those, for their own child only.

| Trigger | Recipient | Message (ID) | Message (NL) | Priority |
|---|---|---|---|---|
| Student marked absent | Parent | "[Nama] tidak hadir hari ini di TPA" | "[Naam] was vandaag niet aanwezig bij TPA" | High |
| New homework assigned | Parent + Student | "Tugas baru: [Judul] — deadline [Tanggal]" | "Nieuwe opdracht: [Titel] — deadline [Datum]" | Medium |
| Homework due tomorrow | Parent + Student | "Pengingat: Tugas [Judul] deadline besok" | "Herinnering: Opdracht [Titel] deadline morgen" | Medium |
| Jilid completed | Parent | "Alhamdulillah! [Nama] selesai Jilid [X]!" | "Alhamdulillah! [Naam] heeft Jilid [X] afgerond!" | High |
| Surah memorized | Parent | "[Nama] hafal Surah [Nama Surah]!" | "[Naam] heeft Surah [Naam Surah] gememoriseerd!" | High |
| Daily Murajaah reminder | Parent | "Waktunya Murajaah! [Nama]: [Surah] ayat [X-Y]" | "Tijd voor Murajaah! [Naam]: [Surah] ayat [X-Y]" | Medium |
| Year-end report published | Parent + Student (16+) | "Rapor akhir tahun [Nama] sudah siap" | "Jaarrapport van [Naam] is klaar" | Medium |

**Implementation status.** All of them are live as of ADR-015 part 2b.

| Trigger | Status |
|---|---|
| Student marked absent | **Built** (part 1). Webhook on `public.attendance` (migration 009) → `notify-absence` |
| New homework assigned | **Built** (part 2a). Webhook on `public.assignments` (migration 010) → `notify-assignment`. The only sender that fans out across a whole class roster |
| Homework due tomorrow | **Built** (part 2b). Scheduled Function `homework-due-reminders`, 08:00 Europe/Amsterdam. Skips any student who has already marked the assignment `completed` |
| Jilid completed | **Built** (part 2a). Webhook on `public.yanbua_progress` → `notify-milestone`, which applies `src/lib/yanbua.ts#isJilidComplete` — the same module the Yanbu'a screen uses |
| Surah memorized | **Built** (part 2a). Webhook on `murajaah_assignments.active` going true → false, which is exactly the tutor's "Tandai Sudah Hafal" action (checklist §13) |
| Daily Murajaah reminder | **Built** (part 2b). Scheduled Function `send-murajaah-reminders`, 18:00 Europe/Amsterdam, closing PRD FR-006. Sent on the last evening the target's frequency can still be met, not unconditionally — ADR-016(h) |
| Weekly progress digest | **Built** (part 2b). Not a row the Spec originally had: the Scheduler table asked for a Friday summary push and no notification was ever defined for it, because what it describes (attendance %, new progress) cannot go on a lock screen. The push says the summary is ready; the summary is on the dashboard — ADR-016(g) |
| Year-end report published | **Built** (part 2a), closing PRD FR-007. Webhook on `year_end_reports.status` reaching `published` — deliberately *not* a call inside `publish-report`, so a push service having a bad minute can never affect whether a report published |

All of them are verified end to end against a real browser and a real
push service (`scripts/verify-push.mjs`), including that the other
family's parent received nothing. The scheduled ones are driven through
`scripts/invoke-scheduled.mjs`, which pins the clock from outside the
process so the Europe/Amsterdam gate can be exercised on both a CET and
a CEST date and the second, idempotent run asserted.

The message column above is the **in-app** wording. What reaches a lock
screen is the shorter text under `notifications.push.*` — the child's
first name and the event type, nothing else (DPIA R6, ADR-015(b)). This
is why the jilid *number*, the surah *name* and the assignment *title*
appear nowhere in a notification, and are asserted absent both in unit
tests and live.

**Where the milestone rules live.** `notify-milestone` imports
`isJilidComplete` from `src/lib/yanbua.ts` rather than restating it, the
way `netlify/functions/` already imports `src/lib/reports.ts`. The
trigger in migration 010 is correspondingly *unselective* — it fires for
every Yanbu'a entry and lets the Function decide — because any filter in
SQL would be a second copy of a curriculum rule, free to drift from the
first. The cost is invocations, not correctness; see Billing.

### Technical Implementation

* VAPID key pair generated once per environment, stored in Netlify environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, plus `VITE_VAPID_PUBLIC_KEY` — the public half is also needed in the browser to subscribe). Rotating the pair invalidates every stored subscription
* Push subscriptions stored in `users.push_sub` (JSONB column, migration 002), written only through `push-subscribe`, which validates the shape — the column is untyped `jsonb` and the sender POSTs to whatever endpoint it holds. **One subscription per user**, not per device (ADR-015(g))
* Payload includes: title, localized body, PPME icon, deep-link URL, notification type tag. Built server-side only (`netlify/functions/lib/notifications.ts`) so the R6 content rules have one implementation and one test suite
* The recipient's own `users.locale` selects the language — never the sender's, never a default
* Notifications are deduplicated by a tag of `(event, user, local date)`, which both replaces rather than stacks in the browser and acts as the idempotency key for hourly scheduled Functions (ADR-015(e))
* Delivery is best-effort by design: a push service that reports an endpoint gone (404/410) has it cleared from `users.push_sub`, and the settings screen reads that server state rather than the browser's (ADR-015(h))
* Service-worker handlers live in `public/push-sw.js`, imported into the Workbox-generated worker (ADR-015(f))

### WhatsApp Integration (Phase 3 — Optional)

For families who don't enable push notifications, send reminders via WhatsApp Business API:
- Provider: 360dialog (EU-based WhatsApp BSP) or MessageBird (Dutch company)
- Cost: ~€0.05/message (template messages)
- Estimated volume: 200 students × daily = ~6,000 messages/month = ~€300/month
- Decision: Only implement if push notification adoption < 60%

## Flows

### Flow 1: Attendance Recording

```mermaid
sequenceDiagram
    participant T as Tutor (PWA)
    participant SW as Service Worker
    participant N as Netlify CDN
    participant NF as Netlify Function
    participant S as Supabase (EU)
    participant P as Parent (PWA)

    T->>N: Load Attendance page (cached by SW)
    T->>S: GET /rest/v1/students?class_id=eq.{id}
    S-->>T: Student roster (RLS: tutor's class only)
    T->>T: Mark each student present/absent
    T->>S: POST /rest/v1/attendance (batch insert)
    S-->>T: 201 Created
    S->>NF: Database webhook (on INSERT where status='absent')
    NF->>NF: Lookup parent push subscriptions
    NF->>P: Web Push: "[Name] tidak hadir hari ini"

    alt Offline scenario
        T->>SW: Queue attendance POST in IndexedDB
        SW-->>T: Show "Saved offline, will sync"
        Note over SW,S: When online...
        SW->>S: Background Sync: POST /rest/v1/attendance
        S-->>SW: 201 Created
    end
```

### Flow 2: Murajaah Daily Practice (Home)

```mermaid
sequenceDiagram
    participant SCH as Netlify Scheduler
    participant NF as Netlify Function
    participant S as Supabase (EU)
    participant P as Parent (PWA)

    Note over SCH: Daily at 18:00 CET
    SCH->>NF: Trigger send-reminder function
    NF->>S: GET active murajaah assignments (not confirmed today)
    S-->>NF: List of students + parents with pending practice
    NF->>P: Web Push: "Waktunya Murajaah!"

    P->>P: Child recites to parent
    P->>S: POST /rest/v1/murajaah_log (date, confirmed: true, quality)
    S-->>P: 201 Created
    S->>S: Trigger function: calculate streak
    S-->>P: Realtime update: streak = N+1
```

### Flow 3: Yanbu'a Progress Entry

```mermaid
sequenceDiagram
    participant T as Tutor (PWA)
    participant S as Supabase (EU)
    participant NF as Netlify Function
    participant P as Parent (PWA)

    T->>S: GET /rest/v1/yanbua_progress?student_id=eq.{id}&order=recorded_at.desc&limit=1
    S-->>T: Latest: Jilid 3, Page 12, Lancar
    T->>T: Record new: Jilid 3, Page 15, Lancar
    T->>S: POST /rest/v1/yanbua_progress
    S-->>T: 201 Created

    alt Last page of Jilid
        S->>NF: Database webhook (jilid completion detected)
        NF->>P: Web Push: "Alhamdulillah! Selesai Jilid 3!"
        NF->>S: UPDATE student SET yanb_level = 'jilid_4'
    end

    Note over P: Parent opens app (anytime)
    P->>S: GET /rest/v1/yanbua_progress?student_id=eq.{child_id}
    S-->>P: Full timeline (RLS: own child only)
```

## Database

### Provider & Configuration

| Property | Value |
|---|---|
| Provider | Supabase (self-hosted option available) |
| Region | Frankfurt, Germany (eu-central-1) |
| Engine | PostgreSQL 15 |
| Encryption at rest | AES-256 (Supabase default) |
| Encryption in transit | TLS 1.3 |
| Backups | Daily automated (7-day retention on free tier; 30-day on Pro) |
| Point-in-time recovery | Available on Pro plan ($25/mo) |
| Connection pooling | PgBouncer (built-in via Supabase) |
| Row Level Security | Enabled on ALL tables |

### Storage Estimates (Year 1)

| Entity | Records/year (est.) | Avg row size | Total |
|---|---|---|---|
| Users | ~250 | 1 KB | 0.25 MB |
| Students | ~200 | 0.5 KB | 0.1 MB |
| Attendance | 200 students × 100 sessions | 0.2 KB | 4 MB |
| Assignments | ~500 | 1 KB | 0.5 MB |
| Yanbu'a Progress | 200 × 100 entries | 0.3 KB | 6 MB |
| Quran Progress | 200 × 50 entries | 0.4 KB | 4 MB |
| Murajaah Logs | 200 × 200 days | 0.2 KB | 8 MB |
| **Total (Year 1)** | | | **~23 MB** |

Well within Supabase free tier (500 MB database limit).

### Row Level Security Policies

RLS policies enforce data isolation at the database level:

| Table | Role | Access | Rule |
|---|---|---|---|
| `attendance` | Parent | SELECT | Only rows where `student_id` belongs to parent's children |
| `attendance` | Tutor | INSERT | Only rows for sessions in tutor's assigned classes. Deliberately **not** narrowed by ADR-023: the register is one upsert of the whole roster, so refusing one row refuses the class — see ADR-023(c) for what closing it needs |
| `murajaah_log` | Parent | INSERT | Only rows for assignments belonging to parent's children |
| `yanbua_progress` | Tutor | INSERT | Only rows for students in tutor's assigned classes, **minus the tutor's own student record** if they are also a santri (`fn_my_recordable_students()`, ADR-023) |
| `quran_progress` | Tutor | INSERT | Only rows for students in tutor's assigned classes, minus their own record (ADR-023) |
| `assignment_status`, `murajaah_assignments` | Tutor | ALL | Same set, minus their own record (ADR-023). The USING clause narrows too, because it gates DELETE as well as SELECT |
| All student-scoped tables | Student (16+, self-login) | SELECT | Only rows where `student_id` matches the Student record whose `user_id = auth.uid()`. Read-only **as a consequence of holding no other relationship, not because of the role**: no policy in the schema tests for `student`, so a 16+ student who is also named in a class's `tutor_ids` gets that class's tutor grants in the ordinary way (ADR-020, RLS-35). Being *enrolled* in a class still reveals nothing about classmates. Since ADR-023 those tutor grants stop short of the assistant's **own** record for every evaluative write — they may not grade themselves, set their own target, mark their own homework verified or author their own report, even when they teach the class they sit in (RLS-37); `attendance` is the one exception, and it is stated as such |
| `year_end_reports` | Tutor | SELECT, INSERT, UPDATE | Only rows for students in tutor's assigned classes; any status (drafts included) — **minus their own record** (ADR-023), so a student assistant cannot author, or read the draft of, a report about themselves. `yer_student_read` still gives them the published one |
| `year_end_reports` | Parent | SELECT | Only rows where `student_id` belongs to parent's children **and** `status = 'published'` — drafts never visible |
| `year_end_reports` | Student (16+) | SELECT | Only own row **and** `status = 'published'` |
| Storage `reports` bucket | All non-service roles | — | No direct read/write policy; access only via the `report-pdf` function's signed URL after an auth check |
| `users.push_sub` | Self | UPDATE | Covered by the existing `users_self_update` policy (which only pins `role`), so storing a push subscription needed no migration and no new policy. Writes still go through `push-subscribe` rather than PostgREST — the column is untyped `jsonb` and the sender POSTs to whatever endpoint it holds, so shape validation, rate limiting and the recipient check all live in that Function (ADR-015). That check is a relationship — is any student row's `parent_id` or `user_id` this caller — rather than a role, since ADR-022 |
| `public.fn_webhook_config()` | anon, authenticated | — | EXECUTE revoked. It returns the webhook shared secret from Vault; no client role may call it (asserted as WH-06 in the pgTAP suite) |
| All tables | Admin | ALL | Full access for TPA committee admin role (`*_admin_all` / `fn_is_admin()`, migrations 003 + 005). Unchanged since it was written — ADR-012 fenced admin out of these screens in the *application* only, and ADR-014 removed that fence without touching a single policy. The one write the app still declines to offer admin is `murajaah_log` (home-practice confirmation), which RLS does permit — see ADR-014(c) |

**"Parent", "Tutor" and "Student" in the table above name
*relationships*, not the `users.role` column** (ADR-019). Every rule in
it is written against a link the row itself carries — `parent_id =
auth.uid()`, `auth.uid() = any (tutor_ids)`, `user_id = auth.uid()` —
and `fn_is_admin()` is the only policy in the schema that reads `role`.
One person may hold several of these at once, in which case Postgres ORs
the permissive policies and they get the union of the grants, each half
keeping its own limits: a tutor whose own child attends can record
progress for the class they teach and not for their own child, and sees
their own child's published report but not its draft. Proven, not
assumed — RLS-28…RLS-34, which also cover three relationships at once
and record the exception: an admin's grant is unconditional, so a
combination that includes it is bounded by nothing.

## Billing

### Cost Breakdown (Monthly)

| Service | Tier | Cost/month | Notes |
|---|---|---|---|
| Supabase | Free | €0 | 500MB DB, 1GB storage, 50K MAU, 500K edge function invocations |
| Netlify | Free (or Pro) | €0 — €19 | 100GB bandwidth, 125K function invocations (free); Pro if needed |
| Google OAuth | Free | €0 | No cost for OAuth 2.0 |
| Web Push | Free | €0 | VAPID-based, no third-party service |
| Domain | Annual | ~€12/year (~€1/mo) | Confirmed: `tpa.ppmedenhaag.nl` (subdomain = free, CNAME to Netlify) |
| **Total (Free tier)** | | **€0 — €1/mo** | Sufficient for 200 students, 20 tutors |
| **Total (Pro tier)** | | **€19 — €44/mo** | If scaling to multi-branch (500+ users) |

**Year-end report PDFs:** at ~200 students × 1 report/year × ~150-300KB per PDF, total storage is on the order of tens of MB/year — comfortably inside Supabase's 1GB free-tier storage allowance alongside the database itself. No additional cost line needed.

**Notification function invocations** (against Netlify's 125K/month free
allowance). The scaling-trigger table used to flag this as "possible with
daily notifications × 200 users", which was never checked; ADR-015 makes
the arithmetic explicit because its hourly-cron approach deliberately
trades invocations for correctness:

| Source | Invocations/month | Note |
|---|---|---|
| `notify-absence` (webhook) | ~1,000 | One per absence. ~200 students × ~4 TPA days/month × a ~10–15% absence rate |
| `notify-milestone` — Yanbu'a (webhook) | ~800 | **One per progress entry, not one per completion.** The trigger is deliberately unselective so the completion rule stays in one place (`src/lib/yanbua.ts`); roughly 30 of these are real milestones and the rest exit after two queries with no push. Paying ~770 no-op invocations a month to avoid a second copy of a curriculum rule in SQL is a trade worth making at this scale, and worth revisiting only if the free tier ever comes into view |
| `notify-milestone` — murajaah (webhook) | ~50 | One per "Tandai Sudah Hafal"; a state transition, so no no-ops |
| `notify-assignment` (webhook) | ~40 | One per assignment created, not per student — the fan-out happens inside the Function |
| `notify-report-ready` (webhook) | ~200/year | One per report, once, at year end |
| 4 scheduled Functions, hourly | 2,880 | 24 × ~30 × 4. The 23 hourly runs that are not the target hour return immediately (part 2b) |
| `push-subscribe` | negligible | Once per family per device change |
| Report/enrollment Functions | a few hundred | Seasonal (year-end), unchanged by this work |
| **Total** | **~5,000–6,000/month** | **~4–5% of the free allowance** |

Even at ten times the absence rate, or with a scheduled Function added
per feature, this stays an order of magnitude inside the free tier. Note
that the per-minute cron the hourly approach *avoided* would have been
43,200 invocations/month — still free, but wasteful. Nothing here
requires Netlify Pro.

### Scaling Triggers

| Metric | Free Tier Limit | Action |
|---|---|---|
| Database size > 500MB | Supabase Pro ($25/mo) | Unlikely in 3+ years at current growth |
| MAU > 50,000 | Supabase Pro | Not applicable (max ~500 users) |
| Bandwidth > 100GB/mo | Netlify Pro ($19/mo) | Unlikely for text-based PWA |
| Function invocations > 125K/mo | Netlify Pro | Examined rather than assumed — see below. Comfortably inside the free tier at PPME's size |

## CS Tools

### Admin Dashboard (TPA Committee)

Built into the PWA with `admin` role access. **ADR-012's narrowing has been
reversed by ADR-014**: admin is now a super admin with full read *and* write
access to every operational screen, reached through the same five tabs every
other role uses. The enrollment/setup screens below sit one level down,
behind a single "Kelola" entry point, and remain admin-only (`RequireAdmin`).

| Feature | Description | Status |
|---|---|---|
| Student Enrollment | Add students; link to parent accounts; assign to classes (`/admin/students`) | Built — no remove/deactivate yet |
| Class Management | Create classes; assign tutors; set schedules (`/admin/classes`) | Built |
| Tutor Management | View active tutors; manage class assignments | Built, folded into Class Management (assigning tutors to a class doubles as "who's active") — no standalone tutor list/view |
| User Registration | Invite a user by email, or register one who signed in directly (`/admin/registrations`) | Built — not in the original spec; see `invite-user.mts` |
| Year-End Draft Generation | Trigger bulk draft-report creation for an academic year, optionally one class | Built — a panel on the admin's own Reports screen since ADR-014. Was a separate content-blind screen at `/admin/reports` under ADR-013; that route no longer exists |
| Attendance Reports | Per-class attendance, recorded and reviewed through the normal Attendance screen on any class | Built by ADR-014 — the *aggregate* cross-class rate report originally specced here is still not built |
| Progress Overview | Yanbu'a/Quran/Murajaah progression, per class and per student, through the normal feature screens | Built by ADR-014 — again per class, not a single TPA-wide summary view |
| Export (CSV) | Export attendance and progress data for TPA committee reporting | Not built. ADR-012's blocker is gone (admin may read this data now), so what remains is GDPR art. 20 scope and DPIA risk R4 — an export must exclude the absence-`reason` field, which can carry health data |

### Self-Service for Parents

| Feature | Description |
|---|---|
| Profile Management | Update name, notification preferences, locale (ID/NL) |
| Link Children | Connect parent account to student profile (admin-approved) |
| Notification Settings | Enable/disable push (`/settings/notifications`, reached from the dashboard) — **built**. Also states what a notification can contain, which is shown to everyone including accounts that receive nothing. Whether the toggle is offered is decided by the caller's relationships, not their role (ADR-022): a tutor whose own child attends gets it, a tutor with no child of their own is told plainly that this account is linked to no santri. **Per-family Murajaah reminder time is not built**: it would need a column on `users` and only matters once `send-murajaah-reminders` exists (ADR-015 part 2), so it is deferred to the milestone that would use it. Until then the reminder hour is one TPA-wide default, 18:00 local |

## Scheduler

### Netlify Scheduled Functions

**Built as of ADR-015 part 2b** — three of them. The fourth is
superseded rather than pending; see the row. The cron column was
rewritten before any of this was implemented, because the original was
wrong for most of the year and would otherwise have been copied straight
into the code.

| Function | Schedule (Cron, UTC) | Local gate | Description |
|---|---|---|---|
| `send-murajaah-reminders` | `0 * * * *` (hourly) | 18:00 Europe/Amsterdam | **Built.** Active Murajaah targets whose family can no longer afford to skip today — `daily` every unconfirmed evening, `3x_week` once the days left in the week drop to the confirmations still owed, `weekly` on Sunday (ADR-016(h)). Push to parents |
| ~~`calculate-streak-resets`~~ | — | — | **Superseded by ADR-016(a)/(b)**, not deferred. Its job was to zero stored streaks that had gone stale overnight; the streak is now computed from the log at read time and cannot go stale, and `murajaah_log.streak_count` was dropped in migration 011. There is nothing left for it to do |
| `homework-due-reminders` | `0 * * * *` (hourly) | 08:00 Europe/Amsterdam | **Built.** Assignments due tomorrow, across each class's roster, skipping any student who has already marked it `completed`. Parent + 16+ student |
| `weekly-progress-digest` | `0 * * * *` (hourly) | 08:00 Europe/Amsterdam, Friday | **Built.** Push to parents of any child with activity this week; a quiet week (school holidays) sends nothing. The attendance figure and progress counts are *in the app* — `src/features/dashboard/WeeklySummary.tsx` — because DPIA R6 will not have them on a lock screen (ADR-016(g)) |
| `prune-notifications` | `0 * * * *` (hourly) | 03:00 Europe/Amsterdam | **Built** (ADR-017(f)). Deletes notification-centre rows past the 90-day retention window — DPIA R5. Its own job rather than folded into the weekly digest: retention is an obligation and the digest is a courtesy, so a Friday the digest skips must not silently be a day nothing was deleted |

None of them authenticate their caller, and are built so that they do not
need to — ADR-016(d), which also records that a scheduled Function *is*
reachable over plain HTTP under `netlify dev`, whatever the deployed
platform does. They read nothing from the request, return before opening
a database connection outside their hour, return counts rather than
dedup tags, and send nothing new on a repeat run.

**Why hourly with a gate instead of a fixed UTC hour (ADR-015(e)).**
Netlify cron expressions are UTC-only. The previous table read
`0 17 * * *` "= 18:00 CET", which is true for the winter and one hour
late for the whole of CEST — including the entire TPA summer term. The
alternatives were being wrong half the year, or editing four crons twice
a year and remembering to. Instead each Function runs every hour and asks
`isAmsterdamHour(target)` (`netlify/functions/lib/notifications.ts`),
which resolves the offset from the runtime's IANA database rather than
arithmetic, and is unit-tested on both switchover Sundays. The dedup tag
is keyed on the family's local date, so a duplicate run cannot produce a
duplicate notification — including in the repeated 02:00–03:00 hour of
the autumn switch.

### Implementation Approach

Each scheduled function follows the same pattern:
1. Authenticate the channel, not a caller (`webhookAuth.ts`) — a scheduled Function has no signed-in user, and must not be usefully invokable by a stranger over HTTP
2. Return immediately unless it is the target hour in `Europe/Amsterdam`
3. Query Supabase for pending items (e.g., unconfirmed Murajaah assignments for today)
4. Retrieve associated parent push subscriptions
5. Send Web Push notifications via `web-push` library (VAPID), building payloads with the shared builder so the R6 content limits apply identically
6. Clear any subscription the push service reports as gone; log delivery status for monitoring

# Other Artifacts

* **PWA Manifest** (`manifest.json`): App name "TPA PPME Den Haag", theme color #0D50A0, icons in PPME branding — 192/512/maskable-512, generated from the high-resolution logo masters in `assets/brand/` by `scripts/generate-brand-assets.py`. The square icons carry the **globe mark alone**, not the full 1.933:1 lockup, so they stay legible at launcher size; the maskable variant sits inside the 80% safe zone. The same script emits `public/logo.png` (full colour, light backgrounds) and `public/logo-white.png` (reversed, for the brand-blue top bar), and inlines the reversed wordmark into `netlify/functions/lib/logoAsset.ts` for the report PDF header
* **Service Worker**: Workbox precaching for app shell; runtime caching for API responses; background sync for offline submissions
* **i18n Configuration**: `react-i18next` with `id` and `nl` locale files; Islamic/Arabic terms untranslated in both locales
* **Seed Data**:
  - Yanbu'a structure: 7 jilid with page counts per jilid
  - Quran structure: 114 surahs with names (Arabic + transliteration) and ayah counts
* **GDPR Documentation** (owned by PPME Den Haag IT team, per confirmed decision):
  - Privacy Policy (NL + ID)
  - Data Processing Agreement (if using Supabase managed)
  - DPIA (Data Protection Impact Assessment) for children's data
  - Right to erasure implementation (delete student + all related records, **plus the year-end report PDF object in Storage**, which `on delete cascade` does not reach — manual runbook in README until an automated flow exists)
  - Data export (GDPR Article 20 portability — CSV export)
* **CI/CD Pipeline**: Git push → Netlify auto-build → Preview deploy (PR) → Production deploy (main branch)
* **Monitoring**: Netlify Analytics (built-in) + Supabase Dashboard (query performance, active connections)

# Questions

| # | Question | Status | Answer |
|---|---|---|---|
| 1 | Can PPME Den Haag use Supabase (Australian company, EU servers) under GDPR? | Open | Need PPME IT team to review Supabase DPA; data stays in Frankfurt EU — likely acceptable |
| 2 | Should students under 16 have their own accounts or access through parents only? | Answered | Hybrid: Student always linked to Parent (`parent_id`); students 16+ may additionally have their own Google-linked account (`Student.user_id`, nullable) for self-login as `role=student`. Under-16 students have no login — parent-only access. |
| 3 | Is a subdomain (tpa.ppmedenhaag.nl) or separate domain preferred? | Answered | Confirmed: subdomain of ppmedenhaag.nl (`tpa.ppmedenhaag.nl`) |
| 4 | Will PPME provide the Google Workspace for admin service account? | Open | Needed for server-side operations if required |
| 5 | WhatsApp Business API budget approved for Phase 3? | Open | ~€300/mo for 6K messages; alternative: push-only |
| 6 | Should progress data be retained indefinitely or have a retention period? | Open | GDPR requires data minimization; recommend 3 years post-enrollment then archive |
| 7 | Does PPME want multi-tenant architecture from day one or single-tenant? | Open | Single-tenant recommended for Phase 1; multi-tenant refactor when branching |
| 8 | What is the Murajaah reminder default time? Configurable per family? | Open | Recommend 18:00 CET default (after Maghrib); per-family override in settings |

# References

* **PRD:** `PRD-TPA-Progress-Tracker.md` (companion document)
* **PPME Den Haag:** https://www.ppmedenhaag.nl/about/
* **Supabase Documentation:** https://supabase.com/docs
* **Supabase Row Level Security:** https://supabase.com/docs/guides/auth/row-level-security
* **Netlify Documentation:** https://docs.netlify.com/
* **Netlify Scheduled Functions:** https://docs.netlify.com/functions/scheduled-functions/
* **Google OAuth 2.0:** https://developers.google.com/identity/protocols/oauth2
* **Web Push (VAPID):** https://web.dev/push-notifications-overview/
* **Workbox (PWA):** https://developer.chrome.com/docs/workbox/
* **GDPR Article 8 (Children's Consent):** https://gdpr-info.eu/art-8-gdpr/
* **Uitvoeringswet AVG (Dutch GDPR):** https://wetten.overheid.nl/BWBR0040940/
* **Tailwind CSS:** https://tailwindcss.com/
* **react-i18next:** https://react.i18next.com/

---
