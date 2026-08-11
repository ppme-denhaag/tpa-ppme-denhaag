-- ============================================================
-- TPA PPME Den Haag — Migration 001: Enum types
-- Matches TAD "Enums" table exactly.
-- ============================================================

create type user_role as enum ('admin', 'tutor', 'parent', 'student');

create type locale as enum ('id', 'nl');

create type attendance_status as enum ('present', 'absent', 'late');

create type assignment_status as enum ('pending', 'completed', 'incomplete', 'partial');

create type yanbuah_mastery as enum ('lancar', 'kurang_lancar', 'ulang');

create type quran_quality as enum (
  'mumtaz',          -- ممتاز (excellent)
  'jayyid_jiddan',   -- جيد جدا (very good)
  'jayyid',          -- جيد (good)
  'maqbul',          -- مقبول (acceptable)
  'perlu_perbaikan'  -- needs improvement
);

create type murajaah_quality as enum ('hafal_lancar', 'hafal_kurang_lancar', 'belum_hafal');

create type murajaah_frequency as enum ('daily', '3x_week', 'weekly');
-- ============================================================
-- TPA PPME Den Haag — Migration 002: Core tables
-- 11 domain entities + 2 reference tables (surahs, yanbua_jilid).
-- Supabase convention: public.users extends auth.users (1:1).
-- ============================================================

-- ---------- users (application profile over Supabase Auth) ----------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        user_role not null default 'parent',
  locale      locale not null default 'id',
  push_sub    jsonb,                    -- Web Push subscription object
  created_at  timestamptz not null default now()
);
comment on table public.users is
  'App profile; id mirrors auth.users. google_id lives in auth.identities, not duplicated here.';

-- ---------- reference: Yanbu''a jilid ----------
create table public.yanbua_jilid (
  jilid       smallint primary key check (jilid between 1 and 7),
  page_count  smallint not null check (page_count > 0),
  label_id    text not null,   -- Bahasa Indonesia label
  label_nl    text not null    -- Dutch label
);

-- ---------- reference: surahs ----------
create table public.surahs (
  surah_num        smallint primary key check (surah_num between 1 and 114),
  name_arabic      text not null,
  transliteration  text not null,
  ayah_count       smallint not null check (ayah_count > 0)
);

-- ---------- classes ----------
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  schedule    text,                     -- e.g. 'Sabtu 10:00-12:00'
  tutor_ids   uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index idx_classes_tutor_ids on public.classes using gin (tutor_ids);

-- ---------- students (hybrid account model) ----------
create table public.students (
  id              uuid primary key default gen_random_uuid(),
  parent_id       uuid not null references public.users (id) on delete restrict,
  user_id         uuid unique references public.users (id) on delete set null,
    -- NULL for under-16 (majority). Set only when a 16+ student
    -- self-registers with their own Google account (role=student).
  full_name       text not null,
  class_id        uuid references public.classes (id) on delete set null,
  date_of_birth   date not null,
  enrollment_date date not null default current_date,
  current_jilid   smallint references public.yanbua_jilid (jilid),
  current_surah   smallint references public.surahs (surah_num),
  current_ayah    smallint check (current_ayah >= 1),
  created_at      timestamptz not null default now()
);
create index idx_students_parent on public.students (parent_id);
create index idx_students_class  on public.students (class_id);

-- ---------- sessions ----------
create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  date        date not null,
  tutor_id    uuid not null references public.users (id),
  created_at  timestamptz not null default now(),
  unique (class_id, date)
);

-- ---------- attendance ----------
create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  status      attendance_status not null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (session_id, student_id)      -- one record per student per session
);
create index idx_attendance_student on public.attendance (student_id);

-- ---------- assignments ----------
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  tutor_id    uuid not null references public.users (id),
  title       text not null check (char_length(title) <= 200),
  description text,                     -- text-only in MVP per PRD constraint
  due_date    date not null,
  created_at  timestamptz not null default now()
);
create index idx_assignments_class on public.assignments (class_id);

