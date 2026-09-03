-- RIDEZ Delte kamerabilleder v107
-- Koer denne fil EN gang i Supabase SQL Editor FOER v107 flettes ind.
-- Sikkerhedsregel:
--   camera  = maa vises via turens offentlige delingslink
--   gallery = maa kun ses af ejeren i Historik
--   private = gamle/ukendte billeder; maa aldrig vises via delingslinket

alter table public.ridez_photos
  add column if not exists photo_origin text not null default 'private';

alter table public.ridez_photos
  drop constraint if exists ridez_photos_photo_origin_check;

alter table public.ridez_photos
  add constraint ridez_photos_photo_origin_check
  check (photo_origin in ('camera','gallery','private'));

-- Eksisterende billeder forbliver private. Vi gætter aldrig deres oprindelse.
update public.ridez_photos
set photo_origin='private'
where photo_origin is null
   or photo_origin not in ('camera','gallery','private');

create index if not exists ridez_photos_public_camera_idx
  on public.ridez_photos(ride_id,day_number,id)
  where photo_origin='camera';

create or replace function public.ridez_register_photo_v107(
  p_driver_token text,
  p_storage_path text,
  p_lat double precision,
  p_lng double precision,
  p_captured_at timestamptz,
  p_day_number integer,
  p_photo_origin text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare
  rid uuid;
  photo_id bigint;
  dn integer;
  safe_origin text;
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

  dn:=greatest(1,least(coalesce(p_day_number,1),366));
  safe_origin:=case
    when p_photo_origin='camera' then 'camera'
    when p_photo_origin='gallery' then 'gallery'
    else 'private'
  end;

  insert into public.ridez_photos(
    ride_id,storage_path,lat,lng,captured_at,day_number,photo_origin
  ) values(
    rid,p_storage_path,p_lat,p_lng,coalesce(p_captured_at,now()),dn,safe_origin
  )
  returning id into photo_id;

  return photo_id;
end $$;

revoke all on function public.ridez_register_photo_v107(
  text,text,double precision,double precision,timestamptz,integer,text
) from public;
grant execute on function public.ridez_register_photo_v107(
  text,text,double precision,double precision,timestamptz,integer,text
) to anon;

create or replace function public.ridez_public_camera_photos_v107(
  p_public_token text,
  p_day_number integer,
  p_after_id bigint default 0
) returns table(
  id bigint,
  storage_path text,
  lat double precision,
  lng double precision,
  captured_at timestamptz,
  day_number integer
)
language sql security definer set search_path=public as $$
  select ph.id,
         ph.storage_path,
         ph.lat,
         ph.lng,
         ph.captured_at,
         greatest(1,ph.day_number)
  from public.ridez_photos ph
  join public.ridez_rides r on r.id=ph.ride_id
  where r.public_token=p_public_token
    and ph.photo_origin='camera'
    and greatest(1,ph.day_number)=greatest(1,coalesce(p_day_number,1))
    and ph.id>greatest(0,coalesce(p_after_id,0))
  order by ph.id asc
  limit 200
$$;

revoke all on function public.ridez_public_camera_photos_v107(text,integer,bigint) from public;
grant execute on function public.ridez_public_camera_photos_v107(text,integer,bigint) to anon;
