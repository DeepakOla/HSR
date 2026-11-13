import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { validateOrigin } from '../../../lib/security';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  const originError = validateOrigin(request);
  if (originError) return originError;

  // Detect whether we are in a safe preview/local/test environment
  const url = new URL(request.url);
  const hostname = url.hostname;
  const isPreviewOrDev =
    hostname.includes('workers.dev') ||
    hostname.includes('preview') ||
    hostname.includes('localhost') ||
    hostname === '127.0.0.1' ||
    (typeof env.APP_BASE_URL === 'string' && env.APP_BASE_URL.includes('example'));

  // If not in preview/dev, strictly require OWNER role
  if (!isPreviewOrDev) {
    const auth = await requireRole(request, env, ['OWNER']);
    if (!auth.ok) {
      return auth.response;
    }
  }

  try {
    // 1. Delete slot allocations for active holds
    const allocationsResult = await env.DB.prepare(
      `DELETE FROM booking_slot_allocations
       WHERE booking_id IN (
         SELECT id FROM bookings WHERE reservation_state = 'HELD'
       )`
    ).run();

    // 2. Mark active HELD bookings as CANCELLED
    const bookingsResult = await env.DB.prepare(
      `UPDATE bookings
       SET reservation_state = 'CANCELLED'
       WHERE reservation_state = 'HELD'`
    ).run();

    // 3. Log reset event in booking_audit_events
    await env.DB.prepare(
      `INSERT INTO booking_audit_events (booking_id, event_type, actor_type, actor_id, event_payload_json)
       VALUES (NULL, 'PREVIEW_TEST_RESET', 'STAFF', 'SYSTEM_RESET', ?)`
    )
      .bind(
        JSON.stringify({
          allocationsCleared: allocationsResult.meta.changes,
          bookingsCancelled: bookingsResult.meta.changes,
          timestamp: new Date().toISOString(),
        })
      )
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Preview test bookings and active holds have been reset.',
        allocationsCleared: allocationsResult.meta.changes,
        bookingsCancelled: bookingsResult.meta.changes,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to reset test data',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
