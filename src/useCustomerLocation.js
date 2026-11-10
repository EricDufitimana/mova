import { useEffect, useRef, useState } from 'react';
import { ASYV, ASYV_LABEL } from './data.js';
export default function useCustomerLocation() {
  const [point, setPoint] = useState(ASYV);
  const [label, setLabel] = useState(ASYV_LABEL);
  const [status, setStatus] = useState('default');
  const [error, setError] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const watch = useRef(null);
  useEffect(() => () => {if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);}, []);
  const locate = () => {
    if (!window.isSecureContext || !navigator.geolocation) {setError('Phone GPS needs HTTPS. You can still use the ASYV pickup or enter a place.'); return;}
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    setStatus('requesting'); setError('');
    watch.current = navigator.geolocation.watchPosition(position => {
      setPoint({lat:position.coords.latitude, lng:position.coords.longitude});setAccuracy(position.coords.accuracy);setLabel('My current location');setStatus('live');setError('');
    }, failure => {setStatus('default');setError(failure.code === 1 ? 'Location permission is off. Using the selected pickup instead.' : 'GPS is unavailable. Using the selected pickup instead.');}, {enableHighAccuracy:true,timeout:12000,maximumAge:10000});
  };
  return {point,label,status,error,accuracy,locate};
}
