# Test Plan — TPA PPME Den Haag

*Version 1.0 draft · Stack: Vitest (unit), Supabase CLI + pgTAP or SQL scripts (RLS), Playwright (E2E). CI: Netlify build + GitHub Actions.*

## 1. Scope & priorities

Priority order reflects risk, not feature order:

1. **RLS isolation** (children's data — a failure here is a GDPR incident, not a bug)
2. **Core flows** (attendance, progress recording — daily-use correctness)
3. **Streak & milestone logic** (edge-case-heavy)
4. **Notifications** (cross-platform quirks, silent failures)
5. **Offline/PWA behavior** (deferred if offline-writes descoped from MVP)
6. **i18n completeness**

Out of scope for MVP testing: load/performance (200 users on Supabase free tier is trivial), penetration testing (basic OWASP checklist only).

## 2. Environments

| Env | Purpose | Data |
|---|---|---|
| Local (Supabase CLI) | Unit + RLS tests, migration validation (`supabase db reset` must run 001→004 cleanly) | Synthetic fixtures only |
| Netlify Preview + Supabase branch/staging project | E2E per PR | Synthetic fixtures only |
| Production | Smoke tests post-deploy | Real data — **never** used in tests |

**Rule: no real student data in any test environment, ever.**

### Standard fixture set (used by RLS + E2E suites)

- 1 admin, 2 tutors (T1, T2), 3 parents (P1, P2, P3), 1 student account (S16, linked to P3's child)
- 2 classes: Class A (tutor T1), Class B (tutor T2)
- P1 has 2 children in Class A; P2 has 1 child in Class B; P3 has 1 child (16+, user_id set) in Class B
- Sessions, attendance, assignments, and progress rows for each child

## 3. RLS test suite (highest priority)

Run as SQL scripts with `set role authenticated; set request.jwt.claims` per persona, or via pgTAP. Every test asserts **both** the positive (allowed) and negative (denied/empty) case.

| ID | Assertion |
|---|---|
| RLS-01 | P1 SELECT students → sees exactly their 2 children; P2's child absent from results |
| RLS-02 | P1 SELECT attendance/yanbua/quran/murajaah rows of P2's child → 0 rows |
| RLS-03 | T1 SELECT students → Class A only; Class B students invisible |
| RLS-04 | T1 INSERT attendance for Class B student → rejected |
| RLS-05 | T1 INSERT yanbua_progress with tutor_id ≠ auth.uid() → rejected |
| RLS-06 | S16 SELECT own attendance/progress → rows returned; sibling/classmate rows → 0 |
| RLS-07 | S16 INSERT/UPDATE on any table → rejected (read-only role) |
| RLS-08 | P1 INSERT murajaah_log for own child's assignment → allowed; for P2's child → rejected |
| RLS-09 | P1 INSERT murajaah_log with confirmed_by ≠ auth.uid() → rejected |
| RLS-10 | Any non-admin UPDATE users.role (own or others) → rejected |
| RLS-11 | Non-admin INSERT/DELETE on students → rejected (enrollment is admin-only) |
| RLS-12 | Anonymous (no JWT) SELECT on every table → 0 rows / 401 |
| RLS-13 | Duplicate murajaah_log (same assignment_id + date) → 409 unique violation |
| RLS-14 | Admin can SELECT/modify all tables |
| RLS-15 | Tutor (T1) SELECT year_end_reports for Class A student, status=draft → row returned (own class, draft visible to tutor) |
| RLS-16 | Parent (P1) SELECT year_end_reports for own child, status=draft → 0 rows (drafts must never leak to parents) |
| RLS-17 | Parent (P1) SELECT year_end_reports for own child, status=published → row returned |
| RLS-18 | Parent (P1) SELECT year_end_reports for P2's child, any status → 0 rows |
| RLS-19 | S16 SELECT own year_end_reports, status=published → row returned; status=draft → 0 rows |
| RLS-20 | T2 (not the authoring tutor, different class) SELECT/PATCH a Class A report → rejected |
| RLS-21 | Non-service-role client attempts to read/write `storage.objects` in the `reports` bucket directly → rejected (no client-facing policy exists) |

**Gate: all RLS tests green in CI is a merge requirement for any migration change, and a launch requirement before real data entry (DPIA risk R1).**

## 4. Unit tests (Vitest)

### 4.1 Streak logic
- Consecutive daily confirmations increment streak (1→2→3)
- Gap of 1 day resets streak to 1
- `confirmed_today` boolean correct across CET/CEST midnight (test with fixed timezones around DST switch: last Sunday of March & October)
- Best-streak derivation from log history
- **3x_week / weekly frequency:** define expected behavior first (open design point flagged in migration 002), then test scheduled-period counting

### 4.2 Milestone detection
- Yanbu'a entry at page == jilid page_count with mastery `lancar` → jilid-complete event fires
- Same page with mastery `kurang_lancar`/`ulang` → no event
- Jilid 7 completion → program-complete variant

### 4.3 Notification payload builder
- Absence, new-assignment, due-tomorrow, milestone, reminder payloads render correctly in **both locales** based on recipient's `users.locale`
- Payload contains first name only, no progress details (DPIA risk R6)
- Dedup tag generated per (user, event-type, date)

### 4.4 Year-end report generation
- `generate-year-end-drafts` computes `attendance_present/absent/late` and `attendance_rate` that exactly match a hand-computed value from fixture attendance rows for the academic year window
- Re-running for an academic year that already has drafts/reports for a student does not create duplicates (unique constraint respected; function reports `skipped_existing` count)
- `publish-report`: status only flips to `published` after successful PDF generation; a simulated PDF-generation failure leaves status as `draft` (no partial state)
- `publish-report` on an already-published report (post-edit regeneration case) overwrites the existing `pdf_path` rather than creating a second object
- PDF content smoke test: generated PDF contains the student's name, academic year, attendance rate, and all three subject grades (basic text-extraction check, not visual regression)

*Implemented in `tests/unit/reports.test.ts`. Two notes for anyone extending these: the publish ordering is tested through `publishReportFlow`'s injected dependencies (a `renderPdf`/`uploadPdf` that throws must leave `markPublished` uncalled), which is why that ordering lives in its own module rather than inline in the Function; and the smoke test renders with `compress: false` and decodes pdfkit's hex `TJ` runs, since a plain substring search over a normal (FlateDecode) PDF finds only the `/Info` metadata.*

## 5. E2E flows (Playwright)

Run against Preview deploys with fixture data; auth mocked via Supabase test JWTs (bypasses live Google OAuth — OAuth itself covered once in a manual smoke test).

| ID | Flow | Persona |
|---|---|---|
| E2E-01 | Mark attendance for full class (mixed statuses) → submit → counters update → parent sees status | Tutor → Parent |
| E2E-02 | Create assignment → appears for class → parent + student views show it → tutor marks completed | Tutor → Parent → Student |
| E2E-03 | Record Yanbu'a progress → history timeline updates → jilid completion triggers milestone card | Tutor → Parent |
| E2E-04 | Record Quran tilawah with quality rating → position card updates | Tutor → Parent |
| E2E-05 | Parent confirms murajaah → streak increments → duplicate confirm same day blocked with friendly error | Parent |
| E2E-06 | 16+ student logs in → sees only own data across all 5 tabs → no write controls rendered | Student |
| E2E-07 | Language toggle ID↔NL → all visible strings switch, Arabic terms unchanged | All |
| E2E-08 | Unregistered Google account signs in → sees "contact admin" screen, no data | — |
| E2E-09 | Admin generates drafts for a class → tutor sees draft list → tutor writes narrative + sets 3 subject grades → publishes → parent receives notification and can view + download PDF; student (S16) can independently view + download the same report | Admin → Tutor → Parent → Student |
| E2E-10 | Tutor edits a published report's narrative → re-publish → PDF updates (old download link still resolves but now serves the new content, per FR-006's single-current-version model) | Tutor → Parent |

## 6. Notification & PWA test matrix (manual, real devices)

| Case | Android Chrome | iOS Safari (16.4+, installed to home screen) | Desktop Chrome |
|---|---|---|---|
| Permission prompt & subscribe | ☐ | ☐ | ☐ |
| Absence push received | ☐ | ☐ | ☐ |
| Milestone push received | ☐ | ☐ | ☐ |
| Scheduled reminder at 18:00 local (check after DST switch too) | ☐ | ☐ | ☐ |
| Dedup: same event twice → one notification | ☐ | ☐ | ☐ |
| iOS not-installed state → graceful explanation, no broken prompt | — | ☐ | — |
| App installable (manifest valid, icons 192/512/maskable) | ☐ | ☐ | ☐ |
| Offline: app shell loads, cached data visible, clear offline banner | ☐ | ☐ | ☐ |
| Offline write-queue (if in scope): attendance recorded offline syncs once online; double-submit on two devices resolves without data loss | ☐ | ☐ | — |

## 7. i18n completeness (automated)

- CI script asserts `id.json` and `nl.json` have identical key sets (already scripted)
- No hardcoded UI strings: lint rule / grep for literal Indonesian or Dutch text in components
- Pseudo-locale render test: no truncation at 44px tap targets with longer Dutch strings

## 8. Compliance verification (pre-launch gate)

- [ ] Right-to-erasure: deleting a fixture student cascades to all 9 related tables (incl. `year_end_reports`) — verified by row counts before/after
- [ ] Right-to-erasure also removes the student's PDF object(s) from the `reports` Storage bucket, not just the DB row. **Procedure (README → "Right to erasure"): delete the Storage object *first*, while `year_end_reports.pdf_path` can still be read, then delete the student** — `on delete cascade` reaches every table but never Storage, so doing it in the other order orphans the PDF with nothing left pointing at it. Verify with `select count(*) from storage.objects where bucket_id='reports' and name like '<student-uuid>/%'` → 0
- [ ] CSV export contains all and only the requesting parent's children's data
- [ ] Privacy policy link blocks first login until accepted
- [ ] Retention job dry-run: correctly identifies (does not yet delete) records past cutoff

## 9. Entry / exit criteria

**MVP (Milestone 1) exit:** RLS suite 100% green · E2E-01, E2E-03, E2E-07, E2E-08 green · notification matrix passed on ≥1 Android + 1 iOS device · compliance gate §8 items 1–3 done.

**GA (Milestone 5) exit:** full E2E suite green · full device matrix · §8 complete incl. retention dry-run · DPIA signed off by PPME IT team.

**Year-End Reports (Milestone 6) exit:** RLS-15 through RLS-21 green · E2E-09 and E2E-10 green · §4.4 unit tests green · PDF Storage erasure step (§8) verified · at least one real tutor has produced and published one report as a dry run before the actual academic year-end rollout.
