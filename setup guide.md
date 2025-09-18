# OpenStudent Supabase & ImageKit Integration Guide

## 🚀 Quick Start Checklist

### 1. Supabase Setup
- [ ] Create/configure Supabase project
- [ ] Run database schema
- [ ] Set up authentication
- [ ] Configure Row Level Security
- [ ] Update configuration files

### 2. ImageKit Setup
- [ ] Configure ImageKit.io account
- [ ] Set up authentication endpoint
- [ ] Update ImageKit configuration
- [ ] Test image upload

### 3. Frontend Integration
- [ ] Update HTML files with new scripts
- [ ] Replace dummy data with database calls
- [ ] Test all CRUD operations
- [ ] Verify image upload/display

---

## 📋 Step-by-Step Setup

### Step 1: Supabase Database Setup

1. **Go to your Supabase dashboard**
   - Navigate to: https://supabase.com/dashboard/projects
   - Select your project or create a new one

2. **Run the database schema**
   - Go to SQL Editor in your Supabase dashboard
   - Copy and paste the entire SQL schema from the "Database Schema" artifact
   - Click "Run" to execute

3. **Verify tables were created**
   - Go to Table Editor
   - You should see: `projects`, `blog_posts`, `admin_users`, `download_logs`

4. **Create your admin user**
   ```sql
   -- Run this in SQL Editor
   INSERT INTO auth.users (
     id,
     instance_id,
     email,
     encrypted_password,
     email_confirmed_at,
     created_at,
     updated_at,
     raw_app_meta_data,
     raw_user_meta_data,
     is_super_admin,
     role
   ) VALUES (
     gen_random_uuid(),
     '00000000-0000-0000-0000-000000000000',
     'admin@openstudent.com',
     crypt('admin123', gen_salt('bf')),
     NOW(),
     NOW(),
     NOW(),
     '{"provider":"email","providers":["email"]}',
     '{}',
     FALSE,
     'authenticated'
   );
   ```

   **Or create user via Supabase Auth Dashboard:**
   - Go to Authentication > Users
   - Click "Add User"
   - Email: `admin@openstudent.com`
   - Password: `admin123`
   - Email Confirmed: ✓

### Step 2: Update Supabase Configuration

1. **Get your Supabase credentials**
   - Go to Settings > API
   - Copy your Project URL and anon public key

2. **Update `assets/js/supabase-config.js`**
   ```javascript
   const supabaseUrl = 'YOUR_SUPABASE_PROJECT_URL';
   const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
   ```

3. **Test connection**
   - Open browser console on any admin page
   - Type: `console.log(supabase)`
   - Should see Supabase client object

### Step 3: ImageKit.io Setup

1. **Get ImageKit credentials**
   - Login to ImageKit.io dashboard
   - Go to Developer Options
   - Copy: Public Key, Private Key, URL Endpoint

2. **Set up authentication endpoint**
   You need a server endpoint for secure uploads. Here are options:

   **Option A: Simple Node.js Server**
   ```javascript
   // server.js
   const express = require('express');
   const ImageKit = require('imagekit');
   const cors = require('cors');

   const app = express();
   app.use(cors());

   const imagekit = new ImageKit({
     publicKey: 'your_public_key',
     privateKey: 'your_private_key',
     urlEndpoint: 'https://ik.imagekit.io/your_imagekit_id'
   });

   app.get('/auth', (req, res) => {
     const authenticationParameters = imagekit.getAuthenticationParameters();
     res.send(authenticationParameters);
   });

   app.listen(3000, () => {
     console.log('ImageKit auth server running on port 3000');
   });
   ```

   **Option B: Supabase Edge Function**
   ```javascript
   // supabase/functions/imagekit-auth/index.ts
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
   import ImageKit from "npm:imagekit";

   const imagekit = new ImageKit({
     publicKey: Deno.env.get('IMAGEKIT_PUBLIC_KEY')!,
     privateKey: Deno.env.get('IMAGEKIT_PRIVATE_KEY')!,
     urlEndpoint: Deno.env.get('IMAGEKIT_URL_ENDPOINT')!
   });

   serve(async (req) => {
     const authParams = imagekit.getAuthenticationParameters();

     return new Response(JSON.stringify(authParams), {
       headers: {
         "Content-Type": "application/json",
         "Access-Control-Allow-Origin": "*"
       }
     });
   });
   ```

