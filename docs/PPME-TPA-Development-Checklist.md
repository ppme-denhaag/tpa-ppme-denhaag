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
- [x] `generate-year-end-drafts.mts`, `publish-report.mts`, `report-pdf.mts` built (§9) — the 2nd–4th Functions, and the 2nd–4th holders of the service-role key. Their shared authorization shape (validate the JWT with an anon-key client, then look the role up independently with the service-role client) is now factored into `netlify/functions/lib/callerAuth.ts` rather than copied per Function

## 5. Frontend / PWA (build against the validated prototype)

- [x] `manifest.json` + icon set using the real PPME logo — configured (192/512/maskable) in `vite.config.ts`; **icons are still a low-res upscale** from a 135×70px source, real high-res asset still needed before launch (see README "Known gaps")
- [~] Service worker via Workbox: app-shell precaching done (`vite-plugin-pwa`, `generateSW`); runtime caching per route and **background sync queue for offline attendance/murajaah submissions not built** — attendance currently requires being online
- [ ] IndexedDB offline queue tested for conflict resolution (e.g., tutor marks attendance offline on two devices before sync)
- [x] Role-based routing/dashboards for the 3 roles shown in the prototype: **Ustadz** (Hadir/Tugas/Yanbu'a/Al-Quran/Murajaah — class roster views), **Orang Tua** (same 5 tabs — single child's data), **Santri** (same 5 tabs — self view, 16+ only) — built for all 5 tabs (**Hadir + Tugas + Yanbu'a + Al-Quran + Murajaah**). A 4th role (**Admin**) was also built with its own separate nav (§10), not part of the original 3-role design
  - [x] Note: prototype's top "Pilih Peran" switcher is **prototype-only** — production derives role from authenticated user via Supabase Auth + RLS, not a manual toggle — confirmed correct in the shipped `AuthContext`/RLS implementation
- [x] Bottom tab nav built in confirmed order: Hadir | Tugas | Yanbu'a | Al-Quran | Murajaah — plus a separate admin-only tab set (Pendaftaran | Kelas | Santri), shown instead of (never alongside) the above for `role=admin`
- [~] Top nav: logo left, language toggle (globe icon), notification bell with badge — logo + language toggle done; **notification bell not built** (no notifications feature exists yet)
- [x] Attendance check-in UI: 3-state per student (✓ present / clock late / ✕ absent), matching `attendance_status` enum
- [x] Streak/gold-accent treatment reserved specifically for achievement moments (Murajaah flame counter, "Sudah Hafal" badges) — not used elsewhere — followed for Yanbu'a's jilid-complete banner and now Murajaah's streak number + "mark memorized"/portfolio badges (§13)
- [ ] Accessibility pass: 44px minimum tap targets, tested on real Android 8+/iOS 13+ devices — 44px enforced in CSS (`min-h-11` convention) but never verified on real hardware
- [ ] **iOS Web Push tested specifically** — requires "Add to Home Screen" first on iOS 16.4+; not a given even though iOS technically supports it
- [ ] Notification center/list screen — design not yet reviewed in prototype batch; confirm before building

## 6. Security & Compliance

- [ ] Privacy Policy drafted (NL + ID), owned by PPME IT team, linked before any authentication step
- [ ] DPIA completed for children's data (PPME IT team ownership)
- [~] Right-to-erasure flow: cascade delete of student + all related records is in place at the DB layer, and the **manual** procedure is now written down step by step (README "Right to erasure"), including deleting the year-end report PDF from Storage first — `on delete cascade` never reaches Storage. Still no admin-facing UI or automated flow
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

Built against the existing schema/RLS (migration 005 already covered
`year_end_reports`, the enums, the policies and the `reports` bucket; no new
migration needed) — same "verify against a real local Postgres+RLS stack" bar
as Milestones 1–4, plus a `netlify dev` layer this time, since the three
Functions below hold the service-role key and can't be exercised through
plain PostgREST calls the way the RLS-only features could.

- [x] Migration 005 applied (`year_end_reports` table, `report_status`/`report_grade` enums, RLS, `reports` Storage bucket)
- [x] `pdfkit` added as a dependency for the `publish-report` Function (ADR-011) — 8.2 MB installed (mostly standard-font metrics), well inside Netlify's 50 MB zipped / 250 MB unzipped Function limits, and no headless browser to cold-start; a report renders in well under a second locally
- [x] PDF template designed: brand header band, attendance stats table, subject grades table, narrative section, footer (tutor name + publish date) — labels are **bilingual ID/NL in one document** rather than rendered per recipient locale, so there is exactly one current PDF per report (FR-006) and no ambiguity about which language the stored object is in. Header is a typographic wordmark, not the bitmap logo: the only logo asset is 135×70px (README "Known gaps"), and bundling it would add a runtime file-resolution path that behaves differently under `netlify dev` and deployed Netlify
- [x] New "Reports" screen for Parent and Student 16+ (`FamilyReportsView`, reached from the dashboard tile — the 5-tab nav order is prototype-validated and deliberately unchanged); tutor review/publish screen (`TutorReportsView` → `ReportEditor`); admin generate-only screen (`/admin/reports`, added to `ADMIN_NAV_TABS`)
- [x] `generate-year-end-drafts`, `publish-report`, `report-pdf` Functions implemented per the OpenAPI contract, which was updated where the build found it wrong: `skipped_no_tutor` added to the generate response (a student with no class, or a class with no tutor, can't have an author — `tutor_id` is NOT NULL), `publish-report` narrowed to the authoring tutor only (ADR-013) and given a 400 for an empty narrative, `report-pdf` documented as denying admin
- [x] **Decision on the "Admin-triggered" generation call (TAD ADR-013)**: bulk generation needs an enrollment-wide view, which only admin has, so the trigger is admin's — but `/admin/reports` is content-blind, showing only `created_count`/`skipped_existing`/`skipped_no_tutor`, never a draft list, narrative or grade. `/reports` still blocks admin (`AdminRestricted`), `report-pdf` refuses admin outright, and publishing is authoring-tutor-only. Keeps ADR-012 intact instead of quietly widening it
- [x] **Decision on the Storage path**: `{student_id}/{academic_year with / → -}.pdf`. The TAD's literal `{academic_year}.pdf` would nest each report a directory deeper, since Storage reads `/` as a separator. Deterministic per student+year, which is what makes re-publish overwrite in place rather than accumulate versions
- [ ] Report-ready push notification (FR-007) — deliberately out of scope for this milestone, same reasoning as Homework's FR-005, the Quran milestone celebration and Murajaah's FR-006; needs Netlify Scheduled Functions/webhook infra, which don't exist yet for anything in this project (see §4, §8). Publishing notifies nobody; `reports.notification` stays drafted-but-unused in both locales
- [x] i18n: `reports` namespace was pre-drafted at **30 keys per locale** (not the 172 this line previously claimed — corrected after counting); 19 genuinely-missing keys added for the review/publish/generate forms (`academicYearLabel`, `academicYearInvalid`, `classScope`, `allClasses`, `skippedExisting`, `skippedNoTutor`, `adminScopeNote`, `subjectYanbua`, `subjectQuran`, `subjectMurajaah`, `subjectNotes`, `notGraded`, `narrativeRequired`, `readOnlyOtherTutor`, `noDraftsForClass`, `republish`, `progressContext`, `murajaahTargets`, `saved`) → **49 per locale, parity-checked by the existing CI test**. `confirmPublish` was also reworded in both locales to stop promising a notification that FR-007 doesn't send. `reviewDraft`, `editPublished`, `notPublishedYet` and `notification` remain unused
- [x] RLS tests RLS-15 through RLS-21 passing — unchanged by this milestone (no migration), re-run green as part of the full 38-assertion suite against a fresh local stack before and after the build
- [x] Right-to-erasure procedure updated to explicitly delete the student's Storage PDF object, not just the DB row (cascade delete doesn't reach Storage) — concrete runbook in README ("Right to erasure"), referenced from TAD "Other Artifacts" and test-plan.md §8
- [x] Unit tests for the §4.4 assertions (`tests/unit/reports.test.ts`, 15 cases): hand-computed stats accuracy, duplicate-generation skip counts, publish atomicity (an injected PDF-render failure and an injected Storage failure both leave `markPublished` uncalled), re-publish overwriting one object, and a PDF text-extraction smoke test for name/year/attendance rate/grades/tutor
- [x] Verified against a local Postgres+PostgREST+RLS stack **plus `netlify dev`**: 53 assertions via curl with minted JWTs for admin/two tutors/two parents/16+ student — non-admin generate rejected (403), invalid academic year rejected, first run creates 3 for one class, stats matching hand-computed 92.30/100.00/84.60 with an out-of-window session correctly excluded, re-run creating 0 and skipping 3, all-classes run adding only the remaining student, drafts invisible to parent and 16+ student via PostgREST, publish rejected with an empty narrative (status still `draft`), co-tutor and parent publish attempts rejected, publish → PDF in the bucket → status flipped, parent/tutor/16+-student signed URLs served and cross-family/admin/draft cases refused, then an edit + re-publish overwriting the same object with the same `published_at` and the corrected text inside the regenerated PDF. Also a scripted Playwright click-through of E2E-09/E2E-10 against `netlify dev` + `DevAuthSwitcher` (admin generate → tutor review/grade/publish → parent view + PDF download → admin blocked from `/reports`) with zero browser console errors; not committed to CI, which has neither the Functions runtime nor fixture data
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

## 12. Quran Recitation Progress Tracking — Al-Quran (New Feature, Milestone 3)

Built against the existing schema/RLS (migrations 002/003/004 already covered `quran_progress`/`surahs`; no new migration needed) — same "verify against a real local Postgres+RLS stack" bar as Milestones 1–2.

- [x] Tutor view (`TutorQuranView`): class roster → select student → record recitation session (surah via a searchable native `<select>` against the seeded `surahs` reference table, ayah_from/ayah_to range, `quran_quality` rating, optional tajweed notes), same roster-drill-down shape as `TutorYanbuaView`/`TutorAssignmentsView`
- [x] Family view (`FamilyQuranView`): parent/student current-position summary (surah, ayah reached, approximate whole-Quran completion %) + chronological recitation history with quality badges, mirroring `FamilyYanbuaView`'s `CurrentLevelCard`/timeline shape
- [x] **Decision on `students.current_surah`/`current_ayah`** (migration 002, never written by any prior code): current position is derived client-side from the latest `quran_progress` row rather than maintained as a second write path — see `src/lib/quran.ts`'s docstring and the TAD domain model footnote. Matches Yanbu'a's client-side jilid-completion detection (README "Known gaps") rather than introducing a new denormalization-sync pattern
- [x] Wired into the existing `/quran` route in `src/App.tsx` (was `FeaturePlaceholder`); `QuranPage` blocks admin the same way Attendance/Yanbu'a/Assignments do (`AdminRestricted`)
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
- [x] **Decision on "current streak" display**: `murajaah_log.streak_count` is set by the `fn_set_streak_count` trigger on INSERT only — there's no scheduled job to zero it out when a day is missed (Netlify Scheduled Functions don't exist yet, see §4/§8), so a live "current streak" number can't actually be verified by the system between confirmations. The UI shows the latest log's streak_count together with its date instead of asserting a live figure — see `src/lib/murajaah.ts`'s docstring
- [x] **Decision on FR-005/FR-007's tutor TPA assessment**: there is no RLS write path from a tutor into `murajaah_log` (`mlog_tutor_read` is read-only; only `mlog_parent_insert`, scoped to the parent's own children, can write) and `murajaah_assignments` has no quality/assessment column — "if Hafal Lancar, mark as Memorized and assign next portion" resolves entirely through `murajaah_assignments.active` (tutor already has full RW there), applied as a tutor action rather than persisted as a separate assessment record — see `src/features/murajaah/api.ts`'s docstring and the TAD domain model footnote
- [x] Wired into the existing `/murajaah` route in `src/App.tsx` (was `FeaturePlaceholder`); `MurajaahPage` blocks admin the same way Attendance/Yanbu'a/Assignments/Quran do (`AdminRestricted`)
- [x] Nine new i18n keys added (`murajaah.fieldQuality`, `assignNew`, `targetAssigned`, `markMemorized`, `portfolio`, `noActiveTarget`, `tabAssign`, `tabOverview`, `history`) — the rest of the `murajaah` namespace was already drafted ahead of this build and reused as-is; `murajaah.assignedBy` and `murajaah.reminder` remain unused (the former needs a `users` read policy exposing a tutor's name to parents that doesn't exist — no other feature shows a "recorded by" name to families either — and the latter is FR-006, deferred with the rest of notifications)
- [x] Unit tests for `isStreakCurrent`/`startOfWeekLocalDate` (`tests/unit/murajaah.test.ts`)
- [x] Verified against a local Postgres+PostgREST+RLS stack: tutor own-class insert, tutor `tutor_id` impersonation rejected, cross-class tutor insert rejected, tutor `active` PATCH (mark memorized) on own-class vs. cross-class (0 rows, not an error), parent read of own child, parent cross-family read returns empty, parent write attempt on `murajaah_assignments` rejected (no parent write policy), parent confirms `murajaah_log` for own child, parent `confirmed_by` impersonation rejected, parent cross-family `murajaah_log` insert rejected, tutor `murajaah_log` write attempt rejected (read-only), tutor read of own-class log, 16+ self-login student reads own rows only, student write attempt rejected, anonymous read returns empty, duplicate same-day confirmation rejected (unique violation) — plus a dedicated streak-trigger sequence confirming two consecutive days yields `streak_count=2` and a gap day resets it to 1 — 18 cases via curl with minted JWTs, plus a full click-through via `netlify dev`-equivalent (`npm run dev` + `DevAuthSwitcher`) as tutor and parent with zero browser console errors
- [ ] FR-006 (daily practice reminders) — deliberately out of scope for this milestone, same reasoning as Homework's FR-005 and the Quran milestone-celebration notification; needs Netlify Scheduled Functions/webhook infra, which don't exist yet for anything in this project (see §4, §8)

