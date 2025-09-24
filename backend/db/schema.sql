
-- =====================================
-- SQL RPCs for Analytics and Leaderboards
-- =====================================

-- Returns top contributors in a date range ranked by uploads, then views, then downloads
create or replace function public.get_top_contributors(p_limit integer, p_start timestamptz, p_end timestamptz)
returns table (
  user_id uuid,
  uploads integer,
  views bigint,
  downloads bigint
) language sql stable as $$
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

-- Returns top projects in a date range ranked by views then downloads
create or replace function public.get_top_projects(p_limit integer, p_start timestamptz, p_end timestamptz)
returns table (
  project_id uuid,
  title text,
  views bigint,
  downloads bigint,
  created_at timestamptz
) language sql stable as $$
  select id as project_id, title, coalesce(views,0)::bigint as views, coalesce(download_count,0)::bigint as downloads, created_at
  from public.projects
  where (p_start is null or created_at >= p_start)
    and (p_end   is null or created_at <  p_end)
  order by views desc, downloads desc
  limit coalesce(p_limit, 10);
$$;

-- Generic metric trend for projects: supported metrics: 'uploads', 'views', 'downloads'
-- Returns current_value, previous_value, pct_change (previous -> current)
create or replace function public.get_metric_trend(p_metric text, p_start timestamptz, p_end timestamptz)
returns table (
  current_value numeric,
  previous_value numeric,
  pct_change numeric
) language plpgsql stable as $$
declare
  v_days integer;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_curr numeric := 0;
  v_prev numeric := 0;
begin
  if p_start is null or p_end is null then
    -- If no window provided, compute last 7 days against the prior 7 days
    v_days := 7;
    v_prev_end := date_trunc('day', now());
    v_prev_start := v_prev_end - (v_days || ' days')::interval;
    p_end := v_prev_end;
    p_start := v_prev_start;
  end if;

  v_prev_start := p_start - (p_end - p_start);
  v_prev_end := p_start;

  if p_metric = 'uploads' then
    select count(*)::numeric into v_curr from public.projects where created_at >= p_start and created_at < p_end;
    select count(*)::numeric into v_prev from public.projects where created_at >= v_prev_start and created_at < v_prev_end;
  elsif p_metric = 'views' then
    select coalesce(sum(views),0)::numeric into v_curr from public.projects where created_at >= p_start and created_at < p_end;
    select coalesce(sum(views),0)::numeric into v_prev from public.projects where created_at >= v_prev_start and created_at < v_prev_end;
  elsif p_metric = 'downloads' then
    select coalesce(sum(download_count),0)::numeric into v_curr from public.projects where created_at >= p_start and created_at < p_end;
    select coalesce(sum(download_count),0)::numeric into v_prev from public.projects where created_at >= v_prev_start and created_at < v_prev_end;
  else
    raise exception 'Unsupported metric: %', p_metric;
  end if;

  return query select v_curr, v_prev, case when v_prev = 0 then null else round(((v_curr - v_prev) / v_prev) * 100.0, 2) end;
end;
$$;

-- Grant execution to anon/authenticated as needed (adjust roles to your project)
grant execute on function public.get_top_contributors(integer, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.get_top_projects(integer, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.get_metric_trend(text, timestamptz, timestamptz) to anon, authenticated;

-- OpenStudent Database Schema
-- Designed for Supabase (PostgreSQL) with RLS and proper indexing

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Universities table
CREATE TABLE universities (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    location VARCHAR(255),
    website_url VARCHAR(255),
    logo_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT universities_name_unique UNIQUE (name)
);

-- Programs table
CREATE TABLE programs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    duration_years INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT programs_university_code_unique UNIQUE (university_id, code)
);

-- Courses table
CREATE TABLE courses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    level INTEGER, -- e.g., 100, 200, 300, etc.
    semester INTEGER, -- 1 or 2
    credits INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT courses_program_code_unique UNIQUE (program_id, code)
);

-- Users table (extends Supabase Auth)
CREATE TABLE users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'contributor' CHECK (role IN ('admin', 'contributor', 'reviewer')),
    full_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(255),
    university_id UUID REFERENCES universities(id),
    program_id UUID REFERENCES programs(id),
    points INTEGER DEFAULT 0,
    total_earnings DECIMAL(10, 2) DEFAULT 0,
    available_balance DECIMAL(10, 2) DEFAULT 0,
    paystack_customer_code VARCHAR(255), -- For Paystack integration
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT users_email_unique UNIQUE (email)
);

-- Teams table
CREATE TABLE teams (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    university_id UUID REFERENCES universities(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team members junction table
CREATE TABLE team_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT team_members_unique UNIQUE (team_id, user_id)
);

-- Projects table
CREATE TABLE projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    abstract TEXT,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    contributor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    file_url VARCHAR(500) NOT NULL, -- MEGA API URL
    file_size BIGINT, -- File size in bytes
    image_url VARCHAR(500), -- ImageKit URL
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
    tags VARCHAR(255)[], -- Array of tags
    price DECIMAL(5, 2) DEFAULT 0, -- Price per download
    download_count INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project versions table for tracking changes
CREATE TABLE project_versions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    change_note TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT project_versions_unique UNIQUE (project_id, version)
);

