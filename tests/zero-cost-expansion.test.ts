import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { generateUpiSvgQr, buildUpiUri, parseBankAlertEmail, recordAndAutoReconcileUpiCredit } from '../src/lib/zero-cost-upi';
import { formatZohoBooksCsv, generateDailyB2cConsolidation, type ZohoInvoiceExportRow } from '../src/lib/zoho-books-free';
import { createMockD1 } from './helpers/d1-mock';
import { extendFutureSnapshots } from '../src/lib/booking-engine';

describe('Zero-Cost Expansion & Auto-Reconciler Suite', () => {
  let db: any;

  beforeEach(async () => {
    db = createMockD1();
    await extendFutureSnapshots(db as any);
  });

  it('generates valid NPCI upi://pay URI locking amount and reference token', () => {
    const uri = buildUpiUri({
      payeeVpa: 'hsrgreen@icici',
      payeeName: 'HSR Green Energy',
      amountPaise: 50000,
      transactionRef: 'HSR-BK-9912',
      note: 'Advance Hydro Test'
    });

    expect(uri).toContain('upi://pay?');
    expect(uri).toContain('pa=hsrgreen@icici');
    expect(uri).toContain('am=500.00');
    expect(uri).toContain('tr=HSR-BK-9912');
    expect(uri).toContain('cu=INR');
  });

  it('renders lightweight zero-dependency SVG QR code using uqr', () => {
    const svg = generateUpiSvgQr({
      payeeVpa: 'hsrgreen@icici',
      payeeName: 'HSR Green Energy',
      amountPaise: 50000,
      transactionRef: 'HSR-BK-9912'
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<path');
  });

  it('parses incoming bank transaction alert email and extracts 12-digit UTR', async () => {
    const mockEmailMime = `From: alerts@sbi.co.in
To: billing@hsrgreenenergy.com
Subject: Credit Alert: Account Credited with INR 500.00
Content-Type: text/plain; charset=UTF-8

Dear Customer,
Your A/c ending 1234 has been credited by INR 500.00 on 15-Nov-26 by UPI.
UPI Ref No: 432109876543
Remitter VPA: driver@okhdfcbank
Ref: HSR-BK-9912
`;

    const parsed = await parseBankAlertEmail(mockEmailMime);
    expect(parsed).not.toBeNull();
    expect(parsed?.utrNumber).toBe('432109876543');
    expect(parsed?.amountPaise).toBe(50000);
    expect(parsed?.referenceId).toBe('HSR-BK-9912');
    expect(parsed?.senderVpa).toBe('driver@okhdfcbank');
  });

  it('auto-reconciles pending booking group when matching UTR alert arrives', async () => {
    // Insert a pending booking group with valid foreign keys and booking record
    await db.exec(`
      INSERT INTO parties (id, full_name) VALUES ('party-1', 'Test Customer');
      INSERT INTO contact_phones (id, phone_e164, display_phone) VALUES ('phone-1', '+919910055355', '9910055355');
      INSERT INTO booking_groups (id, group_reference, booker_party_id, booker_phone_id, source_channel, payment_status, total_payable_paise, total_cylinders)
      VALUES ('group-123', 'HSR-BK-9912', 'party-1', 'phone-1', 'WEB_PUBLIC', 'VERIFICATION_PENDING', 50000, 1);
    `);

    const slot = (await db.prepare(
      'SELECT id, service_date, slot_label_en, slot_label_hi, start_time, end_time, slot_capacity, daily_capacity, config_version FROM daily_slot_snapshots WHERE is_closed = 0 LIMIT 1'
    ).first()) as any;

    await db.exec(`
      INSERT INTO customers (id, name, mobile_e164) VALUES (999, 'Test Customer', '+919910055355');
      INSERT INTO vehicles (id, registration_normalized, registration_display)
      VALUES (999, 'HR26AB1234', 'HR 26 AB 1234');

      INSERT INTO bookings (
        id, booking_code, status_token_hash, source, reservation_state, payment_state,
        service_date, slot_snapshot_id, customer_id, vehicle_id, category_id,
        category_name_en_snapshot, category_name_hi_snapshot, cylinder_count_snapshot,
        base_price_paise_snapshot, gst_rate_bps_snapshot, gst_amount_paise_snapshot,
        total_price_paise_snapshot, slot_label_en_snapshot, slot_label_hi_snapshot,
        slot_start_snapshot, slot_end_snapshot, slot_capacity_snapshot, daily_capacity_snapshot,
        config_version_snapshot, booking_group_id
      ) VALUES (
        999, 'BK-TEST-01', 'hash-123', 'WEB', 'PENDING_VERIFICATION', 'EVIDENCE_SUBMITTED',
        '${slot.service_date}', ${slot.id}, 999, 999, 1,
        'Car 1 Cyl', 'कार 1', 1,
        250000, 1800, 45000,
        295000, '${slot.slot_label_en}', '${slot.slot_label_hi}',
        '${slot.start_time}', '${slot.end_time}', ${slot.slot_capacity}, ${slot.daily_capacity},
        ${slot.config_version}, 'group-123'
      );
    `);

    const result = await recordAndAutoReconcileUpiCredit(db, {
      utrNumber: '432109876543',
      amountPaise: 50000,
      referenceId: 'HSR-BK-9912',
      rawSnippet: 'SBI UPI Credit'
    });

    expect(result.reconciled).toBe(true);
    expect(result.bookingGroupId).toBe('group-123');

    // Verify booking state in D1 is now CONFIRMED and ADVANCE_VERIFIED
    const updatedGroup = await db.prepare('SELECT payment_status FROM booking_groups WHERE id = ?').bind('group-123').first();
    expect(updatedGroup.payment_status).toBe('PAID');

    const updatedBooking = await db.prepare('SELECT reservation_state, payment_state FROM bookings WHERE id = ?').bind(999).first();
    expect(updatedBooking.reservation_state).toBe('CONFIRMED');
    expect(updatedBooking.payment_state).toBe('ADVANCE_VERIFIED');
  });

  it('formats Zoho Books CSV strictly respecting India tax and SAC schema', () => {
    const rows: ZohoInvoiceExportRow[] = [
      {
        invoiceDate: '2026-11-15',
        invoiceNumber: 'HSR-B2C-20261115',
        customerName: 'Consolidated B2C Retail Testing',
        placeOfSupply: '06-Haryana',
        itemName: 'CNG Cylinder Hydrostatic Testing (SAC 998719)',
        hsnSac: '998719',
        quantity: 14,
        ratePaise: 250000,
        taxableAmountPaise: 3500000,
        cgstPaise: 315000,
        sgstPaise: 315000,
        totalPaise: 4130000,
        paymentMode: 'UPI / Counter'
      }
    ];

    const csv = formatZohoBooksCsv(rows);
    expect(csv).toContain('Invoice Date,Invoice Number,Customer Name');
    expect(csv).toContain('HSR-B2C-20261115');
    expect(csv).toContain('998719');
    expect(csv).toContain('35000.00');
    expect(csv).toContain('41300.00');
  });
});
