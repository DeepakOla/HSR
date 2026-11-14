import type { APIRoute } from 'astro';
import {
  hashSha256,
  createCustomerSessionToken,
  CUSTOMER_SESSION_COOKIE_NAME,
} from '../../../../lib/customer-auth';
import { jsonResponse, errorResponse } from '../../../../lib/utils';
import { getRuntimeEnv } from '../../../../lib/runtime-env';
import type {
  VerifyCustomerChallengeRequest,
  VerifyCustomerChallengeResponse,
  SharedPhoneProfileSummary,
  ContactPhoneRow,
} from '../../../../types/hsr-contracts';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  if (!env?.DB) {
    return errorResponse('Database connection unavailable', 500, 'DB_UNAVAILABLE');
  }

  try {
    const body = (await request.json()) as VerifyCustomerChallengeRequest;
    const challengeId = (body.challengeId || '').trim();
    const codeOrToken = (body.codeOrToken || '').trim();

    if (!challengeId || !codeOrToken) {
      return errorResponse('Challenge ID and verification code are required', 400, 'MISSING_PARAMS');
    }

    const inputHash = await hashSha256(codeOrToken);

    // Look up active challenge
    const challenge = await env.DB.prepare(
      `SELECT * FROM auth_challenges 
       WHERE id = ? AND consumed_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
    )
      .bind(challengeId)
      .first<{
        id: string;
        target_channel: string;
        identifier: string;
        code_hash: string;
        magic_token_hash: string | null;
        attempts: number;
        max_attempts: number;
      }>();

    if (!challenge) {
      return errorResponse('Verification code has expired or is invalid. Please request a new code.', 400, 'CHALLENGE_EXPIRED');
    }

    if (challenge.attempts >= challenge.max_attempts) {
      return errorResponse('Too many failed attempts. Please request a new code.', 429, 'MAX_ATTEMPTS_EXCEEDED');
    }

    const isMatch = challenge.code_hash === inputHash || (challenge.magic_token_hash && challenge.magic_token_hash === inputHash);

    if (!isMatch) {
      await env.DB.prepare('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?')
        .bind(challengeId)
        .run();
      return errorResponse('Incorrect verification code. Please check and try again.', 400, 'INVALID_CODE');
    }

    // Mark challenge consumed
    await env.DB.prepare("UPDATE auth_challenges SET consumed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
      .bind(challengeId)
      .run();

    const identifier = challenge.identifier;
    const isEmail = identifier.includes('@');

    let phoneRow: ContactPhoneRow | null = null;
    let phoneId: string;
    let phoneE164: string;

    if (!isEmail) {
      phoneE164 = identifier;
      const displayPhone = identifier.replace('+91', '');

      phoneRow = await env.DB.prepare('SELECT * FROM contact_phones WHERE phone_e164 = ?')
        .bind(phoneE164)
        .first<ContactPhoneRow>();

      if (!phoneRow) {
        phoneId = `ph_${crypto.randomUUID()}`;
        await env.DB.prepare(
          'INSERT INTO contact_phones (id, phone_e164, display_phone) VALUES (?, ?, ?)'
        )
          .bind(phoneId, phoneE164, displayPhone)
          .run();
      } else {
        phoneId = phoneRow.id;
      }
    } else {
      phoneE164 = '+919876543210';
      phoneId = 'ph_email_holder';
    }

    // Find linked parties via party_phones
    const linkedProfiles = await env.DB.prepare(
      `SELECT p.id as partyId, p.full_name as fullName, p.party_type as partyType,
              pp.relationship_label as relationshipLabel
       FROM party_phones pp
       JOIN parties p ON p.id = pp.party_id
       WHERE pp.phone_id = ?`
    )
      .bind(phoneId)
      .all<{
        partyId: string;
        fullName: string;
        partyType: string;
        relationshipLabel: string;
      }>();

    const profiles = linkedProfiles.results || [];

    // Check if disambiguation is required (multiple profiles on same phone, no selection made yet)
    if (profiles.length > 1 && !body.selectedPartyId && !body.createNewPartyName) {
      const profileSummaries: SharedPhoneProfileSummary[] = await Promise.all(
        profiles.map(async (p) => {
          const vehicles = await env.DB.prepare(
            `SELECT v.display_reg_no FROM vehicles v
             JOIN party_vehicle_access pva ON pva.vehicle_id = v.id
             WHERE pva.party_id = ? LIMIT 3`
          )
            .bind(p.partyId)
            .all<{ display_reg_no: string }>();

          const maskedPlates = (vehicles.results || []).map((v) => {
            const parts = v.display_reg_no.split('-');
            if (parts.length >= 4) {
              return `${parts[0]}-${parts[1]}-**-${parts[3]}`;
            }
            return v.display_reg_no;
          });

          return {
            partyId: p.partyId,
            fullName: p.fullName,
            partyType: p.partyType as any,
            relationshipLabel: p.relationshipLabel as any,
            maskedVehiclePlates: maskedPlates,
          };
        })
      );

      const disambiguationResponse: VerifyCustomerChallengeResponse = {
        authenticated: false,
        requiresProfileDisambiguation: true,
        sharedPhoneProfiles: profileSummaries,
      };

      return jsonResponse(disambiguationResponse, 200);
    }

    let selectedParty: { id: string; full_name: string; email?: string | null } | null = null;

    if (body.selectedPartyId) {
      const match = profiles.find((p) => p.partyId === body.selectedPartyId);
      if (match) {
        selectedParty = { id: match.partyId, full_name: match.fullName };
      }
    } else if (profiles.length === 1 && !body.createNewPartyName) {
      selectedParty = { id: profiles[0].partyId, full_name: profiles[0].fullName };
    }

    // Create new profile if none exists or user requested "+ Create New Profile"
    if (!selectedParty) {
      const newPartyId = `pty_${crypto.randomUUID()}`;
      const newFullName = (body.createNewPartyName || '').trim() || (isEmail ? identifier.split('@')[0] : 'Valued Customer');

      await env.DB.prepare(
        'INSERT INTO parties (id, full_name, email, party_type) VALUES (?, ?, ?, ?)'
      )
        .bind(newPartyId, newFullName, isEmail ? identifier : null, 'INDIVIDUAL')
        .run();

      await env.DB.prepare(
        'INSERT INTO party_phones (id, party_id, phone_id, relationship_label, is_primary) VALUES (?, ?, ?, ?, 1)'
      )
        .bind(`pp_${crypto.randomUUID()}`, newPartyId, phoneId, 'SELF')
        .run();

      selectedParty = { id: newPartyId, full_name: newFullName, email: isEmail ? identifier : null };
    }

    // Issue Customer Session Token
    const sessionToken = await createCustomerSessionToken(
      {
        partyId: selectedParty.id,
        fullName: selectedParty.full_name,
        phoneE164,
        email: selectedParty.email ?? null,
      },
      env
    );

    const isHttps = request.url.startsWith('https:');
    const secureFlag = isHttps ? '; Secure' : '';
    const cookieHeader = `${CUSTOMER_SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag}`;

    const headers = new Headers();
    headers.set('Set-Cookie', cookieHeader);

    const responsePayload: VerifyCustomerChallengeResponse = {
      authenticated: true,
      requiresProfileDisambiguation: false,
      session: {
        actorType: 'CUSTOMER',
        partyId: selectedParty.id,
        fullName: selectedParty.full_name,
        phoneE164,
        redirectUrl: '/app/',
      },
    };

    return new Response(JSON.stringify({ success: true, data: responsePayload }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to verify authentication code', 500, 'SERVER_ERROR');
  }
};
