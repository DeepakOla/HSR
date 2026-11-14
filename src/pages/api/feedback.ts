import type { APIRoute } from 'astro';
import { z } from 'zod';
import { validateOrigin } from '../../lib/security';
import { getRuntimeEnv } from '../../lib/runtime-env';

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).default(5),
  category: z.enum(['general', 'bug', 'ui_ux', 'booking_flow']).default('general'),
  name: z.string().trim().max(100).optional().default(''),
  contact: z.string().trim().max(100).optional().default(''),
  comment: z.string().trim().min(3, 'Feedback must be at least 3 characters').max(2000),
  locale: z.enum(['en', 'hi']).default('en'),
  url: z.string().max(500).optional().default(''),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);

  // Origin verification
  const originError = validateOrigin(request);
  if (originError) return originError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = feedbackSchema.safeParse(body);
  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: 'Validation failed',
        details: result.error.issues,
      }),
      {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const { rating, category, name, contact, comment, locale, url } = result.data;

  // Record feedback into booking_audit_events table
  try {
    const feedbackPayload = JSON.stringify({
      rating,
      category,
      name: name || 'Anonymous Tester',
      contact: contact || null,
      comment,
      locale,
      url: url || request.url,
      submitted_at: new Date().toISOString(),
    });

    await env.DB.prepare(
      `INSERT INTO booking_audit_events (booking_id, event_type, actor_type, actor_id, event_payload_json)
       VALUES (NULL, 'DEMO_FEEDBACK', 'CUSTOMER', 'PREVIEW_TESTER', ?)`
    )
      .bind(feedbackPayload)
      .run();
  } catch (err) {
    // If table write fails, log and still return success to tester
    console.warn('Feedback audit log warning:', err);
  }

  return new Response(
    JSON.stringify({
      success: true,
      message:
        locale === 'hi'
          ? 'आपकी प्रतिक्रिया के लिए धन्यवाद! हम आपके सुझावों की सराहना करते हैं।'
          : 'Thank you for your feedback! We appreciate your help in testing the HSR platform.',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
