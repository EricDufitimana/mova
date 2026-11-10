import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Plus, Minus, LocateFixed, Bike } from 'lucide-react';
import { ASYV, NTUNGA } from './data.js';
import { GOOGLE_API_KEY, loadGoogle } from './googleMaps.js';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pickupIcon=L.divIcon({className:'geo-marker',html:'<span class="geo-pickup">P</span>',iconSize:[34,34],iconAnchor:[17,17]});
const driverIcon=L.divIcon({className:'geo-marker',html:'<span class="geo-driver">M</span>',iconSize:[38,38],iconAnchor:[19,19]});
const parkingIcon=(vehicle,selected)=>L.divIcon({className:'geo-marker',iconSize:[126,54],iconAnchor:[63,54],
  html:`<span class="bike-plate-pin ${selected ? 'selected-bike-pin' : ''}"><b>${vehicle.type === 'Moto' ? 'M' : 'C'}</b><span><strong>${escape(vehicle.plate)}</strong><small>${Number(vehicle.price).toLocaleString()} RWF</small></span></span>`});

function pointsFor(props, bikes) {
  if (bikes && props.vehicles?.length) return props.vehicles.map(v=>({lat:v.lat,lng:v.lng}));
  return [props.pickup,props.driver,...(props.path || []),...(props.vehicles || []).map(v=>({lat:v.lat,lng:v.lng}))];
}

