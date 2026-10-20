create table if not exists public.event_report_metrics (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  metric_name text not null check (length(trim(metric_name)) between 1 and 80),
  metric_value text not null check (length(trim(metric_value)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, metric_name)
);

insert into public.event_report_metrics (event_id, metric_name, metric_value)
select id, 'Besucherzahl', visitor_count::text
from public.events
where visitor_count is not null
on conflict (event_id, metric_name) do nothing;

insert into public.event_report_metrics (event_id, metric_name, metric_value)
select id, 'Social-Media-Reichweite', social_media_reach::text
from public.events
where social_media_reach is not null
on conflict (event_id, metric_name) do nothing;

alter table public.events
  drop column if exists visitor_count,
  drop column if exists social_media_reach;

create index if not exists event_report_metrics_event_id_idx
  on public.event_report_metrics (event_id);

alter table public.event_report_metrics enable row level security;

revoke all on public.event_report_metrics from anon, authenticated;
grant select, insert, update, delete on public.event_report_metrics to authenticated;
grant all on public.event_report_metrics to service_role;

drop policy if exists "workspace members manage event report metrics" on public.event_report_metrics;
create policy "workspace members manage event report metrics" on public.event_report_metrics
  for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_report_metrics.event_id
      and public.is_organization_member(e.organization_id)
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = event_report_metrics.event_id
      and public.is_organization_member(e.organization_id)
  ));
