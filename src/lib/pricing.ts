export const FIXED_GST_RATE_BPS = 1800;

export interface ServicePrice {
  basePricePaise: number;
  gstRateBps: typeof FIXED_GST_RATE_BPS;
  gstAmountPaise: number;
  totalPricePaise: number;
}

export interface BookingPriceBreakdown extends ServicePrice {
  advancePaise: number;
  balancePaise: number;
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

/**
 * Single source of truth for booking price, advance deposit, and balance calculations.
 * Applies 18% GST to base price and subtracts flat advance to determine remaining balance.
 */
export function calculateBookingPrice(
  basePricePaise: number,
  flatAdvancePaise: number
): BookingPriceBreakdown {
  if (!Number.isSafeInteger(flatAdvancePaise) || flatAdvancePaise < 0) {
    throw new RangeError('Advance amount must be a non-negative integer number of paise');
  }

  const price = calculateServicePrice(basePricePaise);

  if (flatAdvancePaise > price.totalPricePaise) {
    throw new RangeError('Advance amount cannot exceed the total price');
  }

  return {
    ...price,
    advancePaise: flatAdvancePaise,
    balancePaise: price.totalPricePaise - flatAdvancePaise,
  };
}

