-- ============================================================
-- CAMPUS SPEEDRUN: DEMO SEED DATA
-- Run AFTER supabase_migration.sql in the Supabase SQL Editor.
--
-- Moves the demo tickets that used to be hard-coded in
-- lib/store.ts into the database. Idempotent:
--   * groups:        ON CONFLICT (tracking_id) DO NOTHING
--   * complaints:    ON CONFLICT (receipt_id)  DO NOTHING
--   * history/notifications: inserted only if an identical row
--     does not already exist.
-- All ids are DB-generated; deadlines are relative to NOW().
-- student_id is NULL for every demo ticket (no real users).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Complaint groups
-- ------------------------------------------------------------
INSERT INTO public.complaint_groups (
    tracking_id, title, normalized_title, ai_summary, category, subcategory, location_zone,
    priority, priority_score, is_safety_critical, is_damage_prone,
    primary_department_code, collaborating_department_codes, hashtags, routing_reasoning,
    current_handler_role, stage_entered_at, stage_deadline, status, report_count,
    escalated_to_super_admin, student_id, can_track, created_at, updated_at
) VALUES
(
    'CSR-48291',
    'Ceiling fan in B.Tech Lab 3 is sparking and wobbling violently',
    'Sparking Ceiling Fan Structural Hazard in B.Tech Lab 3',
    'Problem Narration: A high-velocity ceiling fan has exposed live wiring and severe mechanical wobble in B.Tech Lab 3. Impact Assessment: Poses an immediate electrocution and physical head trauma hazard to students. Recommended Execution: Immediate circuit disconnection and mechanical replacement by technical maintenance.',
    'INFRASTRUCTURE', 'Lab Electrical Fixture', 'B.Tech Block - CSE Lab 3',
    'CRITICAL', 100, TRUE, TRUE,
    'BTECH', ARRAY['INFRA'], ARRAY['#BTech', '#technical', '#LabDamage', '#Infrastructure'],
    'Ranked #1 Priority due to active high-voltage electrical sparking and mechanical instability directly above student workstations.',
    'TEACHER', NOW() - INTERVAL '30 hours', NOW() + INTERVAL '42 hours', 'IN_PROGRESS', 3,
    FALSE, NULL, TRUE, NOW() - INTERVAL '30 hours', NOW()
),
(
    'CSR-83920',
    'Water leaking from AC vent directly onto student workstations in MCA Seminar Hall',
    'AC Condensation Leak Threatening MCA Equipment',
    'Problem Narration: Severe condensation runoff from ceiling AC ducts is dripping onto high-end computing equipment in MCA Seminar Hall. Impact Assessment: Risk of short-circuiting institutional servers and student laptops. Recommended Execution: Clear drain pipe blockage and inspect overhead insulation.',
    'INFRASTRUCTURE', 'HVAC & Civil Maintenance', 'MCA Block - Seminar Hall',
    'HIGH', 73, FALSE, TRUE,
    'MCA', ARRAY['INFRA'], ARRAY['#MCA', '#Infrastructure', '#LabDamage'],
    'Prioritized high due to physical risk of water damage destroying institutional computer hardware.',
    'TEACHER', NOW() - INTERVAL '60 hours', NOW() + INTERVAL '12 hours', 'ACKNOWLEDGED', 2,
    FALSE, NULL, TRUE, NOW() - INTERVAL '60 hours', NOW()
),
(
    'CSR-19402',
    'Chemistry Lab fume hood exhaust motor seized during organic synthesis',
    'Exhaust Motor Failure in Applied Sciences Chemistry Lab',
    'Problem Narration: The primary chemical fume hood in Chemistry Lab 1 failed to exhaust volatile organic fumes. Impact Assessment: Lab air quality compromised; students evacuated. Recommended Execution: Emergency motor replacement and chemical vapor clearance.',
    'INFRASTRUCTURE', 'Laboratory Ventilation', 'Applied Sciences - Chemistry Lab 1',
    'HIGH', 85, TRUE, TRUE,
    'SCI', ARRAY['INFRA'], ARRAY['#AppliedSciences', '#ScienceLab', '#Infrastructure'],
    'Chemical vapor accumulation represents an urgent occupational safety hazard requiring Faculty intervention.',
    'FACULTY', NOW() - INTERVAL '10 hours', NOW() + INTERVAL '62 hours', 'IN_PROGRESS', 1,
    FALSE, NULL, TRUE, NOW() - INTERVAL '82 hours', NOW()
),
(
    'CSR-74109',
    'Core 48-port switch down affecting campus-wide programming lab connectivity',
    'Core Network Switch Outage in Central IT Server Wing',
    'Problem Narration: The central PoE switch powering academic labs 1 through 5 has sustained hardware failure. Impact Assessment: Halts all ongoing practical examinations and online submissions. Recommended Execution: Replace modular power supply or switch to backup chassis.',
    'IT_NETWORK', 'Core Infrastructure', 'Central IT Wing - Rack 4',
    'HIGH', 72, FALSE, FALSE,
    'IT', ARRAY['BTECH', 'MCA'], ARRAY['#ITSupport', '#Hardware', '#Network'],
    'Affects multiple academic departments concurrently during examination week.',
    'ADMINISTRATIVE', NOW() - INTERVAL '15 hours', NOW() + INTERVAL '57 hours', 'IN_PROGRESS', 5,
    TRUE, NULL, TRUE, NOW() - INTERVAL '160 hours', NOW()
),
(
    'CSR-55201',
    'Water cooler filtration unit leaking in 2nd Floor Washroom corridor',
    'RO Water Station Overflow in Academic Block 2',
    'Problem Narration: Filtration outlet overflow valve is stuck open causing water accumulation on floor tiles. Impact Assessment: Slip hazard and clean drinking water disruption. Recommended Execution: Replace float valve and sanitize dispenser unit.',
    'SANITATION', 'Plumbing & Drinking Water', 'Academic Block 2 - Floor 2 Washroom Corridor',
    'MEDIUM', 40, FALSE, FALSE,
    'SAN', ARRAY['INFRA'], ARRAY['#Sanitation', '#CleanWater'],
    'Standard sanitary maintenance with low immediate safety risk.',
    'TEACHER', NOW() - INTERVAL '5 hours', NOW() + INTERVAL '67 hours', 'UNACKNOWLEDGED', 1,
    FALSE, NULL, FALSE, NOW() - INTERVAL '5 hours', NOW()
)
ON CONFLICT (tracking_id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Individual complaint receipts (REP-XXXXX lookups)
-- ------------------------------------------------------------
INSERT INTO public.complaints (
    receipt_id, group_id, student_id, is_anonymous, raw_text, location_zone,
    image_url, document_url, attachment_name, created_at
)
SELECT v.receipt_id, g.id, NULL, TRUE, v.raw_text, v.location_zone,
       NULL, NULL, v.attachment_name, v.created_at
FROM (VALUES
    ('REP-10291', 'CSR-48291',
     'The ceiling fan in B.Tech CSE Lab 3 is sparking and making a loud grinding noise right above seat 14.',
     'B.Tech Block - CSE Lab 3', 'sparking_fan.jpg', NOW() - INTERVAL '30 hours'),
    ('REP-40912', 'CSR-83920',
     'Water is dripping from the AC onto our lab laptops in MCA seminar room.',
     'MCA Block - Seminar Hall', NULL, NOW() - INTERVAL '60 hours')
) AS v(receipt_id, tracking_id, raw_text, location_zone, attachment_name, created_at)
JOIN public.complaint_groups g ON g.tracking_id = v.tracking_id
ON CONFLICT (receipt_id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Status history
-- ------------------------------------------------------------
INSERT INTO public.status_history (group_id, actor_role, action, note, created_at)
SELECT g.id, v.actor_role, v.action, v.note, v.created_at
FROM (VALUES
    ('CSR-48291', 'STUDENT', 'SUBMITTED',
     'Initial complaint filed anonymously via student portal', NOW() - INTERVAL '30 hours'),
    ('CSR-48291', 'TEACHER', 'IN_PROGRESS',
     'Teacher assigned campus electrician for urgent inspection', NOW() - INTERVAL '25 hours'),
    ('CSR-19402', 'SYSTEM', 'AUTO_ESCALATED',
     'Auto-escalated from TEACHER to FACULTY after 3 days of inactivity', NOW() - INTERVAL '10 hours')
) AS v(tracking_id, actor_role, action, note, created_at)
JOIN public.complaint_groups g ON g.tracking_id = v.tracking_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.status_history h
    WHERE h.group_id = g.id AND h.action = v.action AND h.note = v.note
);

-- ------------------------------------------------------------
-- 4. Notifications
-- ------------------------------------------------------------
INSERT INTO public.notifications (target_role, department_code, tracking_id, notification_type, message, is_read, created_at)
SELECT v.target_role::user_role, v.department_code, v.tracking_id, v.notification_type, v.message, FALSE, v.created_at
FROM (VALUES
    ('TEACHER', 'MCA', 'CSR-83920', 'SLA_WARNING',
     'URGENT: Ticket #CSR-83920 (Water leak in MCA Hall) has 12 hours remaining before auto-escalation to FACULTY.',
     NOW() - INTERVAL '1 hour'),
    ('TEACHER', 'BTECH', 'CSR-48291', 'NEW_ASSIGNMENT',
     'New Critical Assignment: Sparking Ceiling Fan in B.Tech Lab 3 assigned to TEACHER review.',
     NOW() - INTERVAL '2 hours')
) AS v(target_role, department_code, tracking_id, notification_type, message, created_at)
WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.tracking_id = v.tracking_id
      AND n.notification_type = v.notification_type
      AND n.message = v.message
);

COMMIT;
