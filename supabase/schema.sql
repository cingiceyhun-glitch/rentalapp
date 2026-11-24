-- HomeHunt sync: run this once in your Supabase project (SQL Editor → New query → Run).
-- Safe to run again.

-- Homes. The app's own record is stored as JSON in `data`, so new fields
-- need no database change.
create table if not exists public.listings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at bigint not null,            -- the device's edit time (ms); newest edit wins
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- Your own photos. The image itself lives in the "photos" storage bucket.
create table if not exists public.photos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_id uuid not null,
  created_at bigint not null,
  path text not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()
);

create index if not exists listings_user_sync on public.listings (user_id, server_updated_at);
create index if not exists photos_user_sync on public.photos (user_id, server_updated_at);

-- Stamp each change with the server's clock, so devices can ask "what changed
-- since …". For homes, an older edit never overwrites a newer one.
create or replace function public.homehunt_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'listings' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before insert or update on public.listings
  for each row execute function public.homehunt_touch();

drop trigger if exists photos_touch on public.photos;
create trigger photos_touch before insert or update on public.photos
  for each row execute function public.homehunt_touch();

-- Let signed-in users reach the tables at all (newer Supabase projects don't
-- grant this automatically); the policies below then limit them to their own rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.listings, public.photos to authenticated;

-- Everyone only ever sees their own rows.
alter table public.listings enable row level security;
alter table public.photos enable row level security;

drop policy if exists "own listings" on public.listings;
create policy "own listings" on public.listings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own photos" on public.photos;
create policy "own photos" on public.photos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private bucket for photo files, one folder per user: photos/<user id>/<photo id>.jpg
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photo files" on storage.objects;
create policy "own photo files" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
