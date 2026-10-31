-- ============================================================
-- CAMPUS SPEEDRUN: COMPLETE INSTITUTIONAL DATABASE MIGRATION
-- Run this in the Supabase SQL Editor of your project.
--
-- Idempotent: safe to run on a fresh project or to upgrade an
-- existing one (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- DROP ... IF EXISTS before CREATE / CREATE OR REPLACE).
--
-- Security model (WORKFLOW.md Contract A):
--   * RLS is ENABLED on every public table.
--   * Server routes use the service-role key (bypasses RLS).
--   * The only policy for normal users: an authenticated user may
--     SELECT their own row in public.users. No anon policies.
--   * Storage bucket `complaint-evidence` is public-read; there is
--     NO anon/authenticated INSERT policy (uploads go through the
--     service-role API route).
--
-- Demo data lives in supabase_seed.sql (run after this file).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ------------------------------------------------------------
-- 1. Custom Types & Enums
-- ------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('STUDENT', 'TEACHER', 'FACULTY', 'ADMINISTRATIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE complaint_priority AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE complaint_status AS ENUM ('UNACKNOWLEDGED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------
-- 2. Departments (spec 08 — exactly 6, NO hostels)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
    code TEXT PRIMARY KEY CHECK (code IN ('BTECH', 'MCA', 'SCI', 'INFRA', 'IT', 'SAN')),
    name TEXT NOT NULL,
    hashtags TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO public.departments (code, name, hashtags) VALUES
    ('BTECH', 'B.Tech / Technical Department',          ARRAY['#BTech', '#technical', '#EngineeringLab']),
    ('MCA',   'MCA Department',                         ARRAY['#MCA', '#ComputerApplications', '#CodingLab']),
    ('SCI',   'Applied Sciences Department',            ARRAY['#AppliedSciences', '#ScienceLab', '#PhysicsChem']),
    ('INFRA', 'Infrastructure & Lab Maintenance',       ARRAY['#Infrastructure', '#LabDamage', '#Electrical', '#Civil']),
    ('IT',    'IT & Network Support',                   ARRAY['#ITSupport', '#WiFiDead', '#Network', '#Hardware']),
    ('SAN',   'Sanitation & Hygiene',                   ARRAY['#Sanitation', '#Hygiene', '#CleanWater'])
ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        hashtags = EXCLUDED.hashtags;

-- ------------------------------------------------------------
-- 3. Public Users Profile Table (mirrors auth.users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    identifier_no TEXT,
    role user_role NOT NULL DEFAULT 'STUDENT',
    department_code TEXT, -- one of the 6 department codes; NULL for students
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.1 Staff Registration Authority Codes
CREATE TABLE IF NOT EXISTS public.staff_registration_codes (
    code TEXT PRIMARY KEY,
    role user_role NOT NULL,
    department_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_by_email TEXT,
    used_at TIMESTAMPTZ,
    note TEXT
);

-- ------------------------------------------------------------
-- 4. Master Complaint Clusters (Grouped Tickets)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaint_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id TEXT NOT NULL UNIQUE DEFAULT ('CSR-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0')),
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    ai_summary TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'INFRASTRUCTURE',
    subcategory TEXT,
    location_zone TEXT NOT NULL,
    priority complaint_priority NOT NULL DEFAULT 'MEDIUM',
    priority_score INTEGER NOT NULL DEFAULT 40 CHECK (priority_score >= 0 AND priority_score <= 100),
    is_safety_critical BOOLEAN NOT NULL DEFAULT FALSE,
    is_damage_prone BOOLEAN NOT NULL DEFAULT FALSE,
    primary_department_code TEXT NOT NULL CHECK (primary_department_code IN ('BTECH', 'MCA', 'SCI', 'INFRA', 'IT', 'SAN')),
    collaborating_department_codes TEXT[] DEFAULT '{}',
    hashtags TEXT[] NOT NULL DEFAULT '{}',
    routing_reasoning TEXT NOT NULL,
    current_handler_role user_role NOT NULL DEFAULT 'TEACHER',
    stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stage_deadline TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
    status complaint_status NOT NULL DEFAULT 'UNACKNOWLEDGED',
    report_count INTEGER NOT NULL DEFAULT 1,
    escalated_to_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    student_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    can_track BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade path for databases created by the previous migration
ALTER TABLE public.complaint_groups
    ADD COLUMN IF NOT EXISTS student_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.complaint_groups
    ADD COLUMN IF NOT EXISTS can_track BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.complaint_groups
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ------------------------------------------------------------
-- 5. Individual Complaint Submissions (Zero-PII Records)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id TEXT NOT NULL UNIQUE DEFAULT ('REP-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0')),
    group_id UUID NOT NULL REFERENCES public.complaint_groups(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
    raw_text TEXT NOT NULL,
    location_zone TEXT NOT NULL,
    image_url TEXT,
    document_url TEXT,
    attachment_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. Status & Escalation History Log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.complaint_groups(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. Notifications (spec 09)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_role user_role NOT NULL,
    department_code TEXT,
    tracking_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. CHECK constraints added idempotently.
--    Added NOT VALID first (always enforced for new/updated rows),
--    then validated; if legacy rows violate it, the migration does
--    not abort — a NOTICE is raised so the rows can be fixed.
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'users_department_code_check'
                     AND conrelid = 'public.users'::regclass) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_department_code_check
            CHECK (department_code IS NULL OR department_code IN ('BTECH', 'MCA', 'SCI', 'INFRA', 'IT', 'SAN'))
            NOT VALID;
    END IF;
    BEGIN
        ALTER TABLE public.users VALIDATE CONSTRAINT users_department_code_check;
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'users_department_code_check: existing rows violate the constraint; fix them and re-run VALIDATE CONSTRAINT.';
    END;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'notifications_notification_type_check'
                     AND conrelid = 'public.notifications'::regclass) THEN
        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_notification_type_check
            CHECK (notification_type IN ('NEW_ASSIGNMENT', 'SLA_WARNING', 'CRITICAL_ESCALATION', 'RESOLVED'))
            NOT VALID;
    END IF;
    BEGIN
        ALTER TABLE public.notifications VALIDATE CONSTRAINT notifications_notification_type_check;
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'notifications_notification_type_check: existing rows violate the constraint; fix them and re-run VALIDATE CONSTRAINT.';
    END;
