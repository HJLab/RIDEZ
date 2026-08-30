(()=>{
'use strict';
const C=window.RIDEZ_CONFIG||{};
const configured=C.SUPABASE_URL&&!C.SUPABASE_URL.startsWith('PASTE_')&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.startsWith('PASTE_');
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),publicRideToken=params.get('ride');
if(!configured){$('setupView').classList.remove('hidden');return}
const db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const state={rideId:null,publicToken:null,driverToken:localStorage.getItem('ridez_driver_token')||null,ownerToken:localStorage.getItem('ridez_owner_token')||null,rideStartedAt:null,watchId:null,lastPos:null,lastUpload:0,distanceM:0,moving:false,stoppedSince:null,messagesSeen:new Set(),map:null,marker:null,line:null,points:[],demo:false,demoTimer:null,demoIndex:0,demoBase:null,demoProfile:null,demoRoute:null,demoTravelM:0,historyMap:null,historyLine:null,maxSpeedMs:0,movingMs:0,stoppedMs:0,statsLastT:null,topSpeedUpdateTimer:null,historySelectMode:false,selectedRideIds:new Set(),demoPrevSpeedMs:0,speedDemoAttempt:null,speedDemoAttempts:[]};
const fmtSpeed=ms=>`${Math.max(0,Math.round((ms||0)*3.6))} km/t`;
const fmtDuration=sec=>{sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;if(h)return s?`${h} t ${m} min ${s} sek.`:`${h} t ${m} min`;if(m)return s?`${m} min ${s} sek.`:`${m} min`;return `${s} sek.`};
const isEmptyRide=r=>Number(r&&r.distance_m||0)<25;
const fmtDate=d=>new Date(d).toLocaleString('da-DK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function ensureOwnerToken(){if(!state.ownerToken){state.ownerToken=token();localStorage.setItem('ridez_owner_token',state.ownerToken)}return state.ownerToken}
const escapeHtml=s=>(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function token(){const a=new Uint8Array(24);crypto.getRandomValues(a);return[...a].map(x=>x.toString(16).padStart(2,'0')).join('')}
function hav(a,b){const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function showViewerTopSpeed(ride){
  const value=$('viewerTopSpeed'),card=$('viewerTopSpeedCard');if(!value||!card)return;
  value.textContent=fmtSpeed(ride.public_top_speed_ms||ride.max_speed_ms||0);
  card.classList.remove('overspeed-live');
}
async function publishPublicTopSpeed(){
  if(!state.driverToken||state.maxSpeedMs<=0)return;
  try{
    await rpc('ridez_update_top_speed_v19',{
      p_driver_token:state.driverToken,
      p_max_speed_ms:state.maxSpeedMs,
      p_limit_kmh:null,
      p_unlimited:false,
      p_country_code:null,
      p_road_type:null
    });
  }catch(e){console.warn('Topfart kunne ikke opdateres live',e)}
}
function schedulePublicTopSpeed(){
  if(state.topSpeedUpdateTimer)clearTimeout(state.topSpeedUpdateTimer);
  state.topSpeedUpdateTimer=setTimeout(()=>{state.topSpeedUpdateTimer=null;publishPublicTopSpeed()},700);
}
async function flushPublicTopSpeed(){
  if(state.topSpeedUpdateTimer){clearTimeout(state.topSpeedUpdateTimer);state.topSpeedUpdateTimer=null}
  if(state.maxSpeedMs>0)await publishPublicTopSpeed();
}

function initMap(id){const m=L.map(id,{zoomControl:true}).setView([55.6761,12.5683],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);return m}
function updateMap(lat,lng,follow=true){if(!state.map)return;const p=[lat,lng];if(!state.marker)state.marker=L.circleMarker(p,{radius:9,weight:4,color:'#111',fillColor:'#e11d24',fillOpacity:1}).addTo(state.map);else state.marker.setLatLng(p);state.points.push(p);if(!state.line)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map);else state.line.setLatLngs(state.points);if(follow)state.map.setView(p,16)}
function setMotion(moving){state.moving=moving;const el=$('motionLight');el.textContent=moving?'KØRER':'STILLE';el.className=`motion ${moving?'moving':'stopped'}`;$('rideStatus').textContent=moving?(state.demo?'Demo kører':'På farten'):(state.demo?'Demo holder stille':'Holder stille');$('statusDetail').textContent=moving?'Beskeder holdes tilbage, mens du kører.':'Det er sikkert at vise ventende beskeder.'}
function updateRideStats(now,speed){state.maxSpeedMs=Math.max(state.maxSpeedMs,Math.max(0,speed||0));if(state.statsLastT!==null){const dt=Math.max(0,Math.min(now-state.statsLastT,15000));if(speed>C.STOPPED_THRESHOLD_MS)state.movingMs+=dt;else state.stoppedMs+=dt}state.statsLastT=now;const top=$('topSpeedValue'),moving=$('movingTimeValue'),stopped=$('stoppedTimeValue');if(top)top.textContent=fmtSpeed(state.maxSpeedMs);if(moving)moving.textContent=fmtDuration(state.movingMs/1000);if(stopped)stopped.textContent=fmtDuration(state.stoppedMs/1000)}
async function rpc(name,args){const{data,error}=await db.rpc(name,args);if(error)throw error;return data}
function resetDriverTripDisplay({clearMarker=true}={}){state.lastPos=null;state.lastUpload=0;state.distanceM=0;state.moving=false;state.stoppedSince=null;state.maxSpeedMs=0;state.movingMs=0;state.stoppedMs=0;state.statsLastT=null;if(state.topSpeedUpdateTimer){clearTimeout(state.topSpeedUpdateTimer);state.topSpeedUpdateTimer=null}state.points=[];state.messagesSeen=new Set();if(state.line&&state.map){state.map.removeLayer(state.line);state.line=null}if(clearMarker&&state.marker&&state.map){state.map.removeLayer(state.marker);state.marker=null}$('speedValue').textContent='0 km/t';$('distanceValue').textContent='0,0 km';if($('topSpeedValue'))$('topSpeedValue').textContent='0 km/t';if($('movingTimeValue'))$('movingTimeValue').textContent='0 sek.';if($('stoppedTimeValue'))$('stoppedTimeValue').textContent='0 sek.';$('messageCount').textContent='0';const el=$('messagesList');if(el){el.className='empty';el.textContent='Ingen beskeder endnu.'}}
function setRideButtons(active){$('startBtn').classList.toggle('hidden',active);$('stopBtn').classList.toggle('hidden',!active);$('shareBtn').classList.toggle('hidden',!active);$('demoBtn').disabled=active&&!state.demo;$('demoType').disabled=active}
async function createRide(title){state.driverToken=token();state.publicToken=token();state.rideStartedAt=Date.now();localStorage.setItem('ridez_driver_token',state.driverToken);ensureOwnerToken();try{state.rideId=await rpc('ridez_create_ride_v16',{p_owner_token:state.ownerToken,p_driver_token:state.driverToken,p_public_token:state.publicToken,p_title:title})}catch(e){console.error(e);throw new Error('Historik v17 er ikke aktiveret i Supabase endnu. Kør først v16-migrationen og derefter supabase-historik-v17.sql én gang.')}setRideButtons(true);pollMessages()}
async function startRide(){if(!navigator.geolocation){alert('GPS understøttes ikke på denne enhed.');return}stopDemoTimer();state.demo=false;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');resetDriverTripDisplay({clearMarker:true});resetSpeedDemoResults(false);await createRide('RIDEZ live-tur');$('rideStatus').textContent='Starter GPS…';state.watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
function onGeoError(e){$('statusDetail').textContent=`GPS-fejl: ${e.message}`}
async function processPosition(cur,speed,accuracy=5){const now=cur.t||Date.now();if(state.lastPos){const dist=hav(state.lastPos,cur);if(dist<1000&&accuracy<80)state.distanceM+=dist}speed=Math.max(0,speed||0);const newTop=speed>state.maxSpeedMs+0.05;updateRideStats(now,speed);if(newTop)schedulePublicTopSpeed();if(speed>=C.MOVING_THRESHOLD_MS){state.stoppedSince=null;setMotion(true)}else if(speed<=C.STOPPED_THRESHOLD_MS){if(!state.stoppedSince)state.stoppedSince=now;if(now-state.stoppedSince>=C.STATIONARY_SECONDS*1000)setMotion(false)}state.lastPos=cur;$('speedValue').textContent=fmtSpeed(speed);$('distanceValue').textContent=`${(state.distanceM/1000).toFixed(1).replace('.',',')} km`;updateMap(cur.lat,cur.lng,true);if(now-state.lastUpload>=C.LOCATION_UPLOAD_MS){state.lastUpload=now;try{await rpc('ridez_update_location',{p_driver_token:state.driverToken,p_lat:cur.lat,p_lng:cur.lng,p_speed_ms:speed,p_moving:state.moving,p_accuracy_m:accuracy})}catch(e){console.error(e)}}}
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
function resetSpeedDemoResults(show=false){
  state.demoPrevSpeedMs=0;
  state.speedDemoAttempt=null;
  state.speedDemoAttempts=[];
  const panel=$('speedDemoResults');
  if(panel)panel.classList.toggle('hidden',!show);
  const best80=$('speedBest80'),best100=$('speedBest100'),top=$('speedDemoTop'),live=$('speedDemoLive'),list=$('speedAttemptList');
  if(best80)best80.textContent='–';
  if(best100)best100.textContent='–';
  if(top)top.textContent='0 km/t';
  if(live)live.textContent='Klar til første acceleration';
  if(list)list.innerHTML='<div class="empty">Resultater vises efter hvert forsøg.</div>';
}
function formatAccel(sec){return Number.isFinite(sec)?`${sec.toFixed(1).replace('.',',')} sek.`:'–'}
function renderSpeedDemoResults(currentSpeedMs=0){
  const attempts=state.speedDemoAttempts;
  const active=state.speedDemoAttempt;
  const best80=attempts.filter(a=>Number.isFinite(a.t80)).reduce((m,a)=>Math.min(m,a.t80),Infinity);
  const best100=attempts.filter(a=>Number.isFinite(a.t100)).reduce((m,a)=>Math.min(m,a.t100),Infinity);
  const el80=$('speedBest80'),el100=$('speedBest100'),top=$('speedDemoTop'),live=$('speedDemoLive'),list=$('speedAttemptList');
  if(el80)el80.textContent=Number.isFinite(best80)?formatAccel(best80):'–';
  if(el100)el100.textContent=Number.isFinite(best100)?formatAccel(best100):'–';
  if(top)top.textContent=fmtSpeed(Math.max(state.maxSpeedMs,currentSpeedMs||0));
  if(live){
    if(active)live.textContent=`Forsøg ${attempts.length+1}: accelererer…`;
    else if(attempts.length>=3)live.textContent='3 accelerationer gennemført';
    else live.textContent=`Klar til forsøg ${attempts.length+1} af 3`;
  }
  if(list){
    if(!attempts.length){list.innerHTML='<div class="empty">Resultater vises efter hvert forsøg.</div>';return;}
    list.innerHTML=attempts.map((a,idx)=>`<div class="speed-attempt"><strong>Forsøg ${idx+1}</strong><span>0–80: <b>${formatAccel(a.t80)}</b></span><span>0–100: <b>${formatAccel(a.t100)}</b></span><span>Top: <b>${Math.round(a.topMs*3.6)} km/t</b></span></div>`).join('');
  }
}
function updateSpeedDemoAttempt(t,speedMs){
  const prev=state.demoPrevSpeedMs||0,stop=C.STOPPED_THRESHOLD_MS||0.8;
  if(!state.speedDemoAttempt && prev<=stop && speedMs>stop && state.speedDemoAttempts.length<3){
    state.speedDemoAttempt={startT:Math.max(0,t-1),t80:null,t100:null,topMs:speedMs};
  }
  const a=state.speedDemoAttempt;
  if(a){
    a.topMs=Math.max(a.topMs,speedMs);
    const prevK=prev*3.6,curK=speedMs*3.6;
    const cross=(target)=>{
      if(curK<=prevK||prevK>=target||curK<target)return null;
      const f=(target-prevK)/(curK-prevK);
      return (t-1)+Math.max(0,Math.min(1,f));
    };
    if(a.t80===null){const ct=cross(80);if(ct!==null)a.t80=Math.max(0,ct-a.startT)}
    if(a.t100===null){const ct=cross(100);if(ct!==null)a.t100=Math.max(0,ct-a.startT)}
    if(speedMs<=stop && prev>stop){
      state.speedDemoAttempts.push(a);
      state.speedDemoAttempt=null;
    }
  }
  state.demoPrevSpeedMs=speedMs;
  renderSpeedDemoResults(speedMs);
}
function demoSpeed(type,i,total){if(type==='speed'){if(i<5)return 0;if(i<=17)return 32*((i-5)/12);if(i<=25)return 31+1.5*Math.sin(i/2);if(i<=32)return Math.max(0,31*(1-(i-25)/7));if(i<=38)return 0;if(i<=48)return 34*((i-38)/10);if(i<=56)return 33+1.5*Math.sin(i/2);if(i<=63)return Math.max(0,33*(1-(i-56)/7));if(i<=69)return 0;if(i<=78)return 36*((i-69)/9);if(i<=88)return 35+1.2*Math.sin(i/2);if(i<=96)return Math.max(0,35*(1-(i-88)/8));return 0}if(type==='short'){if(i<4||i>total-5)return 0;if(i<10)return 4+(i-4)*1.8;if(i<22)return 14;if(i<27)return 0;if(i<38)return 20;if(i<43)return 4;return 12}if(type==='city'){const cycle=i%24;if(cycle<5)return 0;if(cycle<10)return 4+cycle;if(cycle<18)return 10;if(cycle<22)return 5;return 0}if(type==='twisty'){if(i<4||i>total-5)return 0;const phase=i%20;if(phase<5)return 10+phase*1.4;if(phase<12)return 17+3*Math.sin(i/2.5);if(phase<16)return 12;return 15}const phase=i%36;if(i<4||i>total-5)return 0;if(phase<8)return 8+phase*1.8;if(phase<28)return 22+6*Math.sin(i/4);return 10}
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
  if(type==='short') return [start,brewery,bognaes,start];
  if(type==='speed') return [start,bognaes,kattinge,brewery,start];
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
async function startDemo(){if(state.rideId){alert('Afslut den aktive tur først.');return}resetDriverTripDisplay({clearMarker:true});state.demo=true;state.demoIndex=0;state.demoTravelM=0;state.demoProfile=$('demoType').value;$('demoBadge').textContent='DEMO v34';$('demoBadge').classList.remove('hidden');$('demoBtn').textContent='Stop demo';$('demoBtn').classList.add('active');$('rideStatus').textContent='Klargør demo…';$('statusDetail').textContent='Demo v34 henter din GPS-position og låser rutestarten til en vej højst 120 m væk.';try{const gpsBase=await getDemoBase();state.demoBase=await snapDemoBaseToRoad(gpsBase);$('rideStatus').textContent='Finder vej-rute…';$('statusDetail').textContent=`Starter på ${state.demoBase.name||'Toftevej, Herslev'} og følger vejnettet.`;state.demoRoute=await buildRoadDemoRoute(state.demoBase,state.demoProfile)}catch(e){state.demo=false;state.demoBase=null;state.demoRoute=null;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent=e.message||'Kunne ikke finde en vej-rute til demoen.';throw e}const demoName=state.demoProfile==='short'?'kort test':state.demoProfile==='city'?'bykørsel':state.demoProfile==='twisty'?'snoet tur':state.demoProfile==='speed'?'speed':'landevej';await createRide(`RIDEZ demo · ${demoName}`);$('rideStatus').textContent='Demo starter…';$('statusDetail').textContent=`Starter på ${state.demoBase.name||'Toftevej, Herslev'} og simulerer hastighed og stop.`;const total=state.demoProfile==='short'?60:state.demoProfile==='city'?90:state.demoProfile==='twisty'?110:state.demoProfile==='speed'?108:90;if(state.demoProfile==='speed')resetSpeedDemoResults(true);else resetSpeedDemoResults(false);async function tick(){if(!state.demo||!state.rideId)return;const i=state.demoIndex++,speed=demoSpeed(state.demoProfile,i,total);if(state.demoProfile==='speed')updateSpeedDemoAttempt(i,speed);state.demoTravelM+=speed;const cur=demoPointAt(state.demoRoute,state.demoTravelM);if(!cur){await stopRide();return}await processPosition(cur,speed,4);if(i>=total||state.demoTravelM>=state.demoRoute.total-5){await stopRide();return}state.demoTimer=setTimeout(tick,1000)}await tick()}
async function stopRide(){if(state.watchId!==null)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;stopDemoTimer();try{await flushPublicTopSpeed()}catch(e){console.warn(e)}const finishedDistance=state.distanceM,finishedDuration=state.rideStartedAt?Math.max(0,Math.round((Date.now()-state.rideStartedAt)/1000)):0,finishedMoving=Math.max(0,Math.round(state.movingMs/1000)),finishedStopped=Math.max(0,Math.round(state.stoppedMs/1000)),finishedMaxSpeed=Math.max(0,state.maxSpeedMs);try{if(state.driverToken)await rpc('ridez_end_ride_v19',{p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped})}catch(e){console.error(e);try{if(state.driverToken)await rpc('ridez_end_ride_v18',{p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped})}catch(fallbackError){console.error(fallbackError)}}resetDriverTripDisplay({clearMarker:true});state.rideId=null;state.publicToken=null;state.driverToken=null;state.rideStartedAt=null;localStorage.removeItem('ridez_driver_token');state.demo=false;state.demoIndex=0;state.demoBase=null;state.demoProfile=null;state.demoRoute=null;state.demoTravelM=0;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');setRideButtons(false);$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent='Start en tur for at dele din position.';setMotion(false);$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent='Start en tur for at dele din position.';await loadHistory()}
async function shareRide(){const url=`${location.origin}${location.pathname}?ride=${encodeURIComponent(state.publicToken)}`;if(navigator.share){try{await navigator.share({title:'Følg min RIDEZ-tur',text:'Følg min motorcykeltur live på RIDEZ',url});return}catch(e){}}await navigator.clipboard.writeText(url);alert('Følgelink kopieret.')}
async function pollMessages(){if(!state.driverToken||!state.rideId)return;try{const rows=await rpc('ridez_driver_messages',{p_driver_token:state.driverToken});$('messageCount').textContent=rows.length;const unseen=rows.filter(r=>!state.messagesSeen.has(r.id));if(!state.moving&&unseen.length){unseen.forEach(r=>state.messagesSeen.add(r.id));renderMessages(rows);if(document.visibilityState==='visible'&&navigator.vibrate)navigator.vibrate([120,80,120])}else if(!state.moving)renderMessages(rows)}catch(e){console.error(e)}if(state.driverToken&&state.rideId)setTimeout(pollMessages,C.MESSAGE_POLL_MS)}
function renderMessages(rows){const el=$('messagesList');if(!rows.length){el.className='empty';el.textContent='Ingen beskeder endnu.';return}el.className='';el.innerHTML=rows.map(r=>`<div class="message"><div class="meta"><strong>${escapeHtml(r.sender_name)}</strong> · ${new Date(r.created_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}</div><div>${escapeHtml(r.body)}</div></div>`).join('')}
function updateHistorySelectionUi(){
  const toggle=$('historySelectBtn'),bulk=$('historyBulkDeleteBtn'),list=$('historyList');
  if(toggle)toggle.textContent=state.historySelectMode?'Annuller':'Vælg';
  if(bulk){
    const n=state.selectedRideIds.size;
    bulk.classList.toggle('hidden',!state.historySelectMode);
    bulk.disabled=n===0;
    bulk.textContent=n?`Slet valgte (${n})`:'Slet valgte';
  }
  if(list)list.classList.toggle('select-mode',state.historySelectMode);
  document.querySelectorAll('.history-item').forEach(item=>{
    const id=item.dataset.rideId,cb=item.querySelector('.history-select-check');
    item.classList.toggle('selected',state.selectedRideIds.has(id));
    if(cb)cb.checked=state.selectedRideIds.has(id);
    if(state.historySelectMode)item.classList.remove('swiped');
  });
}
function toggleHistorySelectMode(){
  state.historySelectMode=!state.historySelectMode;
  state.selectedRideIds.clear();
  updateHistorySelectionUi();
}
function toggleHistoryRideSelection(rideId){
  if(state.selectedRideIds.has(rideId))state.selectedRideIds.delete(rideId);else state.selectedRideIds.add(rideId);
  updateHistorySelectionUi();
}
async function deleteHistoryRideById(rideId){
  const deleted=await rpc('ridez_delete_history_ride_v17',{p_owner_token:state.ownerToken,p_ride_id:rideId});
  if(!deleted)throw new Error('Turen kunne ikke slettes');
  return true;
}
async function deleteHistoryRideFromList(rideId){
  if(!rideId)return;
  if(!confirm('Slet denne tur permanent fra Historik? Dette kan ikke fortrydes.'))return;
  try{
    await deleteHistoryRideById(rideId);
    if($('historyDetail').dataset.rideId===rideId)closeHistoryRide();
    state.selectedRideIds.delete(rideId);
    await loadHistory();
  }catch(e){console.error(e);alert('Turen kunne ikke slettes. Prøv igen.');}
}
async function deleteSelectedHistoryRides(){
  const ids=[...state.selectedRideIds];
  if(!ids.length)return;
  if(!confirm(`Slet ${ids.length} valgte ${ids.length===1?'tur':'ture'} permanent? Dette kan ikke fortrydes.`))return;
  const btn=$('historyBulkDeleteBtn');
  btn.disabled=true;btn.textContent='Sletter…';
  try{
    for(const id of ids)await deleteHistoryRideById(id);
    if(ids.includes($('historyDetail').dataset.rideId))closeHistoryRide();
    state.selectedRideIds.clear();state.historySelectMode=false;
    await loadHistory();
  }catch(e){console.error(e);alert('En eller flere ture kunne ikke slettes. Historik opdateres nu.');await loadHistory();}
  finally{updateHistorySelectionUi()}
}
function bindHistoryItem(item){
  const rideId=item.dataset.rideId,card=item.querySelector('.history-card'),del=item.querySelector('.history-swipe-delete'),check=item.querySelector('.history-select-check');
  let startX=0,startY=0,tracking=false,swiped=false;
  card.addEventListener('click',e=>{
    if(Date.now()-Number(item.dataset.justSwiped||0)<450){e.preventDefault();return}
    if(state.historySelectMode){e.preventDefault();toggleHistoryRideSelection(rideId);return}
    if(item.classList.contains('swiped')){item.classList.remove('swiped');e.preventDefault();return}
    openHistoryRide(rideId);
  });
  if(check)check.addEventListener('change',()=>toggleHistoryRideSelection(rideId));
  del.addEventListener('click',e=>{e.stopPropagation();deleteHistoryRideFromList(rideId)});
  item.addEventListener('touchstart',e=>{
    if(state.historySelectMode||e.touches.length!==1)return;
    startX=e.touches[0].clientX;startY=e.touches[0].clientY;tracking=true;swiped=false;
  },{passive:true});
  item.addEventListener('touchmove',e=>{
    if(!tracking||state.historySelectMode)return;
    const dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY;
    if(Math.abs(dy)>Math.abs(dx)+8){tracking=false;return}
    if(dx<-18){swiped=true;item.classList.add('swiping')}
  },{passive:true});
  item.addEventListener('touchend',e=>{
    if(!tracking)return;tracking=false;item.classList.remove('swiping');
    const touch=e.changedTouches[0],dx=touch.clientX-startX;
    if(swiped&&dx<-45){
      document.querySelectorAll('.history-item.swiped').forEach(x=>{if(x!==item)x.classList.remove('swiped')});
      item.classList.add('swiped');item.dataset.justSwiped=String(Date.now());
    }else if(dx>25)item.classList.remove('swiped');
  },{passive:true});
}
async function loadHistory(){
  const list=$('historyList');
  if(!list)return;
  ensureOwnerToken();
  list.className='history-list';
  list.innerHTML='<div class="empty">Henter ture…</div>';
  try{
    const rows=await rpc('ridez_history_v18',{p_owner_token:state.ownerToken});
    const visibleRows=rows.filter(r=>!isEmptyRide(r));
    if(!visibleRows.length){list.className='history-list empty';list.textContent='Ingen afsluttede ture endnu.';state.selectedRideIds.clear();state.historySelectMode=false;updateHistorySelectionUi();return}
    list.innerHTML=visibleRows.map(r=>{
      const avgMoving=Number(r.avg_moving_speed_ms||0)*3.6,top=Number(r.max_speed_ms||0)*3.6;
      return `<div class="history-item" data-ride-id="${r.ride_id}"><button class="history-swipe-delete" type="button" aria-label="Slet tur">Slet</button><div class="history-slide"><label class="history-select-wrap" aria-label="Vælg tur"><input class="history-select-check" type="checkbox"><span></span></label><button class="history-card" type="button"><div><strong>${fmtDate(r.created_at)}</strong><span>${escapeHtml(r.title||'RIDEZ tur')}</span></div><div class="history-summary"><b>${(Number(r.distance_m||0)/1000).toFixed(1).replace('.',',')} km</b><span>${fmtDuration(r.duration_s)}</span><span>Top ${top.toFixed(0)} km/t</span><span>Gns. ${avgMoving.toFixed(0)} km/t</span><span>📷 ${Number(r.photo_count||0)}</span></div></button></div></div>`
    }).join('');
    list.querySelectorAll('.history-item').forEach(bindHistoryItem);
    updateHistorySelectionUi();
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
    await deleteHistoryRideById(rideId);
    closeHistoryRide();
    await loadHistory();
  }catch(e){console.error(e);alert('Turen kunne ikke slettes. Kontroller at v17 SQL-opdateringen er kørt i Supabase.');}
  finally{btn.disabled=false;btn.textContent='Slet tur'}
}
function closeHistoryRide(){$('historyDetail').classList.add('hidden');$('historyDetail').dataset.rideId=''}

async function initViewer(){$('viewerView').classList.remove('hidden');state.map=initMap('viewerMap');let lastTrackCount=0;async function refresh(){try{const rideResult=await rpc('ridez_public_ride_v23',{p_public_token:publicRideToken}).catch(()=>rpc('ridez_public_ride_v21',{p_public_token:publicRideToken})).catch(()=>rpc('ridez_public_ride_v19',{p_public_token:publicRideToken}));const ride=Array.isArray(rideResult)?rideResult[0]:rideResult;if(!ride){$('viewerStatus').textContent='Turen findes ikke eller er udløbet.';return}$('viewerTitle').textContent=ride.title||'RIDEZ live-tur';$('viewerSpeed').textContent=fmtSpeed(ride.speed_ms);showViewerTopSpeed(ride);$('viewerUpdated').textContent=ride.updated_at?new Date(ride.updated_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'}):'–';$('viewerStatus').textContent=ride.active?(ride.moving?'Føreren er på farten':'Motorcyklen holder stille'):'Turen er afsluttet';const mo=$('viewerMotion');mo.textContent=ride.moving?'KØRER':'STILLE';mo.className=`motion ${ride.moving?'moving':'stopped'}`;if(ride.lat!=null)updateMap(ride.lat,ride.lng,true);const pts=await rpc('ridez_public_track',{p_public_token:publicRideToken});if(pts.length!==lastTrackCount){lastTrackCount=pts.length;state.points=pts.map(x=>[x.lat,x.lng]);if(state.line)state.line.setLatLngs(state.points);else if(state.points.length)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map)}}catch(e){console.error(e);$('viewerStatus').textContent='Kunne ikke hente live-data.'}setTimeout(refresh,3000)}refresh();$('messageForm').addEventListener('submit',async e=>{e.preventDefault();const name=$('senderName').value.trim(),body=$('messageBody').value.trim();if(!name||!body)return;$('sendFeedback').textContent='Sender…';try{const result=await rpc('ridez_send_message',{p_public_token:publicRideToken,p_sender_name:name,p_body:body});$('messageBody').value='';$('sendFeedback').textContent=result==='moving'?'🏍️ Beskeden er modtaget. Føreren er på farten, så den bliver først vist, når motorcyklen holder stille.':'✓ Beskeden er sendt og kan vises til føreren nu.'}catch(err){$('sendFeedback').textContent='Beskeden kunne ikke sendes. Prøv igen.'}})}
async function initDriver(){$('driverView').classList.remove('hidden');ensureOwnerToken();state.map=initMap('driverMap');$('startBtn').onclick=()=>startRide().catch(e=>alert('Kunne ikke starte turen: '+e.message));$('stopBtn').onclick=()=>stopRide();$('shareBtn').onclick=shareRide;$('demoBtn').onclick=()=>{if(state.demo)stopRide();else startDemo().catch(e=>{console.error(e);alert('Kunne ikke starte demo: '+e.message)})};$('historyCloseBtn').onclick=closeHistoryRide;$('historyDeleteBtn').onclick=deleteHistoryRide;$('historySelectBtn').onclick=toggleHistorySelectMode;$('historyBulkDeleteBtn').onclick=deleteSelectedHistoryRides;loadHistory()}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
publicRideToken?initViewer():initDriver();
})();
