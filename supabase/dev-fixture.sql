-- ============================================================
-- TPA PPME Den Haag — Local dev fixture (NOT a migration)
--
-- Seeds a small realistic dataset into a local `supabase start` stack so
-- the dev-only fixture sign-in panel (src/dev/DevAuthSwitcher.tsx, shown
-- on the sign-in screen in `npm run dev`) has real accounts to sign in
-- as, without real Google OAuth. Intentionally kept out of
-- supabase/migrations/ (never applied to the linked Frankfurt project)
-- and out of supabase/seed.sql (not auto-applied by `db reset`) — this
-- is opt-in, run manually against the local stack only:
--
--   supabase start
--   supabase migration up --local   # applies 001-008 if not already
--   docker exec -i supabase_db_tpa-ppme-denhaag \
--     psql -U postgres -v ON_ERROR_STOP=1 < supabase/dev-fixture.sql
--
-- Seeds: 2 tutors + 1 admin + 2 parents (one with 3 children, one with 1
-- child who's also a 16+ self-login) + 3 multi-role accounts (a tutor who
-- is also a parent, a parent who is also a tutor, and an admin who is
-- both — TAD ADR-019) + 2 classes + 7 students + 1 pending
-- (unregistered) sign-in for the Registrations page to show.
-- No attendance/yanbua_progress rows — left empty so the record/create
-- flows can be exercised from scratch.
-- ============================================================

-- instance_id and the *_token/*_change columns are set explicitly (not
-- left NULL) — PostgREST/RLS never look at them (it only validates the
-- JWT signature and trusts the claims), but GoTrue's own /user endpoint
-- does a real row lookup + scan into a non-nullable-string Go struct, and
-- both `supabase.auth.setSession()` (used by DevAuthSwitcher) and the
-- Admin API go through that path. A NULL instance_id makes GoTrue's
-- lookup silently match nothing ("User from sub claim in JWT does not
-- exist"); a NULL *_token/*_change column makes it find the row but then
-- fail with "sql: Scan error ... converting NULL to string is
-- unsupported". A real Google-OAuth-created row never has this problem
-- because GoTrue itself sets these — only a hand-written SQL fixture
-- can hit it. Learned the hard way: earlier fixture inserts (omitting
-- these columns) passed every RLS/PostgREST-level test in this repo
-- without issue, since none of those go through GoTrue — only the
-- browser sign-in flow surfaced it.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ustadz.ahmad@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ibu.siti@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bapak.rudi@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'fatimah@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'new.tutor@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin.dev@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  -- The two dual-role accounts (TAD ADR-019). See the note under
  -- public.users below for why there are two of them.
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ustadzah.aminah@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bapak.hasan@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ustadzah.laila@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', ''),
  -- Deliberately no matching public.users row — this is what the
  -- Registrations page (admin-only) is for.
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'calon.ustadz@dev.local', '', now(), '{}', '{}', false, false, now(), now(), '', '', '', '', '', '', '', '');

insert into public.users (id, email, full_name, role, locale)
values
  ('a1000000-0000-0000-0000-000000000001', 'ustadz.ahmad@dev.local', 'Ustadz Ahmad', 'tutor', 'id'),
  ('a2000000-0000-0000-0000-000000000001', 'ibu.siti@dev.local', 'Ibu Siti', 'parent', 'id'),
  ('a2000000-0000-0000-0000-000000000002', 'bapak.rudi@dev.local', 'Bapak Rudi', 'parent', 'id'),
  ('a3000000-0000-0000-0000-000000000001', 'fatimah@dev.local', 'Fatimah', 'student', 'id'),
  ('b1000000-0000-0000-0000-000000000001', 'new.tutor@dev.local', 'Ustadz Baru', 'tutor', 'id'),
  ('c1000000-0000-0000-0000-000000000001', 'admin.dev@dev.local', 'Admin Dev', 'admin', 'id'),
  -- ---- dual-role accounts (TAD ADR-019) ----
  -- One person can be more than one thing at the TPA, and the database
  -- has always allowed it (`students.parent_id` is a plain FK to
  -- `users(id)` with no role constraint) even though the admin UI has no
  -- way to set it up yet. Both directions are seeded, because they land
  -- on opposite halves of the app:
  --
  --   Ustadzah Aminah — role 'tutor', teaches Kelas A, her own son Yusuf
  --     is in Kelas B. Every page routes her to the *tutor* views, so
  --     she is the check that the tutor side is untouched.
  --   Bapak Hasan — role 'parent', teaches Kelas B, his own daughter
  --     Khadijah is in Kelas A. Every page routes him to the *family*
  --     views, which is where the unfiltered "my children" query used to
  --     hand him Kelas B's whole roster in the ChildPicker.
  --   Ustadzah Laila — role 'admin', teaches Kelas A, her own daughter
  --     Salma is in Kelas B: all three relationships at once, the shape
  --     RLS-34 asserts. She is the one to click through when a change
  --     touches the admin branch of a query, because for her the admin
  --     grant and the tutor relationship disagree — `useMyClasses`
  --     hands her every class (ADR-014) while `fn_my_classes()` holds
  --     only Kelas A.
  ('d1000000-0000-0000-0000-000000000001', 'ustadzah.aminah@dev.local', 'Ustadzah Aminah', 'tutor', 'id'),
  ('d1000000-0000-0000-0000-000000000002', 'bapak.hasan@dev.local', 'Bapak Hasan', 'parent', 'id'),
  ('d1000000-0000-0000-0000-000000000003', 'ustadzah.laila@dev.local', 'Ustadzah Laila', 'admin', 'id');

insert into public.classes (id, name, schedule, tutor_ids)
values
  ('a4000000-0000-0000-0000-000000000001', 'Kelas A', 'Sabtu 10:00-12:00', array['a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003']::uuid[]),
  ('a4000000-0000-0000-0000-000000000002', 'Kelas B', 'Minggu 09:00-11:00', array['a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002']::uuid[]);

insert into public.students (id, parent_id, user_id, full_name, class_id, date_of_birth)
values
  ('a5000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', null, 'Ali', 'a4000000-0000-0000-0000-000000000001', '2015-03-10'),
  ('a5000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', null, 'Zainab', 'a4000000-0000-0000-0000-000000000001', '2016-07-22'),
  ('a5000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'Fatimah', 'a4000000-0000-0000-0000-000000000001', '2009-11-02'),
  ('a5000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', null, 'Umar', 'a4000000-0000-0000-0000-000000000002', '2017-05-05'),
  -- Each dual-role tutor's own child sits in the class the *other* one
  -- teaches, so neither can reach their own child through their tutor
  -- grant — the union of the two grants is the only way either of them
  -- sees everything they are entitled to.
  ('a5000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', null, 'Yusuf', 'a4000000-0000-0000-0000-000000000002', '2016-02-14'),
  ('a5000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000002', null, 'Khadijah', 'a4000000-0000-0000-0000-000000000001', '2015-09-30'),
  -- The triple-role account's own child, likewise in the class she does
  -- not teach.
  ('a5000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000003', null, 'Salma', 'a4000000-0000-0000-0000-000000000002', '2017-01-19');