END $$;

-- ------------------------------------------------------------
-- 9. Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_groups_priority ON public.complaint_groups(priority_score DESC, stage_deadline ASC);
CREATE INDEX IF NOT EXISTS idx_groups_handler ON public.complaint_groups(current_handler_role, status);
CREATE INDEX IF NOT EXISTS idx_groups_tracking_id ON public.complaint_groups(tracking_id);
CREATE INDEX IF NOT EXISTS idx_groups_damage_prone ON public.complaint_groups(location_zone) WHERE is_damage_prone = TRUE;
CREATE INDEX IF NOT EXISTS idx_groups_student_id ON public.complaint_groups(student_id);
CREATE INDEX IF NOT EXISTS idx_groups_open_deadline ON public.complaint_groups(stage_deadline) WHERE status <> 'RESOLVED';
CREATE INDEX IF NOT EXISTS idx_complaints_receipt_id ON public.complaints(receipt_id);
CREATE INDEX IF NOT EXISTS idx_complaints_group_id ON public.complaints(group_id);
CREATE INDEX IF NOT EXISTS idx_complaints_student_id ON public.complaints(student_id);
CREATE INDEX IF NOT EXISTS idx_history_group_created ON public.status_history(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_target ON public.notifications(target_role, department_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tracking_id ON public.notifications(tracking_id);

-- ------------------------------------------------------------
-- 10. updated_at maintenance
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaint_groups_updated_at ON public.complaint_groups;
CREATE TRIGGER trg_complaint_groups_updated_at
    BEFORE UPDATE ON public.complaint_groups
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 11. Row Level Security
--     Enabled on every public table. Any pre-existing policies on
--     these tables are dropped so that the only policy left is
--     "users_select_own". The service role bypasses RLS.
-- ------------------------------------------------------------
ALTER TABLE public.departments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_registration_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('departments', 'users', 'staff_registration_codes',
                            'complaint_groups', 'complaints', 'status_history', 'notifications')
          AND NOT (tablename = 'users' AND policyname = 'users_select_own')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Only end-user policy: an authenticated user may read their own profile row.
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own
    ON public.users
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = id);

-- Defense in depth: the anon role gets no table privileges at all.
REVOKE ALL ON public.departments, public.users, public.staff_registration_codes,
              public.complaint_groups, public.complaints, public.status_history,
              public.notifications
    FROM anon;

-- ------------------------------------------------------------
-- 12. 3-Day (72-Hour) Auto-Escalation (spec 07 + spec 09)
--     Returns INTEGER = total escalated across BOTH tiers.
--     Writes status_history + CRITICAL_ESCALATION notifications.
--     The previous version returned TABLE(...), so it is dropped
--     first (CREATE OR REPLACE cannot change a return type).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.simulate_time_jump(TEXT);
DROP FUNCTION IF EXISTS public.auto_escalate_stale_complaints();

CREATE OR REPLACE FUNCTION public.auto_escalate_stale_complaints()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_count INTEGER := 0;
    v_faculty_count INTEGER := 0;
BEGIN
    -- Tier 1 -> Tier 2: TEACHER -> FACULTY
    -- (Escalated rows get a fresh 3-day deadline, so the Tier 2 step
    --  below cannot double-escalate them in the same call.)
    WITH escalated AS (
        UPDATE public.complaint_groups
        SET current_handler_role = 'FACULTY',
            stage_entered_at = NOW(),
            stage_deadline = NOW() + INTERVAL '3 days',
            status = 'ESCALATED',
            updated_at = NOW()
        WHERE current_handler_role = 'TEACHER'
          AND status <> 'RESOLVED'
          AND NOW() >= stage_deadline
        RETURNING id, tracking_id, primary_department_code
    ),
    hist AS (
        INSERT INTO public.status_history (group_id, actor_role, action, note)
        SELECT id, 'SYSTEM', 'AUTO_ESCALATED',
               'Auto-escalated from TEACHER to FACULTY after 3 days of inactivity'
        FROM escalated
        RETURNING 1
    ),
    notif AS (
        INSERT INTO public.notifications (target_role, department_code, tracking_id, notification_type, message)
        SELECT 'FACULTY', primary_department_code, tracking_id, 'CRITICAL_ESCALATION',
               'AUTO-ESCALATED: Ticket #' || tracking_id ||
               ' was not forwarded by TEACHER within 3 days and has been escalated to FACULTY queue.'
        FROM escalated
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_teacher_count FROM escalated;

    -- Tier 2 -> Tier 3: FACULTY -> ADMINISTRATIVE
    WITH escalated AS (
        UPDATE public.complaint_groups
        SET current_handler_role = 'ADMINISTRATIVE',
            stage_entered_at = NOW(),
            stage_deadline = NOW() + INTERVAL '3 days',
            status = 'ESCALATED',
            escalated_to_super_admin = TRUE,
            updated_at = NOW()
        WHERE current_handler_role = 'FACULTY'
          AND status <> 'RESOLVED'
          AND NOW() >= stage_deadline
        RETURNING id, tracking_id, primary_department_code
    ),
    hist AS (
        INSERT INTO public.status_history (group_id, actor_role, action, note)
        SELECT id, 'SYSTEM', 'AUTO_ESCALATED',
               'Auto-escalated from FACULTY to ADMINISTRATIVE after 3 days of inactivity'
        FROM escalated
        RETURNING 1
    ),
    notif AS (
        INSERT INTO public.notifications (target_role, department_code, tracking_id, notification_type, message)
        SELECT 'ADMINISTRATIVE', primary_department_code, tracking_id, 'CRITICAL_ESCALATION',
               'AUTO-ESCALATED: Ticket #' || tracking_id ||
               ' was not forwarded by FACULTY within 3 days and has been escalated to ADMINISTRATIVE queue.'
        FROM escalated
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_faculty_count FROM escalated;

    RETURN v_teacher_count + v_faculty_count;
END;
$$;

-- ------------------------------------------------------------
-- 13. Demo "Simulate +3 Days" Time Jump (spec 07 §4)
--     Expires the stage deadline on non-resolved groups (all, or
--     the single tracking id) then runs the escalation engine.
--     Returns the escalation count.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.simulate_time_jump(p_tracking_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.complaint_groups
    SET stage_deadline = NOW() - INTERVAL '1 hour'
    WHERE status <> 'RESOLVED'
      AND current_handler_role <> 'ADMINISTRATIVE' -- Tier 3 has no next tier; don't leave it permanently overdue
      AND (p_tracking_id IS NULL OR tracking_id = UPPER(TRIM(p_tracking_id)));

    RETURN public.auto_escalate_stale_complaints();
END;
$$;

-- Only the service role (server routes) may call these RPCs.
REVOKE ALL ON FUNCTION public.auto_escalate_stale_complaints() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.simulate_time_jump(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_escalate_stale_complaints() TO service_role;
GRANT EXECUTE ON FUNCTION public.simulate_time_jump(TEXT) TO service_role;

-- ------------------------------------------------------------
-- 14. Storage Bucket (complaint-evidence)
--     Public bucket: files are readable via their public URL
--     (/storage/v1/object/public/complaint-evidence/...).
--     Size/MIME limits per spec 02 (images 8 MB, documents 10 MB;
--     the per-type 8 MB image cap is enforced in the upload route).
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'complaint-evidence',
    'complaint-evidence',
    true,
    10485760,
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Remove the old permissive policies. In particular there is NO
-- anon/authenticated INSERT policy: uploads go through the
-- service-role API route (app/api/complaints/upload).
DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
-- No SELECT policy is needed for public-URL reads of a public
-- bucket; omitting it stops anon clients from LISTING every object
-- name in the bucket through the storage API.
