-- Driver is entered as free text (typed by whoever runs the clock-in kiosk)
-- rather than selected from the Staff Database, per product direction —
-- same approach as the Petty Cash claimant field.
alter table driver_attendance
  alter column driver_id drop not null,
  add column if not exists driver_name text;

alter table driver_attendance add constraint driver_attendance_name_date_unique unique (company_id, driver_name, attendance_date);
