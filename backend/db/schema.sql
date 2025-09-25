


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
    
    -- Create transaction if price > 0
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


CREATE TABLE IF NOT EXISTS "public"."blog_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "blog_post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "parent_comment_id" "uuid",
    "content" "text" NOT NULL,
    "status" character varying(20) DEFAULT 'approved'::character varying,
    "like_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "blog_comments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'spam'::character varying, 'deleted'::character varying])::"text"[])))
);


ALTER TABLE "public"."blog_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "content" "text" NOT NULL,
    "excerpt" "text",
    "author_id" "uuid" NOT NULL,
    "image_url" character varying(500),
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "tags" character varying(255)[],
    "view_count" integer DEFAULT 0,
    "like_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "is_featured" boolean DEFAULT false,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "blog_posts_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'pending_review'::character varying, 'published'::character varying, 'archived'::character varying])::"text"[])))
);


ALTER TABLE "public"."blog_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "code" character varying(50) NOT NULL,
    "description" "text",
    "program_id" "uuid" NOT NULL,
    "level" integer,
    "semester" integer,
    "credits" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."downloads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "downloaded_by" "uuid",
    "downloaded_at" timestamp with time zone DEFAULT "now"(),
    "ip_address" character varying(45),
    "user_agent" "text",
    "amount_paid" numeric(5,2) DEFAULT 0
);


ALTER TABLE "public"."downloads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "message" "text" NOT NULL,
    "type" character varying(50) NOT NULL,
    "is_read" boolean DEFAULT false,
    "related_entity_type" character varying(50),
    "related_entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "code" character varying(50) NOT NULL,
    "description" "text",
    "university_id" "uuid" NOT NULL,
    "duration_years" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_reviews" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "is_verified_download" boolean DEFAULT false,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "project_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "project_reviews_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::"text"[])))
);


ALTER TABLE "public"."project_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_versions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text" NOT NULL,
    "file_url" character varying(500) NOT NULL,
    "change_note" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text" NOT NULL,
    "abstract" "text",
    "course_id" "uuid" NOT NULL,
    "contributor_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "file_url" character varying(500) NOT NULL,
    "file_size" bigint,
    "image_url" character varying(500),
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "tags" character varying(255)[],
    "price" numeric(5,2) DEFAULT 0,
    "download_count" integer DEFAULT 0,
    "average_rating" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0,
    "is_featured" boolean DEFAULT false,
    "is_public" boolean DEFAULT true,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "views" integer DEFAULT 0,
    "license" "text" DEFAULT 'Unspecified'::"text" NOT NULL,
    CONSTRAINT "projects_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'under_review'::character varying, 'approved'::character varying, 'rejected'::character varying])::"text"[])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" character varying(20) DEFAULT 'member'::character varying,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "team_members_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'member'::character varying])::"text"[])))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "creator_id" "uuid" NOT NULL,
    "university_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "download_id" "uuid",
    "contributor_id" "uuid" NOT NULL,
    "amount" numeric(5,2) NOT NULL,
    "type" character varying(20) NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "paystack_reference" character varying(255),
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transactions_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::"text"[]))),
    CONSTRAINT "transactions_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['download'::character varying, 'bonus'::character varying, 'correction'::character varying, 'withdrawal'::character varying])::"text"[])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."universities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "short_name" character varying(50),
    "location" character varying(255),
    "website_url" character varying(255),
    "logo_url" character varying(255),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."universities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" character varying(20) DEFAULT 'contributor'::character varying NOT NULL,
    "full_name" character varying(255) NOT NULL,
    "avatar_url" character varying(255),
    "university_id" "uuid",
    "program_id" "uuid",
    "points" integer DEFAULT 0,
    "total_earnings" numeric(10,2) DEFAULT 0,
    "available_balance" numeric(10,2) DEFAULT 0,
    "paystack_customer_code" character varying(255),
    "is_verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT true,
    "onboarding_complete" boolean DEFAULT false,
    CONSTRAINT "users_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['admin'::character varying, 'contributor'::character varying, 'reviewer'::character varying])::"text"[])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withdrawals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "paystack_recipient_code" character varying(255),
    "paystack_transfer_code" character varying(255),
    "failure_reason" "text",
    "processed_by" "uuid",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "withdrawals_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::"text"[])))
);


ALTER TABLE "public"."withdrawals" OWNER TO "postgres";


