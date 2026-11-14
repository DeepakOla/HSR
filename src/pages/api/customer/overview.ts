import type { APIRoute } from 'astro';
import { getCustomerSessionFromCookie } from '../../../lib/customer-auth';
import { jsonResponse, errorResponse } from '../../../lib/utils';
import type { CustomerOverviewResponse } from '../../../types/hsr-contracts';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals?.runtime?.env;
  if (!env?.DB) {
    return errorResponse('Database connection unavailable', 500, 'DB_UNAVAILABLE');
  }

  const session = await getCustomerSessionFromCookie(request, env);
  if (!session) {
    return errorResponse('Unauthorized customer session', 401, 'UNAUTHORIZED');
  }

  try {
    const party = await env.DB.prepare(
      'SELECT id, full_name, email, party_type, gstin FROM parties WHERE id = ?'
    )
      .bind(session.partyId)
      .first<{
        id: string;
        full_name: string;
        email: string | null;
        party_type: string;
        gstin: string | null;
      }>();

    const phoneRow = await env.DB.prepare(
      `SELECT cp.display_phone FROM contact_phones cp
       JOIN party_phones pp ON pp.phone_id = cp.id
       WHERE pp.party_id = ? LIMIT 1`
    )
      .bind(session.partyId)
      .first<{ display_phone: string }>();

    // Registered vehicles count
    const vehicleCountRow = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM party_vehicle_access WHERE party_id = ?`
    )
      .bind(session.partyId)
      .first<{ count: number }>();

    // Tests due soon count (due within 90 days)
    const dueSoonRow = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM vehicles v
       JOIN party_vehicle_access pva ON pva.vehicle_id = v.id
       WHERE pva.party_id = ?
         AND v.next_test_due_date IS NOT NULL
         AND v.next_test_due_date <= date('now', '+90 days')`
    )
      .bind(session.partyId)
      .first<{ count: number }>();

    // Completed tests count
    const completedTestsRow = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM bookings b
       JOIN booking_groups bg ON bg.id = b.booking_group_id
       WHERE (bg.booker_party_id = ? OR b.rc_owner_party_id = ?)
         AND b.booking_status = 'COMPLETED'`
    )
      .bind(session.partyId, session.partyId)
      .first<{ count: number }>();

    // Upcoming appointments
    const upcoming = await env.DB.prepare(
      `SELECT b.id as bookingId, b.booking_token as bookingToken, bg.group_reference as groupReference,
              COALESCE(b.display_reg_no, v.display_reg_no, v.registration_display, 'HR-26-XX-0000') as displayRegNo,
              COALESCE(b.vehicle_category, v.vehicle_category, 'CAR') as vehicleCategory,
              COALESCE(b.booked_cylinder_count, b.cylinder_count_snapshot, 1) as cylinderCount,
              COALESCE(b.slot_date, b.service_date) as slotDate,
              COALESCE(b.slot_start_time, b.slot_start_snapshot, '09:00') as slotStartTime,
              b.booking_status as bookingStatus,
              b.testing_status as testingStatus,
              sr.resource_name as assignedBayName,
              bg.payment_status as paymentStatus,
              bg.total_payable_paise as totalPayablePaise
       FROM bookings b
       LEFT JOIN booking_groups bg ON bg.id = b.booking_group_id
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       LEFT JOIN station_resources sr ON sr.id = b.assigned_bay_id
       WHERE (bg.booker_party_id = ? OR b.rc_owner_party_id = ?)
         AND b.booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
       ORDER BY b.slot_date ASC, b.slot_start_time ASC
       LIMIT 5`
    )
      .bind(session.partyId, session.partyId)
      .all<any>();

    // Recent activity feed
    const activities = [
      {
        id: 'act-1',
        timestamp: new Date().toISOString(),
        title: 'Customer Workspace Synchronized',
        subtitle: 'All vehicle testing records and certificates linked to your profile.',
        statusBadge: 'ACTIVE',
      },
    ];

    const responsePayload: CustomerOverviewResponse = {
      customer: {
        partyId: session.partyId,
        fullName: party?.full_name || session.fullName,
        phoneDisplay: phoneRow?.display_phone || session.phoneE164.replace('+91', ''),
        email: party?.email || session.email || null,
        partyType: (party?.party_type as any) || 'INDIVIDUAL',
        gstin: party?.gstin || null,
      },
      metrics: {
        registeredVehiclesCount: vehicleCountRow?.count || 0,
        testsDueSoonCount: dueSoonRow?.count || 0,
        completedTestsCount: completedTestsRow?.count || 0,
      },
      upcomingAppointments: (upcoming.results || []).map((row: any) => ({
        bookingId: String(row.bookingId),
        bookingToken: String(row.bookingToken || row.bookingId),
        groupReference: row.groupReference || `HSR-${row.bookingId}`,
        displayRegNo: row.displayRegNo,
        vehicleCategory: row.vehicleCategory,
        cylinderCount: Number(row.cylinderCount),
        slotDate: row.slotDate,
        slotStartTime: row.slotStartTime,
        bookingStatus: row.bookingStatus,
        testingStatus: row.testingStatus || 'NOT_ARRIVED',
        assignedBayName: row.assignedBayName || null,
        paymentStatus: row.paymentStatus || 'UNPAID',
        totalPayablePaise: Number(row.totalPayablePaise || 0),
      })),
      recentActivity: activities,
    };

    return jsonResponse(responsePayload, 200);
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to fetch customer overview', 500, 'SERVER_ERROR');
  }
};