-- ---------- assignment_status (per student) ----------
create table public.assignment_status (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  status        assignment_status not null default 'pending',
  notes         text,
  updated_at    timestamptz not null default now(),
  unique (assignment_id, student_id)
);

-- ---------- yanbua_progress ----------
create table public.yanbua_progress (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  tutor_id    uuid not null references public.users (id),
  jilid       smallint not null references public.yanbua_jilid (jilid),
  page        smallint not null check (page >= 1),
  mastery     yanbuah_mastery not null,
  notes       text,
  recorded_at timestamptz not null default now()
);
create index idx_yanbua_student on public.yanbua_progress (student_id, recorded_at desc);

-- ---------- quran_progress ----------
create table public.quran_progress (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  tutor_id      uuid not null references public.users (id),
  surah_num     smallint not null references public.surahs (surah_num),
  ayah_from     smallint not null check (ayah_from >= 1),
  ayah_to       smallint not null,
  quality       quran_quality not null,
  tajweed_notes text,
  recorded_at   timestamptz not null default now(),
  check (ayah_to >= ayah_from)
);
create index idx_quran_student on public.quran_progress (student_id, recorded_at desc);

-- ---------- murajaah_assignments ----------
create table public.murajaah_assignments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  tutor_id    uuid not null references public.users (id),
  surah_num   smallint not null references public.surahs (surah_num),
  ayah_from   smallint not null check (ayah_from >= 1),
  ayah_to     smallint not null,
  frequency   murajaah_frequency not null default 'daily',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (ayah_to >= ayah_from)
);
create index idx_murajaah_assign_student on public.murajaah_assignments (student_id) where active;

-- ---------- murajaah_log ----------
create table public.murajaah_log (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.murajaah_assignments (id) on delete cascade,
  confirmed_by  uuid not null references public.users (id),
  quality       murajaah_quality not null,
  date          date not null default current_date,
  streak_count  integer not null default 1,   -- set by trigger below
  created_at    timestamptz not null default now(),
  unique (assignment_id, date)                -- one confirmation per day
);

-- ---------- streak trigger ----------
-- streak_count = previous day's streak + 1 if yesterday was confirmed,
-- otherwise resets to 1. (Simplified daily model; '3x_week' and 'weekly'
-- frequencies count consecutive *scheduled* periods — refine in function
-- layer if per-frequency streaks are required. See test plan §4.3.)
create or replace function public.fn_set_streak_count()
returns trigger language plpgsql as $$
declare
  prev integer;
begin
  select streak_count into prev
  from public.murajaah_log
  where assignment_id = new.assignment_id
    and date = new.date - 1;
  new.streak_count := coalesce(prev, 0) + 1;
  return new;
end $$;

create trigger trg_murajaah_streak
  before insert on public.murajaah_log
  for each row execute function public.fn_set_streak_count();

-- ---------- updated_at maintenance ----------
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_assignment_status_touch
  before update on public.assignment_status
  for each row execute function public.fn_touch_updated_at();
-- ============================================================
-- TPA PPME Den Haag — Migration 003: Row Level Security
--
-- Roles: admin (all), tutor (own classes), parent (own children),
--        student 16+ self-login (own data, read-only).
-- HIGHEST-RISK MIGRATION: children's data isolation lives here.
-- Every policy below must be covered by the automated RLS tests
-- (see test-plan.md §3) before real student data is entered.
-- ============================================================

-- ---------- helper functions (security definer, stable) ----------

create or replace function public.fn_current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.fn_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_current_role() = 'admin'
$$;

-- student_ids belonging to the calling parent
create or replace function public.fn_my_children()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.students where parent_id = auth.uid()
$$;

-- the single student_id linked to a 16+ self-login student account
create or replace function public.fn_my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.students where user_id = auth.uid()
$$;

-- class_ids where the caller is an assigned tutor
create or replace function public.fn_my_classes()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.classes where auth.uid() = any (tutor_ids)
$$;

