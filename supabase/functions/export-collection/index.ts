// Trendnable — export-collection Edge Function
// Receives a pre-built CSV string from the mobile app, uploads it to
// Supabase Storage, and returns a signed download URL valid for 1 hour.

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
    const { csv, fileName } = await req.json() as { csv: string; fileName: string };
    if (!csv || !fileName) {
      return new Response(JSON.stringify({ error: 'Missing csv or fileName' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Encode string to bytes — Deno storage upload requires ArrayBuffer, not raw string
    const csvBytes = new TextEncoder().encode(csv);
    const blob = new Blob([csvBytes], { type: 'text/csv' });

    // Upload CSV — prefix with timestamp to avoid collisions
    const storageKey = `${Date.now()}-${fileName}`;
    const { error: uploadErr } = await supabase.storage
      .from('exports')
      .upload(storageKey, blob, { contentType: 'text/csv' });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // Signed URL valid for 1 hour
    const { data: urlData, error: urlErr } = await supabase.storage
      .from('exports')
      .createSignedUrl(storageKey, 3600);

    if (urlErr || !urlData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${urlErr?.message}`);
    }

    return new Response(JSON.stringify({ url: urlData.signedUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('export-collection error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
