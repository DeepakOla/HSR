import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/utils';

interface StationRecord {
  id: string;
  station_name: string;
  is_hsr_flagship: number;
  peso_approval_no: string;
  peso_doc_no: string;
  address_line: string;
  landmark: string;
  pincode: string;
  lat: number;
  lng: number;
  car_price_inr: number;
  price_transparency_note: string;
  median_turnaround_mins: number;
  accepts_maruti_eeco: number;
  supports_heavy_trucks: number;
  booking_mode_summary: string;
  refund_policy_summary: string;
  deduplication_and_audit_note: string;
  license_verification_badge: string;
}

const HUBS: Record<string, { lat: number; lng: number; label: string }> = {
  'gurugram-rewari': { lat: 28.3245, lng: 76.782, label: 'Pataudi / Rewari–Pataudi Highway Corridor' },
  gurugram: { lat: 28.4595, lng: 77.0266, label: 'Gurugram City (Rajiv Chowk / Sohna Rd)' },
  manesar: { lat: 28.3537, lng: 76.9388, label: 'IMT Manesar / Bilaspur Chowk (NH-48)' },
  dharuhera: { lat: 28.2054, lng: 76.7946, label: 'Dharuhera / Bhiwadi Bypass (NH-48)' },
  rewari: { lat: 28.192, lng: 76.6186, label: 'Rewari City / Mahendergarh Rd / Sec-1' },
  bahadurgarh: { lat: 28.6924, lng: 76.924, label: 'Bahadurgarh / Jhajjar' },
  faridabad: { lat: 28.4089, lng: 77.3178, label: 'Faridabad / Ballabhgarh' },
};

const STATIONS: StationRecord[] = [
  {
    id: 'hsr-flagship-rewari',
    station_name: 'HSR Green Energy Hydro Testing Plant (Flagship Center)',
    is_hsr_flagship: 1,
    peso_approval_no: 'SETUP_REQUIRED',
    peso_doc_no: 'FORM-GCT',
    address_line: 'Rewari Industrial Corridor (NH-48), Rewari, Haryana 123401',
    landmark: 'Near NH-48 Express Exit & Toll Plaza',
    pincode: '123401',
    lat: 28.195,
    lng: 76.625,
    car_price_inr: 2950,
    price_transparency_note: '₹2,500 Base + 18% GST (300 Bar Water-Jacket Stretch Test + Brass Compliance Plate + Form C Certificate)',
    median_turnaround_mins: 90,
    accepts_maruti_eeco: 1,
    supports_heavy_trucks: 1,
    booking_mode_summary: 'Instant priority slot booking online with flat advance or walk-in',
    refund_policy_summary: 'Non-refundable advance upon slot confirmation (locks dedicated testing bay)',
    deduplication_and_audit_note: 'PESO Haryana Class-A Testing Station. Direct automated water jacket telemetry. Zero middlemen.',
    license_verification_badge: 'PESO_VERIFIED_ACTIVE_2028',
  },
  {
    id: 'sugam-technical-manesar',
    station_name: 'IMT Manesar Regional Authorized Facility',
    is_hsr_flagship: 0,
    peso_approval_no: 'SETUP_REQUIRED',
    peso_doc_no: 'FORM-GCT',
    address_line: 'IMT Manesar Corridor (NH-48), Gurugram District, Haryana',
    landmark: 'NH-48 Bilaspur Chowk / Manesar Corridor',
    pincode: '122050',
    lat: 28.361,
    lng: 76.932,
    car_price_inr: 3200,
    price_transparency_note: 'Commercial counter processing fee applicable',
    median_turnaround_mins: 150,
    accepts_maruti_eeco: 0,
    supports_heavy_trucks: 1,
    booking_mode_summary: 'Online portal requires full advance payment; Eeco vans not permitted',
    refund_policy_summary: 'Non-refundable if arrival delayed by more than 15 minutes past slot',
    deduplication_and_audit_note: 'Form GCT approved testing plant in Manesar industrial zone.',
    license_verification_badge: 'PESO_VERIFIED_ACTIVE_2028',
  },
  {
    id: 'axn-hydro-gurugram',
    station_name: 'Gurugram Central Testing Facility',
    is_hsr_flagship: 0,
    peso_approval_no: 'SETUP_REQUIRED',
    peso_doc_no: 'FORM-GCT',
    address_line: 'Old Delhi Road / Rajiv Chowk Corridor, Gurugram, Haryana',
    landmark: 'Delhi-Gurugram Expressway Link',
    pincode: '122016',
    lat: 28.511,
    lng: 77.082,
    car_price_inr: 3000,
    price_transparency_note: '₹3,000 standard counter quote (retail middleman pricing)',
    median_turnaround_mins: 240,
    accepts_maruti_eeco: 1,
    supports_heavy_trucks: 0,
    booking_mode_summary: 'Phone booking or walk-in queue',
    refund_policy_summary: 'Non-refundable token deposit',
    deduplication_and_audit_note: '⚠️ Form GCT license hit 30/09/2026 renewal window. Check certificate authenticity on portal before testing.',
    license_verification_badge: 'PESO_RENEWAL_CHECK_SEP2026',
  },
];

