import React from 'react';

/** Offline-safe, illustrative map. This is not geographic navigation data. */
export default function IllustratedMap({vehicles, selected, onSelect}) {
  return <div className="illustrated-map" aria-label="Illustrative city map; vehicle positions are simulated">
    <svg viewBox="0 0 900 650" preserveAspectRatio="xMidYMid slice" className="illustrated-roads" aria-hidden="true">
      <defs><pattern id="cityblocks" width="125" height="95" patternUnits="userSpaceOnUse"><rect x="14" y="12" width="78" height="35" rx="5" fill="#d6ded5"/><rect x="40" y="55" width="62" height="23" rx="4" fill="#d6ded5"/></pattern></defs>
      <rect width="900" height="650" fill="#e8ebe1"/>
      <path d="M-30 50 Q170 5 290 150T620 110T940 45L930 305Q720 215 600 310T-30 330Z" fill="#d5e6d0"/>
      <path d="M-40 465Q200 365 305 455T910 430V690H-40Z" fill="#dce8d5"/>
      <rect x="40" y="50" width="305" height="260" fill="url(#cityblocks)"/><rect x="470" y="35" width="345" height="260" fill="url(#cityblocks)"/><rect x="80" y="355" width="330" height="265" fill="url(#cityblocks)"/><rect x="505" y="375" width="330" height="250" fill="url(#cityblocks)"/>
      <g fill="none" strokeLinecap="round"><path d="M-80 520C210 400 210 220 410 306S640 445 990 190" stroke="#fff" strokeWidth="34"/><path d="M-80 520C210 400 210 220 410 306S640 445 990 190" stroke="#f1bf75" strokeWidth="10"/>
      <path d="M85-60Q255 140 330 240T510 740" stroke="#fff" strokeWidth="27"/><path d="M85-60Q255 140 330 240T510 740" stroke="#f3c887" strokeWidth="8"/>
      <path d="M-30 190Q220 210 440 95T950 100" stroke="#fff" strokeWidth="21"/><path d="M-30 190Q220 210 440 95T950 100" stroke="#d2d3c9" strokeWidth="4"/>
      <path d="M-30 590Q215 550 420 420T930 520" stroke="#fff" strokeWidth="21"/><path d="M-30 590Q215 550 420 420T930 520" stroke="#d2d3c9" strokeWidth="4"/>
      <path d="M420-30Q480 155 390 270T640 690" stroke="#fff" strokeWidth="17"/><path d="M720-35Q780 195 660 325T825 690" stroke="#fff" strokeWidth="16"/></g>
      <g fontFamily="Arial,sans-serif" fontWeight="700" letterSpacing="2" fontSize="17" fill="#78897b"><text x="92" y="100">KIMIHURURA</text><text x="520" y="105">KACYIRU</text><text x="80" y="545">NYARUGENGE</text><text x="666" y="550">REMERA</text><text x="370" y="350" fontSize="24" fill="#607367">KIGALI</text></g>
      <g transform="translate(430 320)"><circle r="27" fill="#3585ed" opacity=".14"/><circle r="15" fill="#3585ed" opacity=".22"/><circle r="8" fill="white"/><circle r="5" fill="#3585ed"/></g>
    </svg>
    {vehicles.map((v,i)=>{const x = 12 + ((i*23+18)%76), y=16+((i*31+18)%68);return <button key={v.id} type="button" className={`illustrated-pin ${selected?.id===v.id?'is-selected':''} ${v.status!=='Available'?'is-busy':''}`} style={{left:`${x}%`,top:`${y}%`}} onClick={()=>onSelect(v.id)} title={`${v.plate} · ${v.driver}`}><span>{v.type.charAt(0)}</span>{v.plate}</button>})}
    <div className="illustrated-label">ILLUSTRATIVE MAP — NOT FOR NAVIGATION</div>
  </div>;
}
