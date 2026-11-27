alter table public.supplier_soa_reconciliations
  add column supplier_stated_opening numeric(14, 2),
  add column supplier_stated_closing numeric(14, 2);
comment on column public.supplier_soa_reconciliations.supplier_stated_opening is 'The opening balance printed on the supplier SOA (null when not printed); supplier_opening is the figure used (stated, else the opening line).';
comment on column public.supplier_soa_reconciliations.supplier_stated_closing is 'The closing balance printed on the supplier SOA (null when not printed); supplier_closing is the figure used (stated, else the last running balance, else worked out).';
