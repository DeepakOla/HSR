// ============================================================================
// HSR GREEN ENERGY — SHARED TYPESCRIPT DOMAIN INTERFACES & API CONTRACTS
// Single source of truth across Customer (/app), Staff (/staff), and Admin (/admin)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. DOMAIN ENUMS & LITERAL UNIONS
// ----------------------------------------------------------------------------

export type PartyType = 'INDIVIDUAL' | 'AGENCY_FLEET';

export type RelationshipLabel =
  | 'SELF'
  | 'FAMILY_SHARED'
  | 'RELATIVE_BOOKER'
  | 'FLEET_SUPERVISOR'
  | 'DRIVER';

export type VehicleCategory = 'CAR' | 'TEMPO_LCV' | 'TRUCK_BUS';

export type VehicleAccessRole = 'OWNER' | 'CUSTODIAN' | 'AGENCY';

export type CylinderStatus = 'ACTIVE' | 'CONDEMNED' | 'DETACHED';

export type StaffRole = 'ADMIN_OWNER' | 'OWNER' | 'RECEPTIONIST' | 'TECHNICIAN';

export type ActorType = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SYSTEM_CRON';

export type RoleScope = 'CUSTOMER' | 'RECEPTIONIST' | 'TECHNICIAN' | 'ADMIN_OWNER';

export type AuthChallengeChannel = 'SMS_OTP' | 'WHATSAPP_OTP' | 'EMAIL_MAGIC_LINK';

export type ResourceType = 'VEHICLE_BAY' | 'HYDRO_RIG' | 'INSPECTION_BENCH';

export type ResourceStatus = 'ONLINE' | 'OCCUPIED' | 'MAINTENANCE' | 'CALIBRATION_DUE';

export type BookingSourceChannel =
  | 'WEB_PUBLIC'
  | 'CUSTOMER_PORTAL'
  | 'RECEPTION_PHONE'
  | 'WHATSAPP'
  | 'WALK_IN';

export type ArrivalMode = 'SINGLE' | 'ALL_AT_ONCE' | 'STAGGERED';

export type PaymentStatus =
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'VERIFICATION_PENDING'
  | 'PAID'
  | 'CREDIT_APPROVED'
  | 'REFUNDED';

export type BookingStatus =
  | 'HOLD'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED_HOLD'
  | 'NO_SHOW';

export type TestingStatus =
  | 'NOT_ARRIVED'
  | 'AT_GATE_QUEUE'
  | 'IN_BAY_INTAKE'
  | 'INSPECTION_AND_PREP'
  | 'HYDRO_TESTING'
  | 'PASS_CERT_PENDING'
  | 'FAIL_CONDEMNED'
  | 'CERTIFIED_READY'
  | 'RELEASED';

export type InspectionRating = 'SATISFACTORY' | 'UNSATISFACTORY';

export type TestOutcome = 'PASS' | 'FAIL_CONDEMNED';

export type PaymentMode = 'UPI_QR' | 'CASH' | 'BANK_TRANSFER' | 'ONLINE_GATEWAY';

export type PaymentVerificationState =
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REFUNDED';

export type DocumentType =
  | 'NECK_MARKING_PHOTO'
  | 'PESO_CERTIFICATE_PDF'
  | 'CONDEMNATION_CERT_PDF'
  | 'TAX_INVOICE_PDF';

export type ReminderType =
  | 'BOOKING_CONFIRMATION'
  | 'DAY_BEFORE_SLOT'
  | 'DELAY_NOTICE'
  | 'CERT_READY'
  | 'DUE_IN_30_DAYS'
  | 'DUE_IN_7_DAYS';

// ----------------------------------------------------------------------------
// 2. STATUTORY CONSTANTS & VALIDATION HELPERS (PESO GCR 2016 / IS 8451)
// ----------------------------------------------------------------------------

export const PESO_STATUTORY_LIMITS = {
  MAX_WEIGHT_LOSS_PCT: 5.0,
  MAX_PERMANENT_EXPANSION_PCT: 10.0,
  RETEST_VALIDITY_YEARS: 3,
} as const;

