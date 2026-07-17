// Pipeline Health Check
// Runs daily at 10:00 UTC (after all other pipelines)
// Validates that all pipelines ran and produced meaningful data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface PipelineConfig {
  name: string;
  expectedTime: string; // HH:MM UTC
  minProcessed: number; // minimum items that should be processed
  metaField?: string; // field to check in meta (e.g., "processed")
}

const PIPELINES: PipelineConfig[] = [
  { name: 'funko-pipeline', expectedTime: '04:30', minProcessed: 0 },
  { name: 'discovery-pipeline', expectedTime: '05:00', minProcessed: 0 },
  { name: 'autographed-pipeline', expectedTime: '05:30', minProcessed: 0 },
  { name: 'hot-pipeline', expectedTime: '07:00', minProcessed: 100 },
  { name: 'sold-pipeline', expectedTime: '08:30', minProcessed: 1 },
  { name: 'detect-insights', expectedTime: '09:00', minProcessed: 0 },
];

interface PipelineResult {
  name: string;
  ran: boolean;
  expected_time: string;
  actual_time: string | null;
  processed: number;
  duration_ms: number | null;
  status: 'healthy' | 'warning' | 'missing' | 'zero-data';
  message: string;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();

  try {
    const today = new Date().toISOString().split('T')[0];
    const results: PipelineResult[] = [];
    let healthyCount = 0;

    // Check each pipeline
    for (const pipeline of PIPELINES) {
      const { data: runs } = await supabase
        .from('pipeline_runs')
        .select('*')
        .eq('pipeline', pipeline.name)
        .gte('ran_at', `${today}T00:00:00Z`)
        .lt('ran_at', `${today}T23:59:59Z`)
        .order('ran_at', { ascending: false })
        .limit(1);

      const run = runs?.[0];
      const expectedTimeUTC = `${today}T${pipeline.expectedTime}:00Z`;

      if (!run) {
        // Pipeline didn't run
        results.push({
          name: pipeline.name,
          ran: false,
          expected_time: expectedTimeUTC,
          actual_time: null,
          processed: 0,
          duration_ms: null,
          status: 'missing',
          message: `Pipeline did not run at scheduled time (expected ${pipeline.expectedTime} UTC)`,
        });
        continue;
      }

      const processed = run.meta?.processed ?? 0;
      const actualTime = new Date(run.ran_at).toISOString();

      // Check if processing happened
      if (processed === 0) {
        results.push({
          name: pipeline.name,
          ran: true,
          expected_time: expectedTimeUTC,
          actual_time: actualTime,
          processed: 0,
          duration_ms: run.duration_ms,
          status: 'zero-data',
          message: `Pipeline ran but processed 0 items (expected min: ${pipeline.minProcessed})`,
        });
        continue;
      }

      // Check minimum threshold
      if (processed < pipeline.minProcessed) {
        results.push({
          name: pipeline.name,
          ran: true,
          expected_time: expectedTimeUTC,
          actual_time: actualTime,
          processed,
          duration_ms: run.duration_ms,
          status: 'warning',
          message: `Pipeline processed ${processed} items (below threshold of ${pipeline.minProcessed})`,
        });
        continue;
      }

      // Check execution time (warn if > 90s)
      const duration = run.duration_ms ?? 0;
      if (duration > 90000) {
        results.push({
          name: pipeline.name,
          ran: true,
          expected_time: expectedTimeUTC,
          actual_time: actualTime,
          processed,
          duration_ms: duration,
          status: 'warning',
          message: `Pipeline completed but exceeded 90s timeout (${(duration / 1000).toFixed(1)}s)`,
        });
        continue;
      }

      // Healthy
      results.push({
        name: pipeline.name,
        ran: true,
        expected_time: expectedTimeUTC,
        actual_time: actualTime,
        processed,
        duration_ms: duration,
        status: 'healthy',
        message: `✅ Processed ${processed} items in ${(duration / 1000).toFixed(1)}s`,
      });
      healthyCount++;
    }

    const allHealthy = results.every((r) => r.status === 'healthy');
    const failedCount = results.filter((r) => r.status !== 'healthy').length;

    // Log the health check
    const { error: logErr } = await supabase.from('pipeline_health_checks').insert({
      check_date: today,
      all_healthy: allHealthy,
      results: results,
      total_pipelines: PIPELINES.length,
      healthy_pipelines: healthyCount,
      failed_pipelines: failedCount,
      details: results
        .filter((r) => r.status !== 'healthy')
        .map((r) => `${r.name}: ${r.message}`)
        .join(' | '),
    });

    if (logErr) {
      console.error('Failed to log health check:', logErr.message);
    }

    const durationMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        ok: true,
        check_date: today,
        all_healthy: allHealthy,
        total_pipelines: PIPELINES.length,
        healthy_pipelines: healthyCount,
        failed_pipelines: failedCount,
        results,
        duration_ms: durationMs,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Health check error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
