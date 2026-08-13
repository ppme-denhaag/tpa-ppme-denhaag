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

-- ============================================================
-- RLS-22 … RLS-27: super admin writes (TAD ADR-014)
--
-- Everything below already passed before ADR-014 — no migration was
-- needed to make admin a super admin, because migration 003/005 always
-- granted admin `ALL` on every table (`*_admin_all`, plus the
-- `or fn_is_admin()` branches on the tutor policies). What changed is
-- that the *application* stopped blocking those writes, so the suite now
-- asserts them explicitly: if a future migration ever narrows an admin
-- policy, the app would start 403-ing on screens that look writable
-- rather than failing here first.
--
-- Two properties are being tested at once, and the second matters more:
--   1. an admin INSERT/UPDATE actually lands on each operational table;
--   2. those new rows widen *nobody* else's visibility (RLS-26/27) —
--      admin gaining access must not leak sideways into a parent, tutor
--      or student scope.
--
-- Deliberately placed after RLS-14, which asserts exact fixture row
-- counts for admin and would fail if these inserts ran first.
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub to 'a0000000-0000-0000-0000-000000000000';
set local request.jwt.claim.role to 'authenticated';

-- ============================================================
-- RLS-22: admin INSERT lands on every operational table, for a class
--         it is not a tutor of (Class B / T2), with its own id in the
--         `tutor_id` "who recorded this" column
-- ============================================================
insert into _tap_log(line) select lives_ok(
  $$ insert into public.sessions (id, class_id, date, tutor_id)
     values ('e0000000-0000-0000-0000-0000000000ad', 'c0000000-0000-0000-0000-00000000000b',
             current_date - 7, 'a0000000-0000-0000-0000-000000000000') $$,
  'RLS-22: admin can INSERT a session for a class it does not tutor'
);
insert into _tap_log(line) select lives_ok(
  $$ insert into public.attendance (session_id, student_id, status)
     values ('e0000000-0000-0000-0000-0000000000ad', 'd0000000-0000-0000-0000-000000000003', 'late') $$,
  'RLS-22: admin can INSERT attendance for another tutor''s student'
);
insert into _tap_log(line) select lives_ok(
  $$ insert into public.assignments (id, class_id, tutor_id, title, due_date)
     values ('b0000000-0000-0000-0000-0000000000ad', 'c0000000-0000-0000-0000-00000000000b',
             'a0000000-0000-0000-0000-000000000000', 'Admin-set homework', current_date + 3) $$,
  'RLS-22: admin can INSERT an assignment for a class it does not tutor'
);
insert into _tap_log(line) select lives_ok(
  $$ insert into public.assignment_status (assignment_id, student_id, status)
     values ('b0000000-0000-0000-0000-0000000000ad', 'd0000000-0000-0000-0000-000000000003', 'completed') $$,
  'RLS-22: admin can INSERT an assignment_status verdict'
);
insert into _tap_log(line) select lives_ok(
  $$ insert into public.yanbua_progress (student_id, tutor_id, jilid, page, mastery)
     values ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 2, 5, 'lancar') $$,
  'RLS-22: admin can INSERT yanbua_progress with its own id as tutor_id'
);
insert into _tap_log(line) select lives_ok(
  $$ insert into public.quran_progress (student_id, tutor_id, surah_num, ayah_from, ayah_to, quality)
     values ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 2, 1, 10, 'jayyid') $$,
  'RLS-22: admin can INSERT quran_progress with its own id as tutor_id'
);
insert into _tap_log(line) select lives_ok(
  $$ insert into public.murajaah_assignments (id, student_id, tutor_id, surah_num, ayah_from, ayah_to, frequency)
     values ('f0000000-0000-0000-0000-0000000000ad', 'd0000000-0000-0000-0000-000000000003',
             'a0000000-0000-0000-0000-000000000000', 3, 1, 5, 'weekly') $$,
  'RLS-22: admin can INSERT a murajaah target with its own id as tutor_id'
);
insert into _tap_log(line) select lives_ok(
  $$ insert into public.year_end_reports (student_id, academic_year, tutor_id, status)
     values ('d0000000-0000-0000-0000-000000000003', '2023/2024',
             '70000000-0000-0000-0000-000000000002', 'draft') $$,
  'RLS-22: admin can INSERT a year_end_report for another tutor''s student'
);

