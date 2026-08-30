-- RIDEZ Billeder v55
-- Koer denne EN gang i Supabase SQL Editor.
-- Opretter et Supabase Storage-bucket til komprimerede tur-billeder og en sikker RPC,
-- der kun kan knytte et billede til den aktive tur med korrekt driver-token.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ridez-photos','ridez-photos',true,5242880,array['image/jpeg'])
on conflict (id) do update
set public=true,
    file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg'];

drop policy if exists ridez_photos_anon_insert_v55 on storage.objects;
create policy ridez_photos_anon_insert_v55
on storage.objects for insert to anon
with check (bucket_id='ridez-photos' and name like 'v55/%');

drop policy if exists ridez_photos_anon_delete_v55 on storage.objects;
create policy ridez_photos_anon_delete_v55
on storage.objects for delete to anon
using (bucket_id='ridez-photos' and name like 'v55/%');

create or replace function public.ridez_register_photo_v55(
  p_driver_token text,
  p_storage_path text,
  p_lat double precision,
  p_lng double precision,
  p_captured_at timestamptz
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; photo_id bigint;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;
  select r.id into rid
  from public.ridez_rides r
  where r.driver_token=p_driver_token and r.active=true
  limit 1;
  if rid is null then raise exception 'active ride not found'; end if;
  if p_storage_path is null or p_storage_path not like ('v55/'||rid::text||'/%') then
    raise exception 'invalid storage path';
  end if;
  insert into public.ridez_photos(ride_id,storage_path,lat,lng,captured_at)
  values(rid,p_storage_path,p_lat,p_lng,coalesce(p_captured_at,now()))
  returning id into photo_id;
  return photo_id;
end $$;

grant execute on function public.ridez_register_photo_v55(text,text,double precision,double precision,timestamptz) to anon;
