# Data Protection Impact Assessment (DPIA) — DRAFT
## TPA PPME Den Haag Progress-Tracking App

> **STATUS: WORKING DRAFT** for completion and sign-off by the PPME Den Haag IT team
> (confirmed owner of GDPR/DPIA execution; PPME Den Haag remains the legal data
> controller). Written in English as an internal working document — translate the
> final version if required by internal policy. Sections marked **[IT TEAM]** need
> input or a decision.

---

## 1. Why a DPIA?

A DPIA is advisable (and arguably required under GDPR art. 35) because the processing
involves **systematic monitoring of children's educational progress at scale**
(~200 students, majority under 16), in an organizational context that is religious in
nature. Even though the app stores only educational progress data, the combination of
(a) vulnerable data subjects (children) and (b) the religious context of the
organization warrants a documented assessment.

## 2. Description of the processing

| Aspect | Description |
|---|---|
| Purpose | Track attendance, homework, Yanbu'a reading progress, Quran recitation, and home memorization (murajaah) for TPA students; inform parents via push notifications |
| Data subjects | Students (majority <16), parents/guardians, volunteer tutors, admins |
| Data categories | Identity (name, DOB), contact (email via Google account — parents/tutors/16+ students only), educational progress, attendance incl. absence reasons, push subscription tokens |
| Recipients | Parents (own children only), tutors (own classes only), TPA admins (**all students, all data, read and write** — see §3 and R11); no third-party sharing |
| Processors | Supabase Inc. (database + auth; data region Frankfurt, DE), Netlify (hosting/functions, EU region), Google (OAuth identity provider; **and, for users who enable notifications, Firebase Cloud Messaging as the browser's push service** — see below), **Resend (transactional email, EU region — TAD ADR-018)** |
| Transfers outside EU | **Not "none" any more, for one optional feature.** All stored data stays in Frankfurt by design. But Web Push delivery necessarily goes through the *browser's own* push service, which for Chrome and Android is Firebase Cloud Messaging (Google, servers outside the EU); Firefox uses Mozilla's, Safari uses Apple's. This is not a supplier we can swap — the browser chooses it — and TAD ADR-009 ("no third-party service needed") is true only in the sense that we pay nobody and integrate with nobody. What that service receives is bounded: the payload is encrypted end-to-end under the Web Push protocol (the intermediary cannot read it), and the payload itself is limited to a child's first name and an event type (R6). It also receives the device's push endpoint and delivery metadata. **Mitigation available to families**: notifications are off by default and opt-in per account.<br><br>**Email (Resend) is a separate matter and stays in the EU.** Transactional email (ADR-018) goes through Resend with its **EU region** selected, chosen so mail sits under the same residency reasoning as Frankfurt/Supabase and EU-region Netlify. Unlike push, this *is* a supplier we choose, so the region is ours to set — but it has to be set in Resend's dashboard before real families are invited, because it cannot be applied retroactively to mail already sent. What Resend receives is the recipient's email address and the rendered message; for the invitation template that is the recipient's own name and address and nothing about a child. **[IT TEAM]**: add Resend to the processing register and put a DPA in place; confirm the EU region is actually selected before the first real invitation. **[IT TEAM]**: record this in the processing register and complete a Chapter V transfer assessment for it; and separately, verify via the Supabase DPA whether any sub-processor (support/telemetry) accesses stored data from outside the EU, documenting SCCs if so. |
| Retention | Proposed: 3 years post-enrollment, then delete/anonymize. **[IT TEAM]**: confirm. |

## 3. Necessity & proportionality

- **Data minimization:** Only educational progress data is collected; no photos, no
  free-form health data (absence reason is a short optional text — see risk R4), no
  location, no behavioral tracking or analytics beyond aggregate hosting metrics.
- **Who inside the organization can see what:** access is need-to-know by role and
  enforced at the database layer (Row Level Security), not merely in the interface.
  A parent sees only their own children; a tutor sees only the classes they are
  assigned to; a 16+ student sees only their own record, read-only. **The `admin`
  role is the exception: it can read *and* modify every student's attendance,
  homework, Yanbu'a/Quran/Murajaah progress and year-end reports, across the whole
  TPA.** That was always true of the database policies; since TAD ADR-014 it is also
  true of the application, which previously hid those screens from admin.

  **One person may hold more than one of these positions** — a tutor whose own child
  attends, an administrator who also teaches — and the access that results is the
  union of what each position grants, never more (TAD ADR-019). This is not a new
  state of affairs: the policies have always been written against the relationship a
  person holds (parent of this child, tutor of this class) rather than against a
  role label, so nothing about it depends on the application asking the right
  question. It is now asserted directly in the test suite (test-plan.md §3,
  RLS-28…RLS-33), including that each half keeps its own limits — a tutor-parent
  cannot record progress for their own child, and cannot see their own child's
  unpublished report merely because they teach someone else's.

  This is assessed as proportionate for a ~200-student community programme with a
  handful of volunteer administrators: someone has to be able to cover a session for
  an absent tutor, correct a mis-recorded absence, and finish a year-end report at
  the end of term, and the alternative — an administrator who can enrol a child but
  cannot fix a single record about them — pushed that work into email and paper,
  outside any access control at all. It is a *breadth* decision, not a *category*
  one: admin sees the same educational-progress data everyone else does, no new
  field is collected, and nothing is disclosed outside the organization.

  Two boundaries are kept deliberately, and both are about attribution rather than
  confidentiality: only a parent can confirm that a child practised at home (the
  record means "a parent watched this"), and only the tutor who wrote a year-end
  report can publish it to the family. **[IT TEAM]** should keep the number of admin
  accounts small and named (not shared), require 2FA on the Google accounts behind
  them, and treat admin offboarding at least as promptly as tutor offboarding
  (R11). Note that the app keeps no audit log, so an administrative correction is
  not attributable after the fact.
- **Lawful basis:** **[IT TEAM]** to confirm: consent by parent at enrollment
  (recommended for clarity given the community context) vs. legitimate interest.
  For under-16 students, parental consent is obtained at enrollment regardless.
- **Special category data (art. 9):** The app does not record religious beliefs as a
  data field. However, enrollment in an Islamic educational program could allow an
  inference of religious affiliation. **[IT TEAM]** should document the position that
  processing is limited to members' educational administration within a religious
  not-for-profit body (cf. art. 9(2)(d) GDPR) and that data is never disclosed
  outside the organization without consent.
- **Proportionality of monitoring:** Progress tracking mirrors what tutors already
  record on paper today; the app digitizes an existing practice rather than creating
  new surveillance.

## 4. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Cross-family data leakage (parent A sees parent B's child) | Low (if tested) | High | Row Level Security at DB layer for every table; automated RLS test suite in CI asserting negative access (test-plan.md §3); policies reviewed before real data entry |
| R2 | Unauthorized account gets access (compromised Google account) | Low | High | Auth delegated to Google (2FA available); role stored server-side, not client-claimable; users cannot change their own role (enforced in RLS) |
| R3 | Data breach at processor | Low | High | EU-region processors with DPAs; AES-256 at rest, TLS 1.3 in transit; no secrets in repo; breach-notification duties in DPA. **[IT TEAM]**: define internal breach response (who notifies AP within 72h) |
| R4 | Absence "reason" field collects health data (e.g. "sakit") | Medium | Medium | Keep field optional and short; UI offers preset non-specific reasons (Sakit/Izin) instead of free text; exclude reason field from any export shared beyond parent+tutor; note in privacy policy. The absence *notification* is one such export and excludes it — see R6: the reason is not merely omitted from the message, it is never sent out of the database |
| R5 | Data kept longer than needed | Medium | Medium | Scheduled retention job deletes/anonymizes records N years post-enrollment (**[IT TEAM]** confirm N=3); right-to-erasure cascade implemented and tested. **Partly implemented as of ADR-017**, for the one table that needed it first: the in-app notification centre (`public.notifications`) is the only store here that grows because *time passed* rather than because someone recorded something — three scheduled Functions between them can write a row per child per day regardless of activity. `prune-notifications` deletes past **90 days**, a window chosen to outlast the longest-lived reason to open the list (a year-end report notification a parent may not act on for weeks), and reports its cutoff and delete count so a review has something to read. It is a separate job rather than folded into the weekly digest precisely because retention is an obligation and the digest is a courtesy. The broader N-years question for progress data is still open and still **[IT TEAM]**'s |
| R6 | Push notification content leaks child data on lock screens | Medium | Low | **Implemented and tested** (TAD ADR-015). Notification text limited to first name + event type; no progress details or reasons in push payloads. Three controls, deliberately layered so none of them is the only one: (a) *structural* — the payload builder accepts no parameter that could carry a reason, grade or position, so there is no channel through which one could reach a lock screen even by mistake, and it takes a full name and reduces it to the first token; (b) *the copy itself* — lock-screen strings live in their own `notifications.push.*` block, and a unit test rejects any string there that interpolates anything other than the child's name, so the limit survives a future event type being added; the richer wording the Notification Spec drafted (jilid number, surah name) is kept for the in-app list, shown only after sign-in; (c) *the wire* — the database webhook sends only the changed row's id, so the absence `reason` never leaves Postgres at all (asserted as WH-06 in the pgTAP suite, and WH-09 for the assignment title). All **eight** notification types now live are held to the same limit — no absence reason, no jilid number, no surah name, no assignment title, no grades, no attendance percentage — and each is verified live with the sensitive value actually present on the triggering row (test-plan §6). The weekly digest (ADR-016(g)) is where this bit hardest: the Scheduler table had specified a push carrying "attendance %, new progress", which is the single figure a family would least like read over their shoulder, so the notification says only that a summary is ready and the summary itself lives behind the login, on the dashboard. Two further controls were added in ADR-016 after they turned out to be missing: (d) *the dedup tag now identifies the child*, so a parent of two absent children is told about both rather than one silently replacing the other — a fix to a delivery bug, but it is also what makes the notification's own promise true; and (e) *no Function's HTTP response carries a dedup tag*, since a tag is `event:userId:studentId:date` and the scheduled Functions answer unauthenticated requests in at least one environment. Residual: the child's first name does appear on an unlocked-but-idle screen, which is the point of the notification; a family that considers even that too much can turn notifications off per account.<br><br>**R6 does not extend to the in-app notification centre, deliberately** (ADR-017(h)). Its threat model is a lock screen; the centre's rows are readable only by an authenticated recipient, so they carry the richer wording the Notification Spec originally drafted — the jilid number, the surah, the assignment title. That is the two-tier split ADR-015(b) promised, and the unit suite now enforces it in both directions: every in-app string is checked to name the child, and every push string is rejected if it interpolates `{{number}}`, `{{surah}}`, `{{title}}`, `{{date}}` or `{{count}}`. The centre adds three access-control facts of its own, each asserted in pgTAP: only the addressee reads a notification (NC-01/NC-02), **admin reads none at all** — the one place ADR-014's super admin does not reach, since an inbox of every family's messages adds nothing to running the TPA (NC-09) — and no client role can create or delete one (NC-06/NC-07), so nobody can put words in the TPA's mouth on another parent's screen |
| R7 | 16+ student self-login sees more than intended | Low | Medium | Student RLS scope is read-only and limited to own `student_id`; automated tests cover sibling and classmate isolation |
| R8 | Volunteer tutors access data after leaving | Medium | Medium | Admin offboarding procedure: remove tutor from `classes.tutor_ids` immediately on departure; **[IT TEAM]**: add to volunteer onboarding/offboarding checklist |
| R11 | **A privileged (`admin`) account is retained after the holder leaves, or is compromised** | Low–Medium | **High** | The larger version of R8: an admin reads and writes every student's data across the whole TPA, so the same lapse that costs one class's data for a departed tutor costs all of it here. Controls: (a) keep admin accounts few and individually named — never a shared committee login; (b) require 2FA on the underlying Google account (the app has no password of its own, so account security *is* Google account security — R2); (c) offboarding is a role change or profile deletion in `public.users` and must happen the same day, ahead of tutor offboarding in the checklist; (d) periodic review — **[IT TEAM]** to set a cadence — of who currently holds `role = 'admin'`. Residual: there is no audit log, so an administrative read is invisible and an administrative write is only attributable where the row records who created it. **[IT TEAM]**: decide whether an audit trail is required before launch, or accepted as residual risk for a volunteer-run community app |
| R9 | Community-built app lacks continuity (single maintainer) | Medium | Medium | Documentation set (PRD/TAD/API contract/migrations) maintained in repo owned by PPME IT team account, not a personal account |
| R10 | Year-end report PDF, once downloaded, is outside the app's access controls (parent can forward/print/share it freely) | Medium | Low-Medium | Inherent to any exportable document; mitigated by minimizing PDF content to what's appropriate for the parent to already hold (educational grades/narrative, no other students' data, no internal tutor-only notes); PDF is watermarked with recipient context (student name + academic year) implicitly via its content, deterring casual redistribution; accepted residual risk — flag for **[IT TEAM]** awareness rather than a technical control |

## 5. Data subject rights implementation

| Right | Implementation |
|---|---|
| Access / portability (art. 15/20) | Parent-facing CSV export of all data for their child(ren) |
| Rectification (art. 16) | Admin edits student records *and* the operational records about them (attendance, progress, report narratives and grades) directly in the app since ADR-014 — previously only enrolment fields were correctable without a database intervention; users edit own profile |
| Erasure (art. 17) | Admin-triggered cascade delete of student + all related records (attendance, progress, murajaah, year-end reports); DB-level `on delete cascade` handles table rows automatically, but the year-end report PDF lives in Supabase **Storage**, which cascade does not reach — the erasure procedure must explicitly delete the corresponding Storage object(s) as a separate step; verified by test |
| Objection / restriction | Handled manually via **[contact email]**; documented procedure **[IT TEAM]** |

## 6. Consultation & sign-off

- [ ] **[IT TEAM]** Review Supabase DPA and sub-processor list — record conclusion in §2
- [ ] **[IT TEAM]** Resend: DPA in place, EU region confirmed selected, and `tpa.ppmedenhaag.nl` verified — all three before the first real invitation is sent (TAD ADR-018). The region in particular cannot be fixed after the fact for mail already delivered
- [ ] **[IT TEAM]** Chapter V transfer assessment for Web Push delivery via the browser's push service (Firebase Cloud Messaging for Chrome/Android) — see §2 "Transfers outside EU". Notifications are opt-in and off by default, and the payload is encrypted and content-limited, but the transfer is real and should be documented rather than assumed away
- [ ] **[IT TEAM]** Confirm lawful basis (§3) and retention period (§2)
- [ ] **[IT TEAM]** Confirm breach-response owner (§4 R3)
- [ ] **[IT TEAM]** Sign off on the super-admin role (§3, §4 R11) — number of admin accounts, 2FA requirement, offboarding cadence, and whether an audit log is required before launch. **This one gates real student data**, not just the DPIA
- [ ] **[IT TEAM]** Parent representative consulted (recommended: brief the parent community before launch)
- [ ] Sign-off: name, role, date: `[...]`
- [ ] Review date: `[launch + 12 months]`
