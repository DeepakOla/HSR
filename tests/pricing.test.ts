import { describe, expect, it } from 'vitest';
import { calculateServicePrice } from '../src/lib/pricing';

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
