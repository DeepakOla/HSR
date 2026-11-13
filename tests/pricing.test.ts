import { describe, expect, it } from 'vitest';
import { calculateBookingPrice, calculateServicePrice } from '../src/lib/pricing';

describe('HSR cylinder service pricing', () => {
  it.each([
    [1, 250000, 45000, 295000],
    [2, 500000, 90000, 590000],
    [3, 750000, 135000, 885000],
    [4, 1000000, 180000, 1180000],
    [5, 1250000, 225000, 1475000],
    [6, 1500000, 270000, 1770000],
    [8, 2000000, 360000, 2360000],
    [10, 2500000, 450000, 2950000],
    [12, 3000000, 540000, 3540000],
  ])('calculates the default price for %i cylinder(s)', (_count, base, gst, total) => {
    expect(calculateServicePrice(base)).toEqual({
      basePricePaise: base,
      gstRateBps: 1800,
      gstAmountPaise: gst,
      totalPricePaise: total,
    });
  });

  it('allows one cylinder-count price to be discounted without changing another', () => {
    const discountedTwoCylinderPrice = calculateServicePrice(450000);
    const unchangedOneCylinderPrice = calculateServicePrice(250000);
    expect(discountedTwoCylinderPrice.totalPricePaise).toBe(531000);
    expect(unchangedOneCylinderPrice.totalPricePaise).toBe(295000);
  });

  it('rejects invalid base prices', () => {
    expect(() => calculateServicePrice(-1)).toThrow(RangeError);
    expect(() => calculateServicePrice(1.5)).toThrow(RangeError);
  });
});

describe('HSR booking price calculations with flat advance', () => {
  const DEFAULT_FLAT_ADVANCE_PAISE = 50000; // ₹500

  // 1. Default commercial matrix for all 1 to 12 cylinders
  it.each([
    // [cylinders, basePaise, gstPaise, totalPaise, advancePaise, balancePaise]
    [1, 250000, 45000, 295000, 50000, 245000],
    [2, 500000, 90000, 590000, 50000, 540000],
    [3, 750000, 135000, 885000, 50000, 835000],
    [4, 1000000, 180000, 1180000, 50000, 1130000],
    [5, 1250000, 225000, 1475000, 50000, 1425000],
    [6, 1500000, 270000, 1770000, 50000, 1720000],
    [7, 1750000, 315000, 2065000, 50000, 2015000],
    [8, 2000000, 360000, 2360000, 50000, 2310000],
    [9, 2250000, 405000, 2655000, 50000, 2605000],
    [10, 2500000, 450000, 2950000, 50000, 2900000],
    [11, 2750000, 495000, 3245000, 50000, 3195000],
    [12, 3000000, 540000, 3540000, 50000, 3490000],
  ])(
    'calculates correct breakdown for %i cylinder(s) with ₹500 flat advance',
    (_cylinders, base, gst, total, advance, balance) => {
      const breakdown = calculateBookingPrice(base, advance);
      expect(breakdown).toEqual({
        basePricePaise: base,
        gstRateBps: 1800,
        gstAmountPaise: gst,
        totalPricePaise: total,
        advancePaise: advance,
        balancePaise: balance,
      });
      // Invariant: advance + balance === total
      expect(breakdown.advancePaise + breakdown.balancePaise).toBe(breakdown.totalPricePaise);
    }
  );

  // 2. Boundary case: Zero advance
  it('correctly handles zero advance (full balance payable at counter)', () => {
    const breakdown = calculateBookingPrice(250000, 0);
    expect(breakdown.advancePaise).toBe(0);
    expect(breakdown.balancePaise).toBe(295000);
    expect(breakdown.totalPricePaise).toBe(295000);
  });

  // 3. Boundary case: Full advance
  it('correctly handles full advance equal to total price (zero balance)', () => {
    const total = 295000;
    const breakdown = calculateBookingPrice(250000, total);
    expect(breakdown.advancePaise).toBe(total);
    expect(breakdown.balancePaise).toBe(0);
  });

  // 4. Custom owner-configured base price & advance
  it('calculates custom discounted base price with owner-configured advance', () => {
    // Discounted 2-cylinder price: ₹4,500 base + 18% GST (₹810) = ₹5,310 total
    // Owner sets ₹1,000 advance -> Balance = ₹4,310
    const breakdown = calculateBookingPrice(450000, 100000);
    expect(breakdown.totalPricePaise).toBe(531000);
    expect(breakdown.advancePaise).toBe(100000);
    expect(breakdown.balancePaise).toBe(431000);
  });

  // 5. Compatibility with calculateServicePrice
  it('retains exact equivalence with calculateServicePrice for service price fields', () => {
    const servicePrice = calculateServicePrice(1000000);
    const bookingPrice = calculateBookingPrice(1000000, DEFAULT_FLAT_ADVANCE_PAISE);
    expect(bookingPrice.basePricePaise).toBe(servicePrice.basePricePaise);
    expect(bookingPrice.gstRateBps).toBe(servicePrice.gstRateBps);
    expect(bookingPrice.gstAmountPaise).toBe(servicePrice.gstAmountPaise);
    expect(bookingPrice.totalPricePaise).toBe(servicePrice.totalPricePaise);
  });

  // 6. Validation and Error Handling
  it('rejects invalid advance amounts', () => {
    expect(() => calculateBookingPrice(250000, -1)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, -50000)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, 50000.5)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, NaN)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, Infinity)).toThrow(RangeError);
  });

  it('rejects advance amount exceeding total price', () => {
    // Total for 1 cylinder is 295000 paise (₹2,950). Advance of 300000 paise (₹3,000) must throw.
    expect(() => calculateBookingPrice(250000, 300000)).toThrow(RangeError);
  });

  it('rejects invalid base price when called via calculateBookingPrice', () => {
    expect(() => calculateBookingPrice(-250000, DEFAULT_FLAT_ADVANCE_PAISE)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000.75, DEFAULT_FLAT_ADVANCE_PAISE)).toThrow(RangeError);
  });
});

