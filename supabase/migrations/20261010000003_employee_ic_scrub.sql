-- HRMS Phase 3, part 3: remove the IC / passport number from the company-readable employees table.
-- APPLY ONLY AFTER the new app code is deployed (it reads and writes the IC in employee_private_details).
-- Safe by construction: a value is cleared only when an identical copy already exists in employee_private_details.
update employees e
set ic_passport_no = null
where e.ic_passport_no is not null
  and exists (
    select 1 from employee_private_details p
    where p.employee_id = e.id and p.ic_passport_no = e.ic_passport_no
  );