-- Downloads table
CREATE TABLE downloads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    downloaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45), -- Store IPv6 addresses too
    user_agent TEXT,
    amount_paid DECIMAL(5, 2) DEFAULT 0,
    CONSTRAINT downloads_unique UNIQUE (project_id, downloaded_by) -- Prevent duplicate downloads
);

-- Transactions table
CREATE TABLE transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    download_id UUID REFERENCES downloads(id) ON DELETE SET NULL,
    contributor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(5, 2) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('download', 'bonus', 'correction', 'withdrawal')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    paystack_reference VARCHAR(255), -- Paystack transaction reference
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Withdrawals table
CREATE TABLE withdrawals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    paystack_recipient_code VARCHAR(255), -- Paystack recipient code
    paystack_transfer_code VARCHAR(255), -- Paystack transfer code
    failure_reason TEXT,
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blog posts table
CREATE TABLE blog_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url VARCHAR(500), -- ImageKit URL
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
    tags VARCHAR(255)[],
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project reviews table
CREATE TABLE project_reviews (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_verified_download BOOLEAN DEFAULT FALSE, -- Whether reviewer downloaded the project
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT project_reviews_unique UNIQUE (project_id, reviewer_id)
);

-- Blog comments table
CREATE TABLE blog_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    blog_post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES blog_comments(id) ON DELETE CASCADE, -- For nested comments
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'spam', 'deleted')),
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- e.g., 'project_approved', 'new_download', etc.
    is_read BOOLEAN DEFAULT FALSE,
    related_entity_type VARCHAR(50), -- e.g., 'project', 'blog_post', 'withdrawal'
    related_entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_university ON users(university_id);
CREATE INDEX idx_users_program ON users(program_id);
CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_programs_university ON programs(university_id);

CREATE INDEX idx_courses_program ON courses(program_id);

CREATE INDEX idx_projects_course ON projects(course_id);
CREATE INDEX idx_projects_contributor ON projects(contributor_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_projects_tags ON projects USING GIN(tags);

CREATE INDEX idx_downloads_project ON downloads(project_id);
CREATE INDEX idx_downloads_user ON downloads(downloaded_by);
CREATE INDEX idx_downloads_date ON downloads(downloaded_at);

CREATE INDEX idx_transactions_contributor ON transactions(contributor_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

CREATE INDEX idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);

CREATE INDEX idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at);
CREATE INDEX idx_blog_posts_tags ON blog_posts USING GIN(tags);

CREATE INDEX idx_project_reviews_project ON project_reviews(project_id);
CREATE INDEX idx_project_reviews_reviewer ON project_reviews(reviewer_id);

CREATE INDEX idx_blog_comments_blog_post ON blog_comments(blog_post_id);
CREATE INDEX idx_blog_comments_user ON blog_comments(user_id);
CREATE INDEX idx_blog_comments_parent ON blog_comments(parent_comment_id);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Universities policies
CREATE POLICY "Universities are viewable by everyone" ON universities
    FOR SELECT USING (true);

CREATE POLICY "Only admins can modify universities" ON universities
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Programs policies
CREATE POLICY "Programs are viewable by everyone" ON programs
    FOR SELECT USING (true);

CREATE POLICY "Only admins can modify programs" ON programs
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Courses policies
CREATE POLICY "Courses are viewable by everyone" ON courses
    FOR SELECT USING (true);

CREATE POLICY "Only admins can modify courses" ON courses
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Users policies
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (auth.role() = 'authenticated' AND
                    (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update all users" ON users
    FOR UPDATE USING (auth.role() = 'authenticated' AND
                    (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Teams policies
CREATE POLICY "Teams are viewable by team members" ON teams
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM team_members WHERE team_id = teams.id) OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Team owners can manage their teams" ON teams
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM team_members
            WHERE team_id = teams.id AND role IN ('owner', 'admin')
        ) OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Team members policies
CREATE POLICY "Team members are viewable by team members" ON team_members
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM team_members WHERE team_id = team_members.team_id) OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Team owners can manage team members" ON team_members
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM team_members
            WHERE team_id = team_members.team_id AND role IN ('owner', 'admin')
        ) OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Projects policies
CREATE POLICY "Approved projects are viewable by everyone" ON projects
    FOR SELECT USING (status = 'approved' AND is_public = true);

CREATE POLICY "Users can view their own projects" ON projects
    FOR SELECT USING (auth.uid() = contributor_id);

CREATE POLICY "Users can create projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "Users can update their own projects" ON projects
    FOR UPDATE USING (auth.uid() = contributor_id);

CREATE POLICY "Admins and reviewers can manage all projects" ON projects
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'reviewer'));

