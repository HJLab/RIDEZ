(()=>{
'use strict';
const C=window.RIDEZ_CONFIG||{};
const configured=C.SUPABASE_URL&&!C.SUPABASE_URL.startsWith('PASTE_')&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.startsWith('PASTE_');
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),publicRideToken=params.get('ride');
if(!configured){$('setupView').classList.remove('hidden');return}
const db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const state={rideId:null,publicToken:null,driverToken:localStorage.getItem('ridez_driver_token')||null,ownerToken:localStorage.getItem('ridez_owner_token')||null,rideStartedAt:null,watchId:null,lastPos:null,lastUpload:0,distanceM:0,moving:false,stoppedSince:null,messagesSeen:new Set(),map:null,marker:null,line:null,points:[],demo:false,demoTimer:null,demoIndex:0,demoBase:null,demoProfile:null,demoRoute:null,demoTravelM:0,historyMap:null,historyLine:null,maxSpeedMs:0,movingMs:0,stoppedMs:0,statsLastT:null,topSpeedPos:null,topSpeedLookupTimer:null,topSpeedLookupSeq:0,topSpeedPolicy:null,viewerPenaltyShown:false};
const fmtSpeed=ms=>`${Math.max(0,Math.round((ms||0)*3.6))} km/t`;
const fmtDuration=sec=>{sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;if(h)return s?`${h} t ${m} min ${s} sek.`:`${h} t ${m} min`;if(m)return s?`${m} min ${s} sek.`:`${m} min`;return `${s} sek.`};
const isEmptyRide=r=>Number(r&&r.distance_m||0)<25;
const fmtDate=d=>new Date(d).toLocaleString('da-DK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function ensureOwnerToken(){if(!state.ownerToken){state.ownerToken=token();localStorage.setItem('ridez_owner_token',state.ownerToken)}return state.ownerToken}
const escapeHtml=s=>(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function token(){const a=new Uint8Array(24);crypto.getRandomValues(a);return[...a].map(x=>x.toString(16).padStart(2,'0')).join('')}
function hav(a,b){const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function roadDistanceM(point,geometry){
  if(!Array.isArray(geometry)||geometry.length<2)return Infinity;
  const lat0=point.lat*Math.PI/180,ky=111320,kx=111320*Math.cos(lat0);
  let best=Infinity;
  for(let i=1;i<geometry.length;i++){
    const a=geometry[i-1],b=geometry[i];
    const ax=(a.lon-point.lng)*kx,ay=(a.lat-point.lat)*ky,bx=(b.lon-point.lng)*kx,by=(b.lat-point.lat)*ky;
    const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
    const t=len2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len2)):0;
    const x=ax+t*dx,y=ay+t*dy;
    best=Math.min(best,Math.hypot(x,y));
  }
  return best;
}
function roadKind(tags={}){const h=tags.highway||'';if(h==='motorway'||h==='motorway_link'||h==='trunk'||h==='trunk_link')return'motorway';if(['residential','living_street','service','pedestrian'].includes(h))return'urban';return'rural'}
const COUNTRY_DEFAULT_LIMITS={
  DK:{urban:50,rural:80,motorway:130},DE:{urban:50,rural:100,motorway:null},SE:{urban:50,rural:70,motorway:110},NO:{urban:50,rural:80,motorway:110},
  NL:{urban:50,rural:80,motorway:100},BE:{urban:50,rural:70,motorway:120},FR:{urban:50,rural:80,motorway:130},AT:{urban:50,rural:100,motorway:130},
  CH:{urban:50,rural:80,motorway:120},IT:{urban:50,rural:90,motorway:130},SI:{urban:50,rural:90,motorway:130},HR:{urban:50,rural:90,motorway:130},
  BA:{urban:50,rural:80,motorway:130},ME:{urban:50,rural:80,motorway:100},CZ:{urban:50,rural:90,motorway:130},PL:{urban:50,rural:90,motorway:140},
  HU:{urban:50,rural:90,motorway:130},SK:{urban:50,rural:90,motorway:130},RS:{urban:50,rural:80,motorway:130}
};
function standardLimit(country,kind){const row=COUNTRY_DEFAULT_LIMITS[country];return row&&Number.isFinite(row[kind])?row[kind]:null}
function parseMaxspeed(raw,country,kind){
  if(!raw)return null;
  const text=String(raw).trim();
  if(/^none$/i.test(text))return Infinity;
  if(/^walk$/i.test(text))return 5;
  const standard=text.match(/^([A-Za-z]{2}):(urban|rural|motorway)$/i);
  if(standard)return standardLimit(standard[1].toUpperCase(),standard[2].toLowerCase());
  const mph=/([0-9]+(?:\.[0-9]+)?)\s*mph/i.exec(text);if(mph)return Number(mph[1])*1.609344;
  const nums=(text.match(/[0-9]+(?:\.[0-9]+)?/g)||[]).map(Number).filter(Number.isFinite);if(nums.length)return Math.min(...nums);
  return null;
}
function speedLimitCache(){try{return JSON.parse(localStorage.getItem('ridez_speed_limit_cache_v19')||'{}')}catch{return{}}}
function cacheSpeedLimit(key,value){const c=speedLimitCache();c[key]={...value,savedAt:Date.now()};const entries=Object.entries(c).sort((a,b)=>(b[1].savedAt||0)-(a[1].savedAt||0)).slice(0,120);try{localStorage.setItem('ridez_speed_limit_cache_v19',JSON.stringify(Object.fromEntries(entries)))}catch{}}
async function lookupSpeedLimit(lat,lng){
  const key=`${lat.toFixed(3)},${lng.toFixed(3)}`,cached=speedLimitCache()[key];
  if(cached&&Date.now()-(cached.savedAt||0)<30*24*3600*1000)return cached;
  const q=`[out:json][timeout:8];way(around:45,${lat},${lng})[highway];out tags geom;is_in(${lat},${lng})->.a;area.a[\"boundary\"=\"administrative\"][\"admin_level\"=\"2\"];out tags;`;
  try{
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q)});
    if(!res.ok)throw new Error('Overpass '+res.status);
    const data=await res.json(),elements=Array.isArray(data.elements)?data.elements:[];
    const countryEl=elements.find(e=>e.tags&&(e.tags['ISO3166-1:alpha2']||e.tags['ISO3166-1']));
    const country=String(countryEl?.tags?.['ISO3166-1:alpha2']||countryEl?.tags?.['ISO3166-1']||'').toUpperCase().slice(0,2)||null;
    const roads=elements.filter(e=>e.type==='way'&&e.tags?.highway&&Array.isArray(e.geometry)).map(e=>({...e,distanceM:roadDistanceM({lat,lng},e.geometry)})).sort((a,b)=>a.distanceM-b.distanceM);
    const road=roads[0]||null;
    if(!road||road.distanceM>45){const unknown={limitKmh:null,country,kind:null,source:'unknown',roadDistanceM:road?.distanceM??null};cacheSpeedLimit(key,unknown);return unknown}
    const kind=roadKind(road.tags),raw=road.tags.maxspeed||road.tags['maxspeed:type']||null;
    let limit=parseMaxspeed(raw,country,kind),source=limit!=null?'osm':'country-default';
    if(limit==null&&country)limit=standardLimit(country,kind);
    if(limit==null)source='unknown';
    const value={limitKmh:Number.isFinite(limit)?Math.round(limit):limit===Infinity?Infinity:null,country,kind,source,roadDistanceM:Math.round(road.distanceM),roadName:road.tags.name||road.tags.ref||null};
    cacheSpeedLimit(key,value);return value;
  }catch(e){console.warn('Fartgrænse kunne ikke slås op',e);return{limitKmh:null,country:null,kind:null,source:'unknown',roadDistanceM:null}}
}
async function commitTopSpeedPolicy(){
  if(!state.driverToken||!state.topSpeedPos||state.maxSpeedMs<=0)return;
  const seq=++state.topSpeedLookupSeq,pos={...state.topSpeedPos},speed=state.maxSpeedMs;
  // v20: Dedicated demo test uses a deterministic simulated 50 km/t zone.
  // Real rides and the four normal demo routes still use the real road lookup.
  const info=(state.demo&&state.demoProfile==='speedtest')
    ? {limitKmh:50,country:'DK',kind:'urban',source:'demo-test',roadDistanceM:0,roadName:'Simuleret 50-zone'}
    : await lookupSpeedLimit(pos.lat,pos.lng);
  if(seq!==state.topSpeedLookupSeq)return;
  const limit=info.limitKmh===Infinity?9999:info.limitKmh;
  const over=Number.isFinite(limit)?speed*3.6>limit+0.5:null;
  state.topSpeedPolicy={...info,limitKmh:limit===9999?Infinity:limit,overLimit:over,speedMs:speed};
  try{await rpc('ridez_update_top_speed_v19',{p_driver_token:state.driverToken,p_max_speed_ms:speed,p_limit_kmh:limit===9999?null:limit,p_unlimited:limit===9999,p_country_code:info.country,p_road_type:info.kind})}catch(e){console.error('Topfartspolitik kunne ikke gemmes',e)}
}
function scheduleTopSpeedPolicy(cur){
  state.topSpeedPos={lat:cur.lat,lng:cur.lng};
  if(state.topSpeedLookupTimer)clearTimeout(state.topSpeedLookupTimer);
  state.topSpeedLookupTimer=setTimeout(()=>{state.topSpeedLookupTimer=null;commitTopSpeedPolicy()},1400);
}
async function flushTopSpeedPolicy(){if(state.topSpeedLookupTimer){clearTimeout(state.topSpeedLookupTimer);state.topSpeedLookupTimer=null}if(state.maxSpeedMs>0&&state.topSpeedPos)await commitTopSpeedPolicy()}
function showViewerTopSpeed(ride){
  const value=$('viewerTopSpeed'),card=$('viewerTopSpeedCard');if(!value||!card)return;
  const limit=Number(ride.top_speed_limit_kmh);
  const currentKmh=Math.max(0,Number(ride.speed_ms||0)*3.6);
  const currentlyOver=Boolean(ride.active&&Number.isFinite(limit)&&currentKmh>limit+0.5);

  // v23: Følgeren kan altid se den registrerede højeste hastighed.
  // Kun mens den AKTUELLE hastighed ligger over den kendte fartgrænse,
  // pulserer tallet roligt i to røde nuancer. Når farten igen er lovlig,
  // står topfarten normalt og roligt igen.
  value.textContent=fmtSpeed(ride.public_top_speed_ms||0);
  card.classList.toggle('overspeed-live',currentlyOver);
}

