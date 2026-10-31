-- ============================================================
-- Remove data created by the end-to-end test runs (2026-10-31).
-- Run in the Supabase SQL editor. Only touches rows created by the
-- test scripts:
--   * tickets in any "... E2E Lab ..." zone,
--   * tickets whose reports ALL came from cs-e2e-...@example.com test
--     accounts (e.g. the photo test CSR-75975) — a ticket with any report
--     from a real student, or a seed report, is never touched,
--   * the cs-e2e-...@example.com accounts and staff codes noted 'e2e test'.
-- Uploaded test images stay in the complaint-evidence bucket; delete them
-- from Storage in the dashboard if you want.
-- ============================================================
BEGIN;

CREATE TEMP TABLE e2e_groups ON COMMIT DROP AS
SELECT g.id, g.tracking_id
FROM public.complaint_groups g
WHERE g.location_zone LIKE '%E2E Lab%'
   OR (
        EXISTS (
            SELECT 1 FROM public.complaints c
            JOIN auth.users u ON u.id = c.student_id
            WHERE c.group_id = g.id AND u.email LIKE 'cs-e2e-%@example.com'
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.complaints c
            LEFT JOIN auth.users u ON u.id = c.student_id
            WHERE c.group_id = g.id
              AND (u.email IS NULL OR u.email NOT LIKE 'cs-e2e-%@example.com')
        )
   );

DELETE FROM public.notifications
WHERE tracking_id IN (SELECT tracking_id FROM e2e_groups);

-- complaints and status_history rows cascade from complaint_groups
DELETE FROM public.complaint_groups
WHERE id IN (SELECT id FROM e2e_groups);

DELETE FROM public.staff_registration_codes
WHERE note = 'e2e test';

-- A test run at 05:14:27 UTC on 2026-10-31 time-jumped every open ticket. The demo
-- seed tickets were put back to their seeded tier/status, but the "auto-escalated"
-- history entries and notifications that jump wrote for them are removed here.
DELETE FROM public.status_history
WHERE action = 'AUTO_ESCALATED'
  AND created_at = '2026-10-31 05:14:27.292123+00'
  AND group_id IN (SELECT id FROM public.complaint_groups
                   WHERE tracking_id IN ('CSR-48291','CSR-83920','CSR-19402','CSR-55201'));
DELETE FROM public.notifications
WHERE notification_type = 'CRITICAL_ESCALATION'
  AND created_at = '2026-10-31 05:14:27.292123+00'
  AND tracking_id IN ('CSR-48291','CSR-83920','CSR-19402','CSR-55201');

-- public.users rows cascade from auth.users
DELETE FROM auth.users
WHERE email LIKE 'cs-e2e-%@example.com';

COMMIT;
