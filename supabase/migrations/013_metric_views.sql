-- Aggregated views on business_metrics so the dashboard and Hermes can
-- query "this week / this month" without re-doing the math each call.
-- week_start follows ISO (Monday). month_start follows calendar month.

create or replace view metric_week as
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

-- Percentile view (separate to keep the main one cheap).
create or replace view metric_week_p50 as
  select
    member_id,
    metric_key,
    date_trunc('week', day)::date                        as week_start,
    percentile_cont(0.5) within group (order by value)   as p50_value
  from business_metrics
  group by member_id, metric_key, date_trunc('week', day);

create or replace view metric_month as
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

create or replace view metric_month_p50 as
  select
    member_id,
    metric_key,
    date_trunc('month', day)::date                       as month_start,
    percentile_cont(0.5) within group (order by value)   as p50_value
  from business_metrics
  group by member_id, metric_key, date_trunc('month', day);
