# Roba Dabo Online v4 — Employee Management Edition

Roba Dabo is a Next.js + Supabase bread-shop management system. This edition adds a complete CEO/Admin employee-management workflow on top of the v3 foundation.

## Included

- Supabase email/password login
- CEO / ADMIN / EMPLOYEE roles
- CEO/Admin-only employee management
- Create employee accounts with email + temporary password
- Employee ID and phone fields
- CEO can create Employees or Administrators
- Admin can create Employees
- Edit employee name, email, phone, employee ID, role and optional password
- Enable/disable staff accounts
- Disabled profiles are rejected by login and protected database functions
- Employee dashboard with daily/weekly/monthly/yearly sales
- CEO/Admin employee performance table with today's and monthly sales
- Central inventory and POS
- Automatic stock deduction when a sale is recorded
- Daily/weekly/monthly/yearly reports
- Business settings
- Realtime sales/product refresh

## 1. Install

```cmd
npm install
npm run dev
```

Open http://localhost:3000

## 2. Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SECRET_OR_SERVICE_ROLE_KEY
```

The first two values are browser-safe. The last value is server-only and must never be exposed to the browser or committed to Git.

## 3. Database migrations

The original v3 project uses:

`supabase/migrations/001_initial.sql`

Run it once in Supabase SQL Editor if your database is new.

Then run:

`supabase/migrations/002_employee_management.sql`

This adds employee phone/ID/email fields, indexes, employee sales summary and a protected active-account check in `record_sale`.

If you already ran `001_initial.sql`, do NOT rerun it just to add employees; run migration 002 only.

## 4. CEO profile

Create the CEO authentication user in Supabase Authentication → Users. Then ensure the user's UUID exists in `public.profiles` with role `CEO` and active=true.

Example:

```sql
insert into public.profiles (id, full_name, role, active)
values ('YOUR-CEO-UUID', 'Roba Dabo CEO', 'CEO', true)
on conflict (id) do update set role='CEO', active=true;
```

## 5. Server key requirement

The Employees page creates real Supabase Auth users. That operation must happen server-side. The project therefore uses `/api/employees` with a server-only Supabase admin key. Supabase's Admin Auth APIs are intended for trusted server environments and must not expose the service/secret key in browser code.

## 6. Employee workflow

CEO/Admin → Employees → Add Employee.

The employee receives:

- email
- temporary password
- employee ID (optional)
- phone (optional)

The account is auto-confirmed so the employee can log in immediately.

## 7. Security model

- Browser uses only the public/publishable Supabase key.
- Employee creation/editing is performed by a server route.
- The server route verifies the caller's access token and management role before using the admin key.
- RLS protects profiles, products, sales, expenses and settings.
- Disabled profiles return no active role through `my_role()`.
- `record_sale()` refuses sales from inactive accounts.

## 8. Production deployment

For Vercel, add the same three environment variables in Project Settings → Environment Variables. `SUPABASE_SERVICE_ROLE_KEY` must be configured as a server environment variable only.

Then deploy:

```cmd
npm run build
npm start
```

or connect the repository to Vercel for automatic deployments.
