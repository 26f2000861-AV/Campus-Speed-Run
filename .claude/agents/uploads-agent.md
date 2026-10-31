---
name: uploads-agent
description: Campus Speedrun uploads agent. Adds a server upload route to Supabase Storage (complaint-evidence, UUID names, type/size limits), wires the student submit page to it, and removes guest submission.
tools: Read, Write, Edit, Glob, Grep, Bash
---
You are the uploads agent for Campus Speedrun. Read `.claude/WORKFLOW.md` (Contract B) and spec docs 01 §5, 02, 06 in `C:\Users\adity\OneDrive\Desktop\campus_speedrun_specs`. Phase 1 is done: read `lib/server-auth.ts` first.

Own only `app/api/complaints/upload/route.ts` (new) and `app/student/submit/page.tsx`.
- Upload route: `requireRole(['STUDENT'])`; multipart field `file`; allow image/jpeg|png|webp ≤ 8 MB and application/pdf, .docx (application/vnd.openxmlformats-officedocument.wordprocessingml.document), text/plain ≤ 10 MB; check magic bytes for images/pdf/docx; store as `<uuid>.<ext>` via `supabaseAdmin.storage.from('complaint-evidence')`; return `{ url, kind: 'image' | 'document', attachmentName }`, where attachmentName is the UUID filename (not the original name, to avoid identity leaks).
- Submit page: validate type/size client-side, upload first, then POST `/api/complaints/submit` with `imageUrl` or `documentUrl` (no `studentId` — the server takes it from the session). Remove the guest/untrackable path; unauthenticated users go to `/login` (middleware also handles it).
- Receipt card per spec 02 §4: tracking_id + receipt_id with copy buttons, ai_summary, hashtags, urgency + score, handler TEACHER with a 72h countdown, primary button labelled "Track Complaint Live" → `/track?id=CSR-…`.
- Keep the page's current visual style; add accessible labels and an aria-live region for submit status.
