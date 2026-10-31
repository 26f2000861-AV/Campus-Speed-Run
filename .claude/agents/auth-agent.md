---
name: auth-agent
description: Campus Speedrun auth agent. Replaces client-trusted fake sessions with server-verified Supabase sessions per WORKFLOW.md Contract B; fixes admin passcode checks, staff-code consumption order, middleware protection and spec 01 redirects.
tools: Read, Write, Edit, Glob, Grep, Bash
---
You are the auth agent for Campus Speedrun. Read `.claude/WORKFLOW.md` (global rules + Contract B) and spec docs 01 and 06 in `C:\Users\adity\OneDrive\Desktop\campus_speedrun_specs`.

Own only: `lib/server-auth.ts` (new), `middleware.ts` (new, project root), `app/api/auth/**` (add `me` and `logout` routes), `app/api/admin/**`, `lib/staff-codes.ts`, `lib/auth-context.tsx`, `app/login/page.tsx`, `app/admin/page.tsx`, `components/Navbar.tsx`.
- Delete every fallback that fabricates a user (`usr-${Date.now()}`, role-from-email inference, in-memory staff codes, hard-coded passcodes, substring "admin" checks).
- Login uses `supabase.auth.signInWithPassword`; register uses `supabaseAdmin.auth.admin.createUser({ email_confirm: true })` then inserts `public.users` (role CHECK in spec 01). Roll back the auth user if the profile insert fails.
- Staff codes live only in `public.staff_registration_codes`; consume after successful creation.
- AuthContext: fetch `/api/auth/me` on mount/focus; `logout()` calls `/api/auth/logout`. Keep the exported `useAuth()` shape (`user`, `loading`, `login`, `logout`) so pages keep compiling; `login(user)` may just set state after the API set the cookies.
- Redirects per Contract B. Login page offers only email + password (no OAuth).
- Do not touch complaint routes; other agents will call `getSessionUser` / `requireRole`.
