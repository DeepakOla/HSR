export interface ZohoInvoiceExportRow {
  invoiceDate: string;           // YYYY-MM-DD
  invoiceNumber: string;         // e.g. HSR-B2C-20261115 or HSR-INV-0012
  customerName: string;          // e.g. Daily Retail B2C Walk-ins or ABC Logistics
  gstin?: string;                // 15-character GSTIN or blank for B2C
  placeOfSupply: string;         // '06-Haryana'
  itemName: string;              // 'CNG Cylinder Hydrostatic Testing'
  hsnSac: string;                // '998719'
  quantity: number;              // Total cylinders tested
  ratePaise: number;             // Base rate per cylinder
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
  paymentMode: string;           // 'UPI' or 'Cash'
}

export function formatZohoBooksCsv(rows: ZohoInvoiceExportRow[]): string {
  const headers = [
    'Invoice Date',
    'Invoice Number',
    'Customer Name',
    'GST Identification Number (GSTIN)',
    'Place of Supply',
    'Item Name',
    'HSN/SAC',
    'Quantity',
    'Rate',
    'Taxable Value',
    'CGST (9%)',
    'SGST (9%)',
    'Total Amount',
    'Payment Mode'
  ];

  const escapeCsv = (str: string | number | undefined | null) => {
    if (str === null || str === undefined) return '';
    const text = String(str);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [
    headers.join(','),
    ...rows.map(r => [
      escapeCsv(r.invoiceDate),
      escapeCsv(r.invoiceNumber),
      escapeCsv(r.customerName),
      escapeCsv(r.gstin || ''),
      escapeCsv(r.placeOfSupply),
      escapeCsv(r.itemName),
      escapeCsv(r.hsnSac),
      escapeCsv(r.quantity),
      escapeCsv((r.ratePaise / 100).toFixed(2)),
      escapeCsv((r.taxableAmountPaise / 100).toFixed(2)),
      escapeCsv((r.cgstPaise / 100).toFixed(2)),
      escapeCsv((r.sgstPaise / 100).toFixed(2)),
      escapeCsv((r.totalPaise / 100).toFixed(2)),
      escapeCsv(r.paymentMode)
    ].join(','))
  ];

  return lines.join('\r\n');
}

export async function generateDailyB2cConsolidation(
  db: D1Database,
  targetDate: string // YYYY-MM-DD
): Promise<ZohoInvoiceExportRow | null> {
  // Aggregate all completed B2C retail tests for the target date
  const agg = await db.prepare(`
    SELECT 
      COUNT(b.id) as total_tests,
      COALESCE(SUM(b.cylinder_count), 0) as total_cylinders,
      COALESCE(SUM(b.base_price_paise), 0) as total_base_paise,
      COALESCE(SUM(b.gst_paise), 0) as total_gst_paise,
      COALESCE(SUM(b.total_price_paise), 0) as total_amount_paise
    FROM bookings b
    LEFT JOIN parties p ON b.party_id = p.id
    WHERE DATE(b.booking_date) = ?
      AND (p.party_type = 'INDIVIDUAL' OR p.party_type IS NULL)
      AND (p.gstin IS NULL OR p.gstin = '')
      AND b.booking_status IN ('COMPLETED', 'CHECKED_IN', 'IN_PROGRESS')
  `).bind(targetDate).first<{
    total_tests: number;
    total_cylinders: number;
    total_base_paise: number;
    total_gst_paise: number;
    total_amount_paise: number;
  }>();

  if (!agg || agg.total_tests === 0) return null;

  const invoiceNumber = `HSR-B2C-${targetDate.replace(/-/g, '')}`;
  const halfGst = Math.round(agg.total_gst_paise / 2);
  const avgRate = agg.total_cylinders > 0 ? Math.round(agg.total_base_paise / agg.total_cylinders) : agg.total_base_paise;

  const row: ZohoInvoiceExportRow = {
    invoiceDate: targetDate,
    invoiceNumber,
    customerName: 'Consolidated B2C Retail Testing',
    placeOfSupply: '06-Haryana',
    itemName: 'CNG Cylinder Hydrostatic Testing (SAC 998719)',
    hsnSac: '998719',
    quantity: agg.total_cylinders || agg.total_tests,
    ratePaise: avgRate,
    taxableAmountPaise: agg.total_base_paise,
    cgstPaise: halfGst,
    sgstPaise: agg.total_gst_paise - halfGst,
    totalPaise: agg.total_amount_paise,
    paymentMode: 'UPI / Counter'
  };

  // Upsert into zoho_books_sync_ledger
  await db.prepare(`
    INSERT INTO zoho_books_sync_ledger (
      id, entry_date, entry_type, invoice_number, customer_party_name,
      customer_gstin, taxable_amount_paise, cgst_paise, sgst_paise,
      total_amount_paise, sync_status, created_at
    ) VALUES (
      lower(hex(randomblob(16))), ?, 'B2C_DAILY_CONSOLIDATED', ?, ?,
      NULL, ?, ?, ?, ?, 'EXPORTED_CSV', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    )
    ON CONFLICT(invoice_number) DO UPDATE SET
      taxable_amount_paise = excluded.taxable_amount_paise,
      cgst_paise = excluded.cgst_paise,
      sgst_paise = excluded.sgst_paise,
      total_amount_paise = excluded.total_amount_paise
  `).bind(
    targetDate,
    invoiceNumber,
    row.customerName,
    row.taxableAmountPaise,
    row.cgstPaise,
    row.sgstPaise,
    row.totalPaise
  ).run();

  return row;
}
