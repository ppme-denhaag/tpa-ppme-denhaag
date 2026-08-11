-- ============================================================
-- TPA PPME Den Haag — RLS automated test suite (pgTAP)
--
-- Implements RLS-01 through RLS-21 from docs/test-plan.md §3, using
-- the "standard fixture set" described in test-plan.md §2:
--   1 admin, 2 tutors (T1, T2), 3 parents (P1, P2, P3), 1 student
--   account (S16, linked to P3's child); 2 classes (A: T1, B: T2);
--   P1 has 2 children in Class A; P2 has 1 child in Class B; P3 has
--   1 child (16+, user_id set) in Class B.
--
-- Runs entirely inside one transaction that is rolled back at the end
-- (see ROLLBACK at the bottom), so it never leaves fixture data behind
-- — safe to run against `--linked` (the live project) or `--local`.
--
-- Connects as the `postgres` role (table owner), which is exempt from
-- RLS by default — used only for fixture setup. Every assertion below
-- explicitly switches to the `authenticated` or `anon` Postgres role
-- plus the relevant `request.jwt.claim.sub`/`role` GUCs to impersonate
-- a specific persona, matching how PostgREST evaluates RLS in
-- production (see auth.uid()/auth.role() definitions).
-- ============================================================

begin;

select no_plan();

create temp table _tap_log(id serial primary key, line text);
grant all on _tap_log to anon, authenticated, service_role;
grant all on _tap_log_id_seq to anon, authenticated, service_role;

-- ---------- Fixtures ----------
-- (as postgres — bypasses RLS by table ownership)

-- auth.users (minimal valid rows; only `id` is NOT NULL)
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local',   '', now(), '{}', '{}', false, false, now(), now()),
  ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't1@test.local',      '', now(), '{}', '{}', false, false, now(), now()),
  ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't2@test.local',      '', now(), '{}', '{}', false, false, now(), now()),
  ('90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'p1@test.local',      '', now(), '{}', '{}', false, false, now(), now()),
  ('90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'p2@test.local',      '', now(), '{}', '{}', false, false, now(), now()),
  ('90000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'p3@test.local',      '', now(), '{}', '{}', false, false, now(), now()),
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 's16@test.local',     '', now(), '{}', '{}', false, false, now(), now());

-- public.users profiles
insert into public.users (id, email, full_name, role, locale)
values
  ('a0000000-0000-0000-0000-000000000000', 'admin@test.local', 'Admin Test',   'admin',   'id'),
  ('70000000-0000-0000-0000-000000000001', 't1@test.local',    'Tutor One',    'tutor',   'id'),
  ('70000000-0000-0000-0000-000000000002', 't2@test.local',    'Tutor Two',    'tutor',   'id'),
  ('90000000-0000-0000-0000-000000000001', 'p1@test.local',    'Parent One',   'parent',  'id'),
  ('90000000-0000-0000-0000-000000000002', 'p2@test.local',    'Parent Two',   'parent',  'id'),
  ('90000000-0000-0000-0000-000000000003', 'p3@test.local',    'Parent Three', 'parent',  'id'),
  ('50000000-0000-0000-0000-000000000001', 's16@test.local',   'Santri 16',    'student', 'id');

-- classes
insert into public.classes (id, name, schedule, tutor_ids)
values
  ('c0000000-0000-0000-0000-00000000000a', 'Class A (RLS test)', 'Sabtu 10:00', array['70000000-0000-0000-0000-000000000001']::uuid[]),
  ('c0000000-0000-0000-0000-00000000000b', 'Class B (RLS test)', 'Minggu 10:00', array['70000000-0000-0000-0000-000000000002']::uuid[]);

-- students: P1 has 2 in Class A; P2 has 1 in Class B; P3 has 1 (16+, S16) in Class B
insert into public.students (id, parent_id, user_id, full_name, class_id, date_of_birth)
values
  ('d0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', null, 'P1 Child A', 'c0000000-0000-0000-0000-00000000000a', '2015-01-01'),
  ('d0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', null, 'P1 Child B', 'c0000000-0000-0000-0000-00000000000a', '2016-01-01'),
  ('d0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', null, 'P2 Child',   'c0000000-0000-0000-0000-00000000000b', '2014-01-01'),
  ('d0000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'P3 Child (S16)', 'c0000000-0000-0000-0000-00000000000b', '2009-01-01');

-- sessions
insert into public.sessions (id, class_id, date, tutor_id)
values
  ('e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', current_date, '70000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', current_date, '70000000-0000-0000-0000-000000000002');

-- attendance
insert into public.attendance (session_id, student_id, status)
values
  ('e0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000001', 'present'),
  ('e0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000002', 'present'),
  ('e0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000003', 'present'),
  ('e0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000004', 'present');

-- yanbua/quran progress (one for P1's child, one for P2's child, for the
-- RLS-02 cross-family negative checks to be meaningful — a row exists,
-- it's just invisible to the wrong parent)
insert into public.yanbua_progress (student_id, tutor_id, jilid, page, mastery)
values
  ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1, 1, 'lancar'),
  ('d0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000002', 1, 1, 'lancar');

insert into public.quran_progress (student_id, tutor_id, surah_num, ayah_from, ayah_to, quality)
values
  ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1, 1, 5, 'mumtaz'),
  ('d0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000002', 1, 1, 5, 'mumtaz');

-- murajaah assignments (one per family) + one pre-existing log for P2's
-- child (used by RLS-02's cross-family check)
insert into public.murajaah_assignments (id, student_id, tutor_id, surah_num, ayah_from, ayah_to, frequency)
values
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1, 1, 3, 'daily'),
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000002', 1, 1, 3, 'daily');

insert into public.murajaah_log (assignment_id, confirmed_by, quality, date)
values
  ('f0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'hafal_lancar', current_date);

-- year_end_reports: draft + published rows across both families/classes
-- so the tutor/parent/student visibility rules all have something real
-- to filter (test-plan.md RLS-15..21)
insert into public.year_end_reports (student_id, academic_year, tutor_id, status)
values
  ('d0000000-0000-0000-0000-000000000001', '2025/2026', '70000000-0000-0000-0000-000000000001', 'draft'),      -- P1 child A: draft, class A / T1
  ('d0000000-0000-0000-0000-000000000002', '2025/2026', '70000000-0000-0000-0000-000000000001', 'published'),  -- P1 child B: published, class A / T1
  ('d0000000-0000-0000-0000-000000000003', '2025/2026', '70000000-0000-0000-0000-000000000002', 'published'),  -- P2 child: published, class B / T2
  ('d0000000-0000-0000-0000-000000000004', '2025/2026', '70000000-0000-0000-0000-000000000002', 'published'),  -- S16: published, class B / T2
  ('d0000000-0000-0000-0000-000000000004', '2024/2025', '70000000-0000-0000-0000-000000000002', 'draft');      -- S16: draft (different year), class B / T2

-- ============================================================
-- RLS-01: P1 SELECT students → sees exactly their 2 children;
--         P2's child absent from results
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role to 'authenticated';

insert into _tap_log(line) select set_eq(
  'select id from public.students',
  array['d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002']::uuid[],
  'RLS-01: P1 sees exactly their 2 children, P2''s child excluded'
);

-- ============================================================
-- RLS-02: P1 SELECT attendance/yanbua/quran/murajaah rows of P2's
--         child → 0 rows (P1 is still impersonated from RLS-01)
-- ============================================================
insert into _tap_log(line) select is(
  (select count(*) from public.attendance where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-02: P1 sees 0 attendance rows for P2''s child'
);
insert into _tap_log(line) select is(
  (select count(*) from public.yanbua_progress where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-02: P1 sees 0 yanbua_progress rows for P2''s child'
);
insert into _tap_log(line) select is(
  (select count(*) from public.quran_progress where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-02: P1 sees 0 quran_progress rows for P2''s child'
);
insert into _tap_log(line) select is(
  (select count(*) from public.murajaah_log ml join public.murajaah_assignments ma on ma.id = ml.assignment_id
   where ma.student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-02: P1 sees 0 murajaah_log rows for P2''s child'
);

-- ============================================================
-- RLS-03: T1 SELECT students → Class A only; Class B invisible
-- ============================================================
set local request.jwt.claim.sub to '70000000-0000-0000-0000-000000000001';

insert into _tap_log(line) select set_eq(
  'select id from public.students',
  array['d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002']::uuid[],
  'RLS-03: T1 sees only Class A students'
);

-- ============================================================
-- RLS-04: T1 INSERT attendance for Class B student → rejected
-- ============================================================
insert into _tap_log(line) select throws_ok(
  $$ insert into public.attendance (session_id, student_id, status)
     values ('e0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000003', 'present') $$,
  '42501', null,
  'RLS-04: T1 cannot insert attendance for a Class B student'
);

-- ============================================================
-- RLS-05: T1 INSERT yanbua_progress with tutor_id ≠ auth.uid() → rejected
-- ============================================================
insert into _tap_log(line) select throws_ok(
  $$ insert into public.yanbua_progress (student_id, tutor_id, jilid, page, mastery)
     values ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 1, 2, 'lancar') $$,
  '42501', null,
  'RLS-05: T1 cannot insert yanbua_progress with someone else''s tutor_id'
);

-- ============================================================
-- RLS-06: S16 SELECT own attendance/progress → rows returned;
--         sibling/classmate rows → 0
-- ============================================================
set local request.jwt.claim.sub to '50000000-0000-0000-0000-000000000001';

insert into _tap_log(line) select ok(
  (select count(*) from public.attendance where student_id = 'd0000000-0000-0000-0000-000000000004') > 0,
  'RLS-06: S16 sees their own attendance rows'
);
insert into _tap_log(line) select is(
  (select count(*) from public.attendance where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-06: S16 sees 0 attendance rows for a classmate'
);
insert into _tap_log(line) select is(
  (select count(*) from public.yanbua_progress where student_id = 'd0000000-0000-0000-0000-000000000001'),
  0::bigint, 'RLS-06: S16 sees 0 yanbua_progress rows for a non-sibling student'
);

-- ============================================================
-- RLS-07: S16 INSERT/UPDATE on any table → rejected (read-only role)
-- ============================================================
insert into _tap_log(line) select throws_ok(
  $$ insert into public.attendance (session_id, student_id, status)
     values ('e0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000004', 'present') $$,
  '42501', null,
  'RLS-07: S16 cannot INSERT attendance'
);
-- No UPDATE policy exists for the student role at all (only SELECT
-- policies), so this silently matches 0 rows rather than raising an
-- error — same "outer USING clause filters, no exception" behavior as
-- RLS-10/11/20, so it needs the row-count pattern, not throws_ok.
do $$
declare affected int;
begin
  update public.students set full_name = 'Hacked' where id = 'd0000000-0000-0000-0000-000000000004';
  get diagnostics affected = row_count;
  drop table if exists _rls_check;
  create temp table _rls_check(n int);
  insert into _rls_check values (affected);
end $$;
insert into _tap_log(line) select is((select n from _rls_check), 0, 'RLS-07: S16 cannot UPDATE their own student row (0 rows affected)');
drop table _rls_check;

-- ============================================================
-- RLS-08: P1 INSERT murajaah_log for own child's assignment → allowed;
--         for P2's child → rejected
-- ============================================================
set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000001';

insert into _tap_log(line) select lives_ok(
  $$ insert into public.murajaah_log (assignment_id, confirmed_by, quality, date)
     values ('f0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'hafal_lancar', current_date) $$,
  'RLS-08: P1 can confirm murajaah for their own child'
);
insert into _tap_log(line) select throws_ok(
  $$ insert into public.murajaah_log (assignment_id, confirmed_by, quality, date)
     values ('f0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'hafal_lancar', current_date + 1) $$,
  '42501', null,
  'RLS-08: P1 cannot confirm murajaah for P2''s child'
);

-- ============================================================
-- RLS-09: P1 INSERT murajaah_log with confirmed_by ≠ auth.uid() → rejected
-- ============================================================
insert into _tap_log(line) select throws_ok(
  $$ insert into public.murajaah_log (assignment_id, confirmed_by, quality, date)
     values ('f0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'hafal_lancar', current_date + 2) $$,
  '42501', null,
  'RLS-09: P1 cannot insert a murajaah_log with confirmed_by set to someone else'
);

-- ============================================================
-- RLS-10: Any non-admin UPDATE users.role (own or others) → rejected
-- ============================================================
insert into _tap_log(line) select throws_ok(
  $$ update public.users set role = 'admin' where id = '90000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'RLS-10: P1 cannot change their own role'
);
-- (RLS's USING clause silently filters non-matching rows rather than
-- raising an error, so we capture the affected row count via
-- GET DIAGNOSTICS instead of throws_ok — a data-modifying CTE isn't
-- allowed as a nested subquery, hence the DO block.)
do $$
declare affected int;
begin
  update public.users set full_name = 'Should Not Apply' where id = '90000000-0000-0000-0000-000000000002';
  get diagnostics affected = row_count;
  drop table if exists _rls_check;
  create temp table _rls_check(n int);
  insert into _rls_check values (affected);
end $$;
insert into _tap_log(line) select is((select n from _rls_check), 0, 'RLS-10: P1 cannot update another user''s row at all (0 rows affected)');
drop table _rls_check;

-- ============================================================
-- RLS-11: Non-admin INSERT/DELETE on students → rejected
--         (enrollment is admin-only)
-- ============================================================
insert into _tap_log(line) select throws_ok(
  $$ insert into public.students (parent_id, full_name, class_id, date_of_birth)
     values ('90000000-0000-0000-0000-000000000001', 'Illegit Child', 'c0000000-0000-0000-0000-00000000000a', '2018-01-01') $$,
  '42501', null,
  'RLS-11: P1 cannot INSERT a new student'
);
do $$
declare affected int;
begin
  delete from public.students where id = 'd0000000-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  drop table if exists _rls_check;
  create temp table _rls_check(n int);
  insert into _rls_check values (affected);
end $$;
insert into _tap_log(line) select is((select n from _rls_check), 0, 'RLS-11: P1 cannot DELETE their own child''s enrollment row');
drop table _rls_check;

-- ============================================================
-- RLS-12: Anonymous (no JWT) SELECT on every table → 0 rows
-- ============================================================
set local role anon;
set local request.jwt.claim.sub to '';
set local request.jwt.claim.role to 'anon';

insert into _tap_log(line) select is((select count(*) from public.students), 0::bigint, 'RLS-12: anon sees 0 students');
insert into _tap_log(line) select is((select count(*) from public.attendance), 0::bigint, 'RLS-12: anon sees 0 attendance rows');
insert into _tap_log(line) select is((select count(*) from public.yanbua_progress), 0::bigint, 'RLS-12: anon sees 0 yanbua_progress rows');
insert into _tap_log(line) select is((select count(*) from public.murajaah_log), 0::bigint, 'RLS-12: anon sees 0 murajaah_log rows');
insert into _tap_log(line) select is((select count(*) from public.year_end_reports), 0::bigint, 'RLS-12: anon sees 0 year_end_reports rows');

-- ============================================================
-- RLS-13: Duplicate murajaah_log (same assignment_id + date) →
--         unique violation
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role to 'authenticated';

insert into _tap_log(line) select throws_ok(
  $$ insert into public.murajaah_log (assignment_id, confirmed_by, quality, date)
     values ('f0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'hafal_lancar', current_date) $$,
  '23505', null,
  'RLS-13: duplicate (assignment_id, date) murajaah_log raises a unique violation'
);

-- ============================================================
-- RLS-14: Admin can SELECT/modify all tables
-- ============================================================
set local request.jwt.claim.sub to 'a0000000-0000-0000-0000-000000000000';

insert into _tap_log(line) select is((select count(*) from public.students), 4::bigint, 'RLS-14: admin sees all 4 fixture students');
insert into _tap_log(line) select is((select count(*) from public.year_end_reports), 5::bigint, 'RLS-14: admin sees all 5 fixture year_end_reports');

-- ============================================================
-- RLS-15: T1 SELECT year_end_reports for Class A student,
--         status=draft → row returned
-- ============================================================
set local request.jwt.claim.sub to '70000000-0000-0000-0000-000000000001';

insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports
   where student_id = 'd0000000-0000-0000-0000-000000000001' and status = 'draft'),
  1::bigint, 'RLS-15: T1 (authoring tutor) can see their own class''s draft report'
);

-- ============================================================
-- RLS-16 / RLS-17: P1 SELECT year_end_reports for own children →
--         draft invisible, published visible
-- ============================================================
set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000001';

insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports
   where student_id = 'd0000000-0000-0000-0000-000000000001' and status = 'draft'),
  0::bigint, 'RLS-16: P1 cannot see their own child''s draft report'
);
insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports
   where student_id = 'd0000000-0000-0000-0000-000000000002' and status = 'published'),
  1::bigint, 'RLS-17: P1 can see their own child''s published report'
);

-- ============================================================
-- RLS-18: P1 SELECT year_end_reports for P2's child, any status → 0 rows
-- ============================================================
insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-18: P1 sees 0 year_end_reports for P2''s child'
);

-- ============================================================
-- RLS-19: S16 SELECT own year_end_reports, status=published → row
--         returned; status=draft → 0 rows
-- ============================================================
set local request.jwt.claim.sub to '50000000-0000-0000-0000-000000000001';

insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports
   where student_id = 'd0000000-0000-0000-0000-000000000004' and status = 'published'),
  1::bigint, 'RLS-19: S16 can see their own published report'
);
insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports
   where student_id = 'd0000000-0000-0000-0000-000000000004' and status = 'draft'),
  0::bigint, 'RLS-19: S16 cannot see their own draft report'
);

