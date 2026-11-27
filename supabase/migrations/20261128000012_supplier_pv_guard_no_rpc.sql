-- The allocation guard runs only as a trigger; nobody calls it through the API.
revoke execute on function public.supplier_pv_allocation_guard() from authenticated, anon, public;
