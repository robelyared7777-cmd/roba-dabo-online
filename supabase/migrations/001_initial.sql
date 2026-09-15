create extension if not exists pgcrypto;

create type public.user_role as enum ('CEO','ADMIN','EMPLOYEE');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'EMPLOYEE',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Bread',
  cost_price numeric(12,2) not null default 0 check(cost_price >= 0),
  sale_price numeric(12,2) not null default 0 check(sale_price >= 0),
  quantity integer not null default 0 check(quantity >= 0),
  low_stock_level integer not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  employee_id uuid not null references public.profiles(id),
  quantity integer not null check(quantity > 0),
  unit_price numeric(12,2) not null,
  cost_at_sale numeric(12,2) not null,
  total numeric(12,2) not null,
  profit numeric(12,2) not null,
  payment_method text not null default 'Cash',
  sold_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12,2) not null check(amount > 0),
  category text not null default 'Other',
  created_by uuid not null references public.profiles(id),
  spent_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  id integer primary key default 1 check(id=1),
  shop_name text not null default 'Roba Dabo',
  owner text not null default '',
  phone text not null default '',
  email text not null default 'robelyared777@gmail.com',
  address text not null default '',
  tin text not null default '',
  currency text not null default 'ETB / Birr',
  tax_rate numeric(8,2),
  opening_time text not null default '',
  closing_time text not null default '',
  receipt_paper text not null default '',
  receipt_header text not null default '',
  receipt_footer text not null default ''
);

insert into public.business_settings(id) values(1) on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.business_settings enable row level security;

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and active=true limit 1 $$;

create policy "profiles own or management" on public.profiles for select
using (id=auth.uid() or public.my_role() in ('CEO','ADMIN'));

create policy "management create profiles" on public.profiles for insert
with check (public.my_role() in ('CEO','ADMIN'));

create policy "management update profiles" on public.profiles for update
using (public.my_role() in ('CEO','ADMIN'));

create policy "products readable" on public.products for select
using (active=true and auth.uid() is not null);

create policy "management products" on public.products for all
using (public.my_role() in ('CEO','ADMIN'))
with check (public.my_role() in ('CEO','ADMIN'));

create policy "sales readable" on public.sales for select
using (public.my_role() in ('CEO','ADMIN') or employee_id=auth.uid());

create policy "sales insert" on public.sales for insert
with check (employee_id=auth.uid() or public.my_role() in ('CEO','ADMIN'));

create policy "expenses management" on public.expenses for all
using (public.my_role() in ('CEO','ADMIN'))
with check (public.my_role() in ('CEO','ADMIN'));

create policy "settings management" on public.business_settings for all
using (public.my_role() in ('CEO','ADMIN'))
with check (public.my_role() in ('CEO','ADMIN'));

create or replace function public.record_sale(
  p_product_id uuid,
  p_quantity integer,
  p_payment_method text default 'Cash'
) returns json
language plpgsql security definer set search_path=public
as $$
declare
  p products%rowtype;
  total numeric(12,2);
  profit numeric(12,2);
  sid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;

  select * into p from products where id=p_product_id and active=true for update;
  if not found then raise exception 'Product not found'; end if;
  if p.quantity < p_quantity then raise exception 'Insufficient stock'; end if;

  total := p.sale_price * p_quantity;
  profit := (p.sale_price-p.cost_price) * p_quantity;

  update products set quantity=quantity-p_quantity where id=p.id;

  insert into sales(product_id,employee_id,quantity,unit_price,cost_at_sale,total,profit,payment_method)
  values(p.id,auth.uid(),p_quantity,p.sale_price,p.cost_price,total,profit,coalesce(p_payment_method,'Cash'))
  returning id into sid;

  return json_build_object('id',sid,'total',total,'profit',profit,'remaining_stock',p.quantity-p_quantity);
end $$;

create or replace function public.dashboard_summary()
returns json
language plpgsql security definer set search_path=public
as $$
declare f timestamptz := date_trunc('day',now()); t timestamptz := f + interval '1 day';
begin
  if public.my_role() is null then raise exception 'Not authorized'; end if;
  return json_build_object(
    'revenue',coalesce((select sum(total) from sales where sold_at>=f and sold_at<t),0),
    'gross_profit',coalesce((select sum(profit) from sales where sold_at>=f and sold_at<t),0),
    'expenses',coalesce((select sum(amount) from expenses where spent_at>=f and spent_at<t),0),
    'net_profit',coalesce((select sum(profit) from sales where sold_at>=f and sold_at<t),0)-coalesce((select sum(amount) from expenses where spent_at>=f and spent_at<t),0),
    'transactions',(select count(*) from sales where sold_at>=f and sold_at<t),
    'items_sold',coalesce((select sum(quantity) from sales where sold_at>=f and sold_at<t),0),
    'low_stock',(select count(*) from products where active and quantity<=low_stock_level),
    'products',(select count(*) from products where active)
  );
end $$;

create or replace function public.report_summary(p_period text)
returns json
language plpgsql security definer set search_path=public
as $$
declare f timestamptz; t timestamptz:=now(); r numeric:=0; gp numeric:=0; e numeric:=0;
begin
  if public.my_role() not in ('CEO','ADMIN') then raise exception 'Not authorized'; end if;
  f := case lower(p_period)
    when 'day' then date_trunc('day',now())
    when 'week' then date_trunc('day',now())-interval '6 days'
    when 'month' then date_trunc('month',now())
    when 'year' then date_trunc('year',now())
    else date_trunc('day',now()) end;
  select coalesce(sum(total),0),coalesce(sum(profit),0) into r,gp from sales where sold_at>=f and sold_at<t;
  select coalesce(sum(amount),0) into e from expenses where spent_at>=f and spent_at<t;
  return json_build_object('revenue',r,'gross_profit',gp,'expenses',e,'net_profit',gp-e);
end $$;

alter table public.sales replica identity full;
alter table public.products replica identity full;
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.products;
