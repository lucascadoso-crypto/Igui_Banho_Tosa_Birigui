-- Sistema Pet V2 - public visual identity for login screen
-- Allows anonymous users to read non-sensitive branding fields before login.

drop policy if exists "config_sistema_public_select" on public.config_sistema;

create policy "config_sistema_public_select"
on public.config_sistema
for select
to anon, authenticated
using (true);
