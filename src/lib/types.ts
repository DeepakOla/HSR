export interface BusinessSettings {
  business_name_en: string;
  business_name_hi: string;
  city: string;
  address_line: string;
  map_url: string;
  contact_phone: string;
  whatsapp_number: string;
  contact_email: string;
  vpa_id: string;
  vpa_payee_name: string;
  hold_minutes: number;
  flat_advance_paise: number;
  r2_enabled: number;
  evidence_budget_bytes: number;
  timezone: string;
  seo_title_en: string;
  seo_title_hi: string;
  seo_desc_en: string;
  seo_desc_hi: string;
}

export interface SlotAvailability {
  slotSnapshotId: number;
  serviceDate: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  slotCapacity: number;
  slotReserved: number;
  slotRemaining: number;
  dayCapacity: number;
  dayReserved: number;
  dayRemaining: number;
  isClosed: boolean;
  isPublic: boolean;
  canStartBooking: boolean;
  bookingEndTime: string | null;
}

export interface VehicleCategory {
  id: number;
  code: string;
  name: string;
  cylinderCount: number;
  basePricePaise: number;
  gstRateBps: number;
  gstPaise: number;
  totalPaise: number;
  advancePaise: number | null;
}

export type { BookingPriceBreakdown } from './pricing';
export { calculateBookingPrice } from './pricing';