-- ============================================================
-- RLS-23: admin UPDATE lands on operational rows it did not create,
--         including another tutor's report narrative/grades — the
--         `yer_tutor_rw` WITH CHECK pin (`tutor_id = auth.uid()`) that
--         makes a co-tutor read-only does not apply to `yer_admin_all`
-- ============================================================
do $$
declare affected int;
begin
  update public.attendance set status = 'present'
  where session_id = 'e0000000-0000-0000-0000-00000000000b'
    and student_id = 'd0000000-0000-0000-0000-000000000003';
  get diagnostics affected = row_count;
  drop table if exists _rls_check;
  create temp table _rls_check(n int);
  insert into _rls_check values (affected);
end $$;
insert into _tap_log(line) select is((select n from _rls_check), 1, 'RLS-23: admin UPDATE of a tutor-recorded attendance row affects the row');
drop table _rls_check;

do $$
declare affected int;
begin
  update public.year_end_reports
  set narrative = 'Edited by admin', overall_grade = 'jayyid'
  where student_id = 'd0000000-0000-0000-0000-000000000001' and academic_year = '2025/2026';
  get diagnostics affected = row_count;
  drop table if exists _rls_check;
  create temp table _rls_check(n int);
  insert into _rls_check values (affected);
end $$;
insert into _tap_log(line) select is((select n from _rls_check), 1, 'RLS-23: admin UPDATE of T1''s report narrative/grades affects the row');
drop table _rls_check;

-- ============================================================
-- RLS-24: `tutor_id` on an admin-recorded row is the admin's own id,
--         and that id is in nobody's `classes.tutor_ids` — the column
--         means "who recorded this", not "a tutor of this class", and
--         nothing downstream may assume otherwise (ADR-014 decision 1a)
-- ============================================================
insert into _tap_log(line) select is(
  (select tutor_id from public.yanbua_progress
   where student_id = 'd0000000-0000-0000-0000-000000000003' and page = 5),
  'a0000000-0000-0000-0000-000000000000'::uuid,
  'RLS-24: an admin-recorded yanbua row carries the admin''s own id in tutor_id'
);
insert into _tap_log(line) select is(
  (select count(*) from public.classes
   where 'a0000000-0000-0000-0000-000000000000'::uuid = any (tutor_ids)),
  0::bigint,
  'RLS-24: that id is not a member of any class''s tutor_ids'
);

-- ============================================================
-- RLS-25: RLS *permits* an admin murajaah_log insert (`mlog_admin_all`),
--         which is exactly why the app has to be the thing that declines
--         it. `confirmed_by` means "the parent who watched the child
--         recite" — home practice nobody witnessed is not something an
--         administrator can attest to, so ADR-014 leaves that one action
--         with parents at the application layer, the same shape the old
--         admin fence had. Asserted rather than assumed so the split
--         between "the database allows this" and "the app does not offer
--         it" stays visible.
-- ============================================================
insert into _tap_log(line) select lives_ok(
  $$ insert into public.murajaah_log (assignment_id, confirmed_by, quality, date)
     values ('f0000000-0000-0000-0000-0000000000ad', 'a0000000-0000-0000-0000-000000000000',
             'hafal_lancar', current_date) $$,
  'RLS-25: RLS permits an admin murajaah_log insert (the parent-only rule is application-layer)'
);

