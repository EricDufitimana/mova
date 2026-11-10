// Entirely fictional vehicles, drivers, plates and prices for UI prototyping.
// dx/dy positions are offsets in meters relative to the local demo anchor.
export const KIGALI = { lat: -1.9536, lng: 30.0606 };
// Approximate locality pins; browser GPS can replace the customer pickup.
// Sources: mapcarta.com/N4078852338 and geonames.org/search.html?q=Ntunga&country=RW
export const ASYV = { lat: -2.03307, lng: 30.3836 };
export const NTUNGA = { lat: -1.957409, lng: 30.354718 };
export const ASYV_LABEL = 'Agahozo-Shalom Youth Village';
export const SEEDS = [
  { id: 'mv-201', driver: 'Jean Claude M.', plate: 'RAD 482 F', type: 'Moto', model: 'TVS HLX 125', rating: 4.9, trips: 1248, eta: 2, price: 900, status: 'Available', dx: -350, dy: 480, color: '#d7ab7b' },
  { id: 'mv-202', driver: 'Aline U.', plate: 'RAE 316 C', type: 'Car', model: 'Toyota Corolla', rating: 4.9, trips: 863, eta: 4, price: 3200, status: 'Available', dx: 780, dy: 210, color: '#bac9d1' },
  { id: 'mv-203', driver: 'Patrick N.', plate: 'RAF 705 B', type: 'Moto', model: 'Bajaj Boxer', rating: 4.8, trips: 2072, eta: 3, price: 1100, status: 'Available', dx: 500, dy: -630, color: '#df9b86' },
  { id: 'mv-204', driver: 'Diane M.', plate: 'RAG 184 T', type: 'Taxi', model: 'Toyota Prius', rating: 5.0, trips: 594, eta: 6, price: 4500, status: 'Available', dx: -950, dy: -100, color: '#cbc0ec' },
  { id: 'mv-205', driver: 'Eric H.', plate: 'RAH 929 D', type: 'Moto', model: 'TVS Neo', rating: 4.7, trips: 431, eta: 5, price: 950, status: 'Busy', dx: -760, dy: -780, color: '#89bdab' },
  { id: 'mv-206', driver: 'Kevin T.', plate: 'RAJ 562 P', type: 'Car', model: 'Suzuki Swift', rating: 4.8, trips: 709, eta: 7, price: 2800, status: 'Available', dx: 1260, dy: -250, color: '#e9c8ac' },
  { id: 'mv-207', driver: 'Sandrine K.', plate: 'RAK 237 A', type: 'Moto', model: 'Bajaj Boxer', rating: 4.9, trips: 1852, eta: 4, price: 1000, status: 'Available', dx: -1280, dy: 720, color: '#e1b5b9' },
  { id: 'mv-208', driver: 'Fabrice B.', plate: 'RAL 810 M', type: 'Taxi', model: 'Hyundai i10', rating: 4.8, trips: 1186, eta: 8, price: 3900, status: 'Busy', dx: 1020, dy: 1140, color: '#9bb1cf' },
  ...['Yves K.', 'Clement N.', 'Alice M.', 'Emmanuel B.', 'Grace U.', 'Olivier H.', 'Joseph R.', 'Ange T.'].map((driver, i) => ({
    id: `mv-${209+i}`, driver, plate: `RAM ${410+i*37} ${['A','B','C','D','E','F','G','H'][i]}`, type:'Moto', model:i%2 ? 'Bajaj Boxer' : 'TVS HLX 125',
    rating:4.7+(i%3)*.1, trips:500+i*113, eta:3, price:900+(i%4)*100, status:'Available', dx:0, dy:0, color:'#d7ab7b'
  })),
];
// Separate parking positions around the fictional Ntunga bike rank, in meters.
export function vehicleOrigin(vehicle) {
  const index=Math.max(0,SEEDS.findIndex(v=>v.id === (typeof vehicle === 'string' ? vehicle : vehicle.id)));
  return near(NTUNGA, (index%4-1.5)*75, (Math.floor(index/4)-1.5)*65);
}
export function near(anchor, dx, dy) {
  return {
    lat: anchor.lat + dy / 111320,
    lng: anchor.lng + dx / (111320 * Math.cos(anchor.lat * Math.PI / 180))
  };
}
export function distanceKm(a, b) {
  const r = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export const money = n => `${new Intl.NumberFormat('en-US').format(n)} RWF`;
