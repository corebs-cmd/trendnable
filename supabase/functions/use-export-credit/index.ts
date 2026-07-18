// Trendnable — use-export-credit Edge Function
// Called after a successful export to decrement the user's export_credits.
// Authenticated — only decrements for the calling user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Verify the JWT to get the user ID
    const userSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await userSupabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check user has credits before decrementing
    const { data: userData } = await userSupabase
      .from('users')
      .select('export_credits')
      .eq('id', user.id)
      .single();

    if (!userData || userData.export_credits <= 0) {
      return new Response(JSON.stringify({ error: 'No export credits' }), {
        status: 402, headers: { 'Content-Type': 'application/json' },
      });
    }

    await userSupabase.rpc('decrement_export_credits', { user_id_input: user.id });

    return new Response(JSON.stringify({ ok: true, remaining: userData.export_credits - 1 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
