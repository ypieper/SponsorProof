-- Contact details belong to an event because sponsors need the right contact
-- person for each individual event.
alter table public.events
  add column if not exists contact_first_name text not null default '',
  add column if not exists contact_last_name text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists contact_phone text not null default '';

-- Seed existing events from the former organization-wide contact so those
-- details remain available after the settings field is moved.
update public.events e
set contact_first_name = coalesce(nullif(btrim(e.contact_first_name), ''), nullif(btrim(s.contact_first_name), ''), ''),
    contact_last_name = coalesce(nullif(btrim(e.contact_last_name), ''), nullif(btrim(s.contact_last_name), ''), ''),
    contact_email = coalesce(nullif(btrim(e.contact_email), ''), nullif(btrim(s.contact_email), ''), ''),
    contact_phone = coalesce(nullif(btrim(e.contact_phone), ''), nullif(btrim(s.contact_phone), ''), '')
from public.organization_settings s
where s.organization_id = e.organization_id;
