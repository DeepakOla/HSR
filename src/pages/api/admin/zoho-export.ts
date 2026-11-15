import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { errorResponse } from '../../../lib/utils';
import { formatZohoBooksCsv, generateDailyB2cConsolidation, type ZohoInvoiceExportRow } from '../../../lib/zoho-books-free';

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const db = getDb({ locals } as any);

  try {
    const rows: ZohoInvoiceExportRow[] = [];

    // 1. Get B2C consolidated row for this date
    const b2cRow = await generateDailyB2cConsolidation(db, dateParam);
    if (b2cRow) {
      rows.push(b2cRow);
    }

    // 2. Get any individual B2B bookings for this date (parties with GSTIN)
    const b2bBookings = await db.prepare(`
      SELECT 
        b.id,
        b.booking_date,
        b.cylinder_count,
        b.base_price_paise,
        b.gst_paise,
        b.total_price_paise,
        p.full_name as party_name,
        p.gstin
      FROM bookings b
      JOIN parties p ON b.party_id = p.id
      WHERE DATE(b.booking_date) = ?
        AND p.gstin IS NOT NULL 
        AND p.gstin != ''
        AND b.booking_status IN ('COMPLETED', 'CHECKED_IN', 'IN_PROGRESS')
    `).bind(dateParam).all<{
      id: string;
      booking_date: string;
      cylinder_count: number;
      base_price_paise: number;
      gst_paise: number;
      total_price_paise: number;
      party_name: string;
      gstin: string;
    }>();

    if (b2bBookings.results && b2bBookings.results.length > 0) {
      for (const b of b2bBookings.results) {
        const halfGst = Math.round(b.gst_paise / 2);
        const invNum = `HSR-B2B-${b.id.slice(0, 8).toUpperCase()}`;
        rows.push({
          invoiceDate: dateParam,
          invoiceNumber: invNum,
          customerName: b.party_name,
          gstin: b.gstin,
          placeOfSupply: '06-Haryana',
          itemName: 'CNG Cylinder Hydrostatic Testing (SAC 998719)',
          hsnSac: '998719',
          quantity: b.cylinder_count,
          ratePaise: Math.round(b.base_price_paise / (b.cylinder_count || 1)),
          taxableAmountPaise: b.base_price_paise,
          cgstPaise: halfGst,
          sgstPaise: b.gst_paise - halfGst,
          totalPaise: b.total_price_paise,
          paymentMode: 'Bank Transfer / UPI'
        });
      }
    }

    // If no bookings today, return a blank sample header row
    const csvContent = formatZohoBooksCsv(rows);
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="hsr_zoho_books_${dateParam}.csv"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to export Zoho Books CSV', 500);
  }
};
