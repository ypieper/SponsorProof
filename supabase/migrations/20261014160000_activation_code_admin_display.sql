-- Keep activation codes encrypted server-side so platform admins can retrieve them.
-- Redemption continues to use the unique SHA-256 hash in code_hash.
alter table public.activation_codes
  add column if not exists code_encrypted text;

comment on column public.activation_codes.code_encrypted is
  'AES-256-GCM encrypted activation code; only exposed through the platform-admin API.';