-- ============================================================
-- RLS-26: admin's new rows are invisible to everyone they should be —
--         admin gaining write access must not widen any other scope
-- ============================================================
set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000001';  -- P1 (Class A family)
insert into _tap_log(line) select is(
  (select count(*) from public.attendance where session_id = 'e0000000-0000-0000-0000-0000000000ad'),
  0::bigint, 'RLS-26: P1 sees 0 of the admin-created attendance rows for P2''s child'
);
insert into _tap_log(line) select is(
  (select count(*) from public.yanbua_progress where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-26: P1 still sees 0 yanbua rows for P2''s child after the admin write'
);
insert into _tap_log(line) select is(
  (select count(*) from public.quran_progress where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-26: P1 still sees 0 quran rows for P2''s child after the admin write'
);
insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-26: P1 still sees 0 year_end_reports for P2''s child after the admin write'
);

set local request.jwt.claim.sub to '70000000-0000-0000-0000-000000000001';  -- T1 (Class A tutor)
insert into _tap_log(line) select is(
  (select count(*) from public.attendance where session_id = 'e0000000-0000-0000-0000-0000000000ad'),
  0::bigint, 'RLS-26: T1 sees 0 of the admin-created Class B attendance rows'
);
insert into _tap_log(line) select is(
  (select count(*) from public.assignments where id = 'b0000000-0000-0000-0000-0000000000ad'),
  0::bigint, 'RLS-26: T1 sees 0 of the admin-created Class B assignments'
);

set local request.jwt.claim.sub to '50000000-0000-0000-0000-000000000001';  -- S16 (Class B, but P3's child)
insert into _tap_log(line) select is(
  (select count(*) from public.yanbua_progress where student_id = 'd0000000-0000-0000-0000-000000000003'),
  0::bigint, 'RLS-26: S16 sees 0 of the admin-created rows for a classmate'
);

set local role anon;
set local request.jwt.claim.sub to '';
set local request.jwt.claim.role to 'anon';
insert into _tap_log(line) select is(
  (select count(*) from public.attendance), 0::bigint,
  'RLS-26: anon still sees 0 attendance rows after the admin writes'
);
insert into _tap_log(line) select is(
  (select count(*) from public.year_end_reports), 0::bigint,
  'RLS-26: anon still sees 0 year_end_reports after the admin writes'
);

-- ============================================================
-- RLS-27: the non-admin write boundaries are unchanged — a tutor still
--         cannot reach into another class, a parent still cannot write
--         operational data, a 16+ student is still read-only
-- ============================================================
set local role authenticated;
set local request.jwt.claim.role to 'authenticated';

set local request.jwt.claim.sub to '70000000-0000-0000-0000-000000000001';  -- T1
do $$
declare affected int;
begin
  update public.attendance set status = 'absent'
  where session_id = 'e0000000-0000-0000-0000-0000000000ad';
  get diagnostics affected = row_count;
  drop table if exists _rls_check;
  create temp table _rls_check(n int);
  insert into _rls_check values (affected);
end $$;
insert into _tap_log(line) select is((select n from _rls_check), 0, 'RLS-27: T1 cannot UPDATE an admin-created Class B attendance row');
drop table _rls_check;

set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000002';  -- P2 (the affected family)
insert into _tap_log(line) select throws_ok(
  $$ insert into public.yanbua_progress (student_id, tutor_id, jilid, page, mastery)
     values ('d0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', 1, 9, 'lancar') $$,
  '42501', null,
  'RLS-27: a parent still cannot INSERT yanbua_progress for their own child'
);
insert into _tap_log(line) select ok(
  (select count(*) from public.yanbua_progress where student_id = 'd0000000-0000-0000-0000-000000000003') > 0,
  'RLS-27: …but P2 does see the admin-recorded row for their own child'
);

set local request.jwt.claim.sub to '50000000-0000-0000-0000-000000000001';  -- S16
insert into _tap_log(line) select throws_ok(
  $$ insert into public.quran_progress (student_id, tutor_id, surah_num, ayah_from, ayah_to, quality)
     values ('d0000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 1, 1, 3, 'jayyid') $$,
  '42501', null,
  'RLS-27: a 16+ student is still read-only after admin gained write access'
);

-- ============================================================
-- WH-01…WH-06: notification webhooks (migration 009)
--
-- Not RLS assertions, but they belong to the same "what does the
-- database do on its own" suite: the absence webhook is a trigger that
-- fires on every attendance write in the product, including admin's,
-- and it reaches outside the database. Two things need pinning — that
-- it fires on exactly the right transition and nothing else, and that
-- the shared secret it carries is not reachable from a client role.
--
-- pg_net queues into net.http_request_queue inside the calling
-- transaction, so a rolled-back test can assert on what *would* be sent
-- without a network, a listener, or anything left behind.
-- ============================================================
reset role;

insert into _tap_log(line) select has_function('public', 'fn_notify_absence', 'WH-01: fn_notify_absence() exists');
insert into _tap_log(line) select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'attendance'
      and t.tgname = 'trg_notify_absence' and not t.tgisinternal
  ),
  'WH-01: trg_notify_absence is attached to public.attendance'
);

-- Unconfigured (a fresh db reset, CI, this suite): silent.
insert into _tap_log(line) select ok(
  (select base_url from public.fn_webhook_config()) is null,
  'WH-02: fn_webhook_config() returns NULL when Vault holds no configuration'
);
create temp table _wh_mark(n bigint);
insert into _wh_mark select coalesce(max(id), 0) from net.http_request_queue;

update public.attendance set status = 'absent'
where session_id = 'e0000000-0000-0000-0000-00000000000a'
  and student_id = 'd0000000-0000-0000-0000-000000000001';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  0::bigint,
  'WH-02: an absence recorded in an unconfigured environment queues no request'
);
update public.attendance set status = 'present'
where session_id = 'e0000000-0000-0000-0000-00000000000a'
  and student_id = 'd0000000-0000-0000-0000-000000000001';

-- Configured: the trigger fires on the transition into absent, once.
select vault.create_secret('https://webhook.test.local/.netlify/functions', 'notify_webhook_base_url');
select vault.create_secret('test-shared-secret', 'notify_webhook_secret');

