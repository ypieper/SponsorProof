-- Prepare event contracts for a sponsor-first, organizer-second signature flow.
alter table public.contracts
  add column if not exists signature_status text not null default 'draft',
  add column if not exists sponsor_signed_at timestamptz,
  add column if not exists organizer_signed_at timestamptz,
  add column if not exists signing_provider text,
  add column if not exists signing_request_id text,
  add column if not exists signing_document_id uuid references public.contract_documents (id) on delete set null;

alter table public.contracts
  drop constraint if exists contracts_signature_status_check;
alter table public.contracts
  add constraint contracts_signature_status_check
  check (signature_status in ('draft', 'pending_sponsor', 'pending_organizer', 'signed'));

-- Legacy signed_at values are interpreted as completed signatures in the app.
-- Avoid bulk-updating contracts here: the entitlement trigger correctly blocks
-- edits to contracts for events without the contracts feature enabled.

create unique index if not exists contracts_signing_request_id_unique_idx
  on public.contracts (signing_provider, signing_request_id)
  where signing_provider is not null and signing_request_id is not null;

-- The temporary click flow is started by an event organizer after choosing
-- the exact PDF that both parties will review.
create or replace function public.start_simple_contract_signing(target_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event uuid;
begin
  select c.event_id into target_event
  from public.contracts c
  where c.id = target_contract_id and c.signature_status = 'draft'
    and c.signing_document_id is not null
    and exists (
      select 1 from public.contract_documents d
      where d.id = c.signing_document_id and d.contract_id = c.id
        and d.kind in ('generated_pdf', 'uploaded_pdf')
    );
  if target_event is null then raise exception 'Contract is not ready for signing'; end if;
  if auth.uid() is null or not public.owns_event(target_event) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;
  update public.contracts set signature_status = 'pending_sponsor'
  where id = target_contract_id and signature_status = 'draft';
  if not found then raise exception 'Contract is not ready for signing'; end if;
end;
$$;

revoke all on function public.start_simple_contract_signing(uuid) from public, anon;
grant execute on function public.start_simple_contract_signing(uuid) to authenticated;

create or replace function public.begin_contract_signing(
  target_contract_id uuid,
  provider_name text,
  provider_request_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if provider_name is null or length(trim(provider_name)) = 0
    or provider_request_id is null or length(trim(provider_request_id)) = 0 then
    raise exception 'A signing provider and request id are required';
  end if;

  update public.contracts c
  set signature_status = 'pending_sponsor',
      signing_provider = trim(provider_name),
      signing_request_id = trim(provider_request_id)
  where c.id = target_contract_id
    and c.signature_status = 'draft'
    and c.signing_document_id is not null
    and exists (
      select 1 from public.contract_documents d
      where d.id = c.signing_document_id
        and d.contract_id = c.id
        and d.kind in ('generated_pdf', 'uploaded_pdf')
    );

  if not found then raise exception 'Contract is not ready for signing'; end if;
end;
$$;

revoke all on function public.begin_contract_signing(uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_contract_signing(uuid, text, text) to service_role;

create or replace function public.record_contract_signature(
  target_contract_id uuid,
  signer_role text,
  occurred_at timestamptz
)
returns table (signature_status text, signed_at date, sponsor_signed_at timestamptz, organizer_signed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_contract public.contracts%rowtype;
  signing_time timestamptz := coalesce(occurred_at, now());
begin
  if signer_role is null or signer_role not in ('sponsor', 'organizer') then raise exception 'Invalid signer role'; end if;

  select * into current_contract
  from public.contracts c
  where c.id = target_contract_id
  for update;
  if not found then raise exception 'Contract not found'; end if;

  if signer_role = 'sponsor' then
    if current_contract.sponsor_signed_at is null and current_contract.signature_status = 'pending_sponsor' then
      update public.contracts c
      set sponsor_signed_at = signing_time,
          signature_status = 'pending_organizer'
      where c.id = target_contract_id;
    elsif current_contract.sponsor_signed_at is null then
      raise exception 'Sponsor signature is not currently expected';
    end if;
  elsif current_contract.organizer_signed_at is null then
    if current_contract.sponsor_signed_at is null or current_contract.signature_status <> 'pending_organizer' then
      raise exception 'Organizer can sign only after the sponsor';
    end if;
    update public.contracts c
    set organizer_signed_at = signing_time,
        signature_status = 'signed',
        signed_at = (signing_time at time zone 'Europe/Berlin')::date
    where c.id = target_contract_id;
  end if;

  return query
    select c.signature_status, c.signed_at, c.sponsor_signed_at, c.organizer_signed_at
    from public.contracts c where c.id = target_contract_id;
end;
$$;

revoke all on function public.record_contract_signature(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_contract_signature(uuid, text, timestamptz) to service_role;

alter table public.contract_documents
  drop constraint if exists contract_documents_kind_check;
alter table public.contract_documents
  add constraint contract_documents_kind_check
  check (kind in ('generated_pdf', 'generated_docx', 'uploaded_pdf', 'signed'));

-- Final signed files can be linked to the exact event/sponsor contract in the
-- sponsor's event archive when a signing provider is connected later.
alter table public.sponsor_documents
  add column if not exists contract_id uuid,
  add column if not exists document_role text not null default 'general';

alter table public.sponsor_documents
  drop constraint if exists sponsor_documents_document_role_check,
  drop constraint if exists sponsor_documents_event_contract_fk;
alter table public.sponsor_documents
  add constraint sponsor_documents_document_role_check
    check (document_role in ('general', 'signed_contract')),
  add constraint sponsor_documents_event_contract_fk
    foreign key (event_id, contract_id)
    references public.contracts (event_id, id)
    on delete cascade,
  add constraint sponsor_documents_signed_contract_check
    check (document_role <> 'signed_contract' or contract_id is not null);

create index if not exists sponsor_documents_contract_id_idx
  on public.sponsor_documents (contract_id) where contract_id is not null;
