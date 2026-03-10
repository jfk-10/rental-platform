-- Run this in Supabase SQL editor to allow frontend registration inserts.
-- This is permissive for development/demo environments.

alter table if exists public.owners enable row level security;
alter table if exists public.tenants enable row level security;
alter table if exists public.properties enable row level security;
alter table if exists public.property_images enable row level security;

drop policy if exists owners_insert_anon on public.owners;
create policy owners_insert_anon
on public.owners
for insert
to anon, authenticated
with check (true);

drop policy if exists tenants_insert_anon on public.tenants;
create policy tenants_insert_anon
on public.tenants
for insert
to anon, authenticated
with check (true);

-- Optional read policies if your app reads these tables from frontend.
drop policy if exists owners_select_anon on public.owners;
create policy owners_select_anon
on public.owners
for select
to anon, authenticated
using (true);

drop policy if exists owners_update_anon on public.owners;
create policy owners_update_anon
on public.owners
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists tenants_select_anon on public.tenants;
create policy tenants_select_anon
on public.tenants
for select
to anon, authenticated
using (true);

drop policy if exists tenants_update_anon on public.tenants;
create policy tenants_update_anon
on public.tenants
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists properties_select_anon on public.properties;
create policy properties_select_anon
on public.properties
for select
to anon, authenticated
using (true);

drop policy if exists properties_insert_anon on public.properties;
create policy properties_insert_anon
on public.properties
for insert
to anon, authenticated
with check (true);

drop policy if exists properties_update_anon on public.properties;
create policy properties_update_anon
on public.properties
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists properties_delete_anon on public.properties;
create policy properties_delete_anon
on public.properties
for delete
to anon, authenticated
using (true);

drop policy if exists property_images_select_anon on public.property_images;
create policy property_images_select_anon
on public.property_images
for select
to anon, authenticated
using (true);

drop policy if exists property_images_insert_anon on public.property_images;
create policy property_images_insert_anon
on public.property_images
for insert
to anon, authenticated
with check (true);

drop policy if exists property_images_delete_anon on public.property_images;
create policy property_images_delete_anon
on public.property_images
for delete
to anon, authenticated
using (true);
