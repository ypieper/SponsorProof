alter table public.events
  add column if not exists visitor_count integer check (visitor_count is null or visitor_count >= 0),
  add column if not exists social_media_reach integer check (social_media_reach is null or social_media_reach >= 0);
