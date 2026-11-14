/**
 * Synthetic Test Data Fixtures for HSR Green Energy Test Suites
 *
 * All data in this file is strictly synthetic and does not represent real customers,
 * real PII, or real financial accounts. In accordance with Section 5.9 and AGENTS.md,
 * no production customer PII or real credentials are used.
 */

export type VehicleType =
  | 'Car'
  | 'Taxi'
  | 'Tempo'
  | 'Van'
  | 'LCV'
  | 'Truck'
  | 'Bus'
  | 'Other';

export interface SyntheticCustomer {
  name: string;
  mobile: string;
  expectedE164: string;
}

export interface SyntheticVehicle {
  raw: string;
  normalized: string;
  type: VehicleType;
  model: string;
  format: 'STATE_SERIES' | 'BH_SERIES';
}

export interface SyntheticStaff {
  email: string;
  role?: 'OWNER' | 'RECEPTIONIST';
  isActive: number;
}

export interface SyntheticPaymentConfig {
  vpaId: string;
  payeeName: string;
  advancePaise: number;
}

export const SYNTHETIC_DATA = {
  customers: {
    standard: {
      name: 'Rajesh Kumar',
      mobile: '9876543210',
      expectedE164: '+919876543210',
    } as SyntheticCustomer,
    hindi: {
      name: 'सुरेश शर्मा',
      mobile: '9123456789',
      expectedE164: '+919123456789',
    } as SyntheticCustomer,
    formattedSpaced: {
      name: 'Amit Singh',
      mobile: '98765 43210',
      expectedE164: '+919876543210',
    } as SyntheticCustomer,
    formattedCountryCode: {
      name: 'Pooja Verma',
      mobile: '+91 98765 43210',
      expectedE164: '+919876543210',
    } as SyntheticCustomer,
    formattedLeadingZero: {
      name: 'Vikas Patel',
      mobile: '09876543210',
      expectedE164: '+919876543210',
    } as SyntheticCustomer,
    invalidShortPhone: {
      name: 'Invalid User',
      mobile: '12345',
      expectedE164: '',
    } as SyntheticCustomer,
    invalidAlphaPhone: {
      name: 'Invalid Alpha',
      mobile: '98765abcde',
      expectedE164: '',
    } as SyntheticCustomer,
    invalidSpecialPhone: {
      name: 'Invalid Special',
      mobile: '98765-4321#',
      expectedE164: '',
    } as SyntheticCustomer,
  },

  vehicles: {
    delhiCar: {
      raw: 'dl 01 ab 1234',
      normalized: 'DL01AB1234',
      type: 'Car',
      model: 'Maruti WagonR',
      format: 'STATE_SERIES',
    } as SyntheticVehicle,
    delhiShortRto: {
      raw: 'DL 1 A 1234',
      normalized: 'DL1A1234',
      type: 'Car',
      model: 'Hyundai Santro',
      format: 'STATE_SERIES',
    } as SyntheticVehicle,
    haryanaTruck: {
      raw: 'HR-26-DQ-5551',
      normalized: 'HR26DQ5551',
      type: 'Truck',
      model: 'Tata 407',
      format: 'STATE_SERIES',
    } as SyntheticVehicle,
    upLcv: {
      raw: 'UP-16-BT-9999',
      normalized: 'UP16BT9999',
      type: 'LCV',
      model: 'Mahindra Bolero Maxi Truck',
      format: 'STATE_SERIES',
    } as SyntheticVehicle,
    shortestValid: {
      raw: 'DL1A1',
      normalized: 'DL1A1',
      type: 'Car',
      model: 'Classic Maruti',
      format: 'STATE_SERIES',
    } as SyntheticVehicle,
    longestValid: {
      raw: 'UP 16 ABC 1234',
      normalized: 'UP16ABC1234',
      type: 'Bus',
      model: 'Ashok Leyland',
      format: 'STATE_SERIES',
    } as SyntheticVehicle,
    bharatSeriesCar: {
      raw: '22 bh 1234 aa',
      normalized: '22BH1234AA',
      type: 'Car',
      model: 'Honda City',
      format: 'BH_SERIES',
    } as SyntheticVehicle,
    bharatSeriesSingleSuffix: {
      raw: '21 BH 9999 Z',
      normalized: '21BH9999Z',
      type: 'Car',
      model: 'Tata Nexon',
      format: 'BH_SERIES',
    } as SyntheticVehicle,
    invalidGarbage: 'GARBAGE123',
    invalidSpecial: 'DL@01#1234',
    invalidTooShort: 'DL1',
    invalidStateCode: 'ZZ01AB1234',
    invalidBhYear: '999BH1234AA',
  },

  staff: {
    owner: {
      email: 'owner@hsr-test.internal',
      role: 'OWNER',
      isActive: 1,
    } as SyntheticStaff,
    receptionist: {
      email: 'reception@hsr-test.internal',
      role: 'RECEPTIONIST',
      isActive: 1,
    } as SyntheticStaff,
    unauthorized: {
      email: 'outsider@hsr-test.internal',
      isActive: 1,
    } as SyntheticStaff,
    inactiveOwner: {
      email: 'inactive-owner@hsr-test.internal',
      role: 'OWNER',
      isActive: 0,
    } as SyntheticStaff,
    inactiveReceptionist: {
      email: 'inactive-reception@hsr-test.internal',
      role: 'RECEPTIONIST',
      isActive: 0,
    } as SyntheticStaff,
  },

  payments: {
    configured: {
      vpaId: 'hsrgreenenergy@okaxis',
      payeeName: 'HSR Green Energy',
      advancePaise: 50000,
    } as SyntheticPaymentConfig,
    unconfigured: {
      vpaId: 'SETUP_REQUIRED',
      payeeName: 'SETUP_REQUIRED',
      advancePaise: 50000,
    } as SyntheticPaymentConfig,
    emptyVpa: {
      vpaId: '',
      payeeName: '',
      advancePaise: 50000,
    } as SyntheticPaymentConfig,
    whitespaceVpa: {
      vpaId: '   ',
      payeeName: '   ',
      advancePaise: 50000,
    } as SyntheticPaymentConfig,
    missingPayee: {
      vpaId: 'hsrgreenenergy@okaxis',
      payeeName: 'SETUP_REQUIRED',
      advancePaise: 50000,
    } as SyntheticPaymentConfig,
  },

  utr: {
    validStandard: '123456789012',
    validAlphanumeric: 'UTR20261113ABCD',
    validFormatted: '1234-5678-9012',
    invalidShort: '1234',
    invalidEmpty: '',
    invalidSpecial: '***###@@@',
  },

  vehicleTypes: [
    'Car',
    'Taxi',
    'Tempo',
    'Van',
    'LCV',
    'Truck',
    'Bus',
    'Other',
  ] as const,

  limits: {
    minCylinders: 1,
    maxPublicCylinders: 6,
    maxReceptionistCylinders: 12,
    truckDefaultCylinders: 4,
    flatAdvancePaise: 50000,
    flatAdvanceRupees: 500,
  },
};

