-- The staff who clock in and out of an event are the drivers and the foreign staff on duty (part-time IA MyStaff is no longer used).
alter table public.event_attendance drop constraint event_attendance_staff_type_check;
alter table public.event_attendance add constraint event_attendance_staff_type_check check (staff_type = any (array['driver'::text, 'foreign_staff'::text, 'ia_mystaff'::text]));
