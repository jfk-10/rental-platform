-- Run this in Supabase SQL editor to allow frontend registration inserts.
-- This is permissive for development/demo environments.

alter table if exists public.users enable row level security;
alter table if exists public.owners enable row level security;
alter table if exists public.tenants enable row level security;
alter table if exists public.properties enable row level security;
alter table if exists public.property_images enable row level security;
alter table if exists public.property_applications enable row level security;
alter table if exists public.rental_agreements enable row level security;
alter table if exists public.rent_payments enable row level security;
alter table if exists public.maintenance_requests enable row level security;

drop policy if exists users_select_anon on public.users;
create policy users_select_anon
on public.users
for select
to anon, authenticated
using (true);

drop policy if exists users_insert_anon on public.users;
create policy users_insert_anon
on public.users
for insert
to anon, authenticated
with check (true);

drop policy if exists users_update_anon on public.users;
create policy users_update_anon
on public.users
for update
to anon, authenticated
using (true)
with check (true);

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

drop policy if exists property_applications_select_anon on public.property_applications;
create policy property_applications_select_anon
on public.property_applications
for select
to anon, authenticated
using (true);

drop policy if exists property_applications_insert_anon on public.property_applications;
create policy property_applications_insert_anon
on public.property_applications
for insert
to anon, authenticated
with check (true);

drop policy if exists property_applications_update_anon on public.property_applications;
create policy property_applications_update_anon
on public.property_applications
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists property_applications_delete_anon on public.property_applications;
create policy property_applications_delete_anon
on public.property_applications
for delete
to anon, authenticated
using (true);

drop policy if exists rental_agreements_select_anon on public.rental_agreements;
create policy rental_agreements_select_anon
on public.rental_agreements
for select
to anon, authenticated
using (true);

drop policy if exists rental_agreements_insert_anon on public.rental_agreements;
create policy rental_agreements_insert_anon
on public.rental_agreements
for insert
to anon, authenticated
with check (true);

drop policy if exists rental_agreements_update_anon on public.rental_agreements;
create policy rental_agreements_update_anon
on public.rental_agreements
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists rental_agreements_delete_anon on public.rental_agreements;
create policy rental_agreements_delete_anon
on public.rental_agreements
for delete
to anon, authenticated
using (true);

drop policy if exists rent_payments_select_anon on public.rent_payments;
create policy rent_payments_select_anon
on public.rent_payments
for select
to anon, authenticated
using (true);

drop policy if exists rent_payments_insert_anon on public.rent_payments;
create policy rent_payments_insert_anon
on public.rent_payments
for insert
to anon, authenticated
with check (true);

drop policy if exists rent_payments_update_anon on public.rent_payments;
create policy rent_payments_update_anon
on public.rent_payments
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists rent_payments_delete_anon on public.rent_payments;
create policy rent_payments_delete_anon
on public.rent_payments
for delete
to anon, authenticated
using (true);

drop policy if exists maintenance_requests_select_anon on public.maintenance_requests;
create policy maintenance_requests_select_anon
on public.maintenance_requests
for select
to anon, authenticated
using (true);

drop policy if exists maintenance_requests_insert_anon on public.maintenance_requests;
create policy maintenance_requests_insert_anon
on public.maintenance_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists maintenance_requests_update_anon on public.maintenance_requests;
create policy maintenance_requests_update_anon
on public.maintenance_requests
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists maintenance_requests_delete_anon on public.maintenance_requests;
create policy maintenance_requests_delete_anon
on public.maintenance_requests
for delete
to anon, authenticated
using (true);
