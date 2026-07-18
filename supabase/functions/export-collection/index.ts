// Trendnable — export-collection Edge Function
// Receives CSV + user info, sends the collection export email via Resend
// with the CSV attached. Returns ok on success.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

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
  const plColor    = plPositive ? '#16a34a' : '#dc2626';
  const plSign     = plPositive ? '+' : '';

  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:40px 20px;background:#ffffff;">

      <!-- Header -->
      <div style="margin-bottom:32px;">
        <h1 style="font-size:26px;font-weight:700;color:#0A1426;margin:0 0 4px;">Your Collection Export</h1>
        <p style="font-size:14px;color:#6B7280;margin:0;">Attached: ${fileName}</p>
      </div>

      <!-- Summary card -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:24px;margin-bottom:32px;">
        <p style="font-size:12px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Collection Summary</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#374151;">Total Items</td>
            <td style="padding:6px 0;font-size:14px;color:#0A1426;font-weight:600;text-align:right;">${summary.itemCount}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#374151;">Estimated Value</td>
            <td style="padding:6px 0;font-size:14px;color:#0A1426;font-weight:600;text-align:right;">${fmtUSD(summary.totalValue)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#374151;">Total Cost</td>
            <td style="padding:6px 0;font-size:14px;color:#0A1426;font-weight:600;text-align:right;">${fmtUSD(summary.totalCost)}</td>
          </tr>
          <tr style="border-top:1px solid #E2E8F0;">
            <td style="padding:10px 0 4px;font-size:15px;font-weight:600;color:#374151;">P&amp;L</td>
            <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:${plColor};text-align:right;">${plSign}${fmtUSD(summary.pl)} (${plSign}${summary.plPct.toFixed(1)}%)</td>
          </tr>
        </table>
      </div>

      <!-- CTA -->
      <div style="background:#0A1426;border-radius:12px;padding:24px;margin-bottom:32px;text-align:center;">
        <p style="font-size:13px;color:#94A3B8;margin:0 0 8px;">Track trends daily with Trendnable</p>
        <p style="font-size:14px;color:#CBD5E1;margin:0 0 20px;">Hot scores · Market signals · Price alerts</p>
        <a href="https://apps.apple.com/app/trendnable/id6741441154"
           style="display:inline-block;background:#2563EB;color:#ffffff;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
          Open Trendnable
        </a>
      </div>

      <!-- Footer -->
      <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0;">
        Trendnable &middot; trendnable.app &middot; Your daily collectibles intelligence app
      </p>

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
    const { csv, fileName, userEmail, summary } = await req.json() as {
      csv: string;
      fileName: string;
      userEmail: string;
      summary: Summary;
    };

    if (!csv || !fileName || !userEmail) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Encode CSV as base64 for Resend attachment
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
        attachments: [
          {
            filename: fileName,
            content: base64CSV,
          },
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Resend error: ${JSON.stringify(data)}`);
    }

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
