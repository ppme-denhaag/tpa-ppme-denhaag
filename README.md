# TPA PPME Den Haag

Progress-tracking PWA for PPME Den Haag's TPA (Taman Penitipan Al-Quran) program —
attendance, homework, Yanbu'a/Quran/Murajaah progress, and year-end reports for
tutors, parents, and students.

Full specs live in [`docs/`](./docs): [PRD](./docs/PRD-PPME-TPA.md),
[TAD](./docs/TAD-PPME-TPA.md), [dev checklist](./docs/PPME-TPA-Development-Checklist.md),
[API contract](./docs/openapi.yaml), [test plan](./docs/test-plan.md).

## Stack

React + Vite + TypeScript + Tailwind CSS v4, Supabase (Postgres + Auth + Storage,
Frankfurt/eu-central-1), Netlify (hosting + Functions), react-i18next (id/nl),
vite-plugin-pwa (Workbox).

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
                        # from Supabase dashboard > Project Settings > API
npm run dev
```

```bash
npm run typecheck   # tsc -b --noEmit
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright (starts its own dev server)
npm run build         # production build
```

## Database

Migrations live in `supabase/migrations/` (001–005, applied in order). The
project is already linked (`supabase/config.toml` + `supabase link`); to apply
a new migration:

```bash
supabase db push
```

There is no local Postgres for dev — Docker isn't available in this environment,
so `supabase start` (local emulation) doesn't work here. Local dev talks directly
to the Frankfurt project. **Never point tests or local dev at data you wouldn't
want in a shared dev database** — see test-plan.md's "no real student data in
any test environment, ever" rule.

## Known gaps (foundation pass — not yet built)

- **Google OAuth is not configured yet.** The client-side `signInWithOAuth('google')`
  call works and correctly redirects to Supabase's `/auth/v1/authorize` endpoint,
  but returns a 400 because no Google provider is enabled in Supabase Auth. To fix:
  1. Google Cloud Console → create/select a project → **APIs & Services → Credentials**
     → **Create Credentials → OAuth client ID** → type **Web application**.
  2. Authorized redirect URI: `https://iaqmkityqbfliynaccpw.supabase.co/auth/v1/callback`.
  3. Supabase dashboard → **Authentication → Providers → Google** → enable, paste the
     Client ID/Secret from step 1, save.
  4. Also add `http://localhost:5173` and the Netlify preview/prod URLs under
     Supabase **Authentication → URL Configuration → Redirect URLs**.
- **No real PPME logo asset.** `public/icons/*.png` and the top-nav mark are
  brand-colored placeholders — swap for the real logo before real users see this.
- **RLS automated test suite (test-plan.md §3, RLS-01…RLS-21) is not implemented
  yet.** The policies themselves are live (46 policies, verified via
  `supabase db query`), but the pgTAP/SQL fixture-based CI gate described in the
  test plan still needs to be written — this is the single highest-risk item
  before real student data enters the system.
- **Feature UI is not built.** Attendance, homework, Yanbu'a, Quran, Murajaah,
  and Reports are placeholder pages behind real auth/role/RLS. See the checklist's
  suggested build order for what's next.
- Bundle isn't code-split yet (single ~500KB JS chunk) — fine at this size, revisit
  once feature modules grow.
