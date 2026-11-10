import { distanceKm, NTUNGA, ASYV } from './data.js';

export function pathDistance(path) {
  return path.slice(1).reduce((sum, point, i) => sum + distanceKm(path[i], point) * 1000, 0);
}
export function pointAlong(path, fraction) {
  if (!path?.length) return NTUNGA;
  if (fraction <= 0) return path[0];
  if (fraction >= 1) return path[path.length - 1];
  let left = pathDistance(path) * fraction;
  for (let i = 1; i < path.length; i++) {
    const length = distanceKm(path[i - 1], path[i]) * 1000;
    if (length > 0 && left <= length) {
      const ratio = left / length;
      return {lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * ratio, lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * ratio};
    }
    left -= length;
  }
  return path[path.length - 1];
}
export function trackingAt(ride, now) {
  const simulation = ride.simulation;
  const pickup = ride.pickupCoords || ASYV;
  const path = simulation?.path || [ride.driverOrigin || NTUNGA, pickup];
  let progress = 0;
  if (simulation) {
    const elapsed = (simulation.elapsedMs || 0) + (simulation.paused ? 0 : Math.max(0, now - simulation.startedAt));
    progress = Math.min(1, elapsed / simulation.durationMs);
  }
  if (['arrived','in_progress','completed','settled'].includes(ride.status)) progress = 1;
  if (['cancelled','expired'].includes(ride.status) && simulation?.stoppedProgress !== undefined) progress = simulation.stoppedProgress;
  return {position: pointAlong(path, progress), progress, source: simulation?.source || 'illustrative',
    path, paused: !!simulation?.paused, durationMs: simulation?.durationMs || 15000,
    remainingSeconds: simulation ? Math.ceil((1 - progress) * simulation.durationMs / 1000) : null};
}
