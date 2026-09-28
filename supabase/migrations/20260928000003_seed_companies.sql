insert into companies (name, legal_name) values
  ('Signature Solution', 'Signature Solution Sdn Bhd'),
  ('Kasturi Indah', 'Kasturi Indah Sdn Bhd'),
  ('O2 Life', 'O2 Life Sdn Bhd')
on conflict (legal_name) do nothing;
