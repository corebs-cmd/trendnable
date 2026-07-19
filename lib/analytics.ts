import { posthog } from './posthog';

// ── Event catalogue ───────────────────────────────────────────────────────────
// All event names are defined here — never use raw strings in instrumented code.

export type AnalyticsEvent =
  | { event: 'browse_viewed' }
  | { event: 'collection_pulse_viewed'; properties: { context: 'collection_tab' | 'home_tab' } }
  | { event: 'signal_card_tapped';     properties: { direction: string; sku_id: string } }
  | { event: 'paywall_shown';          properties: { context: string } }
  | { event: 'export_used';            properties: { action: 'send_email' | 'download' | 'purchase' } };

// ── capture — call anywhere (inside or outside React components) ──────────────

export function capture(payload: AnalyticsEvent): void {
  const { event, ...rest } = payload as any;
  posthog.capture(event, rest.properties ?? {});
}
