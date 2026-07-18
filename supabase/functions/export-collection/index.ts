// Trendnable — export-collection Edge Function
// Two actions:
//   email    — sends CSV via Resend with attachment
//   download — uploads CSV to Supabase Storage, returns 1-hour signed URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface Summary {
  itemCount: number;
  totalValue: number;
  totalCost: number;
  pl: number;
  plPct: number;
}

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function buildEmailHTML(summary: Summary, fileName: string): string {
  const plPositive = summary.pl >= 0;
  const plColor    = plPositive ? '#37d49b' : '#FF7A6B';
  const plSign     = plPositive ? '+' : '';

  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0A1426;border-radius:16px;overflow:hidden;">

      <!-- Header -->
      <div style="padding:28px 28px 24px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;">
              <img src="https://wmuvigcdazjitzstxqvk.supabase.co/storage/v1/object/public/assets/logo.png"
                   width="44" height="44"
                   style="width:44px;height:44px;border-radius:12px;display:block;"
                   alt="Trendnable" />
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1.2;">Trendnable</div>
              <div style="font-size:11px;color:#64748B;margin-top:2px;letter-spacing:0.05em;text-transform:uppercase;">Daily collectibles intelligence</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Heading -->
      <div style="padding:28px 28px 0;">
        <h1 style="font-size:22px;font-weight:700;color:#ffffff;margin:0 0 6px;letter-spacing:-0.3px;">Your Collection Export</h1>
        <p style="font-size:13px;color:#64748B;margin:0;">📎 ${fileName}</p>
      </div>

      <!-- Summary card -->
      <div style="margin:20px 28px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;">
        <p style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px;">Collection Summary</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:5px 0;font-size:14px;color:#94A3B8;">Total Items</td>
            <td style="padding:5px 0;font-size:14px;color:#ffffff;font-weight:600;text-align:right;">${summary.itemCount}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:14px;color:#94A3B8;">Estimated Value</td>
            <td style="padding:5px 0;font-size:14px;color:#f1c24c;font-weight:700;text-align:right;">${fmtUSD(summary.totalValue)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:14px;color:#94A3B8;">Total Cost</td>
            <td style="padding:5px 0;font-size:14px;color:#ffffff;font-weight:600;text-align:right;">${fmtUSD(summary.totalCost)}</td>
          </tr>
          <tr style="border-top:1px solid rgba(255,255,255,0.07);">
            <td style="padding:12px 0 4px;font-size:15px;font-weight:600;color:#94A3B8;">P&amp;L</td>
            <td style="padding:12px 0 4px;font-size:16px;font-weight:700;color:${plColor};text-align:right;">${plSign}${fmtUSD(summary.pl)} (${plSign}${summary.plPct.toFixed(1)}%)</td>
          </tr>
        </table>
      </div>

      <!-- Accent bar -->
      <div style="margin:0 28px;height:3px;background:linear-gradient(90deg,#FF5500 0%,#f3963c 33%,#f1c24c 66%,#37d49b 100%);border-radius:2px;"></div>

      <!-- CTA -->
      <div style="padding:24px 28px 28px;text-align:center;">
        <p style="font-size:13px;color:#64748B;margin:0 0 6px;">Hot scores · Market signals · Price alerts</p>
        <a href="https://apps.apple.com/app/trendnable/id6741441154"
           style="display:inline-block;background:#FF5500;color:#ffffff;padding:13px 32px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-top:12px;letter-spacing:0.01em;">
          Open Trendnable
        </a>
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
        <p style="font-size:11px;color:#334155;margin:0;">
          Trendnable &middot; trendnable.app
        </p>
      </div>

    </div>
  `;
}

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
    const { action, csv, fileName, userEmail, summary } = await req.json() as {
      action: 'email' | 'download';
      csv: string;
      fileName: string;
      userEmail?: string;
      summary?: Summary;
    };

    if (!csv || !fileName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Download: upload to Storage, return signed URL ────────────────────────
    if (action === 'download') {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const csvBytes = new TextEncoder().encode(csv);
      const blob = new Blob([csvBytes], { type: 'text/csv' });
      const storageKey = `${Date.now()}-${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('exports')
        .upload(storageKey, blob, { contentType: 'text/csv' });

      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      const { data: urlData, error: urlErr } = await supabase.storage
        .from('exports')
        .createSignedUrl(storageKey, 3600);

      if (urlErr || !urlData?.signedUrl) {
        throw new Error(`Failed to create signed URL: ${urlErr?.message}`);
      }

      return new Response(JSON.stringify({ url: urlData.signedUrl }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Email: send via Resend with CSV attachment ────────────────────────────
    if (!userEmail || !summary) {
      return new Response(JSON.stringify({ error: 'Missing userEmail or summary for email action' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const base64CSV = btoa(unescape(encodeURIComponent(csv)));

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Trendnable <noreply@trendnable.app>',
        to: [userEmail],
        subject: 'Your Trendnable Collection Export',
        html: buildEmailHTML(summary, fileName),
        attachments: [{ filename: fileName, content: base64CSV }],
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Resend error: ${JSON.stringify(data)}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('export-collection error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