ALTER TABLE ONLY "public"."blog_comments"
    ADD CONSTRAINT "blog_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_program_code_unique" UNIQUE ("program_id", "code");



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_unique" UNIQUE ("project_id", "downloaded_by");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_university_code_unique" UNIQUE ("university_id", "code");



ALTER TABLE ONLY "public"."project_reviews"
    ADD CONSTRAINT "project_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_reviews"
    ADD CONSTRAINT "project_reviews_unique" UNIQUE ("project_id", "reviewer_id");



ALTER TABLE ONLY "public"."project_versions"
    ADD CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_versions"
    ADD CONSTRAINT "project_versions_unique" UNIQUE ("project_id", "version");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_unique" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."universities"
    ADD CONSTRAINT "universities_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."universities"
    ADD CONSTRAINT "universities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_blog_comments_blog_post" ON "public"."blog_comments" USING "btree" ("blog_post_id");



CREATE INDEX "idx_blog_comments_parent" ON "public"."blog_comments" USING "btree" ("parent_comment_id");



CREATE INDEX "idx_blog_comments_user" ON "public"."blog_comments" USING "btree" ("user_id");



CREATE INDEX "idx_blog_posts_author" ON "public"."blog_posts" USING "btree" ("author_id");



CREATE INDEX "idx_blog_posts_published_at" ON "public"."blog_posts" USING "btree" ("published_at");



CREATE INDEX "idx_blog_posts_status" ON "public"."blog_posts" USING "btree" ("status");



CREATE INDEX "idx_blog_posts_tags" ON "public"."blog_posts" USING "gin" ("tags");



CREATE INDEX "idx_courses_program" ON "public"."courses" USING "btree" ("program_id");



CREATE INDEX "idx_downloads_date" ON "public"."downloads" USING "btree" ("downloaded_at");



CREATE INDEX "idx_downloads_project" ON "public"."downloads" USING "btree" ("project_id");



CREATE INDEX "idx_downloads_user" ON "public"."downloads" USING "btree" ("downloaded_by");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("is_read");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_programs_university" ON "public"."programs" USING "btree" ("university_id");



CREATE INDEX "idx_project_reviews_project" ON "public"."project_reviews" USING "btree" ("project_id");



CREATE INDEX "idx_project_reviews_reviewer" ON "public"."project_reviews" USING "btree" ("reviewer_id");



CREATE INDEX "idx_projects_contributor" ON "public"."projects" USING "btree" ("contributor_id");



CREATE INDEX "idx_projects_course" ON "public"."projects" USING "btree" ("course_id");



CREATE INDEX "idx_projects_created_at" ON "public"."projects" USING "btree" ("created_at");



CREATE INDEX "idx_projects_download_count" ON "public"."projects" USING "btree" ("download_count");



CREATE INDEX "idx_projects_featured" ON "public"."projects" USING "btree" ("is_featured");



CREATE INDEX "idx_projects_public" ON "public"."projects" USING "btree" ("is_public");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_projects_tags" ON "public"."projects" USING "gin" ("tags");



CREATE INDEX "idx_projects_team" ON "public"."projects" USING "btree" ("team_id");



CREATE INDEX "idx_projects_views" ON "public"."projects" USING "btree" ("views");



CREATE INDEX "idx_transactions_contributor" ON "public"."transactions" USING "btree" ("contributor_id");



CREATE INDEX "idx_transactions_created_at" ON "public"."transactions" USING "btree" ("created_at");



CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_program" ON "public"."users" USING "btree" ("program_id");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_users_university" ON "public"."users" USING "btree" ("university_id");



CREATE INDEX "idx_withdrawals_status" ON "public"."withdrawals" USING "btree" ("status");



CREATE INDEX "idx_withdrawals_user" ON "public"."withdrawals" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "after_download_insert" AFTER INSERT ON "public"."downloads" FOR EACH ROW EXECUTE FUNCTION "public"."handle_project_download"();



CREATE OR REPLACE TRIGGER "after_review_insert" AFTER INSERT ON "public"."project_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_project_rating"();



CREATE OR REPLACE TRIGGER "after_review_update" AFTER UPDATE ON "public"."project_reviews" FOR EACH ROW WHEN ((("old"."rating" IS DISTINCT FROM "new"."rating") OR (("old"."status")::"text" IS DISTINCT FROM ("new"."status")::"text"))) EXECUTE FUNCTION "public"."update_project_rating"();



CREATE OR REPLACE TRIGGER "after_withdrawal_update" AFTER UPDATE ON "public"."withdrawals" FOR EACH ROW WHEN ((("old"."status")::"text" IS DISTINCT FROM ("new"."status")::"text")) EXECUTE FUNCTION "public"."handle_withdrawal_status_change"();



