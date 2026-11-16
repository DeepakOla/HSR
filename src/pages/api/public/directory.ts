import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const corridor = url.searchParams.get('corridor') || 'gurugram-rewari';
  const db = getDb({ locals } as any);

  const stations = await db.prepare(`
    SELECT * FROM directory_stations 
    WHERE corridor_slug = ? 
    ORDER BY is_hsr_flagship DESC, rating DESC
  `).bind(corridor).all();

  // If table is empty, return default seeded corridor stations
  if (!stations.results || stations.results.length === 0) {
    const defaultStations = [
      {
        slug: 'hsr-green-energy-rewari',
        station_name: 'HSR Green Energy (PESO Testing Centre)',
        corridor_slug: 'gurugram-rewari',
        corridor_name: 'Gurugram - Pataudi - Rewari Corridor',
        is_hsr_flagship: 1,
        address: 'Rewari Industrial Corridor (NH-48), Rewari, Haryana 123401',
        city: 'Rewari',
        phone: '+919910055355',
        rating: 4.9,
        hydro_testing_available: 1,
        turnaround_hours: '2 Hours Express Bay',
        price_starts_inr: 2500
      },
      {
        slug: 'haryana-city-gas-pataudi',
        station_name: 'Pataudi Fuel & CNG Mother Station',
        corridor_slug: 'gurugram-rewari',
        corridor_name: 'Gurugram - Pataudi - Rewari Corridor',
        is_hsr_flagship: 0,
        address: 'Pataudi Highway Corridor, Gurugram District, Haryana',
        city: 'Pataudi',
        phone: '+919812000000',
        rating: 4.6,
        hydro_testing_available: 0,
        turnaround_hours: 'Dispensing Only (Testing at HSR)',
        price_starts_inr: 0
      },
      {
        slug: 'manesar-auto-cng-hub',
        station_name: 'Manesar IMT Commercial CNG Hub',
        corridor_slug: 'gurugram-rewari',
        corridor_name: 'Gurugram - Pataudi - Rewari Corridor',
        is_hsr_flagship: 0,
        address: 'IMT Manesar Commercial Corridor (NH-48), Gurugram, Haryana',
        city: 'Manesar',
        phone: '+919811000000',
        rating: 4.7,
        hydro_testing_available: 0,
        turnaround_hours: 'Dispensing Only (Testing at HSR)',
        price_starts_inr: 0
      }
    ];

    return new Response(JSON.stringify({ data: { stations: defaultStations, corridor } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, max-age=60'
      }
    });
  }

  return new Response(JSON.stringify({ data: { stations: stations.results, corridor } }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, max-age=60'
    }
  });
};
