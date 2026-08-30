-- RIDEZ v50: Fast folgelink til Demo Mode.
-- Linket peger pa en stabil demo-kanal, som automatisk skifter til den nyeste demo-tur.

create table if not exists public.ridez_demo_channels (
  channel_token text primary key,
  owner_token text not null,
  current_public_token text,
  updated_at timestamptz not null default now()
);

alter table public.ridez_demo_channels enable row level security;

create or replace function public.ridez_set_demo_channel_v50(
  p_owner_token text,
  p_channel_token text,
  p_public_token text
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if length(coalesce(p_owner_token,'')) < 32
     or length(coalesce(p_channel_token,'')) < 32
     or length(coalesce(p_public_token,'')) < 32 then
    raise exception 'invalid token';
  end if;

  if not exists (
    select 1 from public.ridez_rides r
    where r.owner_token=p_owner_token and r.public_token=p_public_token
  ) then
    raise exception 'ride not owned by token';
  end if;

  update public.ridez_demo_channels
     set current_public_token=p_public_token, updated_at=now()
   where channel_token=p_channel_token and owner_token=p_owner_token;

  if not found then
    begin
      insert into public.ridez_demo_channels(channel_token,owner_token,current_public_token)
      values(p_channel_token,p_owner_token,p_public_token);
    exception when unique_violation then
      raise exception 'demo channel belongs to another owner';
    end;
  end if;
end $$;

create or replace function public.ridez_resolve_demo_channel_v50(
  p_channel_token text
) returns table(public_token text)
language sql
security definer
set search_path=public
as $$
  select d.current_public_token
  from public.ridez_demo_channels d
  where d.channel_token=p_channel_token
  limit 1
$$;

grant execute on function public.ridez_set_demo_channel_v50(text,text,text) to anon;
grant execute on function public.ridez_resolve_demo_channel_v50(text) to anon;
