-- RIDEZ v118: Android-tjenesten gemmer og deler GPS-punkter direkte,
-- også når RIDEZ-webvisningen er sat på pause bag Kurviger.

create table if not exists public.ridez_native_tracking_state_v118(
  ride_id uuid primary key references public.ridez_rides(id) on delete cascade,
  last_recorded_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_accuracy_m double precision,
  last_speed_ms double precision not null default 0,
  warmup_count integer not null default 0,
  distance_m double precision not null default 0,
  moving_seconds double precision not null default 0,
  stopped_seconds double precision not null default 0,
  moving boolean not null default false,
  stopped_since timestamptz,
  current_day_number integer not null default 1,
  current_segment_number integer not null default 1,
  last_track_at timestamptz,
  pending_track_distance_m double precision not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ridez_native_tracking_state_v118 enable row level security;
revoke all on public.ridez_native_tracking_state_v118 from anon,authenticated;

create or replace function public.ridez_native_location_batch_v118(
  p_driver_token text,
  p_points jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  rid uuid;
  ride_active boolean;
  ride_created_at timestamptz;
  ride_last_at timestamptz;
  ride_lat double precision;
  ride_lng double precision;
  ride_accuracy double precision;
  ride_speed double precision;
  ride_distance double precision;
  ride_moving_s integer;
  ride_stopped_s integer;
  ride_day integer;
  ride_segment integer;
  s public.ridez_native_tracking_state_v118%rowtype;
  point jsonb;
  rec timestamptz;
  lat double precision;
  lng double precision;
  accuracy double precision;
  reported_speed double precision;
  speed double precision;
  dt double precision;
  distance_step double precision;
  derived_speed double precision;
  a double precision;
  old_moving boolean;
  should_store boolean;
  accepted integer:=0;
  rejected integer:=0;
  inserted integer:=0;
  batch_max_speed double precision:=0;
begin
  if char_length(coalesce(p_driver_token,''))<32 or jsonb_typeof(p_points)<>'array' then
    raise exception 'invalid native GPS batch';
  end if;

  select r.id,r.active,r.created_at,r.last_point_at,r.lat,r.lng,r.accuracy_m,r.speed_ms,
         coalesce(r.distance_m,0),coalesce(r.moving_s,0),coalesce(r.stopped_s,0),
         greatest(1,coalesce(r.current_day_number,1)),greatest(1,coalesce(r.current_segment_number,1))
  into rid,ride_active,ride_created_at,ride_last_at,ride_lat,ride_lng,ride_accuracy,ride_speed,
       ride_distance,ride_moving_s,ride_stopped_s,ride_day,ride_segment
  from public.ridez_rides r
  where r.driver_token=p_driver_token
  for update;

  if rid is null then raise exception 'ride not found';end if;

  insert into public.ridez_native_tracking_state_v118(
    ride_id,last_recorded_at,last_lat,last_lng,last_accuracy_m,last_speed_ms,warmup_count,
    distance_m,moving_seconds,stopped_seconds,moving,current_day_number,current_segment_number,last_track_at
  ) values(
    rid,ride_last_at,ride_lat,ride_lng,ride_accuracy,greatest(0,coalesce(ride_speed,0)),
    case when ride_last_at is null then 0 else 3 end,
    greatest(0,ride_distance),greatest(0,ride_moving_s),greatest(0,ride_stopped_s),false,
    ride_day,ride_segment,ride_last_at
  ) on conflict(ride_id) do nothing;

  select * into s from public.ridez_native_tracking_state_v118
  where ride_id=rid for update;

  for point in select value from jsonb_array_elements(p_points) loop
    begin
      rec:=to_timestamp((point->>'timestamp')::double precision/1000.0);
      lat:=(point->>'latitude')::double precision;
      lng:=(point->>'longitude')::double precision;
      accuracy:=(point->>'accuracy')::double precision;
      reported_speed:=case when jsonb_typeof(point->'speed')='number'
                           then (point->>'speed')::double precision else null end;
    exception when others then
      rejected:=rejected+1;
      continue;
    end;

    if lat not between -90 and 90 or lng not between -180 and 180
       or accuracy<0 or accuracy>80
       or rec<ride_created_at-interval '5 minutes' or rec>now()+interval '5 minutes'
       or (s.last_recorded_at is not null and rec<=s.last_recorded_at) then
      rejected:=rejected+1;
      continue;
    end if;

    if s.last_recorded_at is null then
      s.last_recorded_at:=rec;s.last_lat:=lat;s.last_lng:=lng;s.last_accuracy_m:=accuracy;
      s.last_speed_ms:=greatest(0,least(coalesce(reported_speed,0),75));s.warmup_count:=1;
      continue;
    end if;

    dt:=extract(epoch from rec-s.last_recorded_at);
    if dt>30 then
      s.current_segment_number:=s.current_segment_number+1;
      s.last_recorded_at:=rec;s.last_lat:=lat;s.last_lng:=lng;s.last_accuracy_m:=accuracy;
      s.last_speed_ms:=greatest(0,least(coalesce(reported_speed,0),75));s.warmup_count:=1;
      s.pending_track_distance_m:=0;
      continue;
    end if;
    if dt<=0 then rejected:=rejected+1;continue;end if;

    if s.warmup_count<2 then
      s.warmup_count:=s.warmup_count+1;
      s.last_recorded_at:=rec;s.last_lat:=lat;s.last_lng:=lng;s.last_accuracy_m:=accuracy;
      s.last_speed_ms:=greatest(0,least(coalesce(reported_speed,0),75));
      continue;
    end if;
    s.warmup_count:=3;

    a:=power(sin(radians(lat-s.last_lat)/2),2)+
       cos(radians(s.last_lat))*cos(radians(lat))*power(sin(radians(lng-s.last_lng)/2),2);
    distance_step:=2*6371000*asin(least(1.0,sqrt(greatest(0,a))));
    derived_speed:=distance_step/dt;
    if derived_speed>75 then
      rejected:=rejected+1;
      continue;
    end if;

    speed:=case when reported_speed between 0 and 75 then reported_speed else derived_speed end;
    if reported_speed is not null and reported_speed<0.8 and derived_speed>15
       and distance_step>greatest(30,accuracy+coalesce(s.last_accuracy_m,accuracy)) then
      rejected:=rejected+1;
      continue;
    end if;
    if dt<5 and abs(speed-s.last_speed_ms)>18*dt+5 then
      rejected:=rejected+1;
      continue;
    end if;

    old_moving:=s.moving;
    if speed>=2.5 then
      s.moving:=true;s.stopped_since:=null;
      s.moving_seconds:=s.moving_seconds+least(dt,15);
      s.distance_m:=s.distance_m+distance_step;
      s.pending_track_distance_m:=s.pending_track_distance_m+distance_step;
    else
      s.stopped_seconds:=s.stopped_seconds+least(dt,15);
      if speed<=0.8 then
        if s.stopped_since is null then s.stopped_since:=rec;end if;
        if rec-s.stopped_since>=interval '3 seconds' then s.moving:=false;end if;
      end if;
    end if;

    s.current_day_number:=greatest(1,(rec::date-ride_created_at::date)+1);
    s.last_recorded_at:=rec;s.last_lat:=lat;s.last_lng:=lng;s.last_accuracy_m:=accuracy;s.last_speed_ms:=speed;
    batch_max_speed:=greatest(batch_max_speed,speed);
    accepted:=accepted+1;

    should_store:=s.last_track_at is null or old_moving is distinct from s.moving
      or (s.moving and rec-s.last_track_at>=interval '4 seconds')
      or (not s.moving and rec-s.last_track_at>=interval '60 seconds');
    if should_store then
      insert into public.ridez_track_points(
        ride_id,lat,lng,speed_ms,created_at,recorded_at,day_number,segment_number,
        step_distance_m,total_distance_m,moving_s,stopped_s
      ) values(
        rid,lat,lng,speed,rec,rec,s.current_day_number,s.current_segment_number,
        greatest(0,s.pending_track_distance_m),s.distance_m,
        floor(s.moving_seconds)::integer,floor(s.stopped_seconds)::integer
      );
      s.pending_track_distance_m:=0;s.last_track_at:=rec;inserted:=inserted+1;
    end if;
  end loop;

  update public.ridez_native_tracking_state_v118 set
    last_recorded_at=s.last_recorded_at,last_lat=s.last_lat,last_lng=s.last_lng,
    last_accuracy_m=s.last_accuracy_m,last_speed_ms=s.last_speed_ms,warmup_count=s.warmup_count,
    distance_m=s.distance_m,moving_seconds=s.moving_seconds,stopped_seconds=s.stopped_seconds,
    moving=s.moving,stopped_since=s.stopped_since,current_day_number=s.current_day_number,
    current_segment_number=s.current_segment_number,last_track_at=s.last_track_at,
    pending_track_distance_m=s.pending_track_distance_m,updated_at=now()
  where ride_id=rid;

  if accepted>0 then
    update public.ridez_rides r set
      lat=s.last_lat,lng=s.last_lng,speed_ms=s.last_speed_ms,
      moving=case when r.active then s.moving else false end,
      accuracy_m=s.last_accuracy_m,updated_at=now(),last_point_at=s.last_recorded_at,
      current_day_number=s.current_day_number,current_segment_number=s.current_segment_number,
      track_point_count=coalesce(r.track_point_count,0)+inserted,
      distance_m=greatest(coalesce(r.distance_m,0),s.distance_m),
      moving_s=greatest(coalesce(r.moving_s,0),floor(s.moving_seconds)::integer),
      stopped_s=greatest(coalesce(r.stopped_s,0),floor(s.stopped_seconds)::integer),
      max_speed_ms=greatest(coalesce(r.max_speed_ms,0),batch_max_speed)
    where r.id=rid;
  end if;

  return jsonb_build_object('accepted',accepted,'rejected',rejected,'stored',inserted,
    'distance_m',s.distance_m,'moving',s.moving,'last_recorded_at',s.last_recorded_at);
end $$;

revoke all on function public.ridez_native_location_batch_v118(text,jsonb) from public;
grant execute on function public.ridez_native_location_batch_v118(text,jsonb) to anon;

-- Webvisningen må gerne supplere med hældning, sving og acceleration, men må
-- aldrig overskrive Android-tjenestens større distance- eller tidsværdier.
create or replace function public.ridez_update_live_stats_v118(
  p_driver_token text,p_distance_m double precision,p_max_speed_ms double precision,
  p_moving_s integer,p_stopped_s integer,p_accel_best_s double precision,
  p_accel_best_start_kmh double precision,p_accel_best_end_kmh double precision,
  p_accel_slowest_s double precision,p_accel_slowest_start_kmh double precision,
  p_accel_slowest_end_kmh double precision,p_live_lean_deg double precision,
  p_max_lean_left_deg double precision,p_max_lean_right_deg double precision,
  p_turn_left_count integer,p_turn_right_count integer
) returns void
language sql security definer set search_path=public as $$
 update public.ridez_rides set
   distance_m=greatest(coalesce(distance_m,0),greatest(0,coalesce(p_distance_m,0))),
   max_speed_ms=greatest(coalesce(max_speed_ms,0),greatest(0,coalesce(p_max_speed_ms,0))),
   moving_s=greatest(coalesce(moving_s,0),greatest(0,coalesce(p_moving_s,0))),
   stopped_s=greatest(coalesce(stopped_s,0),greatest(0,coalesce(p_stopped_s,0))),
   accel_best_80_s=case when p_accel_best_s is null then accel_best_80_s else greatest(0,p_accel_best_s) end,
   accel_best_80_start_kmh=case when p_accel_best_s is null then accel_best_80_start_kmh else p_accel_best_start_kmh end,
   accel_best_80_end_kmh=case when p_accel_best_s is null then accel_best_80_end_kmh else p_accel_best_end_kmh end,
   accel_slowest_80_s=case when p_accel_slowest_s is null then accel_slowest_80_s else greatest(0,p_accel_slowest_s) end,
   accel_slowest_80_start_kmh=case when p_accel_slowest_s is null then accel_slowest_80_start_kmh else p_accel_slowest_start_kmh end,
   accel_slowest_80_end_kmh=case when p_accel_slowest_s is null then accel_slowest_80_end_kmh else p_accel_slowest_end_kmh end,
   live_lean_deg=greatest(-70,least(70,coalesce(p_live_lean_deg,0))),
   max_lean_left_deg=greatest(coalesce(max_lean_left_deg,0),greatest(0,coalesce(p_max_lean_left_deg,0))),
   max_lean_right_deg=greatest(coalesce(max_lean_right_deg,0),greatest(0,coalesce(p_max_lean_right_deg,0))),
   turn_left_count=greatest(coalesce(turn_left_count,0),greatest(0,coalesce(p_turn_left_count,0))),
   turn_right_count=greatest(coalesce(turn_right_count,0),greatest(0,coalesce(p_turn_right_count,0)))
 where driver_token=p_driver_token and active=true
$$;

revoke all on function public.ridez_update_live_stats_v118(text,double precision,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer) from public;
grant execute on function public.ridez_update_live_stats_v118(text,double precision,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer) to anon;

-- Ved Stop tur bevares de største værdier. En webvisning, der lige er kommet
-- tilbage fra baggrunden, kan derfor ikke nulstille dagens native GPS-resultat.
create or replace function public.ridez_end_ride_v118(
 p_driver_token text,p_distance_m double precision,p_duration_s integer,p_max_speed_ms double precision,
 p_moving_s integer,p_stopped_s integer,p_accel_0_80_s double precision,p_accel_0_100_s double precision,
 p_accel_best_80_s double precision,p_accel_best_80_start_kmh double precision,p_accel_best_80_end_kmh double precision,
 p_accel_slowest_80_s double precision,p_accel_slowest_80_start_kmh double precision,p_accel_slowest_80_end_kmh double precision,
 p_max_lean_left_deg double precision,p_max_lean_right_deg double precision,p_turn_left_count integer,p_turn_right_count integer
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 update public.ridez_rides r set
   active=false,moving=false,
   distance_m=greatest(coalesce(r.distance_m,0),greatest(0,coalesce(p_distance_m,0))),
   duration_s=greatest(coalesce(r.duration_s,0),greatest(0,coalesce(p_duration_s,0)),coalesce(r.moving_s,0)+coalesce(r.stopped_s,0)),
   max_speed_ms=greatest(coalesce(r.max_speed_ms,0),greatest(0,coalesce(p_max_speed_ms,0))),
   moving_s=greatest(coalesce(r.moving_s,0),greatest(0,coalesce(p_moving_s,0))),
   stopped_s=greatest(coalesce(r.stopped_s,0),greatest(0,coalesce(p_stopped_s,0))),
   accel_0_80_s=coalesce(p_accel_0_80_s,r.accel_0_80_s),accel_0_100_s=coalesce(p_accel_0_100_s,r.accel_0_100_s),
   accel_best_80_s=coalesce(p_accel_best_80_s,r.accel_best_80_s),
   accel_best_80_start_kmh=coalesce(p_accel_best_80_start_kmh,r.accel_best_80_start_kmh),
   accel_best_80_end_kmh=coalesce(p_accel_best_80_end_kmh,r.accel_best_80_end_kmh),
   accel_slowest_80_s=coalesce(p_accel_slowest_80_s,r.accel_slowest_80_s),
   accel_slowest_80_start_kmh=coalesce(p_accel_slowest_80_start_kmh,r.accel_slowest_80_start_kmh),
   accel_slowest_80_end_kmh=coalesce(p_accel_slowest_80_end_kmh,r.accel_slowest_80_end_kmh),
   max_lean_left_deg=greatest(coalesce(r.max_lean_left_deg,0),greatest(0,coalesce(p_max_lean_left_deg,0))),
   max_lean_right_deg=greatest(coalesce(r.max_lean_right_deg,0),greatest(0,coalesce(p_max_lean_right_deg,0))),
   turn_left_count=greatest(coalesce(r.turn_left_count,0),greatest(0,coalesce(p_turn_left_count,0))),
   turn_right_count=greatest(coalesce(r.turn_right_count,0),greatest(0,coalesce(p_turn_right_count,0))),
   ended_at=coalesce(r.ended_at,now()),updated_at=now(),
   track_point_count=(select count(*) from public.ridez_track_points p where p.ride_id=r.id)
 where r.driver_token=p_driver_token returning r.id into rid;
 if rid is null then raise exception 'ride not found';end if;
 return rid;
end $$;

revoke all on function public.ridez_end_ride_v118(text,double precision,integer,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer) from public;
grant execute on function public.ridez_end_ride_v118(text,double precision,integer,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer) to anon;