-- Give the row a reason *before* the absence fires, so WH-06 is a real
-- assertion about a row that has one rather than about an empty column.
update public.attendance set reason = 'koorts'
where session_id = 'e0000000-0000-0000-0000-00000000000a'
  and student_id = 'd0000000-0000-0000-0000-000000000001';

delete from _wh_mark;
insert into _wh_mark select coalesce(max(id), 0) from net.http_request_queue;

update public.attendance set status = 'present'
where session_id = 'e0000000-0000-0000-0000-00000000000a'
  and student_id = 'd0000000-0000-0000-0000-000000000002';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  0::bigint,
  'WH-03: recording a student as present queues nothing'
);

update public.attendance set status = 'absent'
where session_id = 'e0000000-0000-0000-0000-00000000000a'
  and student_id = 'd0000000-0000-0000-0000-000000000001';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-03: present -> absent queues exactly one request'
);

-- Re-saving the roster (the upsert `submitAttendance` performs) must not
-- re-notify a family that was already marked absent.
update public.attendance set status = 'absent'
where session_id = 'e0000000-0000-0000-0000-00000000000a'
  and student_id = 'd0000000-0000-0000-0000-000000000001';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-04: re-saving an already-absent row queues nothing further'
);

insert into _tap_log(line) select is(
  (select url from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1),
  'https://webhook.test.local/.netlify/functions/notify-absence',
  'WH-05: the request targets the configured base URL'
);
insert into _tap_log(line) select is(
  (select headers ->> 'x-webhook-secret' from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1),
  'test-shared-secret',
  'WH-05: the request carries the configured shared secret'
);

-- The absence `reason` can carry health data (DPIA R4/R6). The webhook
-- body must carry the row id and nothing else, so the reason never
-- leaves the database at all.
insert into _tap_log(line) select ok(
  (select (convert_from(body, 'utf8')::jsonb -> 'record') - 'id'
   from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1) = '{}'::jsonb,
  'WH-06: the webhook body''s record carries the row id and nothing else'
);
insert into _tap_log(line) select ok(
  (select convert_from(body, 'utf8') from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1)
    not like '%koorts%',
  'WH-06: the absence reason does not appear anywhere in the webhook body'
);

-- ============================================================
-- WH-07…WH-12: the four event triggers added in migration 010
-- ============================================================

-- WH-07: the jilid trigger is deliberately *not* selective — it fires
-- for every Yanbu'a entry and lets the Function apply
-- `isJilidComplete`, so that rule has exactly one implementation. Both
-- a mid-jilid entry and a completing one must queue a request.
delete from _wh_mark;
insert into _wh_mark select coalesce(max(id), 0) from net.http_request_queue;
insert into public.yanbua_progress (student_id, tutor_id, jilid, page, mastery)
values ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1, 5, 'kurang_lancar');
insert into public.yanbua_progress (student_id, tutor_id, jilid, page, mastery)
values ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1, 44, 'lancar');
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  2::bigint,
  'WH-07: every yanbua_progress entry queues a milestone check, completing or not'
);
insert into _tap_log(line) select is(
  (select count(distinct url) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-07: …all of them to the same notify-milestone endpoint'
);
insert into _tap_log(line) select is(
  (select url from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1),
  'https://webhook.test.local/.netlify/functions/notify-milestone',
  'WH-07: the jilid webhook targets notify-milestone'
);
insert into _tap_log(line) select is(
  (select convert_from(body, 'utf8')::jsonb ->> 'table' from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1),
  'yanbua_progress',
  'WH-07: …and names the table, so one Function can serve both milestone kinds'
);

-- WH-08: "surah memorized" is a state transition, not a curriculum rule
-- — active true -> false, and nothing else.
delete from _wh_mark;
insert into _wh_mark select coalesce(max(id), 0) from net.http_request_queue;
update public.murajaah_assignments set active = false
where id = 'f0000000-0000-0000-0000-000000000001';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-08: marking a murajaah target memorized queues one request'
);
insert into _tap_log(line) select is(
  (select convert_from(body, 'utf8')::jsonb ->> 'table' from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1),
  'murajaah_assignments',
  'WH-08: …identified as the murajaah_assignments milestone'
);
update public.murajaah_assignments set active = true
where id = 'f0000000-0000-0000-0000-000000000001';
update public.murajaah_assignments set ayah_to = 5
where id = 'f0000000-0000-0000-0000-000000000001';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-08: re-activating a target, or editing it, queues nothing'
);

