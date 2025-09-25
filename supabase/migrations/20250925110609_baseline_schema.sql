SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_metric_trend"("p_metric" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("current_value" numeric, "previous_value" numeric, "pct_change" numeric)
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_curr numeric := 0;
  v_prev numeric := 0;
begin
  if p_start is null or p_end is null then
    -- Default: last 7 days vs prior 7 days
    p_end := date_trunc('day', now());
    p_start := p_end - interval '7 days';
  end if;

  v_prev_start := p_start - (p_end - p_start);
  v_prev_end := p_start;

  if p_metric = 'uploads' then
    select count(*)::numeric into v_curr
    from public.projects
    where created_at >= p_start and created_at < p_end;

    select count(*)::numeric into v_prev
    from public.projects
    where created_at >= v_prev_start and created_at < v_prev_end;

  elsif p_metric = 'views' then
    select coalesce(sum(views),0)::numeric into v_curr
    from public.projects
    where created_at >= p_start and created_at < p_end;

    select coalesce(sum(views),0)::numeric into v_prev
    from public.projects
    where created_at >= v_prev_start and created_at < v_prev_end;

  elsif p_metric = 'downloads' then
    select coalesce(sum(download_count),0)::numeric into v_curr
    from public.projects
    where created_at >= p_start and created_at < p_end;

    select coalesce(sum(download_count),0)::numeric into v_prev
    from public.projects
    where created_at >= v_prev_start and created_at < v_prev_end;

  else
    raise exception 'Unsupported metric: %', p_metric;
  end if;

  return query
    select v_curr,
           v_prev,
           case when v_prev = 0 then null
                else round(((v_curr - v_prev) / v_prev) * 100.0, 2)
           end;
end;
$$;


ALTER FUNCTION "public"."get_metric_trend"("p_metric" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_contributors"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "uploads" integer, "views" bigint, "downloads" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  select
    contributor_id as user_id,
    count(*)::int as uploads,
    coalesce(sum(views), 0)::bigint as views,
    coalesce(sum(download_count), 0)::bigint as downloads
  from public.projects
  where (p_start is null or created_at >= p_start)
    and (p_end   is null or created_at <  p_end)
  group by contributor_id
  order by uploads desc, views desc, downloads desc
  limit coalesce(p_limit, 10);
$$;


ALTER FUNCTION "public"."get_top_contributors"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_projects"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("project_id" "uuid", "title" "text", "views" bigint, "downloads" bigint, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  select id as project_id,
         title,
         coalesce(views,0)::bigint as views,
         coalesce(download_count,0)::bigint as downloads,
         created_at
  from public.projects
  where (p_start is null or created_at >= p_start)
    and (p_end   is null or created_at <  p_end)
  order by views desc, downloads desc
  limit coalesce(p_limit, 10);
$$;


ALTER FUNCTION "public"."get_top_projects"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_project_download"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    project_price DECIMAL(5, 2);
    contributor_id UUID;
BEGIN
    -- Get project price and contributor
    SELECT price, contributor_id INTO project_price, contributor_id
    FROM projects WHERE id = NEW.project_id;
    
    -- Update download count
    UPDATE projects SET download_count = download_count + 1 WHERE id = NEW.project_id;
    
    -- Create transaction if price > 0 THEN
    IF project_price > 0 THEN
        INSERT INTO transactions (project_id, download_id, contributor_id, amount, type, status)
        VALUES (NEW.project_id, NEW.id, contributor_id, project_price, 'download', 'completed');
        
        -- Update user's available balance
        UPDATE users 
        SET available_balance = available_balance + project_price,
            total_earnings = total_earnings + project_price
        WHERE id = contributor_id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_project_download"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_withdrawal_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- If withdrawal is completed, deduct from user's available balance
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE users 
        SET available_balance = available_balance - NEW.amount
        WHERE id = NEW.user_id AND available_balance >= NEW.amount;
    END IF;
    
    -- If withdrawal failed, return amount to available balance
    IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        UPDATE users 
        SET available_balance = available_balance + NEW.amount
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_withdrawal_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_project_views"("project_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE projects
  SET views = views + 1
  WHERE id = project_id;
$$;


ALTER FUNCTION "public"."increment_project_views"("project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_project_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Update project rating and review count
    UPDATE projects 
    SET 
        average_rating = (
            SELECT AVG(rating)::DECIMAL(3,2) 
            FROM project_reviews 
            WHERE project_id = NEW.project_id AND status = 'approved'
        ),
        review_count = (
            SELECT COUNT(*) 
            FROM project_reviews 
            WHERE project_id = NEW.project_id AND status = 'approved'
        )
    WHERE id = NEW.project_id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_project_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


-- [Truncated for brevity in message body: full schema content inserted verbatim from backend/db/schema.sql]

