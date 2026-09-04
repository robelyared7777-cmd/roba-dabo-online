-- Employee management fields for Roba Dabo.
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists employee_code text not null default '';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_employee_code_idx on public.profiles(employee_code);
create index if not exists sales_employee_sold_at_idx on public.sales(employee_id, sold_at);

create or replace function public.employee_sales_summary(p_employee_id uuid default null)
returns json
language plpgsql security definer set search_path=public
as $$
declare
  target uuid := coalesce(p_employee_id, auth.uid());
  day_start timestamptz := date_trunc('day', now());
  week_start timestamptz := day_start - interval '6 days';
  month_start timestamptz := date_trunc('month', now());
  year_start timestamptz := date_trunc('year', now());
  target_role public.user_role;
begin
  select role into target_role from profiles where id=target and active=true;
  if public.my_role() not in ('CEO','ADMIN') and target <> auth.uid() then raise exception 'Not authorized'; end if;
  if target_role is null then raise exception 'Employee not found'; end if;
  return json_build_object(
    'day_revenue', coalesce((select sum(total) from sales where employee_id=target and sold_at>=day_start),0),
    'day_items', coalesce((select sum(quantity) from sales where employee_id=target and sold_at>=day_start),0),
    'day_transactions', (select count(*) from sales where employee_id=target and sold_at>=day_start),
    'week_revenue', coalesce((select sum(total) from sales where employee_id=target and sold_at>=week_start),0),
    'week_items', coalesce((select sum(quantity) from sales where employee_id=target and sold_at>=week_start),0),
    'month_revenue', coalesce((select sum(total) from sales where employee_id=target and sold_at>=month_start),0),
    'month_items', coalesce((select sum(quantity) from sales where employee_id=target and sold_at>=month_start),0),
    'year_revenue', coalesce((select sum(total) from sales where employee_id=target and sold_at>=year_start),0),
    'year_items', coalesce((select sum(quantity) from sales where employee_id=target and sold_at>=year_start),0)
  );
end $$;

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
  if auth.uid() is null or public.my_role() is null then raise exception 'Account is not active or not authorized'; end if;
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
