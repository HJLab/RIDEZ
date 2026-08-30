(()=>{
'use strict';
const C=window.RIDEZ_CONFIG||{};
const configured=C.SUPABASE_URL&&!C.SUPABASE_URL.startsWith('PASTE_')&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.startsWith('PASTE_');
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search), publicRideToken=params.get('ride');
if(!configured){$('setupView').classList.remove('hidden');return}
const db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const state={rideId:null,publicToken:null,driverToken:localStorage.getItem('ridez_driver_token')||null,watchId:null,lastPos:null,lastUpload:0,distanceM:0,moving:false,stoppedSince:null,messagesSeen:new Set(),map:null,marker:null,line:null,points:[]};
const fmtSpeed=ms=>`${Math.max(0,Math.round((ms||0)*3.6))} km/t`;
const escapeHtml=s=>(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function token(){const a=new Uint8Array(24);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('')}
function hav(a,b){const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function initMap(id){const m=L.map(id,{zoomControl:true}).setView([55.6761,12.5683],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);return m}
function updateMap(lat,lng,follow=true){if(!state.map)return;const p=[lat,lng];if(!state.marker)state.marker=L.circleMarker(p,{radius:9,weight:4,color:'#111',fillColor:'#e11d24',fillOpacity:1}).addTo(state.map);else state.marker.setLatLng(p);state.points.push(p);if(!state.line)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map);else state.line.setLatLngs(state.points);if(follow)state.map.setView(p,16)}
function setMotion(moving){state.moving=moving;const el=$('motionLight');el.textContent=moving?'KØRER':'STILLE';el.className=`motion ${moving?'moving':'stopped'}`;$('rideStatus').textContent=moving?'På farten':'Holder stille';$('statusDetail').textContent=moving?'Beskeder holdes tilbage, mens du kører.':'Det er sikkert at vise ventende beskeder.'}
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw error;return data}
async function startRide(){
 if(!navigator.geolocation){alert('GPS understøttes ikke på denne enhed.');return}
 state.driverToken=token();state.publicToken=token();localStorage.setItem('ridez_driver_token',state.driverToken);
 const data=await rpc('ridez_create_ride',{p_driver_token:state.driverToken,p_public_token:state.publicToken,p_title:'RIDEZ live-tur'});state.rideId=data;
 $('startBtn').classList.add('hidden');$('stopBtn').classList.remove('hidden');$('shareBtn').classList.remove('hidden');$('rideStatus').textContent='Starter GPS…';
 state.watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:15000});pollMessages();
}
function onGeoError(e){$('statusDetail').textContent=`GPS-fejl: ${e.message}`}
async function onPosition(pos){
 const now=Date.now(), cur={lat:pos.coords.latitude,lng:pos.coords.longitude,t:now,accuracy:pos.coords.accuracy};
 let speed=Number.isFinite(pos.coords.speed)?Math.max(0,pos.coords.speed):null;
 if(state.lastPos){const dt=(now-state.lastPos.t)/1000,dist=hav(state.lastPos,cur);if(speed===null&&dt>0)speed=dist/dt;if(dist<1000&&cur.accuracy<80)state.distanceM+=dist}
 speed=speed||0;
 if(speed>=C.MOVING_THRESHOLD_MS){state.stoppedSince=null;setMotion(true)}
 else if(speed<=C.STOPPED_THRESHOLD_MS){if(!state.stoppedSince)state.stoppedSince=now;if(now-state.stoppedSince>=C.STATIONARY_SECONDS*1000)setMotion(false)}
 state.lastPos=cur;$('speedValue').textContent=fmtSpeed(speed);$('distanceValue').textContent=`${(state.distanceM/1000).toFixed(1).replace('.',',')} km`;updateMap(cur.lat,cur.lng,true);
 if(now-state.lastUpload>=C.LOCATION_UPLOAD_MS){state.lastUpload=now;try{await rpc('ridez_update_location',{p_driver_token:state.driverToken,p_lat:cur.lat,p_lng:cur.lng,p_speed_ms:speed,p_moving:state.moving,p_accuracy_m:cur.accuracy})}catch(e){console.error(e)}}
}
async function stopRide(){if(state.watchId!==null)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;try{await rpc('ridez_end_ride',{p_driver_token:state.driverToken})}catch(e){};$('stopBtn').classList.add('hidden');$('shareBtn').classList.add('hidden');$('startBtn').classList.remove('hidden');$('rideStatus').textContent='Tur afsluttet';$('statusDetail').textContent='Din live-deling er stoppet.'}
async function shareRide(){const url=`${location.origin}${location.pathname}?ride=${encodeURIComponent(state.publicToken)}`;if(navigator.share){try{await navigator.share({title:'Følg min RIDEZ-tur',text:'Følg min motorcykeltur live på RIDEZ',url});return}catch(e){}}await navigator.clipboard.writeText(url);alert('Følgelink kopieret.')}
async function pollMessages(){if(!state.driverToken||!state.watchId)return;try{const rows=await rpc('ridez_driver_messages',{p_driver_token:state.driverToken});$('messageCount').textContent=rows.length;const unseen=rows.filter(r=>!state.messagesSeen.has(r.id));if(!state.moving&&unseen.length){unseen.forEach(r=>state.messagesSeen.add(r.id));renderMessages(rows);if(document.visibilityState==='visible'&&navigator.vibrate)navigator.vibrate([120,80,120]);}else if(!state.moving)renderMessages(rows)}catch(e){console.error(e)}setTimeout(pollMessages,C.MESSAGE_POLL_MS)}
function renderMessages(rows){const el=$('messagesList');if(!rows.length){el.className='empty';el.textContent='Ingen beskeder endnu.';return}el.className='';el.innerHTML=rows.map(r=>`<div class="message"><div class="meta"><strong>${escapeHtml(r.sender_name)}</strong> · ${new Date(r.created_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}</div><div>${escapeHtml(r.body)}</div></div>`).join('')}
async function initViewer(){
 $('viewerView').classList.remove('hidden');state.map=initMap('viewerMap');let lastTrackCount=0;
 async function refresh(){try{const rideResult=await rpc('ridez_public_ride',{p_public_token:publicRideToken});const ride=Array.isArray(rideResult)?rideResult[0]:rideResult;if(!ride){$('viewerStatus').textContent='Turen findes ikke eller er udløbet.';return}$('viewerTitle').textContent=ride.title||'RIDEZ live-tur';$('viewerSpeed').textContent=fmtSpeed(ride.speed_ms);$('viewerUpdated').textContent=ride.updated_at?new Date(ride.updated_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'}):'–';$('viewerStatus').textContent=ride.active?(ride.moving?'Føreren er på farten':'Motorcyklen holder stille'):'Turen er afsluttet';const mo=$('viewerMotion');mo.textContent=ride.moving?'KØRER':'STILLE';mo.className=`motion ${ride.moving?'moving':'stopped'}`;if(ride.lat!=null)updateMap(ride.lat,ride.lng,true);const pts=await rpc('ridez_public_track',{p_public_token:publicRideToken});if(pts.length!==lastTrackCount){lastTrackCount=pts.length;state.points=pts.map(x=>[x.lat,x.lng]);if(state.line)state.line.setLatLngs(state.points);else if(state.points.length)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map)}}catch(e){console.error(e);$('viewerStatus').textContent='Kunne ikke hente live-data.'}setTimeout(refresh,3000)}
 refresh();$('messageForm').addEventListener('submit',async e=>{e.preventDefault();const name=$('senderName').value.trim(),body=$('messageBody').value.trim();if(!name||!body)return;$('sendFeedback').textContent='Sender…';try{const result=await rpc('ridez_send_message',{p_public_token:publicRideToken,p_sender_name:name,p_body:body});$('messageBody').value='';$('sendFeedback').textContent=result==='moving'?'🏍️ Beskeden er modtaget. Føreren er på farten, så den bliver først vist, når motorcyklen holder stille.':'✓ Beskeden er sendt og kan vises til føreren nu.'}catch(err){$('sendFeedback').textContent='Beskeden kunne ikke sendes. Prøv igen.'}})
}
async function initDriver(){
 $('driverView').classList.remove('hidden');state.map=initMap('driverMap');$('startBtn').onclick=()=>startRide().catch(e=>alert('Kunne ikke starte turen: '+e.message));$('stopBtn').onclick=stopRide;$('shareBtn').onclick=shareRide;
}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
publicRideToken?initViewer():initDriver();
})();
