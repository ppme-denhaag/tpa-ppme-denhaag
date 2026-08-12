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
- [ ] **VAPID key pair** — generated for Web Push, stored as Netlify env vars (never committed to repo)
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
- [ ] Database webhooks configured (Supabase → Netlify Functions) for absence notifications and jilid-completion detection — deferred; jilid-completion is currently detected **client-side** instead (see `src/lib/yanbua.ts`), since no webhook/notification infra exists yet
- [ ] Backup/PITR policy confirmed for chosen Supabase tier
- [x] Migration 008 added: `fn_pending_registrations()` — not in the original 10-entity scope, added to support admin enrollment (see §10)

## 4. API & Netlify Functions

- [x] Convention documented for when to call PostgREST directly vs. via a Netlify Function wrapper — emerged in practice rather than being decided upfront: plain CRUD goes straight through PostgREST from the client; anything needing the service-role key (bypassing RLS) goes through a Function that independently re-verifies the caller's authorization in code (see `invite-user.mts`)
- [ ] 5 custom functions built: `notify-absence`, `notify-milestone`, `streak-status`, `push-subscribe`, `send-reminder` — **none of these built yet**; all Phase 3/notifications work remains deferred
- [ ] 4 scheduled functions built with correct cron — verify UTC vs. CET/CEST handling around DST changes
- [ ] Notification deduplication-by-tag logic implemented and tested
- [ ] Streak calculation logic — edge cases defined (assignment created mid-week, `daily` vs `3x_week` frequency, missed-day reset rules)
- [x] `invite-user.mts` built — the project's **first real Function**, landed ahead of the 5 above and not part of the original spec (admin email-invite, see §10 and TAD's Netlify Functions table)

## 5. Frontend / PWA (build against the validated prototype)

- [x] `manifest.json` + icon set using the real PPME logo — configured (192/512/maskable) in `vite.config.ts`; **icons are still a low-res upscale** from a 135×70px source, real high-res asset still needed before launch (see README "Known gaps")
- [~] Service worker via Workbox: app-shell precaching done (`vite-plugin-pwa`, `generateSW`); runtime caching per route and **background sync queue for offline attendance/murajaah submissions not built** — attendance currently requires being online
- [ ] IndexedDB offline queue tested for conflict resolution (e.g., tutor marks attendance offline on two devices before sync)
- [~] Role-based routing/dashboards for the 3 roles shown in the prototype: **Ustadz** (Hadir/Tugas/Yanbu'a/Al-Quran/Murajaah — class roster views), **Orang Tua** (same 5 tabs — single child's data), **Santri** (same 5 tabs — self view, 16+ only) — built for **Hadir + Tugas + Yanbu'a**; Al-Quran/Murajaah remain placeholder pages. A 4th role (**Admin**) was also built with its own separate nav (§10), not part of the original 3-role design
  - [x] Note: prototype's top "Pilih Peran" switcher is **prototype-only** — production derives role from authenticated user via Supabase Auth + RLS, not a manual toggle — confirmed correct in the shipped `AuthContext`/RLS implementation
- [x] Bottom tab nav built in confirmed order: Hadir | Tugas | Yanbu'a | Al-Quran | Murajaah — plus a separate admin-only tab set (Pendaftaran | Kelas | Santri), shown instead of (never alongside) the above for `role=admin`
- [~] Top nav: logo left, language toggle (globe icon), notification bell with badge — logo + language toggle done; **notification bell not built** (no notifications feature exists yet)
- [x] Attendance check-in UI: 3-state per student (✓ present / clock late / ✕ absent), matching `attendance_status` enum
- [x] Streak/gold-accent treatment reserved specifically for achievement moments (Murajaah flame counter, "Sudah Hafal" badges) — not used elsewhere — followed for Yanbu'a's jilid-complete banner; Murajaah itself isn't built yet so that half is still N/A
- [ ] Accessibility pass: 44px minimum tap targets, tested on real Android 8+/iOS 13+ devices — 44px enforced in CSS (`min-h-11` convention) but never verified on real hardware
- [ ] **iOS Web Push tested specifically** — requires "Add to Home Screen" first on iOS 16.4+; not a given even though iOS technically supports it
- [ ] Notification center/list screen — design not yet reviewed in prototype batch; confirm before building

