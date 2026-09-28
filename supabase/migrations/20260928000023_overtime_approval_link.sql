-- Overtime requests never got linked into the shared approvals table the way
-- leave requests were, so they were invisible to the Main Dashboard's Pending
-- Approvals count. Bring overtime in line with leave_requests's pattern.
alter table overtime_records
  add column approval_id uuid references approvals(id) on delete set null;