-- Project versions policies
CREATE POLICY "Project versions are viewable by project owners and admins" ON project_versions
    FOR SELECT USING (
        auth.uid() IN (SELECT contributor_id FROM projects WHERE id = project_versions.project_id) OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Project owners can create versions" ON project_versions
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT contributor_id FROM projects WHERE id = project_versions.project_id)
    );

-- Downloads policies
CREATE POLICY "Users can view their own downloads" ON downloads
    FOR SELECT USING (auth.uid() = downloaded_by);

CREATE POLICY "Users can create downloads" ON downloads
    FOR INSERT WITH CHECK (auth.uid() = downloaded_by);

CREATE POLICY "Admins can view all downloads" ON downloads
    FOR SELECT USING (auth.role() = 'authenticated' AND
                    (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Transactions policies
CREATE POLICY "Users can view their own transactions" ON transactions
    FOR SELECT USING (auth.uid() = contributor_id);

CREATE POLICY "Admins can view all transactions" ON transactions
    FOR SELECT USING (auth.role() = 'authenticated' AND
                    (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Withdrawals policies
CREATE POLICY "Users can view their own withdrawals" ON withdrawals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create withdrawals" ON withdrawals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view and process all withdrawals" ON withdrawals
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Blog posts policies
CREATE POLICY "Published blog posts are viewable by everyone" ON blog_posts
    FOR SELECT USING (status = 'published');

CREATE POLICY "Users can view their own blog posts" ON blog_posts
    FOR SELECT USING (auth.uid() = author_id);

CREATE POLICY "Users can create blog posts" ON blog_posts
    FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own blog posts" ON blog_posts
    FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Admins and reviewers can manage all blog posts" ON blog_posts
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'reviewer'));

-- Project reviews policies
CREATE POLICY "Approved project reviews are viewable by everyone" ON project_reviews
    FOR SELECT USING (status = 'approved');

CREATE POLICY "Users can view their own reviews" ON project_reviews
    FOR SELECT USING (auth.uid() = reviewer_id);

CREATE POLICY "Users can create reviews for projects they downloaded" ON project_reviews
    FOR INSERT WITH CHECK (
        auth.uid() = reviewer_id AND
        EXISTS (
            SELECT 1 FROM downloads
            WHERE project_id = project_reviews.project_id AND downloaded_by = auth.uid()
        )
    );

CREATE POLICY "Users can update their own reviews" ON project_reviews
    FOR UPDATE USING (auth.uid() = reviewer_id);

CREATE POLICY "Admins can manage all reviews" ON project_reviews
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Blog comments policies
CREATE POLICY "Approved blog comments are viewable by everyone" ON blog_comments
    FOR SELECT USING (status = 'approved');

CREATE POLICY "Users can view their own comments" ON blog_comments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create comments" ON blog_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" ON blog_comments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all comments" ON blog_comments
    FOR ALL USING (auth.role() = 'authenticated' AND
                 (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Functions and Triggers

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE TRIGGER update_universities_updated_at BEFORE UPDATE ON universities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_withdrawals_updated_at BEFORE UPDATE ON withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_reviews_updated_at BEFORE UPDATE ON project_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_comments_updated_at BEFORE UPDATE ON blog_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle project download and transaction creation
CREATE OR REPLACE FUNCTION handle_project_download()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Trigger to handle project downloads
CREATE TRIGGER after_download_insert AFTER INSERT ON downloads
FOR EACH ROW EXECUTE FUNCTION handle_project_download();

-- Function to handle withdrawal status changes
CREATE OR REPLACE FUNCTION handle_withdrawal_status_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Trigger to handle withdrawal status changes
CREATE TRIGGER after_withdrawal_update AFTER UPDATE ON withdrawals
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION handle_withdrawal_status_change();

-- Function to update project rating when a review is added/updated
CREATE OR REPLACE FUNCTION update_project_rating()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Trigger to update project rating after review insert or update
CREATE TRIGGER after_review_insert AFTER INSERT ON project_reviews
FOR EACH ROW EXECUTE FUNCTION update_project_rating();

CREATE TRIGGER after_review_update AFTER UPDATE ON project_reviews
FOR EACH ROW WHEN (OLD.rating IS DISTINCT FROM NEW.rating OR OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_project_rating();

-- Insert initial data (optional)
INSERT INTO universities (id, name, short_name, location) VALUES
    (uuid_generate_v4(), 'University of Ghana', 'UG', 'Legon, Accra'),
    (uuid_generate_v4(), 'Kwame Nkrumah University of Science and Technology', 'KNUST', 'Kumasi'),
    (uuid_generate_v4(), 'University of Cape Coast', 'UCC', 'Cape Coast'),
    (uuid_generate_v4(), 'Ghana Institute of Management and Public Administration', 'GIMPA', 'Accra'),
    (uuid_generate_v4(), 'Ashesi University', 'Ashesi', 'Berekuso');

-- Create admin user (this should be done after Auth is set up)
-- Note: This is just a placeholder, actual admin creation should be done through the Auth system
-- INSERT INTO users (id, email, role, full_name) VALUES
--     ([admin-auth-id], 'admin@openstudent.com', 'admin', 'OpenStudent Admin');