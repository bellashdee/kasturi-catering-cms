-- Staff documents: warning letters and other HR letters can be filed on a staff member's record
alter table employee_certificates drop constraint if exists employee_certificates_cert_type_check;
alter table employee_certificates
  add constraint employee_certificates_cert_type_check
  check (cert_type in ('food_handling','typhoid','work_permit','training','medical_certificate','confirmation_letter','loa','warning_letter','show_cause_letter','contract','appraisal','other'));