3. **Update ImageKit configuration**
   ```javascript
   // In assets/js/imagekit-config.js
   const imagekit = new ImageKit({
     publicKey: "your_public_key",
     urlEndpoint: "https://ik.imagekit.io/your_imagekit_id",
     authenticationEndpoint: "https://your-auth-endpoint.com/auth"
   });
   ```

### Step 4: File Updates

1. **Replace the HTML files** with the updated versions from the artifacts above:
   - `admin/login.html` → Updated Login Page
   - `admin/dashboard.html` → Updated Dashboard
   - `admin/add_project.html` → Updated Add Project Form

2. **Update JavaScript files**:
   - Replace `assets/js/supabase.js` with `supabase-config.js`
   - Replace `assets/js/imagekit.js` with `imagekit-config.js`

3. **Add new script tags** to your HTML files:
   ```html
   <!-- Before closing </body> tag -->
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="https://unpkg.com/imagekit-javascript/dist/imagekit.min.js"></script>
   <script src="../assets/js/supabase-config.js"></script>
   <script src="../assets/js/imagekit-config.js"></script>
   ```

### Step 5: Test Integration

1. **Test Authentication**
   - Go to `/admin/login.html`
   - Login with: `admin@openstudent.com` / `admin123`
   - Should redirect to dashboard

2. **Test Project Creation**
   - Go to "Add Project"
   - Fill out form and upload image
   - Check Supabase table for new entry
   - Check ImageKit dashboard for uploaded image

3. **Test Dashboard**
   - Should show real statistics
   - Recent projects should load from database

### Step 6: Production Deployment

1. **Environment Variables**
   ```bash
   # For your authentication server
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_key
   IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
   IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
   IMAGEKIT_URL_ENDPOINT=your_imagekit_endpoint
   ```

2. **CORS Configuration**
   - In Supabase: Settings > API > CORS Origins
   - Add your domain: `https://yourdomain.com`
   - For development: `http://localhost:3000`

3. **Row Level Security**
   - Already configured in the schema
   - Public read access for projects/blog posts
   - Admin-only access for modifications

---

## 🔧 Troubleshooting

### Common Issues

1. **"Invalid API key" error**
   - Double-check Supabase URL and key
   - Ensure key is the anon public key, not service role

2. **ImageKit upload fails**
   - Verify authentication endpoint is accessible
   - Check CORS settings
   - Ensure public key is correct

3. **Authentication redirect loops**
   - Clear browser storage/cookies
   - Check if admin user exists in auth.users table

4. **Database permission errors**
   - Verify RLS policies are created
   - Check user role in Supabase auth

### Debug Commands

```javascript
// In browser console
console.log('Supabase client:', supabase);
console.log('Current user:', await DatabaseUtils.getCurrentUser());
console.log('Test query:', await DatabaseUtils.getAllProjects());
```

---

## 🎯 Next Steps

1. **Update remaining pages**:
   - `edit_project.html`
   - `blog_editor.html`
   - `edit_blog.html`

2. **Add features**:
   - Real-time updates
   - File upload for project files
   - Advanced search/filtering
   - Analytics dashboard

3. **Optimize performance**:
   - Add caching
   - Implement pagination
   - Optimize image loading

4. **Security enhancements**:
   - Add rate limiting
   - Implement audit logs
   - Add user roles/permissions

---

## 📞 Support

If you encounter issues:

1. **Check browser console** for error messages
2. **Verify Supabase connection** in Network tab
3. **Test ImageKit endpoint** independently
4. **Review Supabase logs** in dashboard

The integration provides a solid foundation for your OpenStudent platform with proper authentication, database operations, and image handling!