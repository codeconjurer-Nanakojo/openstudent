// assets/js/supabase-config.js
// Updated Supabase configuration with proper initialization

// Initialize Supabase client
const supabaseUrl = 'https://openstudent.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZmxkeW1wZXFpY2Vobmxlb2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTcxMjMsImV4cCI6MjA3MzY5MzEyM30.PJbyazF2R71EkkXwefeQ0rhooOxyE5ETKcVojPrQM7Q';

const supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);

// Database utility functions
const DatabaseUtils = {
    // Projects CRUD operations
    async getAllProjects() {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching projects:', error);
            return [];
        }
    },

    async getProjectById(id) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching project:', error);
            return null;
        }
    },

    async createProject(projectData) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .insert([projectData])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating project:', error);
            throw error;
        }
    },

    async updateProject(id, updates) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating project:', error);
            throw error;
        }
    },

    async deleteProject(id) {
        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    },

    // Blog posts CRUD operations
    async getAllBlogPosts() {
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching blog posts:', error);
            return [];
        }
    },

    async getBlogPostById(id) {
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching blog post:', error);
            return null;
        }
    },

    async createBlogPost(postData) {
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .insert([postData])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating blog post:', error);
            throw error;
        }
    },

    async updateBlogPost(id, updates) {
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating blog post:', error);
            throw error;
        }
    },

    async deleteBlogPost(id) {
        try {
            const { error } = await supabase
                .from('blog_posts')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting blog post:', error);
            throw error;
        }
    },

    // Search functions
    async searchProjects(query) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .or(`title.ilike.%${query}%,course.ilike.%${query}%,tools_used.ilike.%${query}%,description.ilike.%${query}%`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error searching projects:', error);
            return [];
        }
    },

    async searchBlogPosts(query) {
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .select('*')
                .or(`title.ilike.%${query}%,content.ilike.%${query}%,tags.ilike.%${query}%`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error searching blog posts:', error);
            return [];
        }
    },

    // Statistics functions
    async getProjectStats() {
        try {
            const { count, error } = await supabase
                .from('projects')
                .select('*', { count: 'exact' });

            if (error) throw error;
            return count;
        } catch (error) {
            console.error('Error fetching project stats:', error);
            return 0;
        }
    },

    async getBlogStats() {
        try {
            const { count, error } = await supabase
                .from('blog_posts')
                .select('*', { count: 'exact' });

            if (error) throw error;
            return count;
        } catch (error) {
            console.error('Error fetching blog stats:', error);
            return 0;
        }
    },

    // Authentication functions
    async signIn(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Sign in error:', error);
            throw error;
        }
    },

    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Sign out error:', error);
            throw error;
        }
    },

    async getCurrentUser() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        } catch (error) {
            console.error('Get user error:', error);
            return null;
        }
    }
};

// Make utilities available globally
window.DatabaseUtils = DatabaseUtils;
window.supabase = supabase;