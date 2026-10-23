-- The receipt / proof file of a customer payment sent by a sales agent is optional.
alter table public.payment_proof_submissions alter column proof_path drop not null;
