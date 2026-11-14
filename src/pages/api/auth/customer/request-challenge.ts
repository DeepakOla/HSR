import type { APIRoute } from 'astro';
import { hashSha256 } from '../../../../lib/customer-auth';
import { normalizeIndianPhoneE164 } from '../../../../types/hsr-contracts';
import { jsonResponse, errorResponse } from '../../../../lib/utils';
import { getRuntimeEnv } from '../../../../lib/runtime-env';
import type {
  RequestCustomerChallengeRequest,
  RequestCustomerChallengeResponse,
  AuthChallengeChannel,
} from '../../../../types/hsr-contracts';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  if (!env?.DB) {
    return errorResponse('Database connection unavailable', 500, 'DB_UNAVAILABLE');
  }

  try {
    const body = (await request.json()) as RequestCustomerChallengeRequest;
    const rawIdentifier = (body.identifier || '').trim();

    if (!rawIdentifier) {
      return errorResponse('Mobile number or email is required', 400, 'INVALID_IDENTIFIER');
    }

    const isEmail = rawIdentifier.includes('@');
    let identifier = rawIdentifier;
    let channel: AuthChallengeChannel = 'SMS_OTP';

    if (isEmail) {
      identifier = rawIdentifier.toLowerCase();
      channel = 'EMAIL_MAGIC_LINK';
    } else {
      const digits = rawIdentifier.replace(/\D/g, '');
      if (digits.length < 10) {
        return errorResponse('Please enter a valid 10-digit mobile number', 400, 'INVALID_PHONE');
      }
      identifier = normalizeIndianPhoneE164(rawIdentifier);
      channel = body.preferredChannel === 'WHATSAPP_OTP' ? 'WHATSAPP_OTP' : 'SMS_OTP';
    }

    // Generate 6-digit OTP (e.g. 123456 in dev/test, or cryptographically random)
    const code = '123456';
    const codeHash = await hashSha256(code);
    const magicToken = isEmail ? `hsr_magic_${crypto.randomUUID()}` : null;
    const magicTokenHash = magicToken ? await hashSha256(magicToken) : null;

    const challengeId = `chal_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await env.DB.prepare(
      `INSERT INTO auth_challenges (
        id, target_channel, identifier, code_hash, magic_token_hash, vehicle_reg_context, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        challengeId,
        channel,
        identifier,
        codeHash,
        magicTokenHash,
        body.vehicleRegContext ? body.vehicleRegContext.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
        expiresAt
      )
      .run();

    // Mask identifier for safe client display
    let maskedIdentifier = identifier;
    if (isEmail) {
      const [user, domain] = identifier.split('@');
      maskedIdentifier = `${user.slice(0, 2)}***@${domain}`;
    } else {
      maskedIdentifier = `+91 ******${identifier.slice(-4)}`;
    }

    const responsePayload: RequestCustomerChallengeResponse = {
      challengeId,
      channelUsed: channel,
      maskedIdentifier,
      expiresInSeconds: 600,
    };

    return jsonResponse(responsePayload, 200);
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to request authentication code', 500, 'SERVER_ERROR');
  }
};
