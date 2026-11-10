import { useCallback, useEffect, useRef, useState } from 'react';

export const requestId = () => globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const closedRide = ride => ['cancelled', 'expired', 'settled'].includes(ride.status);
export const rideLabels = { requested: 'Waiting for fare agreement', confirmed: 'Fare agreed', en_route: 'Driver on the way', arrived: 'Driver at pickup', in_progress: 'Trip in progress', completed: 'Trip complete · pay after riding', settled: 'Ride closed', cancelled: 'Cancelled · no charge', expired: 'Request expired · no charge' };

export async function api(path, { token, body, id } = {}) {
  const send = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api${path}`, { method: body ? 'POST' : 'GET', signal: controller.signal,
        headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(id ? {'X-Request-ID':id} : {}) },
        ...(body ? {body: JSON.stringify(body)} : {}) });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        const error = new Error('The ride server is unavailable at this address. Open the app from the running Mova server and try again.');
        error.status = response.ok ? 503 : response.status;
        throw error;
      }
      const data = await response.json();
      if (!response.ok) { const error = new Error(data.error || 'The request could not be completed.'); error.status = response.status; throw error; }
      return data;
    } catch (error) {
      if (error.status) throw error;
      throw new Error('Connection lost. Reconnect to the same server; your saved ride will return.');
    } finally { clearTimeout(timeout); }
  };
  try { return await send(); } catch (error) {
    // Only keyed operations are retried: the server will return the same result.
    if (!error.status && id) return send();
    throw error;
  }
}

export function useRideService(role = 'rider') {
  const key = `mova-${role}-session`;
  const [token, setToken] = useState(() => localStorage.getItem(key) || '');
  const [state, setState] = useState({rides: [], vehicles: []});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(null);
  const opening = useRef(null);
  const saveToken = useCallback(value => { localStorage.setItem(key, value); setToken(value); }, [key]);
  const refresh = useCallback(() => {
    if (!token) return Promise.resolve();
    // Reuse a pending read. Starting a new generation every polling tick
    // discarded every response on connections slower than the polling interval.
    if (inFlight.current?.token === token && inFlight.current.ticket === generation.current) return inFlight.current.promise;
    const ticket = ++generation.current;
    const promise = (async () => {
      try {
        const next = await api('/state', {token});
        if (ticket === generation.current) { setState(next); setConnected(true); setError(''); }
      } catch (failure) {
        if (ticket === generation.current) { setConnected(false); setError(failure.message); }
      } finally {
        if (inFlight.current?.ticket === ticket) inFlight.current = null;
      }
    })();
    inFlight.current = {token, ticket, promise};
    return promise;
  }, [token]);
  useEffect(() => {
    if (token || role !== 'rider') return;
    let active = true, retry, busy = false;
    const connect = async () => {
      if (busy || !active) return;
      clearTimeout(retry);
      busy = true;
      const pending = opening.current ||= api('/session', {body: {}});
      try {
        const result = await pending;
        if (active) saveToken(result.token);
      } catch (failure) {
        if (opening.current === pending) opening.current = null;
        if (active) { setError(failure.message); retry = setTimeout(connect, 2500); }
      } finally { busy = false; }
    };
    connect();
    window.addEventListener('online', connect);
    return () => { active = false; clearTimeout(retry); window.removeEventListener('online', connect); };
  }, [token, role, saveToken]);
  useEffect(() => {
    refresh(); const timer = setInterval(refresh, 1500);
    const wake = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', wake); window.addEventListener('online', refresh);
    return () => { generation.current++; clearInterval(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', refresh); };
  }, [refresh]);
  const mutate = async (path, body) => {
    try { const result = await api(path, {token, body, id: requestId()}); await refresh(); return result; }
    catch (failure) { await refresh(); throw failure; }
  };
  return { token, state, connected, error, saveToken, refresh, mutate, active: state.rides.find(ride => !closedRide(ride)) };
}
