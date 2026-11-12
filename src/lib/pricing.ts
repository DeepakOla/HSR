export const FIXED_GST_RATE_BPS = 1800;

export interface ServicePrice {
  basePricePaise: number;
  gstRateBps: typeof FIXED_GST_RATE_BPS;
  gstAmountPaise: number;
  totalPricePaise: number;
}

/** Apply the fixed 18% GST rate to the owner-configured base service price. */
export function calculateServicePrice(basePricePaise: number): ServicePrice {
  if (!Number.isSafeInteger(basePricePaise) || basePricePaise < 0) {
    throw new RangeError('Base service price must be a non-negative integer number of paise');
  }

  const gstAmountPaise = Math.round((basePricePaise * FIXED_GST_RATE_BPS) / 10_000);
  return {
    basePricePaise,
    gstRateBps: FIXED_GST_RATE_BPS,
    gstAmountPaise,
    totalPricePaise: basePricePaise + gstAmountPaise,
  };
}
