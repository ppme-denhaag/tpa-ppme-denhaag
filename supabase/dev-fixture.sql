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
-- Seeds: 1 tutor + 1 admin + 2 parents (one with 2 children, one with 1
-- child who's also a 16+ self-login) + 2 classes + 4 students + 1
-- pending (unregistered) sign-in for the Registrations page to show.
-- No attendance/yanbua_progress rows — left empty so the record/create
-- flows can be exercised from scratch.
-- ============================================================

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
values
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ustadz.ahmad@dev.local', '', now(), '{}', '{}', false, false, now(), now()),
  ('a2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ibu.siti@dev.local', '', now(), '{}', '{}', false, false, now(), now()),
  ('a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bapak.rudi@dev.local', '', now(), '{}', '{}', false, false, now(), now()),
  ('a3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'fatimah@dev.local', '', now(), '{}', '{}', false, false, now(), now()),
  ('b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'new.tutor@dev.local', '', now(), '{}', '{}', false, false, now(), now()),
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin.dev@dev.local', '', now(), '{}', '{}', false, false, now(), now()),
  -- Deliberately no matching public.users row — this is what the
  -- Registrations page (admin-only) is for.
  ('b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'calon.ustadz@dev.local', '', now(), '{}', '{}', false, false, now(), now());

insert into public.users (id, email, full_name, role, locale)
values
  ('a1000000-0000-0000-0000-000000000001', 'ustadz.ahmad@dev.local', 'Ustadz Ahmad', 'tutor', 'id'),
  ('a2000000-0000-0000-0000-000000000001', 'ibu.siti@dev.local', 'Ibu Siti', 'parent', 'id'),
  ('a2000000-0000-0000-0000-000000000002', 'bapak.rudi@dev.local', 'Bapak Rudi', 'parent', 'id'),
  ('a3000000-0000-0000-0000-000000000001', 'fatimah@dev.local', 'Fatimah', 'student', 'id'),
  ('b1000000-0000-0000-0000-000000000001', 'new.tutor@dev.local', 'Ustadz Baru', 'tutor', 'id'),
  ('c1000000-0000-0000-0000-000000000001', 'admin.dev@dev.local', 'Admin Dev', 'admin', 'id');

insert into public.classes (id, name, schedule, tutor_ids)
values
  ('a4000000-0000-0000-0000-000000000001', 'Kelas A', 'Sabtu 10:00-12:00', array['a1000000-0000-0000-0000-000000000001']::uuid[]),
  ('a4000000-0000-0000-0000-000000000002', 'Kelas B', 'Minggu 09:00-11:00', array['a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001']::uuid[]);

insert into public.students (id, parent_id, user_id, full_name, class_id, date_of_birth)
values
  ('a5000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', null, 'Ali', 'a4000000-0000-0000-0000-000000000001', '2015-03-10'),
  ('a5000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', null, 'Zainab', 'a4000000-0000-0000-0000-000000000001', '2016-07-22'),
  ('a5000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'Fatimah', 'a4000000-0000-0000-0000-000000000001', '2009-11-02'),
  ('a5000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', null, 'Umar', 'a4000000-0000-0000-0000-000000000002', '2017-05-05');