## 6. Security & Compliance

- [ ] Privacy Policy drafted (NL + ID), owned by PPME IT team, linked before any authentication step
- [ ] DPIA completed for children's data (PPME IT team ownership)
- [ ] Right-to-erasure flow implemented: cascade delete of student + all related records, with a technical spec (not just a policy bullet)
- [ ] GDPR Article 20 data export (CSV) implemented for parents
- [ ] Consent flow for under-16 students confirmed against the hybrid account model
- [ ] Basic OWASP Top 10 check on public Netlify Functions (input validation, rate limiting on endpoints like `push-subscribe`)

## 7. Testing & Monitoring

- [ ] Vitest unit tests for streak/mastery/notification logic
- [ ] Playwright E2E covering the 5 primary flows: attendance, homework, Yanbu'a, Al-Quran, Murajaah
- [ ] RLS policy tests automated in CI
- [ ] Netlify Analytics + Supabase Dashboard monitoring wired up; define who's alerted on scheduled function failures (silent otherwise)

## 8. Still Open — Resolve in Parallel, Non-Blocking

- [ ] **WhatsApp integration & budget** — Phase 3 feature (~€300/mo), not needed for MVP; push-only fallback already scoped
- [ ] **Multi-branch timing** — single-tenant recommended for Phase 1 (Den Haag only); revisit if PPME expands
- [ ] **Yanbu'a curriculum variants** — confirm whether the standard 7-jilid structure is universal at PPME, or if seed data needs adjusting

## 9. Year-End Curriculum Reports (New Feature, Milestone 6)

- [x] Migration 005 applied (`year_end_reports` table, `report_status`/`report_grade` enums, RLS, `reports` Storage bucket)
- [ ] `pdfkit` added as a dependency for the `publish-report` Function (ADR-011); confirm package size stays comfortably within Netlify Functions' limits
- [ ] PDF template designed: header (PPME logo + brand colors), attendance stats table, subject grades table, narrative section, footer (tutor name + publish date) — no existing prototype screen to reference, build against the app's established visual language
- [ ] New "Reports" tab/screen added to Parent and Student (16+) dashboards; new "Generate/Review Drafts" screen added to Tutor and Admin views
- [ ] `generate-year-end-drafts`, `publish-report`, `report-pdf` Functions implemented per OpenAPI contract
- [ ] Report-ready push notification wired into the existing notification pipeline (dedup, localized payload)
- [ ] i18n: `reports` namespace added to both locales (already drafted — 172 keys, parity-checked)
- [ ] RLS tests RLS-15 through RLS-21 passing (draft invisibility is the critical one — see test-plan.md §3)
- [ ] Right-to-erasure procedure updated to explicitly delete the student's Storage PDF object, not just the DB row (cascade delete doesn't reach Storage)
- [ ] Dry run: one real tutor publishes one real report before the actual year-end rollout, to catch UX/content issues early

## 10. Admin Enrollment (New Feature — built ahead of schedule, not in the original numbered order)

Not part of the original PRD/TAD feature list or this checklist's build order — built in response to a direct need (someone has to be able to get users into the system) rather than as a scheduled milestone. Scope deliberately narrowed to enrollment/setup only; see TAD ADR-012.

- [x] `/admin/registrations`, `/admin/classes`, `/admin/students` built (`src/features/admin/`)
- [x] Migration 008: `fn_pending_registrations()` — admin-only (enforced in the function itself), the only way to discover a Google sign-in with no `public.users` profile yet
- [x] Email invite flow: `netlify/functions/invite-user.mts` — creates `auth.users` + `public.users` together in one admin action, via `auth.admin.inviteUserByEmail()` under the service-role key
- [x] Admin nav is exclusive, not additive: `ADMIN_NAV_TABS` replaces the operational tabs for `role=admin`, and the operational routes/pages explicitly block admin (`AdminRestricted.tsx`, `RequireAdmin.tsx`) rather than relying on the nav being hidden as the only guard
- [x] Dev-only fixture sign-in panel (`src/dev/DevAuthSwitcher.tsx`) + `supabase/dev-fixture.sql` — lets the whole admin flow (and Milestone 1) be exercised locally without real Google OAuth
- [ ] No standalone "remove/deactivate a student" flow
- [ ] No CSV export (would need its own ADR-012 exception if pursued — it's operational data)
- [ ] Supabase Auth's Site URL / Redirect URLs allow-list needs to be correct on the live project for invite emails to land on the right domain — `invite-user.mts` passes an explicit `redirectTo` (Netlify's own `URL` env var) so this is no longer solely dependent on that dashboard setting, but the target must still be on the allow-list

