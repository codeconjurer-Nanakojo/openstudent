-- Baseline schema (part 2): tables
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
SET default_tablespace = '';
SET default_table_access_method = heap;

CREATE TABLE IF NOT EXISTS "public"."blog_comments" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "blog_post_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "parent_comment_id" uuid,
    "content" text NOT NULL,
    "status" varchar(20) DEFAULT 'approved',
    "like_count" int DEFAULT 0,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT blog_comments_status_check CHECK (status::text = ANY(ARRAY['pending','approved','spam','deleted']::text[]))
);
ALTER TABLE "public"."blog_comments" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "title" varchar(255) NOT NULL,
    "content" text NOT NULL,
    "excerpt" text,
    "author_id" uuid NOT NULL,
    "image_url" varchar(500),
    "status" varchar(20) DEFAULT 'draft',
    "tags" varchar(255)[],
    "view_count" int DEFAULT 0,
    "like_count" int DEFAULT 0,
    "comment_count" int DEFAULT 0,
    "is_featured" boolean DEFAULT false,
    "published_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT blog_posts_status_check CHECK (status::text = ANY(ARRAY['draft','pending_review','published','archived']::text[]))
);
ALTER TABLE "public"."blog_posts" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "name" varchar(255) NOT NULL,
    "code" varchar(50) NOT NULL,
    "description" text,
    "program_id" uuid NOT NULL,
    "level" int,
    "semester" int,
    "credits" int,
    "is_active" boolean DEFAULT true,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);
ALTER TABLE "public"."courses" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."downloads" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "project_id" uuid NOT NULL,
    "downloaded_by" uuid,
    "downloaded_at" timestamptz DEFAULT now(),
    "ip_address" varchar(45),
    "user_agent" text,
    "amount_paid" numeric(5,2) DEFAULT 0
);
ALTER TABLE "public"."downloads" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "user_id" uuid NOT NULL,
    "title" varchar(255) NOT NULL,
    "message" text NOT NULL,
    "type" varchar(50) NOT NULL,
    "is_read" boolean DEFAULT false,
    "related_entity_type" varchar(50),
    "related_entity_id" uuid,
    "created_at" timestamptz DEFAULT now()
);
ALTER TABLE "public"."notifications" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "name" varchar(255) NOT NULL,
    "code" varchar(50) NOT NULL,
    "description" text,
    "university_id" uuid NOT NULL,
    "duration_years" int,
    "is_active" boolean DEFAULT true,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);
ALTER TABLE "public"."programs" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."project_reviews" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "project_id" uuid NOT NULL,
    "reviewer_id" uuid NOT NULL,
    "rating" int NOT NULL,
    "comment" text,
    "is_verified_download" boolean DEFAULT false,
    "status" varchar(20) DEFAULT 'pending',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT project_reviews_rating_check CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT project_reviews_status_check CHECK (status::text = ANY(ARRAY['pending','approved','rejected']::text[]))
);
ALTER TABLE "public"."project_reviews" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."project_versions" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "project_id" uuid NOT NULL,
    "version" int DEFAULT 1 NOT NULL,
    "title" varchar(255) NOT NULL,
    "description" text NOT NULL,
    "file_url" varchar(500) NOT NULL,
    "change_note" text,
    "created_by" uuid NOT NULL,
    "created_at" timestamptz DEFAULT now()
);
ALTER TABLE "public"."project_versions" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "title" varchar(255) NOT NULL,
    "description" text NOT NULL,
    "abstract" text,
    "course_id" uuid NOT NULL,
    "contributor_id" uuid NOT NULL,
    "team_id" uuid,
    "file_url" varchar(500) NOT NULL,
    "file_size" bigint,
    "image_url" varchar(500),
    "status" varchar(20) DEFAULT 'pending',
    "tags" varchar(255)[],
    "price" numeric(5,2) DEFAULT 0,
    "download_count" int DEFAULT 0,
    "average_rating" numeric(3,2) DEFAULT 0,
    "review_count" int DEFAULT 0,
    "is_featured" boolean DEFAULT false,
    "is_public" boolean DEFAULT true,
    "published_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "views" int DEFAULT 0,
    "license" text DEFAULT 'Unspecified' NOT NULL,
    CONSTRAINT projects_status_check CHECK (status::text = ANY(ARRAY['pending','under_review','approved','rejected']::text[]))
);
ALTER TABLE "public"."projects" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "team_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "role" varchar(20) DEFAULT 'member',
    "joined_at" timestamptz DEFAULT now(),
    CONSTRAINT team_members_role_check CHECK (role::text = ANY(ARRAY['owner','admin','member']::text[]))
);
ALTER TABLE "public"."team_members" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "name" varchar(255) NOT NULL,
    "description" text,
    "creator_id" uuid NOT NULL,
    "university_id" uuid,
    "is_active" boolean DEFAULT true,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);
ALTER TABLE "public"."teams" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "project_id" uuid NOT NULL,
    "download_id" uuid,
    "contributor_id" uuid NOT NULL,
    "amount" numeric(5,2) NOT NULL,
    "type" varchar(20) NOT NULL,
    "status" varchar(20) DEFAULT 'pending',
    "paystack_reference" varchar(255),
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT transactions_status_check CHECK (status::text = ANY(ARRAY['pending','completed','failed']::text[])),
    CONSTRAINT transactions_type_check CHECK (type::text = ANY(ARRAY['download','bonus','correction','withdrawal']::text[]))
);
ALTER TABLE "public"."transactions" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."universities" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "name" varchar(255) NOT NULL,
    "short_name" varchar(50),
    "location" varchar(255),
    "website_url" varchar(255),
    "logo_url" varchar(255),
    "is_active" boolean DEFAULT true,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);
ALTER TABLE "public"."universities" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" uuid NOT NULL,
    "email" varchar(255) NOT NULL,
    "role" varchar(20) DEFAULT 'contributor' NOT NULL,
    "full_name" varchar(255) NOT NULL,
    "avatar_url" varchar(255),
    "university_id" uuid,
    "program_id" uuid,
    "points" int DEFAULT 0,
    "total_earnings" numeric(10,2) DEFAULT 0,
    "available_balance" numeric(10,2) DEFAULT 0,
    "paystack_customer_code" varchar(255),
    "is_verified" boolean DEFAULT false,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "active" boolean DEFAULT true,
    "onboarding_complete" boolean DEFAULT false,
    CONSTRAINT users_role_check CHECK (role::text = ANY(ARRAY['admin','contributor','reviewer']::text[]))
);
ALTER TABLE "public"."users" OWNER TO postgres;

CREATE TABLE IF NOT EXISTS "public"."withdrawals" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "user_id" uuid NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" varchar(20) DEFAULT 'pending',
    "paystack_recipient_code" varchar(255),
    "paystack_transfer_code" varchar(255),
    "failure_reason" text,
    "processed_by" uuid,
    "processed_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT withdrawals_status_check CHECK (status::text = ANY(ARRAY['pending','processing','completed','failed']::text[]))
);
ALTER TABLE "public"."withdrawals" OWNER TO postgres;