export function normalizeVehicleRegNo(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeIndianPhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return `+91${last10}`;
}

export function evaluatePesoTestOutcome(input: {
  visualCheck: InspectionRating;
  threadCheck: InspectionRating;
  internalCheck: InspectionRating;
  valveCheck: InspectionRating;
  originalTareWeightKg: number;
  observedWeightKg: number;
  minWallThicknessMm: number;
  maxWallThicknessMm: number;
  designMinWallThicknessMm?: number | null;
  totalExpansionCc: number;
  permanentExpansionCc: number;
}): {
  weightLossPct: number;
  permanentExpansionPct: number;
  calculatedOutcome: TestOutcome;
  failureReasons: string[];
} {
  const failureReasons: string[] = [];

  if (input.visualCheck === 'UNSATISFACTORY') failureReasons.push('Visual inspection unsatisfactory');
  if (input.threadCheck === 'UNSATISFACTORY') failureReasons.push('Neck thread inspection unsatisfactory');
  if (input.internalCheck === 'UNSATISFACTORY') failureReasons.push('Internal inspection unsatisfactory');
  if (input.valveCheck === 'UNSATISFACTORY') failureReasons.push('Valve inspection unsatisfactory');

  const weightLossKg = Math.max(0, input.originalTareWeightKg - input.observedWeightKg);
  const weightLossPct =
    input.originalTareWeightKg > 0
      ? Number(((weightLossKg / input.originalTareWeightKg) * 100).toFixed(2))
      : 0;

  if (weightLossPct > PESO_STATUTORY_LIMITS.MAX_WEIGHT_LOSS_PCT) {
    failureReasons.push(`Tare weight loss (${weightLossPct}%) exceeds 5.0% statutory limit`);
  }

  if (
    input.designMinWallThicknessMm != null &&
    input.minWallThicknessMm < input.designMinWallThicknessMm
  ) {
    failureReasons.push(
      `Minimum wall thickness (${input.minWallThicknessMm} mm) is below design minimum (${input.designMinWallThicknessMm} mm)`
    );
  }

  if (input.permanentExpansionCc > input.totalExpansionCc) {
    failureReasons.push('Permanent expansion cannot exceed total volumetric expansion');
  }

  const permanentExpansionPct =
    input.totalExpansionCc > 0
      ? Number(((input.permanentExpansionCc / input.totalExpansionCc) * 100).toFixed(2))
      : 100;

  if (permanentExpansionPct > PESO_STATUTORY_LIMITS.MAX_PERMANENT_EXPANSION_PCT) {
    failureReasons.push(
      `Permanent volumetric expansion (${permanentExpansionPct}%) exceeds 10.0% statutory limit`
    );
  }

  return {
    weightLossPct,
    permanentExpansionPct,
    calculatedOutcome: failureReasons.length === 0 ? 'PASS' : 'FAIL_CONDEMNED',
    failureReasons,
  };
}

// ----------------------------------------------------------------------------
// 3. DATABASE ROW INTERFACES (1:1 WITH CLOUDFLARE D1 TABLES)
// ----------------------------------------------------------------------------

export interface ContactPhoneRow {
  id: string;
  phone_e164: string;
  display_phone: string;
  is_whatsapp_opted_in: 0 | 1;
  created_at: string;
}