function initMap(id){const m=L.map(id,{zoomControl:true}).setView([55.6761,12.5683],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);return m}
function updateMap(lat,lng,follow=true){if(!state.map)return;const p=[lat,lng];if(!state.marker)state.marker=L.circleMarker(p,{radius:9,weight:4,color:'#111',fillColor:'#e11d24',fillOpacity:1}).addTo(state.map);else state.marker.setLatLng(p);state.points.push(p);if(!state.line)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map);else state.line.setLatLngs(state.points);if(follow)state.map.setView(p,16)}
function setMotion(moving){state.moving=moving;const el=$('motionLight');el.textContent=moving?'KØRER':'STILLE';el.className=`motion ${moving?'moving':'stopped'}`;$('rideStatus').textContent=moving?(state.demo?'Demo kører':'På farten'):(state.demo?'Demo holder stille':'Holder stille');$('statusDetail').textContent=moving?'Beskeder holdes tilbage, mens du kører.':'Det er sikkert at vise ventende beskeder.'}
function updateRideStats(now,speed){state.maxSpeedMs=Math.max(state.maxSpeedMs,Math.max(0,speed||0));if(state.statsLastT!==null){const dt=Math.max(0,Math.min(now-state.statsLastT,15000));if(speed>C.STOPPED_THRESHOLD_MS)state.movingMs+=dt;else state.stoppedMs+=dt}state.statsLastT=now;const top=$('topSpeedValue'),moving=$('movingTimeValue'),stopped=$('stoppedTimeValue');if(top)top.textContent=fmtSpeed(state.maxSpeedMs);if(moving)moving.textContent=fmtDuration(state.movingMs/1000);if(stopped)stopped.textContent=fmtDuration(state.stoppedMs/1000)}
async function rpc(name,args){const{data,error}=await db.rpc(name,args);if(error)throw error;return data}
function resetDriverTripDisplay({clearMarker=true}={}){state.lastPos=null;state.lastUpload=0;state.distanceM=0;state.moving=false;state.stoppedSince=null;state.maxSpeedMs=0;state.movingMs=0;state.stoppedMs=0;state.statsLastT=null;state.topSpeedPos=null;state.topSpeedPolicy=null;state.topSpeedLookupSeq++;if(state.topSpeedLookupTimer){clearTimeout(state.topSpeedLookupTimer);state.topSpeedLookupTimer=null}state.points=[];state.messagesSeen=new Set();if(state.line&&state.map){state.map.removeLayer(state.line);state.line=null}if(clearMarker&&state.marker&&state.map){state.map.removeLayer(state.marker);state.marker=null}$('speedValue').textContent='0 km/t';$('distanceValue').textContent='0,0 km';if($('topSpeedValue'))$('topSpeedValue').textContent='0 km/t';if($('movingTimeValue'))$('movingTimeValue').textContent='0 sek.';if($('stoppedTimeValue'))$('stoppedTimeValue').textContent='0 sek.';$('messageCount').textContent='0';const el=$('messagesList');if(el){el.className='empty';el.textContent='Ingen beskeder endnu.'}}
function setRideButtons(active){$('startBtn').classList.toggle('hidden',active);$('stopBtn').classList.toggle('hidden',!active);$('shareBtn').classList.toggle('hidden',!active);$('demoBtn').disabled=active&&!state.demo;$('demoType').disabled=active}
async function createRide(title){state.driverToken=token();state.publicToken=token();state.rideStartedAt=Date.now();localStorage.setItem('ridez_driver_token',state.driverToken);ensureOwnerToken();try{state.rideId=await rpc('ridez_create_ride_v16',{p_owner_token:state.ownerToken,p_driver_token:state.driverToken,p_public_token:state.publicToken,p_title:title})}catch(e){console.error(e);throw new Error('Historik v17 er ikke aktiveret i Supabase endnu. Kør først v16-migrationen og derefter supabase-historik-v17.sql én gang.')}setRideButtons(true);pollMessages()}
async function startRide(){if(!navigator.geolocation){alert('GPS understøttes ikke på denne enhed.');return}stopDemoTimer();state.demo=false;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');resetDriverTripDisplay({clearMarker:true});await createRide('RIDEZ live-tur');$('rideStatus').textContent='Starter GPS…';state.watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
function onGeoError(e){$('statusDetail').textContent=`GPS-fejl: ${e.message}`}
async function processPosition(cur,speed,accuracy=5){const now=cur.t||Date.now();if(state.lastPos){const dist=hav(state.lastPos,cur);if(dist<1000&&accuracy<80)state.distanceM+=dist}speed=Math.max(0,speed||0);const newTop=speed>state.maxSpeedMs+0.05;updateRideStats(now,speed);if(newTop)scheduleTopSpeedPolicy(cur);if(speed>=C.MOVING_THRESHOLD_MS){state.stoppedSince=null;setMotion(true)}else if(speed<=C.STOPPED_THRESHOLD_MS){if(!state.stoppedSince)state.stoppedSince=now;if(now-state.stoppedSince>=C.STATIONARY_SECONDS*1000)setMotion(false)}state.lastPos=cur;$('speedValue').textContent=fmtSpeed(speed);$('distanceValue').textContent=`${(state.distanceM/1000).toFixed(1).replace('.',',')} km`;updateMap(cur.lat,cur.lng,true);if(now-state.lastUpload>=C.LOCATION_UPLOAD_MS){state.lastUpload=now;try{await rpc('ridez_update_location',{p_driver_token:state.driverToken,p_lat:cur.lat,p_lng:cur.lng,p_speed_ms:speed,p_moving:state.moving,p_accuracy_m:accuracy})}catch(e){console.error(e)}}}
async function onPosition(pos){const now=Date.now(),cur={lat:pos.coords.latitude,lng:pos.coords.longitude,t:now,accuracy:pos.coords.accuracy};let speed=Number.isFinite(pos.coords.speed)?Math.max(0,pos.coords.speed):null;if(state.lastPos&&speed===null){const dt=(now-state.lastPos.t)/1000;if(dt>0)speed=hav(state.lastPos,cur)/dt}await processPosition(cur,speed||0,cur.accuracy)}
function stopDemoTimer(){if(state.demoTimer){clearTimeout(state.demoTimer);state.demoTimer=null}}
function getDemoBase(){
  // v9: Brug telefonens faktiske GPS-position som demo-start. Rutetjenesten får bagefter
  // kun lov til at snapper til en kørbar vej meget tæt på positionen, så den ikke kan flytte
  // starten flere hundrede meter (fx op til kirken).
  if(!navigator.geolocation) return Promise.reject(new Error('GPS understøttes ikke på denne enhed.'));
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(pos=>{
    const accuracy=Number(pos.coords.accuracy)||999;
    if(accuracy>100){reject(new Error('GPS-positionen er for upræcis til Demo Mode. Gå tættere på et vindue eller udenfor og prøv igen.'));return;}
    resolve({lat:pos.coords.latitude,lng:pos.coords.longitude,name:'din aktuelle position',accuracy});
  },()=>reject(new Error('RIDEZ kunne ikke hente din aktuelle GPS-position til demoen.')),{enableHighAccuracy:true,maximumAge:5000,timeout:12000}));
}
async function snapDemoBaseToRoad(base){
  // Selve kontrollen af vej-snap sker i buildRoadDemoRoute med en hård afstandsgrænse.
  return base;
}
function demoSpeed(type,i,total){if(type==='speedtest'){if(i<4||i>total-5)return 0;if(i<10)return 5+(i-4)*2.4;if(i<34)return 20;if(i<39)return 8;return 14}if(type==='short'){if(i<4||i>total-5)return 0;if(i<10)return 4+(i-4)*1.8;if(i<22)return 14;if(i<27)return 0;if(i<38)return 20;if(i<43)return 4;return 12}if(type==='city'){const cycle=i%24;if(cycle<5)return 0;if(cycle<10)return 4+cycle;if(cycle<18)return 10;if(cycle<22)return 5;return 0}if(type==='twisty'){if(i<4||i>total-5)return 0;const phase=i%20;if(phase<5)return 10+phase*1.4;if(phase<12)return 17+3*Math.sin(i/2.5);if(phase<16)return 12;return 15}const phase=i%36;if(i<4||i>total-5)return 0;if(phase<8)return 8+phase*1.8;if(phase<28)return 22+6*Math.sin(i/4);return 10}
function demoWaypoints(base,type){
  // Start og slut er altid telefonens aktuelle position, snappet til nærmeste kørbare vej.
  // Når testen startes hjemmefra, starter demoen derfor på Toftevej i stedet for et fast punkt i Herslev.
  const start=[base.lng,base.lat];
  const brewery=[11.985131,55.669231];          // Kattingevej
  const bognaes=[11.9986,55.6807];              // Bognæsvej
  const kattinge=[11.99905743,55.65945647];     // Kattinge
  const gevninge=[11.9577,55.6649];             // Gevninge
  const boserup=[12.0203,55.6504];               // Boserup-området
  const svogerslev=[12.0149,55.6342];            // Svogerslev
  if(type==='short'||type==='speedtest') return [start,brewery,bognaes,start];
  if(type==='city') return [start,brewery,kattinge,start];
  if(type==='twisty') return [start,gevninge,kattinge,boserup,svogerslev,kattinge,brewery,start];
  return [start,bognaes,kattinge,brewery,start];
}
async function buildRoadDemoRoute(base,type){
  const waypoints=demoWaypoints(base,type);
  const coords=waypoints.map(p=>p.join(',')).join(';');
  // v9: Første og sidste punkt må højst flyttes 120 m til en kørbar vej.
  // Mellempunkter får lidt mere spillerum. Dermed kan OSRM ikke flytte Toftevej-starten til kirken.
  const radiuses=waypoints.map((_,i)=>(i===0||i===waypoints.length-1)?120:250).join(';');
  const url=`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&radiuses=${radiuses}`;
  const res=await fetch(url,{cache:'no-store'});
  if(!res.ok)throw new Error('Rutetjenesten svarede ikke.');
  const json=await res.json();
  if(json.code&&json.code!=='Ok')throw new Error('Kunne ikke finde en kørbar vej tæt nok på demoens startpunkt.');
  const raw=json.routes&&json.routes[0]&&json.routes[0].geometry&&json.routes[0].geometry.coordinates;
  if(!raw||raw.length<2)throw new Error('Kunne ikke finde en vej-rute til demoen.');
  const pts=raw.map(([lng,lat])=>({lat,lng}));
  const firstDistance=hav(base,pts[0]);
  if(firstDistance>140)throw new Error('Demoens vej-rute ligger for langt fra din startposition. RIDEZ nægter at flytte starten til en anden del af Herslev.');
  const cum=[0];
  for(let i=1;i<pts.length;i++)cum[i]=cum[i-1]+hav(pts[i-1],pts[i]);
  return{pts,cum,total:cum[cum.length-1]};
}
function demoPointAt(route,meters){
  if(!route||!route.pts.length)return null;
  const m=Math.max(0,Math.min(meters,route.total));
  let lo=0,hi=route.cum.length-1;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(route.cum[mid]<m)lo=mid+1;else hi=mid}
  const i=Math.max(1,lo),a=route.pts[i-1],b=route.pts[i],seg=route.cum[i]-route.cum[i-1]||1,f=(m-route.cum[i-1])/seg;
  return{lat:a.lat+(b.lat-a.lat)*f,lng:a.lng+(b.lng-a.lng)*f,t:Date.now(),accuracy:4};
}
async function startDemo(){if(state.rideId){alert('Afslut den aktive tur først.');return}resetDriverTripDisplay({clearMarker:true});state.demo=true;state.demoIndex=0;state.demoTravelM=0;state.demoProfile=$('demoType').value;$('demoBadge').textContent='DEMO v24';$('demoBadge').classList.remove('hidden');$('demoBtn').textContent='Stop demo';$('demoBtn').classList.add('active');$('rideStatus').textContent='Klargør demo…';$('statusDetail').textContent=state.demoProfile==='speedtest'?'Fartgrænsetest: simuleret 50-zone, så den rolige røde topfartspuls kan afprøves hjemmefra.':'Demo v24 henter din GPS-position og låser rutestarten til en vej højst 120 m væk.';try{const gpsBase=await getDemoBase();state.demoBase=await snapDemoBaseToRoad(gpsBase);$('rideStatus').textContent='Finder vej-rute…';$('statusDetail').textContent=`Starter på ${state.demoBase.name||'Toftevej, Herslev'} og følger vejnettet.`;state.demoRoute=await buildRoadDemoRoute(state.demoBase,state.demoProfile)}catch(e){state.demo=false;state.demoBase=null;state.demoRoute=null;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent=e.message||'Kunne ikke finde en vej-rute til demoen.';throw e}const demoName=state.demoProfile==='short'?'kort test':state.demoProfile==='city'?'bykørsel':state.demoProfile==='twisty'?'snoet tur':state.demoProfile==='speedtest'?'fartgrænsetest':'landevej';await createRide(`RIDEZ demo · ${demoName}`);$('rideStatus').textContent='Demo starter…';$('statusDetail').textContent=state.demoProfile==='speedtest'?'Simulerer 50 km/t fartgrænse og kører op til ca. 72 km/t. Følgerlinkets højeste hastighed skal pulsere roligt rødt, mens den aktuelle fart er over 50 km/t.':`Starter på ${state.demoBase.name||'Toftevej, Herslev'} og simulerer hastighed og stop.`;const total=state.demoProfile==='short'?60:state.demoProfile==='city'?90:state.demoProfile==='twisty'?110:state.demoProfile==='speedtest'?50:90;async function tick(){if(!state.demo||!state.rideId)return;const i=state.demoIndex++,speed=demoSpeed(state.demoProfile,i,total);state.demoTravelM+=speed;const cur=demoPointAt(state.demoRoute,state.demoTravelM);if(!cur){await stopRide();return}await processPosition(cur,speed,4);if(i>=total||state.demoTravelM>=state.demoRoute.total-5){await stopRide();return}state.demoTimer=setTimeout(tick,1000)}await tick()}
async function stopRide(){if(state.watchId!==null)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;stopDemoTimer();try{await flushTopSpeedPolicy()}catch(e){console.warn(e)}const finishedDistance=state.distanceM,finishedDuration=state.rideStartedAt?Math.max(0,Math.round((Date.now()-state.rideStartedAt)/1000)):0,finishedMoving=Math.max(0,Math.round(state.movingMs/1000)),finishedStopped=Math.max(0,Math.round(state.stoppedMs/1000)),finishedMaxSpeed=Math.max(0,state.maxSpeedMs);try{if(state.driverToken)await rpc('ridez_end_ride_v19',{p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped})}catch(e){console.error(e);try{if(state.driverToken)await rpc('ridez_end_ride_v18',{p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped})}catch(fallbackError){console.error(fallbackError)}}resetDriverTripDisplay({clearMarker:true});state.rideId=null;state.publicToken=null;state.driverToken=null;state.rideStartedAt=null;localStorage.removeItem('ridez_driver_token');state.demo=false;state.demoIndex=0;state.demoBase=null;state.demoProfile=null;state.demoRoute=null;state.demoTravelM=0;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');setRideButtons(false);$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent='Start en tur for at dele din position.';setMotion(false);$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent='Start en tur for at dele din position.';await loadHistory()}
async function shareRide(){const url=`${location.origin}${location.pathname}?ride=${encodeURIComponent(state.publicToken)}`;if(navigator.share){try{await navigator.share({title:'Følg min RIDEZ-tur',text:'Følg min motorcykeltur live på RIDEZ',url});return}catch(e){}}await navigator.clipboard.writeText(url);alert('Følgelink kopieret.')}
async function pollMessages(){if(!state.driverToken||!state.rideId)return;try{const rows=await rpc('ridez_driver_messages',{p_driver_token:state.driverToken});$('messageCount').textContent=rows.length;const unseen=rows.filter(r=>!state.messagesSeen.has(r.id));if(!state.moving&&unseen.length){unseen.forEach(r=>state.messagesSeen.add(r.id));renderMessages(rows);if(document.visibilityState==='visible'&&navigator.vibrate)navigator.vibrate([120,80,120])}else if(!state.moving)renderMessages(rows)}catch(e){console.error(e)}if(state.driverToken&&state.rideId)setTimeout(pollMessages,C.MESSAGE_POLL_MS)}
function renderMessages(rows){const el=$('messagesList');if(!rows.length){el.className='empty';el.textContent='Ingen beskeder endnu.';return}el.className='';el.innerHTML=rows.map(r=>`<div class="message"><div class="meta"><strong>${escapeHtml(r.sender_name)}</strong> · ${new Date(r.created_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}</div><div>${escapeHtml(r.body)}</div></div>`).join('')}
async function loadHistory(){
  const list=$('historyList');
  if(!list)return;
  ensureOwnerToken();
  list.className='history-list';
  list.innerHTML='<div class="empty">Henter ture…</div>';
  try{
    const rows=await rpc('ridez_history_v18',{p_owner_token:state.ownerToken});
    const visibleRows=rows.filter(r=>!isEmptyRide(r));
    if(!visibleRows.length){list.className='history-list empty';list.textContent='Ingen afsluttede ture endnu.';return}
    list.innerHTML=visibleRows.map(r=>{
      const avgMoving=Number(r.avg_moving_speed_ms||0)*3.6,top=Number(r.max_speed_ms||0)*3.6;
      return `<button class="history-card" data-ride-id="${r.ride_id}"><div><strong>${fmtDate(r.created_at)}</strong><span>${escapeHtml(r.title||'RIDEZ tur')}</span></div><div class="history-summary"><b>${(Number(r.distance_m||0)/1000).toFixed(1).replace('.',',')} km</b><span>${fmtDuration(r.duration_s)}</span><span>Top ${top.toFixed(0)} km/t</span><span>Gns. ${avgMoving.toFixed(0)} km/t</span><span>📷 ${Number(r.photo_count||0)}</span></div></button>`
    }).join('');
    list.querySelectorAll('[data-ride-id]').forEach(btn=>btn.addEventListener('click',()=>openHistoryRide(btn.dataset.rideId)));
  }catch(e){console.error(e);list.className='history-list empty';list.textContent='Historik kunne ikke hentes. Kontroller at v16, v17 og v18 SQL-opdateringerne er kørt i Supabase.'}
}
async function openHistoryRide(rideId){
  const detail=$('historyDetail');
  detail.classList.remove('hidden');
  detail.dataset.rideId=rideId;
  $('historyDetailMeta').textContent='Henter tur…';
  $('historyPhotos').innerHTML='<div class="empty">Henter billeder…</div>';
  try{
    const [rows,track,photos]=await Promise.all([
      rpc('ridez_history_v18',{p_owner_token:state.ownerToken}),
      rpc('ridez_history_track',{p_owner_token:state.ownerToken,p_ride_id:rideId}),
      rpc('ridez_history_photos',{p_owner_token:state.ownerToken,p_ride_id:rideId})
    ]);
    const ride=rows.find(r=>r.ride_id===rideId);
    if(!ride)throw new Error('Turen findes ikke');
    const avgMoving=Number(ride.avg_moving_speed_ms||0)*3.6,top=Number(ride.max_speed_ms||0)*3.6;
    $('historyDetailTitle').textContent=fmtDate(ride.created_at);
    $('historyDetailMeta').textContent=`${(Number(ride.distance_m||0)/1000).toFixed(1).replace('.',',')} km · samlet ${fmtDuration(ride.duration_s)}`;
    if($('historyStats'))$('historyStats').innerHTML=`<div><span>Topfart</span><strong>${top.toFixed(0)} km/t</strong></div><div><span>Gns. under kørsel</span><strong>${avgMoving.toFixed(0)} km/t</strong></div><div><span>Kørselstid</span><strong>${fmtDuration(ride.moving_s)}</strong></div><div><span>Stilstand</span><strong>${fmtDuration(ride.stopped_s)}</strong></div>`;
    if(!state.historyMap){state.historyMap=initMap('historyMap')}else{if(state.historyLine){state.historyMap.removeLayer(state.historyLine);state.historyLine=null}}
    const pts=track.map(p=>[p.lat,p.lng]);
    if(pts.length){state.historyLine=L.polyline(pts,{weight:5,color:'#e11d24'}).addTo(state.historyMap);state.historyMap.fitBounds(state.historyLine.getBounds(),{padding:[20,20]})}
    setTimeout(()=>state.historyMap&&state.historyMap.invalidateSize(),50);
    if(!photos.length){$('historyPhotos').innerHTML='<div class="empty">Ingen billeder på denne tur endnu. Billedpositioner er allerede forberedt til en senere RIDEZ-version.</div>'}
    else{$('historyPhotos').innerHTML=photos.map(p=>`<div class="photo-placeholder"><strong>📷 Billede</strong><span>${p.captured_at?fmtDate(p.captured_at):''}</span></div>`).join('')}
    detail.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){console.error(e);$('historyDetailMeta').textContent='Kunne ikke åbne turen.'}
}
async function deleteHistoryRide(){
  const rideId=$('historyDetail').dataset.rideId;
  if(!rideId)return;
  if(!confirm('Slet denne tur permanent fra Historik? Dette kan ikke fortrydes.'))return;
  const btn=$('historyDeleteBtn');
  btn.disabled=true;btn.textContent='Sletter…';
  try{
    const deleted=await rpc('ridez_delete_history_ride_v17',{p_owner_token:state.ownerToken,p_ride_id:rideId});
    if(!deleted)throw new Error('Turen kunne ikke slettes');
    closeHistoryRide();
    await loadHistory();
  }catch(e){console.error(e);alert('Turen kunne ikke slettes. Kontroller at v17 SQL-opdateringen er kørt i Supabase.');}
  finally{btn.disabled=false;btn.textContent='Slet tur'}
}
function closeHistoryRide(){$('historyDetail').classList.add('hidden');$('historyDetail').dataset.rideId=''}

async function initViewer(){$('viewerView').classList.remove('hidden');state.map=initMap('viewerMap');let lastTrackCount=0;async function refresh(){try{const rideResult=await rpc('ridez_public_ride_v23',{p_public_token:publicRideToken}).catch(()=>rpc('ridez_public_ride_v21',{p_public_token:publicRideToken})).catch(()=>rpc('ridez_public_ride_v19',{p_public_token:publicRideToken}));const ride=Array.isArray(rideResult)?rideResult[0]:rideResult;if(!ride){$('viewerStatus').textContent='Turen findes ikke eller er udløbet.';return}$('viewerTitle').textContent=ride.title||'RIDEZ live-tur';$('viewerSpeed').textContent=fmtSpeed(ride.speed_ms);showViewerTopSpeed(ride);$('viewerUpdated').textContent=ride.updated_at?new Date(ride.updated_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'}):'–';$('viewerStatus').textContent=ride.active?(ride.moving?'Føreren er på farten':'Motorcyklen holder stille'):'Turen er afsluttet';const mo=$('viewerMotion');mo.textContent=ride.moving?'KØRER':'STILLE';mo.className=`motion ${ride.moving?'moving':'stopped'}`;if(ride.lat!=null)updateMap(ride.lat,ride.lng,true);const pts=await rpc('ridez_public_track',{p_public_token:publicRideToken});if(pts.length!==lastTrackCount){lastTrackCount=pts.length;state.points=pts.map(x=>[x.lat,x.lng]);if(state.line)state.line.setLatLngs(state.points);else if(state.points.length)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map)}}catch(e){console.error(e);$('viewerStatus').textContent='Kunne ikke hente live-data.'}setTimeout(refresh,3000)}refresh();$('messageForm').addEventListener('submit',async e=>{e.preventDefault();const name=$('senderName').value.trim(),body=$('messageBody').value.trim();if(!name||!body)return;$('sendFeedback').textContent='Sender…';try{const result=await rpc('ridez_send_message',{p_public_token:publicRideToken,p_sender_name:name,p_body:body});$('messageBody').value='';$('sendFeedback').textContent=result==='moving'?'🏍️ Beskeden er modtaget. Føreren er på farten, så den bliver først vist, når motorcyklen holder stille.':'✓ Beskeden er sendt og kan vises til føreren nu.'}catch(err){$('sendFeedback').textContent='Beskeden kunne ikke sendes. Prøv igen.'}})}
async function initDriver(){$('driverView').classList.remove('hidden');ensureOwnerToken();state.map=initMap('driverMap');$('startBtn').onclick=()=>startRide().catch(e=>alert('Kunne ikke starte turen: '+e.message));$('stopBtn').onclick=()=>stopRide();$('shareBtn').onclick=shareRide;$('demoBtn').onclick=()=>{if(state.demo)stopRide();else startDemo().catch(e=>{console.error(e);alert('Kunne ikke starte demo: '+e.message)})};$('historyCloseBtn').onclick=closeHistoryRide;$('historyDeleteBtn').onclick=deleteHistoryRide;loadHistory()}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
publicRideToken?initViewer():initDriver();
})();