-- student_ids in the caller's (tutor's) classes
create or replace function public.fn_my_class_students()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from public.students s
  where s.class_id in (select public.fn_my_classes())
$$;

-- ---------- enable RLS everywhere ----------
alter table public.users                enable row level security;
alter table public.students             enable row level security;
alter table public.classes              enable row level security;
alter table public.sessions             enable row level security;
alter table public.attendance           enable row level security;
alter table public.assignments          enable row level security;
alter table public.assignment_status    enable row level security;
alter table public.yanbua_progress      enable row level security;
alter table public.quran_progress       enable row level security;
alter table public.murajaah_assignments enable row level security;
alter table public.murajaah_log         enable row level security;
alter table public.surahs               enable row level security;
alter table public.yanbua_jilid         enable row level security;

-- ---------- reference tables: readable by any authenticated user ----------
create policy ref_surahs_read on public.surahs
  for select to authenticated using (true);
create policy ref_jilid_read on public.yanbua_jilid
  for select to authenticated using (true);

-- ---------- users ----------
create policy users_self_read on public.users
  for select to authenticated using (id = auth.uid() or public.fn_is_admin());
create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.users where id = auth.uid()));
  -- users may edit their own profile but NOT change their own role
create policy users_admin_all on public.users
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ---------- students ----------
create policy students_parent_read on public.students
  for select to authenticated using (parent_id = auth.uid());
create policy students_self_read on public.students
  for select to authenticated using (user_id = auth.uid());
create policy students_tutor_read on public.students
  for select to authenticated using (class_id in (select public.fn_my_classes()));
create policy students_admin_all on public.students
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());
-- Enrollment (INSERT/UPDATE/DELETE of students) is admin-only by design.

-- ---------- classes ----------
create policy classes_read on public.classes
  for select to authenticated using (
    public.fn_is_admin()
    or auth.uid() = any (tutor_ids)
    or id in (select class_id from public.students where parent_id = auth.uid())
    or id in (select class_id from public.students where user_id = auth.uid())
  );
create policy classes_admin_write on public.classes
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ---------- sessions ----------
create policy sessions_tutor_rw on public.sessions
  for all to authenticated
  using (class_id in (select public.fn_my_classes()) or public.fn_is_admin())
  with check (class_id in (select public.fn_my_classes()) or public.fn_is_admin());
create policy sessions_family_read on public.sessions
  for select to authenticated using (
    class_id in (select class_id from public.students where parent_id = auth.uid())
    or class_id in (select class_id from public.students where user_id = auth.uid())
  );

-- ---------- attendance ----------
create policy attendance_tutor_insert on public.attendance
  for insert to authenticated
  with check (
    student_id in (select public.fn_my_class_students())
    and session_id in (select id from public.sessions
                       where class_id in (select public.fn_my_classes()))
  );
create policy attendance_tutor_read on public.attendance
  for select to authenticated
  using (student_id in (select public.fn_my_class_students()));
create policy attendance_tutor_update on public.attendance
  for update to authenticated
  using (student_id in (select public.fn_my_class_students()))
  with check (student_id in (select public.fn_my_class_students()));
create policy attendance_parent_read on public.attendance
  for select to authenticated using (student_id in (select public.fn_my_children()));
create policy attendance_student_read on public.attendance
  for select to authenticated using (student_id = public.fn_my_student_id());
create policy attendance_admin_all on public.attendance
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ---------- assignments ----------
create policy assignments_tutor_rw on public.assignments
  for all to authenticated
  using (class_id in (select public.fn_my_classes()) or public.fn_is_admin())
  with check ((class_id in (select public.fn_my_classes()) and tutor_id = auth.uid())
              or public.fn_is_admin());
create policy assignments_family_read on public.assignments
  for select to authenticated using (
    class_id in (select class_id from public.students where parent_id = auth.uid())
    or class_id in (select class_id from public.students where user_id = auth.uid())
  );

