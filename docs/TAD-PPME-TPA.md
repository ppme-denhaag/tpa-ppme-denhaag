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

# Impact

| Component | Details |
|---|---|
| Domain Model | 11 core entities: User, Student, Class, Session, Attendance, Assignment, YanbuaProgress, QuranProgress, MurajaahAssignment, MurajaahLog, YearEndReport |
| API Spec | RESTful API via Supabase auto-generated endpoints + Netlify Functions for custom logic (notifications, streak calculation) |
| Batch Files Spec | N/A — no batch file processing required |
| Notification Spec | Web Push (VAPID) for absence alerts, homework reminders, milestone celebrations; optional WhatsApp via Business API (Phase 3) |
| Flows | 5 primary flows: Attendance recording, Homework lifecycle, Yanbu'a entry, Quran entry, Murajaah assignment + daily confirmation |
| Database | PostgreSQL on Supabase (Frankfurt EU); encrypted at rest (AES-256); TLS in transit; Row Level Security; automated daily backups |
| Billing | Supabase Free Tier (500MB DB, 1GB storage, 50K monthly active users); Netlify Free/Pro ($0-$19/mo); Google OAuth (free); Total estimated: $0-$19/month |
| CS Tools | Admin dashboard for TPA committee: enrollment management, class management, user registration/invite — plus, since ADR-014, full read/write access to every operational screen (attendance, homework, Yanbu'a, Quran, Murajaah, year-end reports) on every class, using the same class-shaped views a tutor gets |
| Scheduler | Netlify Scheduled Functions: daily Murajaah reminders (configurable per family, default 18:00 CET); streak reset calculation (midnight CET) |
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
                                              │ streak_count │
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
* stats snapshotted at draft generation; grades reuse the
  report_grade enum (same 5-level scale as quran_quality,
  kept separate so report grading isn't coupled to Quran-
  specific semantics)
** Student.quran_pos (current_surah/current_ayah) is a
   denormalized cache, never written by the Quran feature —
   current position is derived client-side from the latest
   quran_progress row instead (mirrors Yanbu'a's jilid-
   completion detection; see src/lib/quran.ts's docstring)
*** Murajaah.streak_count (set by the fn_set_streak_count
    trigger) has no scheduled job to zero it out when a day
    is missed, since Netlify Scheduled Functions don't exist
    yet — the UI shows the latest log's streak_count together
    with its date rather than asserting a live "current streak"
    the system can't verify (see src/lib/murajaah.ts's docstring)
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
| POST | `/.netlify/functions/notify-absence` | Triggered after attendance POST; sends push to parents of absent students |
| POST | `/.netlify/functions/notify-milestone` | Triggered when jilid completed or surah memorized; sends celebration push |
| GET | `/.netlify/functions/streak-status` | Calculates current streak for a student's Murajaah assignment |
| POST | `/.netlify/functions/push-subscribe` | Stores Web Push subscription for a user |
| POST | `/.netlify/functions/send-reminder` | (Scheduled) Daily Murajaah reminder trigger |
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

| Trigger | Recipient | Message (ID) | Message (NL) | Priority |
|---|---|---|---|---|
| Student marked absent | Parent | "[Nama] tidak hadir hari ini di TPA" | "[Naam] was vandaag niet aanwezig bij TPA" | High |
| New homework assigned | Parent + Student | "Tugas baru: [Judul] — deadline [Tanggal]" | "Nieuwe opdracht: [Titel] — deadline [Datum]" | Medium |
| Homework due tomorrow | Parent + Student | "Pengingat: Tugas [Judul] deadline besok" | "Herinnering: Opdracht [Titel] deadline morgen" | Medium |
| Jilid completed | Parent | "Alhamdulillah! [Nama] selesai Jilid [X]!" | "Alhamdulillah! [Naam] heeft Jilid [X] afgerond!" | High |
| Surah memorized | Parent | "[Nama] hafal Surah [Nama Surah]!" | "[Naam] heeft Surah [Naam Surah] gememoriseerd!" | High |
| Daily Murajaah reminder | Parent | "Waktunya Murajaah! [Nama]: [Surah] ayat [X-Y]" | "Tijd voor Murajaah! [Naam]: [Surah] ayat [X-Y]" | Medium |
| Year-end report published | Parent + Student (16+) | "Rapor akhir tahun [Nama] sudah siap" | "Jaarrapport van [Naam] is klaar" | Medium |

**None of the above are implemented.** No push/webhook/scheduled-function
infrastructure exists in the project yet, so every notification row in this
table — including PRD Feature 6's FR-007 — is deferred. `publish-report`
completes the publish without notifying anyone; families see a new report
the next time they open the Reports screen. The localized copy for the
report-ready message is already drafted (`reports.notification` in both
locale files) and is deliberately left unused until the pipeline exists.

### Technical Implementation

* VAPID key pair generated once, stored in Netlify environment variables
* Push subscriptions stored in `user.push_subscription` (JSONB column in Supabase)
* Payload includes: title, localized body, PPME icon, deep-link URL, notification type tag
* Notifications are deduplicated by tag to prevent duplicate alerts

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
| `attendance` | Tutor | INSERT | Only rows for sessions in tutor's assigned classes |
| `murajaah_log` | Parent | INSERT | Only rows for assignments belonging to parent's children |
| `yanbua_progress` | Tutor | INSERT | Only rows for students in tutor's assigned classes |
| `quran_progress` | Tutor | INSERT | Only rows for students in tutor's assigned classes |
| All student-scoped tables | Student (16+, self-login) | SELECT | Only rows where `student_id` matches the Student record whose `user_id = auth.uid()`; read-only, no INSERT/UPDATE |
| `year_end_reports` | Tutor | SELECT, INSERT, UPDATE | Only rows for students in tutor's assigned classes; any status (drafts included) |
| `year_end_reports` | Parent | SELECT | Only rows where `student_id` belongs to parent's children **and** `status = 'published'` — drafts never visible |
| `year_end_reports` | Student (16+) | SELECT | Only own row **and** `status = 'published'` |
| Storage `reports` bucket | All non-service roles | — | No direct read/write policy; access only via the `report-pdf` function's signed URL after an auth check |
| All tables | Admin | ALL | Full access for TPA committee admin role (`*_admin_all` / `fn_is_admin()`, migrations 003 + 005). Unchanged since it was written — ADR-012 fenced admin out of these screens in the *application* only, and ADR-014 removed that fence without touching a single policy. The one write the app still declines to offer admin is `murajaah_log` (home-practice confirmation), which RLS does permit — see ADR-014(c) |

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

### Scaling Triggers

| Metric | Free Tier Limit | Action |
|---|---|---|
| Database size > 500MB | Supabase Pro ($25/mo) | Unlikely in 3+ years at current growth |
| MAU > 50,000 | Supabase Pro | Not applicable (max ~500 users) |
| Bandwidth > 100GB/mo | Netlify Pro ($19/mo) | Unlikely for text-based PWA |
| Function invocations > 125K/mo | Netlify Pro | Possible with daily notifications × 200 users |

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
| Notification Settings | Enable/disable push; set Murajaah reminder time |

## Scheduler

### Netlify Scheduled Functions

| Function | Schedule (Cron) | Description |
|---|---|---|
| `send-murajaah-reminders` | `0 17 * * *` (17:00 UTC = 18:00 CET) | Query active Murajaah assignments not confirmed today; send push to parents |
| `calculate-streak-resets` | `5 23 * * *` (23:05 UTC = 00:05 CET) | For any Murajaah assignments with no log today, reset streak to 0 |
| `homework-due-reminders` | `0 7 * * *` (07:00 UTC = 08:00 CET) | Check assignments due tomorrow; send reminder push |
| `weekly-progress-digest` | `0 8 * * 5` (08:00 UTC Friday) | Send weekly summary push to parents (attendance %, new progress) |

### Implementation Approach

Each scheduled function follows the same pattern:
1. Query Supabase for pending items (e.g., unconfirmed Murajaah assignments for today)
2. Retrieve associated parent push subscriptions
3. Send Web Push notifications via `web-push` library (VAPID)
4. Log delivery status for monitoring

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