CREATE OR REPLACE TRIGGER "update_blog_comments_updated_at" BEFORE UPDATE ON "public"."blog_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_blog_posts_updated_at" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_courses_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_programs_updated_at" BEFORE UPDATE ON "public"."programs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_project_reviews_updated_at" BEFORE UPDATE ON "public"."project_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_universities_updated_at" BEFORE UPDATE ON "public"."universities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_withdrawals_updated_at" BEFORE UPDATE ON "public"."withdrawals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."blog_comments"
    ADD CONSTRAINT "blog_comments_blog_post_id_fkey" FOREIGN KEY ("blog_post_id") REFERENCES "public"."blog_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_comments"
    ADD CONSTRAINT "blog_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."blog_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_comments"
    ADD CONSTRAINT "blog_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_downloaded_by_fkey" FOREIGN KEY ("downloaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_reviews"
    ADD CONSTRAINT "project_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_reviews"
    ADD CONSTRAINT "project_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_versions"
    ADD CONSTRAINT "project_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."project_versions"
    ADD CONSTRAINT "project_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_download_id_fkey" FOREIGN KEY ("download_id") REFERENCES "public"."downloads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id");



ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins and reviewers can manage all blog posts" ON "public"."blog_posts" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = ANY ((ARRAY['admin'::character varying, 'reviewer'::character varying])::"text"[]))));



CREATE POLICY "Admins and reviewers can manage all projects" ON "public"."projects" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = ANY ((ARRAY['admin'::character varying, 'reviewer'::character varying])::"text"[]))));