-- ---------- assignment_status ----------
create policy astatus_tutor_rw on public.assignment_status
  for all to authenticated
  using (student_id in (select public.fn_my_class_students()) or public.fn_is_admin())
  with check (student_id in (select public.fn_my_class_students()) or public.fn_is_admin());
create policy astatus_parent_read on public.assignment_status
  for select to authenticated using (student_id in (select public.fn_my_children()));
create policy astatus_student_read on public.assignment_status
  for select to authenticated using (student_id = public.fn_my_student_id());

-- ---------- yanbua_progress ----------
create policy yanbua_tutor_insert on public.yanbua_progress
  for insert to authenticated
  with check (student_id in (select public.fn_my_class_students()) and tutor_id = auth.uid());
create policy yanbua_tutor_read on public.yanbua_progress
  for select to authenticated using (student_id in (select public.fn_my_class_students()));
create policy yanbua_parent_read on public.yanbua_progress
  for select to authenticated using (student_id in (select public.fn_my_children()));
create policy yanbua_student_read on public.yanbua_progress
  for select to authenticated using (student_id = public.fn_my_student_id());
create policy yanbua_admin_all on public.yanbua_progress
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ---------- quran_progress (mirror of yanbua) ----------
create policy quran_tutor_insert on public.quran_progress
  for insert to authenticated
  with check (student_id in (select public.fn_my_class_students()) and tutor_id = auth.uid());
create policy quran_tutor_read on public.quran_progress
  for select to authenticated using (student_id in (select public.fn_my_class_students()));
create policy quran_parent_read on public.quran_progress
  for select to authenticated using (student_id in (select public.fn_my_children()));
create policy quran_student_read on public.quran_progress
  for select to authenticated using (student_id = public.fn_my_student_id());
create policy quran_admin_all on public.quran_progress
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ---------- murajaah_assignments ----------
create policy massign_tutor_rw on public.murajaah_assignments
  for all to authenticated
  using (student_id in (select public.fn_my_class_students()) or public.fn_is_admin())
  with check ((student_id in (select public.fn_my_class_students()) and tutor_id = auth.uid())
              or public.fn_is_admin());
create policy massign_parent_read on public.murajaah_assignments
  for select to authenticated using (student_id in (select public.fn_my_children()));
create policy massign_student_read on public.murajaah_assignments
  for select to authenticated using (student_id = public.fn_my_student_id());

-- ---------- murajaah_log ----------
-- Parents confirm practice for their own children only.
create policy mlog_parent_insert on public.murajaah_log
  for insert to authenticated
  with check (
    confirmed_by = auth.uid()
    and assignment_id in (
      select ma.id from public.murajaah_assignments ma
      where ma.student_id in (select public.fn_my_children())
    )
  );
create policy mlog_parent_read on public.murajaah_log
  for select to authenticated using (
    assignment_id in (
      select ma.id from public.murajaah_assignments ma
      where ma.student_id in (select public.fn_my_children())
    )
  );
create policy mlog_tutor_read on public.murajaah_log
  for select to authenticated using (
    assignment_id in (
      select ma.id from public.murajaah_assignments ma
      where ma.student_id in (select public.fn_my_class_students())
    )
  );
create policy mlog_student_read on public.murajaah_log
  for select to authenticated using (
    assignment_id in (
      select ma.id from public.murajaah_assignments ma
      where ma.student_id = public.fn_my_student_id()
    )
  );
create policy mlog_admin_all on public.murajaah_log
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());
-- ============================================================
-- TPA PPME Den Haag — Migration 004: Reference seed data
-- 114 surahs (Arabic, transliteration, ayah count) + 7 jilid.
--
-- ⚠ Jilid page counts: 44 pages/jilid is used as the default
-- (consistent with the validated prototype: "Halaman 15 dari 44").
-- Verify against PPME's actual Yanbu'a edition before launch —
-- ties to PRD open question "Yanbu'a Curriculum Variants".
-- ============================================================

