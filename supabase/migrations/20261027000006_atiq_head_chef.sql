-- Chef Atiq's position is HEAD CHEF (it was written as EXECUTIVE HEAD CHEF); the petty cash shows the position of the staff record
update public.employees set position = 'HEAD CHEF'
where full_name = 'MUHAMMAD ATIQUFARHAN BIN AB HAMID';
