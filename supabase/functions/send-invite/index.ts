import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { to_email, from_name } = await req.json();

  if (!to_email || !from_name) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Trendnable <noreply@trendnable.app>',
      to: [to_email],
      subject: `${from_name} thinks you'd love Trendnable`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 28px; font-weight: 700; color: #0A1426; margin-bottom: 8px;">Trendnable</h1>
          <p style="font-size: 16px; color: #4A5568; margin-bottom: 24px;">
            ${from_name} invited you to join Trendnable — the daily trend intelligence app for collectors.
          </p>
          <p style="font-size: 15px; color: #4A5568; margin-bottom: 32px;">
            Track what's hot in Funko Pops, Trading Cards, Pop Mart, Hot Toys, and more — all in one app.
          </p>
          <a href="https://trendnable.app" style="display: inline-block; background: #2563EB; color: white; padding: 14px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 15px;">
            Download Trendnable
          </a>
          <p style="font-size: 12px; color: #9CA3AF; margin-top: 32px;">
            Trendnable · trendnable.app
          </p>
        </div>
      `,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return new Response(JSON.stringify({ error: data }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