## 11. Homework Assignments — Tugas (New Feature, Milestone 2)

Built against the existing schema/RLS (migrations 002/003 already covered `assignments`/`assignment_status`; no new migration needed) — same "verify against a real local Postgres+RLS stack" bar as Milestone 1.

- [x] Tutor view (`TutorAssignmentsView`): class roster → create assignment (title/description/due_date) → assign to the whole class or a hand-picked subset of students (checkbox list, all checked by default) → per-student status marking (Pending/Completed/Incomplete/Partial) with optional notes, same drill-down shape as `TutorYanbuaView`
- [x] Family view (`FamilyAssignmentsView`): parent/student list with Pending/Completed/Incomplete/Partial/**Overdue** badges — Overdue is computed client-side (`src/lib/assignments.ts#computeDisplayStatus`), not a stored value: `assignment_status_enum` has no `overdue` member, so a row still `pending` past its assignment's `due_date` is the only case that maps to it; once a tutor marks a verdict, it stands even past the due date
- [x] Wired into the existing `/assignments` route in `src/App.tsx` (was `FeaturePlaceholder`); `AssignmentsPage` blocks admin the same way Attendance/Yanbu'a do (`AdminRestricted`)
- [x] Two new i18n keys added (`assignments.statusOverdue`, `assignments.notes`) — the rest of the `assignments` namespace was already drafted ahead of this build and reused as-is
- [x] Unit tests for `computeDisplayStatus` (`tests/unit/assignments.test.ts`)
- [x] Verified against a local Postgres+PostgREST+RLS stack: full create → assign-to-subset → mark-complete → parent-sees-update flow exercised via curl with minted JWTs for the fixture tutor/two parents/16+ self-login student, confirming cross-family isolation on `assignment_status` (empty result, not just filtered), a parent's write attempt resolving to 0 rows (no parent write policy exists), and a cross-class tutor's `assignments` INSERT rejected with 403
- [ ] FR-005 (due-date reminder notifications) — deliberately out of scope for this milestone; needs Netlify Scheduled Functions, which don't exist yet for anything in this project (see §4, §8)

---

## Suggested Build Order

1. Repo + environments (§2) → 2. Database + RLS (§3) → 3. Auth flow (Google OAuth + role derivation) → 4. Ustadz attendance flow end-to-end (simplest, highest-value) → 5. Remaining Ustadz flows (Tugas, Yanbu'a, Al-Quran, Murajaah) → 6. Orang Tua views (read-mostly, reuses most backend work) → 7. Santri self-login (16+) → 8. Notifications/Functions (§4) → 9. PWA/offline polish (§5) → 10. Compliance docs finalized before any real student data is entered (§6)

**Status as of this writing:** 1–3 done. 4 done (Hadir). 5 partially done (Tugas + Yanbu'a done; Al-Quran/Murajaah still placeholders). 6 done for the three built flows (Hadir + Tugas + Yanbu'a), same pattern ready to reuse for the rest of 5 once built. 7 works structurally (RLS + the family views already handle `role=student`) but hasn't been exercised with a real 16+ self-login account. 8 barely started — `invite-user.mts` exists but none of the 5 originally-planned notification/streak Functions do; FR-005 (homework due-date reminders) is deliberately deferred with the rest of notifications, same reasoning as Milestone 1. 9 not started. 10 not started. Admin enrollment (§10) and Homework Assignments (§11 above) both landed out of the numbered order, in response to practical need rather than as scheduled milestones.
