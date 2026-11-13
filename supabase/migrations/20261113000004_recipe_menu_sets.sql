-- The fixed menu sets a recipe belongs to (Signature Solution: JDT 2, JDT 3, JDT 4, JDT UTM), for the Recipes filter and the daily menus.
-- Filled on 2026-11-13 from "MENU JDT 2.xlsx" (JDT 2) and "MENU UTM, JDT 3, JDT 4.xlsx" (JDT 3, JDT 4, JDT UTM).
alter table public.recipes add column if not exists menu_sets text[] not null default '{}';
