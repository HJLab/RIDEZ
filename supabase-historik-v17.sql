-- RIDEZ Historik v17 migration.
-- Run this ONCE in Supabase SQL Editor AFTER the v16 migration.

create or replace function public.ridez_delete_history_ride_v17(
 p_owner_token text,
 p_ride_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
declare deleted_count integer;
begin
 delete from ridez_rides
 where id=p_ride_id
   and owner_token=p_owner_token
   and active=false;
 get diagnostics deleted_count = row_count;
 return deleted_count=1;
end $$;

grant execute on function public.ridez_delete_history_ride_v17(text,uuid) to anon;
