-- metric_* views wurden von Supabase als SECURITY DEFINER angelegt, was
-- den RLS-Schutz von business_metrics umgeht (läuft als postgres-User).
-- Mit security_invoker=on laufen sie mit den Rechten des aufrufenden Users.

create or replace view metric_week with (security_invoker = on) as
  select
    member_id,
    metric_key,
    date_trunc('week', day)::date as week_start,
    sum(value)::numeric           as sum_value,
    avg(value)::numeric           as avg_value,
    max(value)::numeric           as max_value,
    min(value)::numeric           as min_value,
    count(*)::int                 as sample_count
  from business_metrics
  group by member_id, metric_key, date_trunc('week', day);

create or replace view metric_week_p50 with (security_invoker = on) as
  select
    member_id,
    metric_key,
    date_trunc('week', day)::date                        as week_start,
    percentile_cont(0.5) within group (order by value)   as p50_value
  from business_metrics
  group by member_id, metric_key, date_trunc('week', day);

create or replace view metric_month with (security_invoker = on) as
  select
    member_id,
    metric_key,
    date_trunc('month', day)::date as month_start,
    sum(value)::numeric            as sum_value,
    avg(value)::numeric            as avg_value,
    max(value)::numeric            as max_value,
    min(value)::numeric            as min_value,
    count(*)::int                  as sample_count
  from business_metrics
  group by member_id, metric_key, date_trunc('month', day);

create or replace view metric_month_p50 with (security_invoker = on) as
  select
    member_id,
    metric_key,
    date_trunc('month', day)::date                       as month_start,
    percentile_cont(0.5) within group (order by value)   as p50_value
  from business_metrics
  group by member_id, metric_key, date_trunc('month', day);
