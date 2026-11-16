import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface ReceiptData {
  businessName: string;
  address: string;
  phone: string;
  gstin?: string;
  invoiceNumber: string;
  dateStr: string;
  customerName: string;
  customerPhone: string;
  vehicleReg: string;
  cylinderCount: number;
  cylinderSerials: string[];
  testPressureBar: number;
  baseAmountInr: number;
  gstAmountInr: number;
  totalAmountInr: number;
  advancePaidInr: number;
  balanceDueInr: number;
  paymentMode: string;
  retestDueDate: string;
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  // Standard A5 landscape: 595.28 x 419.53 pt
  const page = pdfDoc.addPage([595.28, 419.53]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(0.04, 0.07, 0.16);     // #0A1128
  const orange = rgb(0.92, 0.35, 0.05);   // #EA580C
  const gray = rgb(0.35, 0.4, 0.45);
  const darkGray = rgb(0.12, 0.15, 0.2);

  // Border
  page.drawRectangle({
    x: 18,
    y: 18,
    width: 559.28,
    height: 383.53,
    borderColor: navy,
    borderWidth: 1.5,
  });

  // Header banner
  page.drawRectangle({
    x: 20,
    y: 350,
    width: 555.28,
    height: 50,
    color: navy,
  });

  page.drawText(data.businessName.toUpperCase(), {
    x: 32,
    y: 375,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('GOVT. RECOGNIZED PESO STATUTORY CNG CYLINDER TESTING STATION', {
    x: 32,
    y: 358,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.85, 0.9, 0.95),
  });

  page.drawText('TAX INVOICE & GATE PASS', {
    x: 420,
    y: 366,
    size: 11,
    font: fontBold,
    color: orange,
  });

  // Station info
  page.drawText(`${data.address} • Phone: ${data.phone}${data.gstin ? ' • GSTIN: ' + data.gstin : ''}`, {
    x: 32,
    y: 335,
    size: 7.5,
    font: fontRegular,
    color: gray,
  });

  // Horizontal divider
  page.drawLine({
    start: { x: 30, y: 326 },
    end: { x: 565, y: 326 },
    thickness: 0.75,
    color: rgb(0.85, 0.88, 0.92),
  });

  // Metadata Grid
  const col1X = 32;
  const col2X = 220;
  const col3X = 410;

  // Row 1
  page.drawText('Invoice No:', { x: col1X, y: 310, size: 8, font: fontRegular, color: gray });
  page.drawText(data.invoiceNumber, { x: col1X + 55, y: 310, size: 8, font: fontBold, color: darkGray });

  page.drawText('Date:', { x: col2X, y: 310, size: 8, font: fontRegular, color: gray });
  page.drawText(data.dateStr, { x: col2X + 30, y: 310, size: 8, font: fontBold, color: darkGray });

  page.drawText('Next Due:', { x: col3X, y: 310, size: 8, font: fontRegular, color: gray });
  page.drawText(data.retestDueDate, { x: col3X + 48, y: 310, size: 8.5, font: fontBold, color: orange });

  // Row 2
  page.drawText('Customer:', { x: col1X, y: 294, size: 8, font: fontRegular, color: gray });
  page.drawText(data.customerName, { x: col1X + 55, y: 294, size: 8, font: fontBold, color: darkGray });

  page.drawText('Mobile:', { x: col2X, y: 294, size: 8, font: fontRegular, color: gray });
  page.drawText(data.customerPhone, { x: col2X + 35, y: 294, size: 8, font: fontBold, color: darkGray });

  page.drawText('Vehicle Reg:', { x: col3X, y: 294, size: 8, font: fontRegular, color: gray });
  page.drawText(data.vehicleReg, { x: col3X + 58, y: 294, size: 9, font: fontBold, color: navy });

  // Table Header
  const tableY = 265;
  page.drawRectangle({
    x: 30,
    y: tableY,
    width: 535,
    height: 18,
    color: rgb(0.95, 0.96, 0.98),
  });

  page.drawText('ITEM DESCRIPTION / TESTING STANDARD', { x: 38, y: tableY + 5, size: 7.5, font: fontBold, color: navy });
  page.drawText('CYL', { x: 310, y: tableY + 5, size: 7.5, font: fontBold, color: navy });
  page.drawText('PRESSURE', { x: 355, y: tableY + 5, size: 7.5, font: fontBold, color: navy });
  page.drawText('BASE (₹)', { x: 425, y: tableY + 5, size: 7.5, font: fontBold, color: navy });
  page.drawText('TOTAL (₹)', { x: 500, y: tableY + 5, size: 7.5, font: fontBold, color: navy });

  // Table Body Row
  const rowY = tableY - 26;
  page.drawText('Hydrostatic Stretch Test under Gas Cylinders Rules (IS 8451 / Rule 35)', { x: 38, y: rowY + 8, size: 8, font: fontBold, color: darkGray });
  page.drawText(`Serials: ${data.cylinderSerials.length > 0 ? data.cylinderSerials.join(', ') : 'Verified on Bay'}`, { x: 38, y: rowY - 4, size: 7, font: fontRegular, color: gray });
  
  page.drawText(String(data.cylinderCount), { x: 318, y: rowY + 5, size: 8.5, font: fontBold, color: darkGray });
  page.drawText(`${data.testPressureBar} Bar`, { x: 355, y: rowY + 5, size: 8, font: fontRegular, color: darkGray });
  page.drawText(data.baseAmountInr.toFixed(2), { x: 425, y: rowY + 5, size: 8, font: fontRegular, color: darkGray });
  page.drawText(data.totalAmountInr.toFixed(2), { x: 500, y: rowY + 5, size: 8.5, font: fontBold, color: navy });

  // Divider
  page.drawLine({
    start: { x: 30, y: 195 },
    end: { x: 565, y: 195 },
    thickness: 0.75,
    color: rgb(0.85, 0.88, 0.92),
  });

  // Financial Summary Block
  const sumX = 370;
  let sumY = 175;
  const addSumRow = (lbl: string, val: string, isTotal = false) => {
    page.drawText(lbl, { x: sumX, y: sumY, size: isTotal ? 9 : 8, font: isTotal ? fontBold : fontRegular, color: isTotal ? navy : gray });
    page.drawText(val, { x: sumX + 130, y: sumY, size: isTotal ? 9.5 : 8, font: fontBold, color: isTotal ? navy : darkGray });
    sumY -= 15;
  };

  addSumRow('Taxable Amount:', `₹ ${data.baseAmountInr.toFixed(2)}`);
  addSumRow('CGST (9%) + SGST (9%):', `₹ ${data.gstAmountInr.toFixed(2)}`);
  addSumRow('Grand Total:', `₹ ${data.totalAmountInr.toFixed(2)}`, true);
  addSumRow('Advance Online Paid:', `₹ ${data.advancePaidInr.toFixed(2)}`);
  addSumRow('Balance Paid at Counter:', `₹ ${data.balanceDueInr.toFixed(2)}`);

  // Statutory Certification Badge
  page.drawRectangle({
    x: 32,
    y: 110,
    width: 310,
    height: 75,
    color: rgb(0.97, 0.98, 1),
    borderColor: rgb(0.8, 0.87, 0.96),
    borderWidth: 1,
  });

  page.drawText('STATUTORY RETESTING COMPLIANCE', { x: 42, y: 168, size: 7.5, font: fontBold, color: navy });
  page.drawText('• Certified with high-pressure water jacket method up to 300 Bar.', { x: 42, y: 153, size: 6.8, font: fontRegular, color: darkGray });
  page.drawText('• Valid for 3 years across all Indian fuel stations and RTO renewals.', { x: 42, y: 141, size: 6.8, font: fontRegular, color: darkGray });
  page.drawText(`• Payment Mode: ${data.paymentMode} • Safe to Refuel`, { x: 42, y: 129, size: 6.8, font: fontBold, color: orange });

  // Signature Block
  page.drawText('Authorized Station Signatory & Stamp', { x: 380, y: 65, size: 7.5, font: fontBold, color: navy });
  page.drawLine({
    start: { x: 375, y: 78 },
    end: { x: 550, y: 78 },
    thickness: 0.75,
    color: rgb(0.6, 0.65, 0.7),
  });

  page.drawText('Generated digitally via HSR Green Energy Portal (PESO Statutory Compliance)', {
    x: 32,
    y: 30,
    size: 6.5,
    font: fontRegular,
    color: gray,
  });

  return await pdfDoc.save();
}

export function downloadReceiptPdf(pdfBytes: Uint8Array, fileName: string) {
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