-- ============================================================
-- RLS-20: T2 (not the authoring tutor, different class) SELECT/PATCH
--         a Class A report → rejected
-- ============================================================
set local request.jwt.claim.sub to '70000000-0000-0000-0000-000000000002';

insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports where student_id = 'd0000000-0000-0000-0000-000000000001'),
  0::bigint, 'RLS-20: T2 cannot SELECT a Class A (T1-authored) report'
);
do $$
declare affected int;
begin
  update public.year_end_reports set narrative = 'tampered'
  where student_id = 'd0000000-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  drop table if exists _rls_check;
  create temp table _rls_check(n int);
  insert into _rls_check values (affected);
end $$;
insert into _tap_log(line) select is((select n from _rls_check), 0, 'RLS-20: T2 cannot UPDATE a Class A (T1-authored) report');
drop table _rls_check;

-- ============================================================
-- RLS-21: Non-service-role client attempts to read/write
--         storage.objects in the `reports` bucket directly → rejected
-- ============================================================
set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000001';

insert into _tap_log(line) select is(
  (select count(*) from storage.objects where bucket_id = 'reports'),
  0::bigint, 'RLS-21: authenticated client cannot SELECT storage.objects in the reports bucket'
);
insert into _tap_log(line) select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('reports', 'd0000000-0000-0000-0000-000000000001/2025-2026.pdf', '90000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'RLS-21: authenticated client cannot INSERT into storage.objects in the reports bucket'
);

-- ---------- done ----------
reset role;
insert into _tap_log(line) select * from finish();

select line from _tap_log order by id;

rollback;
