-- Some menu plans (e.g. JDT 2) are written per day of the week (Monday-Sunday), with no breakfast/lunch/dinner split.
-- A "daily" meal carries a day_of_week; breakfast/lunch/dinner meals keep day_of_week null, so existing data is untouched.
alter table menu_plan_meals add column day_of_week text
  check (day_of_week in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'));

alter table menu_plan_meals drop constraint menu_plan_meals_meal_time_check;
alter table menu_plan_meals add constraint menu_plan_meals_meal_time_check
  check (meal_time in ('breakfast', 'lunch', 'dinner', 'daily'));

alter table menu_plan_meals drop constraint menu_plan_meals_week_id_meal_time_key;
alter table menu_plan_meals add constraint menu_plan_meals_week_meal_day_key
  unique nulls not distinct (week_id, meal_time, day_of_week);

alter table menu_plan_meals add constraint menu_plan_meals_daily_needs_day
  check ((meal_time = 'daily') = (day_of_week is not null));
