import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngExpression, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin } from '../icons'
import type { SupplierLead } from '../data/supplierLeads'
import { deliveryPointFor, distanceLabel, straightLineDistanceKm } from '../features/location/proximity'

type Props = { leads: SupplierLead[]; deliveryLocation: string }

export function SupplierProximityMap({leads,deliveryLocation}:Props) {
  const [open,setOpen]=useState(false)
  const mapNode=useRef<HTMLDivElement>(null)
  const deliveryPoint=deliveryPointFor(deliveryLocation)
  const mapped=useMemo(() => deliveryPoint ? leads.flatMap(lead => lead.mapPoint ? [{lead,distance:straightLineDistanceKm(deliveryPoint,lead.mapPoint)}] : []).sort((a,b)=>a.distance-b.distance) : [],[deliveryPoint,leads])

  useEffect(() => {
    if(!open||!mapNode.current||!deliveryPoint||mapped.length===0)return
    let cancelled=false
    let map:LeafletMap|undefined
    void (async()=>{
      const L=(await import('leaflet')).default
      if(cancelled||!mapNode.current)return
      map=L.map(mapNode.current,{scrollWheelZoom:false,zoomControl:true})
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map)
      const bounds:LatLngExpression[]=[[deliveryPoint.latitude,deliveryPoint.longitude]]
      L.circleMarker([deliveryPoint.latitude,deliveryPoint.longitude],{radius:8,color:'#ffffff',weight:3,fillColor:'#164cc8',fillOpacity:1}).addTo(map).bindTooltip('Delivery location',{direction:'top'})
      mapped.forEach(({lead,distance})=>{
        const point=lead.mapPoint!
        bounds.push([point.latitude,point.longitude])
        const label=document.createElement('span')
        const name=document.createElement('strong')
        name.textContent=lead.displayName
        label.append(name,document.createTextNode(` · ${distanceLabel(distance)} estimated`))
        L.circleMarker([point.latitude,point.longitude],{radius:7,color:'#ffffff',weight:2,fillColor:'#3d8b66',fillOpacity:.95}).addTo(map!).bindTooltip(label,{direction:'top'})
      })
      map.fitBounds(L.latLngBounds(bounds),{padding:[28,28],maxZoom:11})
    })()
    return()=>{cancelled=true;map?.remove()}
  },[deliveryPoint,mapped,open])

  return <section className="supplier-map-card" aria-labelledby="supplier-map-title">
    <div className="supplier-map-heading">
      <div><span className="supplier-map-icon"><MapPin size={18}/></span><span><h3 id="supplier-map-title">Supplier proximity</h3><p>Estimated straight-line distance from {deliveryLocation}</p></span></div>
      <button className="secondary" type="button" onClick={()=>setOpen(value=>!value)} disabled={!deliveryPoint||mapped.length===0}>{open?'Hide map':'Map nearby suppliers'}</button>
    </div>
    {!deliveryPoint&&<p className="supplier-map-message">This delivery address has not been geocoded. No distance is shown.</p>}
    {deliveryPoint&&<div className="supplier-distance-list" aria-label="Estimated supplier distances">
      {mapped.slice(0,5).map(({lead,distance})=><span key={lead.id}><strong>{lead.displayName}</strong><b>{distanceLabel(distance)}</b></span>)}
    </div>}
    {open&&<><div ref={mapNode} className="supplier-map" role="region" aria-label={`Map of ${mapped.length} supplier leads near ${deliveryLocation}`}/><p className="supplier-map-note">Approximate suburb-centroid distances—not route distance, delivery coverage, or proof of availability. Map tiles load only when opened.</p></>}
  </section>
}