---

## Suggested Build Order

1. Repo + environments (§2) → 2. Database + RLS (§3) → 3. Auth flow (Google OAuth + role derivation) → 4. Ustadz attendance flow end-to-end (simplest, highest-value) → 5. Remaining Ustadz flows (Tugas, Yanbu'a, Al-Quran, Murajaah) → 6. Orang Tua views (read-mostly, reuses most backend work) → 7. Santri self-login (16+) → 8. Notifications/Functions (§4) → 9. PWA/offline polish (§5) → 10. Compliance docs finalized before any real student data is entered (§6)

**Status as of this writing:** 1–3 done. 4 done (Hadir). 5 done (Tugas + Yanbu'a + Al-Quran + Murajaah, all built). 6 done for all five built flows plus the new Reports screen (Hadir + Tugas + Yanbu'a + Al-Quran + Murajaah + Rapor). 7 works structurally (RLS + the family views already handle `role=student`, and the 16+ student's own year-end report read + PDF download were exercised end-to-end against the local stack) but still hasn't been through a real Google 16+ self-login account. 8 barely started — `invite-user.mts` plus the three year-end-report Functions (`generate-year-end-drafts`, `publish-report`, `report-pdf`) exist, but none of the 5 originally-planned notification/streak Functions do; FR-005 (homework due-date reminders), the Quran milestone-celebration notification, Murajaah's FR-006 (daily practice reminders) and the year-end report's FR-007 (report-ready push) are all deliberately deferred with the rest of notifications, same reasoning as Milestone 1. 9 not started. 10 not started. Admin enrollment (§10) and Homework Assignments (§11) both landed out of the numbered order, in response to practical need rather than as scheduled milestones; Quran (§12) and Murajaah (§13) both landed in their intended §5 slot; Year-End Curriculum Reports (§9) is the first milestone to need Netlify Functions with the service-role key, and so the first that had to be verified through `netlify dev` rather than PostgREST alone. Every route in `src/App.tsx` now resolves to a real feature — `FeaturePlaceholder` was deleted with the last one.