CREATE POLICY "Admins can manage all comments" ON "public"."blog_comments" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Admins can manage all reviews" ON "public"."project_reviews" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Admins can manage roles and active" ON "public"."users" FOR UPDATE USING (((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (true);



CREATE POLICY "Admins can read all rows" ON "public"."users" FOR SELECT USING (((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admins can update project status" ON "public"."projects" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins can view all downloads" ON "public"."downloads" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Admins can view all transactions" ON "public"."transactions" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Admins can view and process all withdrawals" ON "public"."withdrawals" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Allow authenticated users to insert programs" ON "public"."programs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Approved blog comments are viewable by everyone" ON "public"."blog_comments" FOR SELECT USING ((("status")::"text" = 'approved'::"text"));



CREATE POLICY "Approved project reviews are viewable by everyone" ON "public"."project_reviews" FOR SELECT USING ((("status")::"text" = 'approved'::"text"));



CREATE POLICY "Approved projects are viewable by everyone" ON "public"."projects" FOR SELECT USING (((("status")::"text" = 'approved'::"text") AND ("is_public" = true)));



CREATE POLICY "Authenticated can increment views" ON "public"."projects" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Contributors can delete own projects" ON "public"."projects" FOR DELETE USING (("auth"."uid"() = "contributor_id"));



CREATE POLICY "Contributors can update own projects" ON "public"."projects" FOR UPDATE USING (("auth"."uid"() = "contributor_id"));



CREATE POLICY "Courses are viewable by everyone" ON "public"."courses" FOR SELECT USING (true);



CREATE POLICY "Only admins can modify courses" ON "public"."courses" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Only admins can modify programs" ON "public"."programs" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Only admins can modify universities" ON "public"."universities" USING ((("auth"."role"() = 'authenticated'::"text") AND ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Programs are viewable by everyone" ON "public"."programs" FOR SELECT USING (true);



CREATE POLICY "Project owners can create versions" ON "public"."project_versions" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "projects"."contributor_id"
   FROM "public"."projects"
  WHERE ("projects"."id" = "project_versions"."project_id"))));



CREATE POLICY "Project versions are viewable by project owners and admins" ON "public"."project_versions" FOR SELECT USING ((("auth"."uid"() IN ( SELECT "projects"."contributor_id"
   FROM "public"."projects"
  WHERE ("projects"."id" = "project_versions"."project_id"))) OR ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Published blog posts are viewable by everyone" ON "public"."blog_posts" FOR SELECT USING ((("status")::"text" = 'published'::"text"));



CREATE POLICY "Team members are viewable by team members" ON "public"."team_members" FOR SELECT USING ((("auth"."uid"() IN ( SELECT "team_members_1"."user_id"
   FROM "public"."team_members" "team_members_1"
  WHERE ("team_members_1"."team_id" = "team_members_1"."team_id"))) OR ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Team owners can manage team members" ON "public"."team_members" USING ((("auth"."uid"() IN ( SELECT "team_members_1"."user_id"
   FROM "public"."team_members" "team_members_1"
  WHERE (("team_members_1"."team_id" = "team_members_1"."team_id") AND (("team_members_1"."role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::"text"[]))))) OR ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Team owners can manage their teams" ON "public"."teams" USING ((("auth"."uid"() IN ( SELECT "team_members"."user_id"
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND (("team_members"."role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::"text"[]))))) OR ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Teams are viewable by team members" ON "public"."teams" FOR SELECT USING ((("auth"."uid"() IN ( SELECT "team_members"."user_id"
   FROM "public"."team_members"
  WHERE ("team_members"."team_id" = "teams"."id"))) OR ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text" = 'admin'::"text")));



CREATE POLICY "Universities are viewable by everyone" ON "public"."universities" FOR SELECT USING (true);



CREATE POLICY "Users can create blog posts" ON "public"."blog_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can create comments" ON "public"."blog_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create downloads" ON "public"."downloads" FOR INSERT WITH CHECK (("auth"."uid"() = "downloaded_by"));



CREATE POLICY "Users can create projects" ON "public"."projects" FOR INSERT WITH CHECK (("auth"."uid"() = "contributor_id"));



CREATE POLICY "Users can create reviews for projects they downloaded" ON "public"."project_reviews" FOR INSERT WITH CHECK ((("auth"."uid"() = "reviewer_id") AND (EXISTS ( SELECT 1
   FROM "public"."downloads"
  WHERE (("downloads"."project_id" = "project_reviews"."project_id") AND ("downloads"."downloaded_by" = "auth"."uid"()))))));



CREATE POLICY "Users can create withdrawals" ON "public"."withdrawals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own row" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own blog posts" ON "public"."blog_posts" FOR UPDATE USING (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can update their own comments" ON "public"."blog_comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own onboarding_complete" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own projects" ON "public"."projects" FOR UPDATE USING (("auth"."uid"() = "contributor_id"));



CREATE POLICY "Users can update their own reviews" ON "public"."project_reviews" FOR UPDATE USING (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "Users can view their own blog posts" ON "public"."blog_posts" FOR SELECT USING (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can view their own comments" ON "public"."blog_comments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own downloads" ON "public"."downloads" FOR SELECT USING (("auth"."uid"() = "downloaded_by"));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own projects" ON "public"."projects" FOR SELECT USING (("auth"."uid"() = "contributor_id"));



CREATE POLICY "Users can view their own reviews" ON "public"."project_reviews" FOR SELECT USING (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "Users can view their own transactions" ON "public"."transactions" FOR SELECT USING (("auth"."uid"() = "contributor_id"));



CREATE POLICY "Users can view their own withdrawals" ON "public"."withdrawals" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."blog_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."downloads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."universities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "universities_delete_admin" ON "public"."universities" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "universities_insert_admin" ON "public"."universities" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "universities_read_all" ON "public"."universities" FOR SELECT USING (true);



CREATE POLICY "universities_update_admin" ON "public"."universities" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."withdrawals" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_metric_trend"("p_metric" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_metric_trend"("p_metric" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_metric_trend"("p_metric" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_contributors"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_contributors"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_contributors"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_projects"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_projects"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_projects"("p_limit" integer, "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_project_download"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_project_download"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_project_download"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_withdrawal_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_withdrawal_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_withdrawal_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_project_views"("project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_project_views"("project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_project_views"("project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_project_rating"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_project_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_project_rating"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."blog_comments" TO "anon";
GRANT ALL ON TABLE "public"."blog_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_comments" TO "service_role";



GRANT ALL ON TABLE "public"."blog_posts" TO "anon";
GRANT ALL ON TABLE "public"."blog_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_posts" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."downloads" TO "anon";
GRANT ALL ON TABLE "public"."downloads" TO "authenticated";
GRANT ALL ON TABLE "public"."downloads" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."project_reviews" TO "anon";
GRANT ALL ON TABLE "public"."project_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."project_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."project_versions" TO "anon";
GRANT ALL ON TABLE "public"."project_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."project_versions" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."universities" TO "anon";
GRANT ALL ON TABLE "public"."universities" TO "authenticated";
GRANT ALL ON TABLE "public"."universities" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT ALL ON TABLE "public"."withdrawals" TO "anon";
GRANT ALL ON TABLE "public"."withdrawals" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawals" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
RESET ALL;
