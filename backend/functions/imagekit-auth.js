// backend/functions/imagekit-auth.js

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import ImageKit from 'imagekit';

// Initialize Supabase client (for JWT verification)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Initialize ImageKit with backend-only secrets
const imagekit = new ImageKit({
  privateKey: Deno.env.get('IMAGEKIT_PRIVATE_KEY') ?? '',
  publicKey: Deno.env.get('IMAGEKIT_PUBLIC_KEY') ?? '',
  urlEndpoint: Deno.env.get('IMAGEKIT_URL_ENDPOINT') ?? ''
});

// CORS headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // tighten to your domain in production
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    }

    // Extract and verify Supabase JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(jwt);

    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers });
    }

    console.log(`✅ ImageKit auth requested by user: ${user.id}`);

    // Generate ImageKit authentication parameters
    const authParams = imagekit.getAuthenticationParameters();

    return new Response(JSON.stringify({
      ...authParams,
      publicKey: Deno.env.get('IMAGEKIT_PUBLIC_KEY'),
      urlEndpoint: Deno.env.get('IMAGEKIT_URL_ENDPOINT')
    }), { status: 200, headers });

  } catch (err) {
    console.error('💥 Error in imagekit-auth function:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
});