-- WH-09: new homework.
delete from _wh_mark;
insert into _wh_mark select coalesce(max(id), 0) from net.http_request_queue;
insert into public.assignments (id, class_id, tutor_id, title, due_date)
values ('b0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-00000000000a',
        '70000000-0000-0000-0000-000000000001', 'Hafalan Surah An-Nas', current_date + 2);
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-09: creating an assignment queues one request'
);
insert into _tap_log(line) select is(
  (select url from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1),
  'https://webhook.test.local/.netlify/functions/notify-assignment',
  'WH-09: …to notify-assignment'
);
-- The assignment title is not lock-screen content (DPIA R6) and, as with
-- the absence reason, never leaves the database in the webhook at all.
insert into _tap_log(line) select ok(
  (select convert_from(body, 'utf8') from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1)
    not like '%An-Nas%',
  'WH-09: the assignment title does not appear in the webhook body'
);
insert into _tap_log(line) select ok(
  (select (convert_from(body, 'utf8')::jsonb -> 'record') - 'id'
   from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1) = '{}'::jsonb,
  'WH-09: the body carries the row id and nothing else'
);

-- WH-10: a report notifies on the transition into published, once.
delete from _wh_mark;
insert into _wh_mark select coalesce(max(id), 0) from net.http_request_queue;
update public.year_end_reports set status = 'published'
where student_id = 'd0000000-0000-0000-0000-000000000001' and academic_year = '2025/2026';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-10: publishing a draft report queues one request'
);
insert into _tap_log(line) select is(
  (select url from net.http_request_queue where id > (select n from _wh_mark) order by id limit 1),
  'https://webhook.test.local/.netlify/functions/notify-report-ready',
  'WH-10: …to notify-report-ready'
);
-- Re-publishing after a correction (FR-006) leaves status at published,
-- so there is no second publish event to announce — and an admin edit to
-- a published report does not regenerate the PDF (ADR-014(e)), which is
-- exactly when a second "your report is ready" would be untrue.
update public.year_end_reports set status = 'published'
where student_id = 'd0000000-0000-0000-0000-000000000001' and academic_year = '2025/2026';
update public.year_end_reports set narrative = 'corrected text'
where student_id = 'd0000000-0000-0000-0000-000000000001' and academic_year = '2025/2026';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  1::bigint,
  'WH-10: re-publishing or editing an already-published report queues nothing'
);

-- WH-11: every trigger in migration 010, like 009's, is silent in an
-- unconfigured environment. This is what keeps CI and a fresh local
-- stack from making outbound requests.
delete from vault.secrets where name in ('notify_webhook_base_url', 'notify_webhook_secret');
delete from _wh_mark;
insert into _wh_mark select coalesce(max(id), 0) from net.http_request_queue;
insert into public.yanbua_progress (student_id, tutor_id, jilid, page, mastery)
values ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 2, 44, 'lancar');
insert into public.assignments (class_id, tutor_id, title, due_date)
values ('c0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', 'Unconfigured', current_date + 1);
update public.murajaah_assignments set active = false
where id = 'f0000000-0000-0000-0000-000000000002';
insert into _tap_log(line) select is(
  (select count(*) from net.http_request_queue where id > (select n from _wh_mark)),
  0::bigint,
  'WH-11: with no Vault configuration, none of the migration 010 triggers queue anything'
);

-- WH-12: a trigger must never be able to fail the write it observes.
-- `fn_post_webhook` is dropped out from under them; the writes must
-- still succeed.
alter function public.fn_post_webhook(text, text, text, uuid) rename to fn_post_webhook_moved;
insert into _tap_log(line) select lives_ok(
  $$ insert into public.assignments (class_id, tutor_id, title, due_date)
     values ('c0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001',
             'Broken webhook', current_date + 1) $$,
  'WH-12: a broken webhook path does not fail the assignment write'
);
insert into _tap_log(line) select lives_ok(
  $$ update public.attendance set status = 'absent'
     where session_id = 'e0000000-0000-0000-0000-00000000000b'
       and student_id = 'd0000000-0000-0000-0000-000000000004' $$,
  'WH-12: …nor the attendance write'
);
alter function public.fn_post_webhook_moved(text, text, text, uuid) rename to fn_post_webhook;

-- The shared secret must not be reachable from a client role.
set local role authenticated;
set local request.jwt.claim.role to 'authenticated';
set local request.jwt.claim.sub to '90000000-0000-0000-0000-000000000001';  -- P1
insert into _tap_log(line) select throws_ok(
  $$ select * from public.fn_webhook_config() $$,
  '42501', null,
  'WH-06: a signed-in user cannot execute fn_webhook_config() to read the secret'
);
reset role;
drop table _wh_mark;

-- ---------- done ----------
reset role;
insert into _tap_log(line) select * from finish();

select line from _tap_log order by id;

rollback;