insert into public.yanbua_jilid (jilid, page_count, label_id, label_nl) values
  (1, 44, 'Jilid 1', 'Deel 1'),
  (2, 44, 'Jilid 2', 'Deel 2'),
  (3, 44, 'Jilid 3', 'Deel 3'),
  (4, 44, 'Jilid 4', 'Deel 4'),
  (5, 44, 'Jilid 5', 'Deel 5'),
  (6, 44, 'Jilid 6', 'Deel 6'),
  (7, 44, 'Jilid 7', 'Deel 7');

insert into public.surahs (surah_num, name_arabic, transliteration, ayah_count) values
  (1,  'الفاتحة',   'Al-Fatihah',      7),
  (2,  'البقرة',    'Al-Baqarah',      286),
  (3,  'آل عمران',  'Ali ''Imran',     200),
  (4,  'النساء',    'An-Nisa',         176),
  (5,  'المائدة',   'Al-Ma''idah',     120),
  (6,  'الأنعام',   'Al-An''am',       165),
  (7,  'الأعراف',   'Al-A''raf',       206),
  (8,  'الأنفال',   'Al-Anfal',        75),
  (9,  'التوبة',    'At-Tawbah',       129),
  (10, 'يونس',      'Yunus',           109),
  (11, 'هود',       'Hud',             123),
  (12, 'يوسف',      'Yusuf',           111),
  (13, 'الرعد',     'Ar-Ra''d',        43),
  (14, 'إبراهيم',   'Ibrahim',         52),
  (15, 'الحجر',     'Al-Hijr',         99),
  (16, 'النحل',     'An-Nahl',         128),
  (17, 'الإسراء',   'Al-Isra',         111),
  (18, 'الكهف',     'Al-Kahf',         110),
  (19, 'مريم',      'Maryam',          98),
  (20, 'طه',        'Ta-Ha',           135),
  (21, 'الأنبياء',  'Al-Anbiya',       112),
  (22, 'الحج',      'Al-Hajj',         78),
  (23, 'المؤمنون',  'Al-Mu''minun',    118),
  (24, 'النور',     'An-Nur',          64),
  (25, 'الفرقان',   'Al-Furqan',       77),
  (26, 'الشعراء',   'Ash-Shu''ara',    227),
  (27, 'النمل',     'An-Naml',         93),
  (28, 'القصص',     'Al-Qasas',        88),
  (29, 'العنكبوت',  'Al-''Ankabut',    69),
  (30, 'الروم',     'Ar-Rum',          60),
  (31, 'لقمان',     'Luqman',          34),
  (32, 'السجدة',    'As-Sajdah',       30),
  (33, 'الأحزاب',   'Al-Ahzab',        73),
  (34, 'سبأ',       'Saba',            54),
  (35, 'فاطر',      'Fatir',           45),
  (36, 'يس',        'Ya-Sin',          83),
  (37, 'الصافات',   'As-Saffat',       182),
  (38, 'ص',         'Sad',             88),
  (39, 'الزمر',     'Az-Zumar',        75),
  (40, 'غافر',      'Ghafir',          85),
  (41, 'فصلت',      'Fussilat',        54),
  (42, 'الشورى',    'Ash-Shura',       53),
  (43, 'الزخرف',    'Az-Zukhruf',      89),
  (44, 'الدخان',    'Ad-Dukhan',       59),
  (45, 'الجاثية',   'Al-Jathiyah',     37),
  (46, 'الأحقاف',   'Al-Ahqaf',        35),
  (47, 'محمد',      'Muhammad',        38),
  (48, 'الفتح',     'Al-Fath',         29),
  (49, 'الحجرات',   'Al-Hujurat',      18),
  (50, 'ق',         'Qaf',             45),
  (51, 'الذاريات',  'Adh-Dhariyat',    60),
  (52, 'الطور',     'At-Tur',          49),
  (53, 'النجم',     'An-Najm',         62),
  (54, 'القمر',     'Al-Qamar',        55),
  (55, 'الرحمن',    'Ar-Rahman',       78),
  (56, 'الواقعة',   'Al-Waqi''ah',     96),
  (57, 'الحديد',    'Al-Hadid',        29),
  (58, 'المجادلة',  'Al-Mujadilah',    22),
  (59, 'الحشر',     'Al-Hashr',        24),
  (60, 'الممتحنة',  'Al-Mumtahanah',   13),
  (61, 'الصف',      'As-Saff',         14),
  (62, 'الجمعة',    'Al-Jumu''ah',     11),
  (63, 'المنافقون', 'Al-Munafiqun',    11),
  (64, 'التغابن',   'At-Taghabun',     18),
  (65, 'الطلاق',    'At-Talaq',        12),
  (66, 'التحريم',   'At-Tahrim',       12),
  (67, 'الملك',     'Al-Mulk',         30),
  (68, 'القلم',     'Al-Qalam',        52),
  (69, 'الحاقة',    'Al-Haqqah',       52),
  (70, 'المعارج',   'Al-Ma''arij',     44),
  (71, 'نوح',       'Nuh',             28),
  (72, 'الجن',      'Al-Jinn',         28),
  (73, 'المزمل',    'Al-Muzzammil',    20),
  (74, 'المدثر',    'Al-Muddaththir',  56),
  (75, 'القيامة',   'Al-Qiyamah',      40),
  (76, 'الإنسان',   'Al-Insan',        31),
  (77, 'المرسلات',  'Al-Mursalat',     50),
  (78, 'النبأ',     'An-Naba',         40),
  (79, 'النازعات',  'An-Nazi''at',     46),
  (80, 'عبس',       '''Abasa',         42),
  (81, 'التكوير',   'At-Takwir',       29),
  (82, 'الانفطار',  'Al-Infitar',      19),
  (83, 'المطففين',  'Al-Mutaffifin',   36),
  (84, 'الانشقاق',  'Al-Inshiqaq',     25),
  (85, 'البروج',    'Al-Buruj',        22),
  (86, 'الطارق',    'At-Tariq',        17),
  (87, 'الأعلى',    'Al-A''la',        19),
  (88, 'الغاشية',   'Al-Ghashiyah',    26),
  (89, 'الفجر',     'Al-Fajr',         30),
  (90, 'البلد',     'Al-Balad',        20),
  (91, 'الشمس',     'Ash-Shams',       15),
  (92, 'الليل',     'Al-Layl',         21),
  (93, 'الضحى',     'Ad-Duha',         11),
  (94, 'الشرح',     'Ash-Sharh',       8),
  (95, 'التين',     'At-Tin',          8),
  (96, 'العلق',     'Al-''Alaq',       19),
  (97, 'القدر',     'Al-Qadr',         5),
  (98, 'البينة',    'Al-Bayyinah',     8),
  (99, 'الزلزلة',   'Az-Zalzalah',     8),
  (100,'العاديات',  'Al-''Adiyat',     11),
  (101,'القارعة',   'Al-Qari''ah',     11),
  (102,'التكاثر',   'At-Takathur',     8),
  (103,'العصر',     'Al-''Asr',        3),
  (104,'الهمزة',    'Al-Humazah',      9),
  (105,'الفيل',     'Al-Fil',          5),
  (106,'قريش',      'Quraysh',         4),
  (107,'الماعون',   'Al-Ma''un',       7),
  (108,'الكوثر',    'Al-Kawthar',      3),
  (109,'الكافرون',  'Al-Kafirun',      6),
  (110,'النصر',     'An-Nasr',         3),
  (111,'المسد',     'Al-Masad',        5),
  (112,'الإخلاص',   'Al-Ikhlas',       4),
  (113,'الفلق',     'Al-Falaq',        5),
  (114,'الناس',     'An-Nas',          6);
-- ============================================================
-- TPA PPME Den Haag — Migration 005: Year-End Curriculum Reports
--
-- Adds: report_status / report_grade enums, year_end_reports table,
-- RLS policies (drafts visible to tutor/admin only — never parent/
-- student), and the private Storage bucket for generated PDFs.
-- ============================================================

-- ---------- enums ----------
create type report_status as enum ('draft', 'published');

-- Same 5-level scale as quran_quality, kept as a separate type so
-- report grading isn't semantically coupled to Quran-specific quality.
create type report_grade as enum (
  'mumtaz', 'jayyid_jiddan', 'jayyid', 'maqbul', 'perlu_bimbingan'
);

-- ---------- table ----------
create table public.year_end_reports (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.students (id) on delete cascade,
  academic_year       text not null,              -- format 'YYYY/YYYY', e.g. '2025/2026'.
                                                    -- PPME's TPA academic year runs late
                                                    -- Aug/early Sep to early/mid Jul.
  tutor_id            uuid not null references public.users (id),

  status              report_status not null default 'draft',

  -- tutor-authored content (empty on draft creation, filled before publish)
  narrative           text,
  yanbua_grade        report_grade,
  yanbua_notes        text,
  quran_grade         report_grade,
  quran_notes         text,
  murajaah_grade      report_grade,
  murajaah_notes      text,
  overall_grade       report_grade,

  -- stats snapshot, computed at draft generation time by
  -- generate-year-end-drafts (not user-editable via the API)
  attendance_present  smallint not null default 0,
  attendance_absent   smallint not null default 0,
  attendance_late     smallint not null default 0,
  attendance_rate     numeric(5,2) not null default 0,   -- percentage, e.g. 92.31

  pdf_path            text,                        -- Storage path once generated; NULL until first publish
  generated_at        timestamptz not null default now(),
  published_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (student_id, academic_year)
);

create index idx_year_end_reports_student on public.year_end_reports (student_id);
create index idx_year_end_reports_tutor   on public.year_end_reports (tutor_id);

create trigger trg_year_end_reports_touch
  before update on public.year_end_reports
  for each row execute function public.fn_touch_updated_at();  -- reuses fn from migration 002

-- ---------- RLS ----------
alter table public.year_end_reports enable row level security;

-- Tutor: full visibility + edit rights over reports for their own class's students,
-- any status (including drafts). Publishing itself (draft -> published, PDF write)
-- happens through the publish-report Netlify Function using the service role, not
-- a direct client UPDATE — but tutors can still PATCH narrative/grades on a
-- published report via PostgREST (FR-006 post-publish edit), which the Function
-- picks up on next regeneration.
create policy yer_tutor_rw on public.year_end_reports
  for all to authenticated
  using (student_id in (select public.fn_my_class_students()))
  with check (student_id in (select public.fn_my_class_students()) and tutor_id = auth.uid());

-- Parent: published only, own children only. Drafts are invisible by construction
-- (status = 'published' is part of the USING clause, not an app-layer filter).
create policy yer_parent_read on public.year_end_reports
  for select to authenticated
  using (student_id in (select public.fn_my_children()) and status = 'published');

-- Student (16+, self-login): published only, own record only.
create policy yer_student_read on public.year_end_reports
  for select to authenticated
  using (student_id = public.fn_my_student_id() and status = 'published');

create policy yer_admin_all on public.year_end_reports
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ---------- Storage bucket for generated PDFs ----------
-- Private bucket: no public read. All access goes through the report-pdf
-- Function, which mints a short-lived signed URL after checking the same
-- authorization the RLS policies above encode.
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- Only the service role (used server-side by Netlify Functions) may write.
-- No client-facing SELECT/INSERT policy is created on purpose — signed URLs
-- bypass RLS, so there is deliberately no direct client path to this bucket.
create policy reports_bucket_service_write on storage.objects
  for insert to service_role
  with check (bucket_id = 'reports');

create policy reports_bucket_service_update on storage.objects
  for update to service_role
  using (bucket_id = 'reports');