function LeafletController({latest,fitKey,onController,initialView}) {
  const map=useMap();
  const fitted=useRef(null);
  useEffect(()=>{
    let active=true;
    const fit=bikes=>{const points=pointsFor(latest.current,bikes);map.fitBounds(points.map(p=>[p.lat,p.lng]),{padding:[80,90],maxZoom:bikes ? 18 : 16,animate:false});};
    onController({zoomIn:()=>map.zoomIn(),zoomOut:()=>map.zoomOut(),fitRoute:()=>fit(false),showBikes:()=>fit(true)});
    const stats=()=>{if(active){map.getContainer().dataset.mapZoom=String(map.getZoom());const center=map.getCenter();map.getContainer().dataset.mapCenter=`${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;}};
    const resize=()=>{if(active && map.getContainer().clientWidth>0)map.invalidateSize({animate:false,pan:false});};
    const observer=new ResizeObserver(resize);observer.observe(map.getContainer());
    map.on('zoomend moveend',stats);stats();
    return()=>{active=false;observer.disconnect();map.off('zoomend moveend',stats);onController(null);};
  },[map,onController,latest]);
  useEffect(()=>{
    if(fitted.current === fitKey)return;
    fitted.current=fitKey;
    const bikes=initialView === 'bikes';
    map.fitBounds(pointsFor(latest.current,bikes).map(p=>[p.lat,p.lng]),{padding:[80,90],maxZoom:bikes ? 18 : 16,animate:false});
  },[map,fitKey,initialView,latest]);
  return null;
}

function googlePlateIcon(maps,vehicle,selected) {
  const fill=selected ? '#ed774f' : '#252b28', ink=selected ? '#20150e' : '#fff';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="132" height="58"><path d="M58 48L66 57L74 48" fill="${fill}"/><rect x="1" y="1" width="130" height="48" rx="9" fill="${fill}" stroke="#efad80" stroke-width="2"/><text x="12" y="29" font-family="Arial" font-weight="bold" font-size="18" fill="${selected ? '#20150e' : '#efad80'}">${vehicle.type === 'Moto' ? 'M' : 'C'}</text><text x="38" y="21" font-family="Arial" font-weight="bold" font-size="12" fill="${ink}">${escape(vehicle.plate)}</text><text x="38" y="38" font-family="Arial" font-size="10" fill="${ink}">${Number(vehicle.price).toLocaleString()} RWF</text></svg>`;
  return {url:`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,...(maps.Size ? {scaledSize:new maps.Size(132,58),anchor:new maps.Point(66,57)} : {})};
}

function GoogleLayer({latest,fitKey,initialView,onController,onError}) {
  const element=useRef(null),map=useRef(null),markers=useRef(new Map()),line=useRef(null),routeSignature=useRef('');
  const [ready,setReady]=useState(false);
  const fitted=useRef(null);
  useEffect(()=>{
    let active=true;
    loadGoogle().then(async maps=>{
      const {Map:GoogleMap}=await maps.importLibrary('maps');
      if(!active)return;
      map.current=new GoogleMap(element.current,{center:latest.current.pickup,zoom:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false,gestureHandling:'greedy',scrollwheel:true,draggable:true,zoomControl:false,keyboardShortcuts:true});
      const fit=bikes=>{const bounds=new maps.LatLngBounds();pointsFor(latest.current,bikes).forEach(p=>bounds.extend(p));map.current.fitBounds(bounds,80);};
      onController({zoomIn:()=>map.current.setZoom(map.current.getZoom()+1),zoomOut:()=>map.current.setZoom(map.current.getZoom()-1),fitRoute:()=>fit(false),showBikes:()=>fit(true)});
      setReady(true);
    }).catch(error=>{if(active)onError(error.message);});
    return()=>{active=false;markers.current.forEach(entry=>entry.marker.setMap(null));markers.current.clear();line.current?.setMap(null);map.current=null;onController(null);};
  },[latest,onController,onError]);
  useEffect(()=>{
    if(!ready || !map.current)return;
    const maps=window.google.maps,props=latest.current;
    const items=[{id:'pickup',...props.pickup,plate:'Customer pickup',pickup:true},...(props.vehicles?.length ? props.vehicles : [{id:'driver',...props.driver,plate:'Driver · simulated'}])];
    const ids=new Set(items.map(v=>v.id));
    for(const [id,entry] of markers.current)if(!ids.has(id)){entry.marker.setMap(null);markers.current.delete(id);}
    for(const item of items){
      let entry=markers.current.get(item.id);
      const signature=item.pickup ? 'pickup' : props.vehicles?.length ? `${item.plate}-${item.price}-${props.selectedId === item.id}` : 'moving';
      const position={lat:item.lat,lng:item.lng};
      const icon=()=>item.pickup ? {path:maps.SymbolPath.CIRCLE,scale:15,fillColor:'#237ed0',fillOpacity:1,strokeColor:'#fff',strokeWeight:3} : props.vehicles?.length ? googlePlateIcon(maps,item,item.id === props.selectedId) : {path:maps.SymbolPath.CIRCLE,scale:18,fillColor:'#ed774f',fillOpacity:1,strokeColor:'#fff',strokeWeight:3};
      if(!entry){
        const marker=new maps.Marker({map:map.current,position,title:item.plate,icon:icon(),...(item.pickup ? {label:{text:'P',color:'#fff'}} : {})});
        marker.addListener('click',()=>latest.current.onSelect?.(item.id));entry={marker,signature,lat:item.lat,lng:item.lng};markers.current.set(item.id,entry);
      }else{
        if(entry.lat !== item.lat || entry.lng !== item.lng){entry.marker.setPosition(position);entry.lat=item.lat;entry.lng=item.lng;}
        if(entry.signature !== signature){entry.marker.setIcon(icon());entry.signature=signature;}
      }
    }
    const signature=JSON.stringify(props.path || []);
    if(routeSignature.current !== signature){
      line.current?.setMap(null);line.current=props.path?.length ? new maps.Polyline({map:map.current,path:props.path,strokeColor:'#ee754b',strokeWeight:5,strokeOpacity:.9}) : null;routeSignature.current=signature;
    }
    if(fitted.current !== fitKey){const bounds=new maps.LatLngBounds();pointsFor(props,initialView === 'bikes').forEach(p=>bounds.extend(p));map.current.fitBounds(bounds,80);fitted.current=fitKey;}
  });
  return <div ref={element} className="geo-map-surface"/>;
}

export default function GeoMap({pickup=ASYV,driver=NTUNGA,path,vehicles,selectedId,onSelect,fitKey='initial',source='illustrative',initialView='route'}) {
  const [error,setError]=useState(''),[tilesFailed,setTilesFailed]=useState(false);
  const controller=useRef(null),latest=useRef(null);
  latest.current={pickup,driver,path,vehicles,selectedId,onSelect};
  const iconKey=JSON.stringify((vehicles || []).map(v=>[v.id,v.plate,v.price,v.id === selectedId]));
  const parkingIcons=useMemo(()=>new Map((vehicles || []).map(v=>[v.id,parkingIcon(v,v.id === selectedId)])),[iconKey]);
  const ready=useCallback(api=>{controller.current=api;},[]);
  useEffect(()=>{const rejected=()=>setError('Google Maps rejected the key. Check billing, APIs and referrer restrictions.');window.addEventListener('mova-map-auth-error',rejected);return()=>window.removeEventListener('mova-map-auth-error',rejected);},[]);
  return <div className="geo-map" aria-label="Map showing customer pickup and simulated driver">
    {GOOGLE_API_KEY && !error ? <GoogleLayer latest={latest} fitKey={fitKey} initialView={initialView} onController={ready} onError={setError}/> : <MapContainer center={[pickup.lat,pickup.lng]} zoom={12} minZoom={3} maxZoom={20} className="geo-map-surface" scrollWheelZoom={true} touchZoom={true} dragging={true} doubleClickZoom={true} zoomControl={false} wheelPxPerZoomLevel={90} wheelDebounceTime={60} zoomAnimation={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={19} maxZoom={20} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' eventHandlers={{tileerror:()=>setTilesFailed(true),tileload:()=>setTilesFailed(false)}}/>
      <Marker position={[pickup.lat,pickup.lng]} icon={pickupIcon}/>
      {(vehicles?.length ? vehicles : [{id:'driver',...driver}]).map(v=><Marker key={v.id} position={[v.lat,v.lng]} title={v.plate || 'Simulated driver'} icon={vehicles?.length ? parkingIcons.get(v.id) : driverIcon} zIndexOffset={v.id === selectedId ? 1000 : 0} eventHandlers={{click:()=>onSelect?.(v.id)}}/>)}
      {path?.length > 1 && <Polyline positions={path.map(p=>[p.lat,p.lng])} pathOptions={{color:'#f3774f',weight:5,...(source !== 'google' ? {dashArray:'8,8'} : {})}}/>}
      <LeafletController latest={latest} fitKey={fitKey} initialView={initialView} onController={ready}/>
    </MapContainer>}
    <div className="geo-map-controls" role="group" aria-label="Map navigation">
      <button type="button" aria-label="Zoom map in" title="Zoom in · mouse wheel and pinch also work" onClick={()=>controller.current?.zoomIn()}><Plus size={23}/></button>
      <button type="button" aria-label="Zoom map out" title="Zoom out" onClick={()=>controller.current?.zoomOut()}><Minus size={23}/></button>
      {vehicles?.length > 0 && <button type="button" aria-label="Show all Ntunga bikes" title="Show Ntunga bike rank" onClick={()=>controller.current?.showBikes()}><Bike size={23}/></button>}
      <button type="button" aria-label="Fit pickup route" title="Show pickup and driver" onClick={()=>controller.current?.fitRoute()}><LocateFixed size={23}/></button>
    </div>
    <div className="geo-map-caption">Drag to pan · Scroll or pinch to zoom{path?.length ? source === 'google' ? ' · Google driving route' : ' · Illustrative connection, not a road route' : ' · Select a plate to choose your bike'}</div>
    {(error || !GOOGLE_API_KEY || tilesFailed) && <div className="geo-map-warning" role="status">{error || (!GOOGLE_API_KEY ? 'OpenStreetMap fallback · Google key not configured' : 'Street tiles unavailable · geographic pins remain interactive')}</div>}
  </div>;
}
