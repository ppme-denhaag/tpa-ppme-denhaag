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
| Recipients | Parents (own children only), tutors (own classes only), TPA admins; no third-party sharing |
| Processors | Supabase Inc. (database + auth; data region Frankfurt, DE), Netlify (hosting/functions, EU region), Google (OAuth identity provider only — no app data shared) |
| Transfers outside EU | None by design (Frankfurt data residency). **[IT TEAM]**: verify via Supabase DPA whether any sub-processor (support/telemetry) accesses data from outside the EU, and document SCCs if so. |
| Retention | Proposed: 3 years post-enrollment, then delete/anonymize. **[IT TEAM]**: confirm. |

## 3. Necessity & proportionality

- **Data minimization:** Only educational progress data is collected; no photos, no
  free-form health data (absence reason is a short optional text — see risk R4), no
  location, no behavioral tracking or analytics beyond aggregate hosting metrics.
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
| R4 | Absence "reason" field collects health data (e.g. "sakit") | Medium | Medium | Keep field optional and short; UI offers preset non-specific reasons (Sakit/Izin) instead of free text; exclude reason field from any export shared beyond parent+tutor; note in privacy policy |
| R5 | Data kept longer than needed | Medium | Medium | Scheduled retention job deletes/anonymizes records N years post-enrollment (**[IT TEAM]** confirm N=3); right-to-erasure cascade implemented and tested |
| R6 | Push notification content leaks child data on lock screens | Medium | Low | Notification text limited to first name + event type; no progress details or reasons in push payloads |
| R7 | 16+ student self-login sees more than intended | Low | Medium | Student RLS scope is read-only and limited to own `student_id`; automated tests cover sibling and classmate isolation |
| R8 | Volunteer tutors access data after leaving | Medium | Medium | Admin offboarding procedure: remove tutor from `classes.tutor_ids` immediately on departure; **[IT TEAM]**: add to volunteer onboarding/offboarding checklist |
| R9 | Community-built app lacks continuity (single maintainer) | Medium | Medium | Documentation set (PRD/TAD/API contract/migrations) maintained in repo owned by PPME IT team account, not a personal account |
| R10 | Year-end report PDF, once downloaded, is outside the app's access controls (parent can forward/print/share it freely) | Medium | Low-Medium | Inherent to any exportable document; mitigated by minimizing PDF content to what's appropriate for the parent to already hold (educational grades/narrative, no other students' data, no internal tutor-only notes); PDF is watermarked with recipient context (student name + academic year) implicitly via its content, deterring casual redistribution; accepted residual risk — flag for **[IT TEAM]** awareness rather than a technical control |

## 5. Data subject rights implementation

| Right | Implementation |
|---|---|
| Access / portability (art. 15/20) | Parent-facing CSV export of all data for their child(ren) |
| Rectification (art. 16) | Admin edits student records; users edit own profile |
| Erasure (art. 17) | Admin-triggered cascade delete of student + all related records (attendance, progress, murajaah, year-end reports); DB-level `on delete cascade` handles table rows automatically, but the year-end report PDF lives in Supabase **Storage**, which cascade does not reach — the erasure procedure must explicitly delete the corresponding Storage object(s) as a separate step; verified by test |
| Objection / restriction | Handled manually via **[contact email]**; documented procedure **[IT TEAM]** |

## 6. Consultation & sign-off

- [ ] **[IT TEAM]** Review Supabase DPA and sub-processor list — record conclusion in §2
- [ ] **[IT TEAM]** Confirm lawful basis (§3) and retention period (§2)
- [ ] **[IT TEAM]** Confirm breach-response owner (§4 R3)
- [ ] **[IT TEAM]** Parent representative consulted (recommended: brief the parent community before launch)
- [ ] Sign-off: name, role, date: `[...]`
- [ ] Review date: `[launch + 12 months]`