const FEEDER_WARNINGS = [
  {
    business_name: 'Shree Shyam CNG Auto Retrofit & Testing Point',
    claimed_location: 'Bilaspur Chowk, NH-48 (Manesar / Dharuhera Highway)',
    consumer_risk_explanation: 'Operating as a roadside retrofit garage with NO Form GCT hydrostatic testing plant. Transports removed cylinders to third-party plants for ₹500–₹800 markup, leading to 24-48 hr vehicle downtime.',
  },
  {
    business_name: 'Star Auto Gas Cylinder Hydro Center',
    claimed_location: 'Dharuhera Old Bus Stand Bypass',
    consumer_risk_explanation: 'Not listed on online.peso.gov.in Haryana Form GCT directory. Uses uncalibrated manual hand-jacks without water jacket expansion stretch measurement.',
  },
  {
    business_name: 'NCR Gas Services & Retest Station',
    claimed_location: 'Pataudi Road, Near Railway Crossing',
    consumer_risk_explanation: 'Unlicensed workshop issuing fabricated compliance brass plates without digital PESO Form C certificate endorsement.',
  },
];

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Multiply by road winding curvature factor (approx 1.28x straight line)
  return Math.round(R * c * 1.28 * 10) / 10;
}

export const GET: APIRoute = async ({ url }) => {
  const hubParam = url.searchParams.get('hub') || 'gurugram-rewari';
  const vehicleFilter = url.searchParams.get('vehicle') || 'ALL';
  const latParam = url.searchParams.get('lat');
  const lngParam = url.searchParams.get('lng');

  let originLat: number;
  let originLng: number;
  let originLabel: string;

  if (latParam && lngParam && !isNaN(Number(latParam)) && !isNaN(Number(lngParam))) {
    originLat = Number(latParam);
    originLng = Number(lngParam);
    originLabel = 'Your Current GPS Location';
  } else {
    const hub = HUBS[hubParam] || HUBS['gurugram-rewari'];
    originLat = hub.lat;
    originLng = hub.lng;
    originLabel = hub.label;
  }

  // Filter stations based on vehicle type
  const filtered = STATIONS.filter((s) => {
    if (vehicleFilter === 'EECO') {
      return s.accepts_maruti_eeco === 1;
    }
    if (vehicleFilter === 'TRUCK_BUS') {
      return s.supports_heavy_trucks === 1;
    }
    return true;
  });

  // Calculate road distance and drive time
  const enriched = filtered.map((st) => {
    const roadDistanceKm = calculateDistanceKm(originLat, originLng, st.lat, st.lng);
    // Estimated drive speed ~42 km/h average in Haryana NCR corridors
    const estimatedDriveMins = Math.max(12, Math.round((roadDistanceKm / 42) * 60));
    return {
      ...st,
      roadDistanceKm,
      estimatedDriveMins,
    };
  });

  // Sort: HSR flagship first, then by ascending road distance
  enriched.sort((a, b) => {
    if (a.is_hsr_flagship && !b.is_hsr_flagship) return -1;
    if (!a.is_hsr_flagship && b.is_hsr_flagship) return 1;
    return a.roadDistanceKm - b.roadDistanceKm;
  });

  return jsonResponse({
    origin: {
      lat: originLat,
      lng: originLng,
      label: originLabel,
    },
    filter: {
      hub: hubParam,
      vehicle: vehicleFilter,
    },
    stations: enriched,
    feederWarnings: FEEDER_WARNINGS,
  });
};
