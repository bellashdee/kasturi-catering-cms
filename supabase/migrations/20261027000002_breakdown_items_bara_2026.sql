-- Restoran Bara (Senibong), O2 Life, 2026: the figures of the "Sales & Costing" workbooks (Jan - May breakdown sheet, Jun and Jul files).

insert into public.monthly_sales (company_id, year, month, sales_type, sales_amount)
select c.id, 2026, v.m, 'total', v.amt
from public.companies c,
  (values (1, 134506.21), (2, 94832.15), (3, 74247.32), (4, 73000.51), (5, 45105.57), (6, 75725.00), (7, 90810.00)) as v(m, amt)
where c.name = 'O2 Life'
on conflict (company_id, year, month, sales_type) do nothing;

insert into public.breakdown_items (company_id, year, line, label, budget, note, amounts, sort_order)
select c.id, 2026, v.line, v.label, v.budget, v.note, v.amounts, v.ord
from public.companies c,
  (values
    ('raw', 'Actual cost of the month (costing report)', null::numeric, 'June: total expenses 27,475.05 + carried forward 5,046.52', array[60935.08, 42155.67, 32015.82, 27233.58, 21397.99, 32521.57, null, null, null, null, null, null]::numeric[], 1),
    ('labour', 'Salary', null, null, array[49460.77, 41494.14, 40184.64, null, null, null, null, null, null, null, null, null]::numeric[], 1),
    ('utilities', 'Rental', 2000, null, array[2000, 2000, 2000, 2000, 2000, null, null, null, null, null, null, null]::numeric[], 1),
    ('utilities', 'Hostel Bara', 1000, null, array[1000, 1000, 1000, 1000, 1000, null, null, null, null, null, null, null]::numeric[], 2),
    ('utilities', 'Hostel Impian', 900, null, array[900, 0, 0, 0, null, null, null, null, null, null, null, null]::numeric[], 3),
    ('utilities', 'TNB', 1700, null, array[1202.18, 1245.55, 1069.75, 1456.43, null, null, null, null, null, null, null, null]::numeric[], 4),
    ('utilities', 'SAJ Runhill', 700, null, array[817.01, 659.35, 754.75, 696.45, null, null, null, null, null, null, null, null]::numeric[], 5),
    ('utilities', 'Wifi, system', 300, null, array[102.65, 73.74, 73.74, 73.74, null, null, null, null, null, null, null, null]::numeric[], 6),
    ('contribution', 'Food review', 2500, null, array[1200, 5300, null, 800, null, null, null, null, null, null, null, null]::numeric[], 1),
    ('contribution', 'Lela salary', 2200, 'MC', array[965, 0, 0, null, null, null, null, null, null, null, null, null]::numeric[], 2),
    ('contribution', 'Incentive', null, 'March: Adi 104, Nad 50, Fakhrul 124', array[0, 0, null, null, null, null, null, null, null, null, null, null]::numeric[], 3),
    ('contribution', 'Part-time', 1500, null, array[250, 300, 150, 200, null, null, null, null, null, null, null, null]::numeric[], 4),
    ('contribution', 'Maintenance', null, null, array[2363, 1791, 1491.6, 1017.3, 740.2, null, null, null, null, null, null, null]::numeric[], 5),
    ('contribution', 'MC', null, null, array[123, null, 278, 58, null, null, null, null, null, null, null, null]::numeric[], 6)
  ) as v(line, label, budget, note, amounts, ord)
where c.name = 'O2 Life';
