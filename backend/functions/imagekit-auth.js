// backend/functions/imagekit-auth.js

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Import required modules
import { createClient } from 'jsr:@supabase/supabase-js@2';
import ImageKit from 'imagekit';

// Initialize Supabase client (for JWT verification)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Initialize ImageKit
const imagekit = new ImageKit({
  privateKey: Deno.env.get('IMAGEKIT_PRIVATE_KEY') ?? '',
  publicKey: Deno.env.get('IMAGEKIT_PUBLIC_KEY') ?? '',
  urlEndpoint: Deno.env.get('IMAGEKIT_URL_ENDPOINT') ?? ''
});

// CORS headers for browser requests
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};

// Main function handler
Deno.serve(async (req) => {
  try {
    // Enforce POST method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers }
      );
    }

    // Extract Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authorization header missing or invalid' }),
        { status: 401, headers }
      );
    }

    // Extract JWT token
    const jwt = authHeader.replace('Bearer ', '');

    // Verify Supabase user session
    const { data: { user }, error } = await supabase.auth.getUser(jwt);
    if (error || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers }
      );
    }

    // Log user ID for auditing
    console.log(`ImageKit auth requested by user: ${user.id}`);

    // Generate ImageKit authentication parameters
    const authenticationParameters = imagekit.getAuthenticationParameters();

    // Return signed token and public config
    return new Response(
      JSON.stringify({
        ...authenticationParameters,
        publicKey: Deno.env.get('IMAGEKIT_PUBLIC_KEY'),
        urlEndpoint: Deno.env.get('IMAGEKIT_URL_ENDPOINT')
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('Error in imagekit-auth function:', error);

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