export interface PartyRow {
  id: string;
  party_type: PartyType;
  full_name: string;
  email: string | null;
  gstin: string | null;
  business_address: string | null;
  is_credit_approved: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface VehicleRow {
  id: string;
  normalized_reg_no: string;
  display_reg_no: string;
  vehicle_category: VehicleCategory;
  make_model: string | null;
  default_cylinder_count: number;
  owner_party_id: string;
  agency_party_id: string | null;
  last_test_date: string | null;
  next_test_due_date: string | null;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface CylinderRow {
  id: string;
  vehicle_id: string | null;
  serial_number: string;
  manufacturer: string;
  country_of_origin: string;
  manufacturing_date: string | null;
  water_capacity_liters: number | null;
  original_tare_weight_kg: number | null;
  test_pressure_bar: number;
  design_min_wall_thickness_mm: number | null;
  peso_filling_permission_no: string | null;
  current_status: CylinderStatus;
  last_tested_at: string | null;
  next_retest_due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface StationResourceRow {
  id: string;
  resource_code: string;
  resource_name: string;
  resource_type: ResourceType;
  supported_categories_json: string;
  status: ResourceStatus;
  current_booking_id: string | null;
  calibration_cert_no: string | null;
  calibration_valid_until: string | null;
  notes: string | null;
  is_active: 0 | 1;
  updated_at: string;
}

export interface SlotCapacityAllocationRow {
  slot_date: string;
  slot_time: string;
  shift_window_id: string;
  max_cylinders: number;
  allocated_cylinders: number;
  is_manually_blocked: 0 | 1;
  block_reason: string | null;
  updated_at: string;
}

export interface BookingGroupRow {
  id: string;
  group_reference: string;
  idempotency_key: string | null;
  booker_party_id: string;
  booker_phone_id: string;
  agency_party_id: string | null;
  source_channel: BookingSourceChannel;
  is_batch_booking: 0 | 1;
  arrival_mode: ArrivalMode;
  require_gst_invoice: 0 | 1;
  gstin_snapshot: string | null;
  business_name_snapshot: string | null;
  total_vehicles: number;
  total_cylinders: number;
  subtotal_paise: number;
  discount_paise: number;
  gst_paise: number;
  total_payable_paise: number;
  payment_status: PaymentStatus;
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingRow {
  id: string;
  booking_group_id: string;
  booking_token: string;
  vehicle_id: string;
  rc_owner_party_id: string;
  rc_owner_name_snapshot: string;
  driver_name: string | null;
  driver_phone: string | null;
  slot_date: string;
  slot_start_time: string;
  allocated_slots_json: string;
  consecutive_slots_occupied: number;
  booked_cylinder_count: number;
  verified_cylinder_count: number | null;
  unit_price_paise: number;
  line_total_paise: number;
  booking_status: BookingStatus;
  testing_status: TestingStatus;
  assigned_bay_id: string | null;
  hold_expires_at: string | null;
  checked_in_at: string | null;
  bay_assigned_at: string | null;
  testing_started_at: string | null;
  testing_completed_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CylinderTestRecordRow {
  id: string;
  booking_id: string;
  cylinder_id: string;
  hydro_rig_id: string | null;
  tested_by_staff_id: string;
  approved_by_staff_id: string | null;
  visual_check: InspectionRating;
  thread_check: InspectionRating;
  internal_check: InspectionRating;
  valve_check: InspectionRating;
  observed_weight_kg: number;
  weight_loss_pct: number;
  min_wall_thickness_mm: number;
  max_wall_thickness_mm: number;
  base_thickness_mm: number;
  applied_test_pressure_bar: number;
  total_expansion_cc: number;
  permanent_expansion_cc: number;
  permanent_expansion_pct: number;
  internal_drying_done: 0 | 1;
  neck_stamping_done: 0 | 1;
  test_outcome: TestOutcome;
  failure_reason: string | null;
  peso_certificate_number: string | null;
  retest_due_date: string | null;
  tested_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// 4. PUBLIC & BOOKING ENGINE API CONTRACTS (/api/public/*)
// ----------------------------------------------------------------------------

export interface AvailableSlotOption {
  slotTime: string;                   // '09:00'
  displayTime: string;                // '09:00 AM'
  shiftCode: string;                  // 'MORNING'
  shiftName: string;
  remainingCylinderCapacity: number;
  canAccommodateRequest: boolean;
  consecutiveSlotsRequired: number;
  allocatedSlotTimes: string[];       // e.g. ['09:00', '09:30']
}

export interface GetSlotsAvailabilityResponse {
  date: string;
  requestedCylinders: number;
  slots: AvailableSlotOption[];
  pricingQuote: {
    subtotalPaise: number;
    discountPaise: number;
    gstPaise: number;
    totalPayablePaise: number;
    requiresPriorityCallback: boolean; // True if requestedCylinders > maxSelfServeCylinders (12)
  };
}

export interface BookingVehicleInputItem {
  displayRegNo: string;               // 'HR-26-AB-1234'
  vehicleCategory: VehicleCategory;
  cylinderCount: number;
  makeModel?: string;
  rcOwnerName?: string;               // Defaults to bookerFullName if omitted during initial booking
  driverName?: string;
  driverPhone?: string;
}

export interface CreateBookingRequest {
  idempotencyKey: string;
  sourceChannel: BookingSourceChannel;
  slotDate: string;                   // 'YYYY-MM-DD'
  slotStartTime: string;              // 'HH:MM'
  arrivalMode: ArrivalMode;
  bookerFullName: string;
  bookerPhone: string;                // 10-digit or +91
  bookerEmail?: string;
  bookerPartyId?: string;             // Optional when Staff/Customer selects an existing disambiguated profile
  vehicles: BookingVehicleInputItem[]; // Length 1 for Single Vehicle, >= 2 for Fleet Batch
  requireGstInvoice?: boolean;
  gstin?: string;
  businessName?: string;
  notes?: string;
}

export interface CreateBookingResponse {
  bookingGroupId: string;
  groupReference: string;
  totalVehicles: number;
  totalCylinders: number;
  totalPayablePaise: number;
  paymentStatus: PaymentStatus;
  bookings: Array<{
    bookingId: string;
    bookingToken: string;
    statusTrackerUrl: string;         // '/booking-status/[token]'
    displayRegNo: string;
    vehicleCategory: VehicleCategory;
    bookedCylinderCount: number;
    slotDate: string;
    slotStartTime: string;
    allocatedSlots: string[];
    bookingStatus: BookingStatus;
  }>;
}

// ----------------------------------------------------------------------------
// 5. UNIFIED AUTHENTICATION API CONTRACTS (/api/auth/*)
// Supports Hybrid Email Magic Link + Mobile/WhatsApp OTP + Shared Phone Selector
// ----------------------------------------------------------------------------

export interface RequestCustomerChallengeRequest {
  identifier: string;                 // Either 10-digit Mobile OR Email address
  preferredChannel?: AuthChallengeChannel;
  vehicleRegContext?: string;
}

export interface RequestCustomerChallengeResponse {
  challengeId: string;
  channelUsed: AuthChallengeChannel;
  maskedIdentifier: string;
  expiresInSeconds: number;
}

export interface SharedPhoneProfileSummary {
  partyId: string;
  fullName: string;
  partyType: PartyType;
  relationshipLabel: RelationshipLabel;
  maskedVehiclePlates: string[];      // e.g. ['HR-26-**-1234']
}

export interface VerifyCustomerChallengeRequest {
  challengeId: string;
  codeOrToken: string;                // 6-digit OTP or Email Magic Token
  selectedPartyId?: string;           // Provided on 2nd step if multiple profiles share one phone
  createNewPartyName?: string;        // Provided if user selects "+ Create New Profile on this Phone"
}

export interface VerifyCustomerChallengeResponse {
  authenticated: boolean;
  requiresProfileDisambiguation: boolean;
  sharedPhoneProfiles?: SharedPhoneProfileSummary[];
  session?: {
    actorType: 'CUSTOMER';
    partyId: string;
    fullName: string;
    phoneE164: string;
    redirectUrl: string;              // '/app'
  };
}

export interface StaffLoginRequest {
  usernameOrEmail: string;
  password: string;
  expectedWorkspace: 'STAFF' | 'ADMIN';
}

export interface StaffLoginResponse {
  staffUserId: string;
  fullName: string;
  role: StaffRole;
  canVerifyPayments: boolean;
  redirectUrl: '/staff/reception/' | '/staff/testing/' | '/admin/' | '/staff/reception' | '/staff/testing' | '/admin';
}

// ----------------------------------------------------------------------------
// 6. CUSTOMER WORKSPACE API CONTRACTS (/api/customer/* — Sugam Reference)
// ----------------------------------------------------------------------------

export interface CustomerOverviewResponse {
  customer: {
    partyId: string;
    fullName: string;
    phoneDisplay: string;
    email: string | null;
    partyType: PartyType;
    gstin: string | null;
  };
  metrics: {
    registeredVehiclesCount: number;
    testsDueSoonCount: number;        // Due within <= 90 days
    completedTestsCount: number;
  };
  upcomingAppointments: Array<{
    bookingId: string;
    bookingToken: string;
    groupReference: string;
    displayRegNo: string;
    vehicleCategory: VehicleCategory;
    cylinderCount: number;
    slotDate: string;
    slotStartTime: string;
    bookingStatus: BookingStatus;
    testingStatus: TestingStatus;
    assignedBayName: string | null;
    paymentStatus: PaymentStatus;
    totalPayablePaise: number;
  }>;
  recentActivity: Array<{
    id: string;
    timestamp: string;
    title: string;
    subtitle: string;
    statusBadge: string;
  }>;
}

// ----------------------------------------------------------------------------
// 7. STAFF WORKSPACE API CONTRACTS (/api/staff/* — Reception & Testing Team)
// ----------------------------------------------------------------------------

export interface ReceptionQueueItem {
  bookingId: string;
  bookingGroupId: string;
  groupReference: string;
  sourceChannel: BookingSourceChannel;
  slotDate: string;
  slotStartTime: string;
  bookingStatus: BookingStatus;
  testingStatus: TestingStatus;
  paymentStatus: PaymentStatus;
  totalPayablePaise: number;
  vehicle: {
    vehicleId: string;
    displayRegNo: string;
    vehicleCategory: VehicleCategory;
    makeModel: string | null;
    bookedCylinderCount: number;
    verifiedCylinderCount: number | null;
  };
  customer: {
    bookerPartyId: string;
    bookerName: string;
    rcOwnerNameSnapshot: string;
    phoneDisplay: string;
    driverName: string | null;
    agencyName: string | null;
  };
  assignedBay: {
    resourceId: string;
    resourceCode: string;
    resourceName: string;
  } | null;
  testProgress: {
    cylindersRecorded: number;
    cylindersPassed: number;
    cylindersCondemned: number;
    hasPesoCertificatePdf: boolean;
  };
}

export interface CheckInVehicleRequest {
  verifiedCylinderCount: number;
  rcOwnerNameSnapshot: string;
  driverName?: string;
  driverPhone?: string;
  assignBayResourceId?: string | null; // If null, places in 'AT_GATE_QUEUE'
}

export interface SubmitCylinderTestReadingRequest {
  bookingId: string;
  cylinderId?: string;                // Optional if creating cylinder record on the fly
  serialNumber: string;
  manufacturer: string;
  countryOfOrigin: string;
  manufacturingDate: string;
  waterCapacityLiters: number;
  originalTareWeightKg: number;
  testPressureBar: number;
  designMinWallThicknessMm?: number;
  pesoFillingPermissionNo?: string;
  hydroRigId: string;
  visualCheck: InspectionRating;
  threadCheck: InspectionRating;
  internalCheck: InspectionRating;
  valveCheck: InspectionRating;
  observedWeightKg: number;
  minWallThicknessMm: number;
  maxWallThicknessMm: number;
  baseThicknessMm: number;
  appliedTestPressureBar: number;
  totalExpansionCc: number;
  permanentExpansionCc: number;
  internalDryingDone: boolean;
  neckStampingDone: boolean;
  neckMarkingPhotoDocumentId: string; // Uploaded to R2 prior to final sign-off
}

export interface RecordOrVerifyPaymentRequest {
  bookingGroupId: string;
  bookingId?: string;
  amountPaise: number;
  paymentMode: PaymentMode;
  utrOrReference?: string;            // Mandatory if paymentMode === 'UPI_QR' or 'BANK_TRANSFER'
  markAsVerified: boolean;            // Requires staff.can_verify_payments === 1 or ADMIN_OWNER
  notes?: string;
}