export interface SyntheticHoldInput {
  categoryId: number;
  slotSnapshotId: number;
  customerName: string;
  customerPhone: string;
  vehicleRegistration: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  source: 'WEB' | 'PHONE' | 'WHATSAPP' | 'WALKIN';
  locale: 'en' | 'hi';
  idempotencyKey: string;
}

/**
 * Creates a valid synthetic hold input payload suitable for booking engine testing.
 */
export function createSyntheticHoldInput(
  overrides: Partial<SyntheticHoldInput> = {}
): SyntheticHoldInput {
  return {
    categoryId: overrides.categoryId ?? 1,
    slotSnapshotId: overrides.slotSnapshotId ?? 1,
    customerName: overrides.customerName ?? SYNTHETIC_DATA.customers.standard.name,
    customerPhone: overrides.customerPhone ?? SYNTHETIC_DATA.customers.standard.mobile,
    vehicleRegistration:
      overrides.vehicleRegistration ?? SYNTHETIC_DATA.vehicles.delhiCar.raw,
    vehicleType: overrides.vehicleType ?? SYNTHETIC_DATA.vehicles.delhiCar.type,
    vehicleModel: overrides.vehicleModel ?? SYNTHETIC_DATA.vehicles.delhiCar.model,
    source: overrides.source ?? 'WEB',
    locale: overrides.locale ?? 'en',
    idempotencyKey: overrides.idempotencyKey ?? `test-idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
}
