(()=>{
'use strict';
const C=window.RIDEZ_CONFIG||{};
const configured=C.SUPABASE_URL&&!C.SUPABASE_URL.startsWith('PASTE_')&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.startsWith('PASTE_');
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),publicRideToken=params.get('ride'),demoChannelToken=params.get('demo');
if(!configured){$('setupView').classList.remove('hidden');return}
const db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const state={rideId:null,publicToken:null,driverToken:localStorage.getItem('ridez_driver_token')||null,ownerToken:localStorage.getItem('ridez_owner_token')||null,demoChannelToken:localStorage.getItem('ridez_demo_channel_token')||null,rideStartedAt:null,watchId:null,lastPos:null,lastUpload:0,distanceM:0,moving:false,stoppedSince:null,messagesSeen:new Set(),map:null,marker:null,line:null,points:[],demo:false,demoTimer:null,demoIndex:0,demoBase:null,demoProfile:null,demoRoute:null,demoTravelM:0,historyMap:null,historyLine:null,maxSpeedMs:0,movingMs:0,stoppedMs:0,statsLastT:null,topSpeedUpdateTimer:null,historySelectMode:false,selectedRideIds:new Set(),activePhotoMarkers:[],historyPhotoMarkers:[],photoBusy:false,demoPrevSpeedMs:0,demoPrevTimeS:0,speedDemoAttempt:null,speedDemoAttempts:[],accelSamples:[],accelZeroStartMs:null,accelZeroActive:false,accelBest080:null,accelBest0100:null,accelBest80:null,accelSlow80:null,accelFastRule:null,accelSlowRule:null,accelEditorKind:null,currentSpeedMs:0,leanCalibration:(localStorage.getItem('ridez_lean_calibration')===null?null:Number(localStorage.getItem('ridez_lean_calibration'))),leanFilteredDeg:0,leanLiveDeg:0,maxLeanLeftDeg:0,maxLeanRightDeg:0,leftTurnCount:0,rightTurnCount:0,turnActive:null,turnArmed:true,turnNeutralSince:null,lastRawRoll:null,orientationBound:false,calibrating:false,calibrationSamples:[],historyTrack:[],historyPhotosData:[],replayTimer:null,replayMarker:null,replayProgressLine:null,replayProgressPoints:[],replayIndex:0,replayPaused:false,replayRunning:false,replaySpeedFactor:([1,2,5,10].includes(Number(localStorage.getItem('ridez_replay_speed')))?Number(localStorage.getItem('ridez_replay_speed')):2),replayPhotoShown:new Set(),replayPoliceTriggered:false,replayPoliceIndex:-1,replayPoliceMarker:null,replayPoliceTimer:null,replayAudioCtx:null,replayPoliceAudioBuffer:null,replayPoliceAudioSource:null,soundsEnabled:(localStorage.getItem('ridez_sounds_enabled')===null?true:localStorage.getItem('ridez_sounds_enabled')==='1')};
const fmtSpeed=ms=>`${Math.max(0,Math.round((ms||0)*3.6))} km/t`;
function applySpeedColor(el,speedMs){
  if(!el)return;
  const kmh=Math.max(0,Number(speedMs||0)*3.6);
  el.classList.remove('speed-green','speed-yellow','speed-red','speed-red-alert');
  if(kmh<80)el.classList.add('speed-green');
  else if(kmh<130)el.classList.add('speed-yellow');
  else if(kmh<=150)el.classList.add('speed-red');
  else el.classList.add('speed-red-alert');
}
const fmtDuration=sec=>{sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;if(h)return s?`${h} t ${m} min ${s} sek.`:`${h} t ${m} min`;if(m)return s?`${m} min ${s} sek.`:`${m} min`;return `${s} sek.`};
const isEmptyRide=r=>Number(r&&r.distance_m||0)<25;
const fmtDate=d=>new Date(d).toLocaleString('da-DK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function ensureOwnerToken(){if(!state.ownerToken){state.ownerToken=token();localStorage.setItem('ridez_owner_token',state.ownerToken)}return state.ownerToken}
function ensureDemoChannelToken(){if(!state.demoChannelToken){state.demoChannelToken=token();localStorage.setItem('ridez_demo_channel_token',state.demoChannelToken)}return state.demoChannelToken}
async function publishDemoChannel(){if(!state.demo||!state.publicToken)return;await rpc('ridez_set_demo_channel_v50',{p_owner_token:ensureOwnerToken(),p_channel_token:ensureDemoChannelToken(),p_public_token:state.publicToken})}
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

async function publishLiveStats(){
  if(!state.driverToken)return;
  const fast=state.accelBest80,slow=state.accelSlow80;
  try{
    await rpc('ridez_update_live_stats_v45',{
      p_driver_token:state.driverToken,
      p_distance_m:state.distanceM,
      p_max_speed_ms:state.maxSpeedMs,
      p_moving_s:Math.max(0,Math.round(state.movingMs/1000)),
      p_stopped_s:Math.max(0,Math.round(state.stoppedMs/1000)),
      p_accel_best_s:fast?fast.seconds:null,
      p_accel_best_start_kmh:fast?fast.startKmh:null,
      p_accel_best_end_kmh:fast?fast.endKmh:null,
      p_accel_slowest_s:slow?slow.seconds:null,
      p_accel_slowest_start_kmh:slow?slow.startKmh:null,
      p_accel_slowest_end_kmh:slow?slow.endKmh:null,
      p_live_lean_deg:state.leanLiveDeg,
      p_max_lean_left_deg:state.maxLeanLeftDeg,
      p_max_lean_right_deg:state.maxLeanRightDeg,
      p_turn_left_count:state.leftTurnCount,
      p_turn_right_count:state.rightTurnCount
    });
  }catch(e){console.warn('Live turstatistik kunne ikke opdateres',e)}
}

function viewerAccelerationText(seconds,startKmh,endKmh){
  const s=Number(seconds),a=Number(startKmh),b=Number(endKmh);
  if(!Number.isFinite(s)||!Number.isFinite(a)||!Number.isFinite(b)||s<=0)return '–';
  return `${Math.round(a)} → ${Math.round(b)} km/t · ${formatAccelerationResult(s)}`;
}
function renderViewerDashboard(ride){
  const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const movingS=Math.max(0,Number(ride.moving_s||0)),stoppedS=Math.max(0,Number(ride.stopped_s||0));
  set('viewerDistance',`${(Math.max(0,Number(ride.distance_m||0))/1000).toFixed(1).replace('.',',')} km`);
  set('viewerAverageSpeed',fmtSpeed(Number(ride.avg_moving_speed_ms||0)));
  set('viewerMovingTime',fmtDuration(movingS));
  set('viewerStoppedTime',fmtDuration(stoppedS));
  set('viewerFastAccel',viewerAccelerationText(ride.accel_best_s,ride.accel_best_start_kmh,ride.accel_best_end_kmh));
  set('viewerSlowAccel',viewerAccelerationText(ride.accel_slowest_s,ride.accel_slowest_start_kmh,ride.accel_slowest_end_kmh));
  set('viewerLeanLive',ride.active?leanLabel(Number(ride.live_lean_deg||0)):'–');
  set('viewerLeanLeft',`${Math.round(Math.max(0,Number(ride.max_lean_left_deg||0)))}°`);
  set('viewerLeanRight',`${Math.round(Math.max(0,Number(ride.max_lean_right_deg||0)))}°`);
  set('viewerTurnsLeft',String(Math.max(0,Number(ride.turn_left_count||0))));
  set('viewerTurnsRight',String(Math.max(0,Number(ride.turn_right_count||0))));
}

function initMap(id){const m=L.map(id,{zoomControl:true}).setView([55.6761,12.5683],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);return m}
function updateMap(lat,lng,follow=true){if(!state.map)return;const p=[lat,lng];if(!state.marker)state.marker=L.circleMarker(p,{radius:9,weight:4,color:'#111',fillColor:'#e11d24',fillOpacity:1}).addTo(state.map);else state.marker.setLatLng(p);state.points.push(p);if(!state.line)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map);else state.line.setLatLngs(state.points);if(follow)state.map.setView(p,16)}
function photoMarkerIcon(){return L.divIcon({className:'ridez-photo-marker-wrap',html:'<div class="ridez-photo-marker"><span>📷</span></div>',iconSize:[38,38],iconAnchor:[19,34],popupAnchor:[0,-30]})}
function clearActivePhotoMarkers(){if(!state.map)return;state.activePhotoMarkers.forEach(m=>{try{state.map.removeLayer(m)}catch(e){}});state.activePhotoMarkers=[]}
function clearHistoryPhotoMarkers(){if(!state.historyMap)return;state.historyPhotoMarkers.forEach(m=>{try{state.historyMap.removeLayer(m)}catch(e){}});state.historyPhotoMarkers=[]}
function photoPublicUrl(path){if(!path)return'';const {data}=db.storage.from('ridez-photos').getPublicUrl(path);return data&&data.publicUrl?data.publicUrl:''}
function photoPopupElement(url,when=''){
  const wrap=document.createElement('div');wrap.className='photo-popup';
  const btn=document.createElement('button');btn.className='photo-popup-open';btn.type='button';btn.setAttribute('aria-label','Vis billede i fuld størrelse');
  const img=document.createElement('img');img.src=url;img.alt='Billede fra turen';btn.appendChild(img);
  const stamp=document.createElement('span');stamp.textContent=when||'';
  const hint=document.createElement('small');hint.textContent='Tryk på billedet for fuld størrelse';
  wrap.append(btn,stamp,hint);
  let lastTouch=0;
  const open=(ev)=>{if(ev){ev.preventDefault();ev.stopPropagation()}openPhotoViewer(url,when)};
  btn.addEventListener('touchend',ev=>{lastTouch=Date.now();open(ev)},{passive:false});
  btn.addEventListener('click',ev=>{if(Date.now()-lastTouch<800){ev.preventDefault();ev.stopPropagation();return}open(ev)});
  if(window.L&&L.DomEvent){L.DomEvent.disableClickPropagation(wrap);L.DomEvent.disableScrollPropagation(wrap)}
  return wrap;
}
function openPhotoViewer(url,caption=''){if(!url)return;const dlg=$('photoViewerDialog'),img=$('photoViewerImage'),cap=$('photoViewerCaption');if(!dlg||!img)return;img.src=url;img.alt=caption||'Billede fra turen';if(cap){cap.textContent=caption||'';cap.classList.toggle('hidden',!caption)}if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','')}
function closePhotoViewer(){const dlg=$('photoViewerDialog'),img=$('photoViewerImage');if(!dlg)return;if(typeof dlg.close==='function'&&dlg.open)dlg.close();else dlg.removeAttribute('open');if(img)img.src=''}
function addActivePhotoMarker(lat,lng,url,capturedAt){if(!state.map||!Number.isFinite(lat)||!Number.isFinite(lng))return;const when=capturedAt?fmtDate(capturedAt):'';const marker=L.marker([lat,lng],{icon:photoMarkerIcon()}).addTo(state.map);if(url)marker.bindPopup(photoPopupElement(url,when),{maxWidth:300});state.activePhotoMarkers.push(marker)}
async function getPhotoPosition(){if(state.lastPos&&Number.isFinite(state.lastPos.lat)&&Number.isFinite(state.lastPos.lng))return {lat:state.lastPos.lat,lng:state.lastPos.lng};if(!navigator.geolocation)throw new Error('GPS-position er ikke tilgængelig.');return await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(pos=>resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}),()=>reject(new Error('Kunne ikke hente GPS-position til billedet.')),{enableHighAccuracy:true,maximumAge:3000,timeout:10000}))}
async function imageToJpeg(file){
  let img=null,url=null,close=null;
  try{
    if('createImageBitmap' in window){try{img=await createImageBitmap(file,{imageOrientation:'from-image'});close=()=>img.close&&img.close()}catch(e){img=null}}
    if(!img){url=URL.createObjectURL(file);img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('Billedformatet kunne ikke åbnes. Vælg et JPG/PNG-billede.'));el.src=url})}
    const w=img.width||img.naturalWidth,h=img.height||img.naturalHeight;if(!w||!h)throw new Error('Billedet kunne ikke læses.');
    const maxSide=1600,scale=Math.min(1,maxSide/Math.max(w,h)),cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale));
    const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);ctx.drawImage(img,0,0,cw,ch);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));if(!blob)throw new Error('Billedet kunne ikke klargøres.');if(blob.size>5*1024*1024)throw new Error('Billedet er stadig for stort efter komprimering.');return blob;
  }finally{if(close)try{close()}catch(e){};if(url)URL.revokeObjectURL(url)}
}
function setPhotoBusy(busy,text=''){state.photoBusy=busy;['takePhotoBtn','galleryBtn'].forEach(id=>{const el=$(id);if(el)el.disabled=busy});const fb=$('photoFeedback');if(fb){fb.textContent=text;fb.classList.toggle('error',false)}}
async function handleRidePhoto(file,source){
  if(!file||!state.rideId||!state.driverToken){alert('Start en tur, før du tilføjer billeder.');return}
  if(state.photoBusy)return;
  setPhotoBusy(true,'Klargør billede…');
  try{
    const pos=await getPhotoPosition();const capturedAt=new Date(source==='gallery'&&file.lastModified?file.lastModified:Date.now());
    const blob=await imageToJpeg(file);setPhotoBusy(true,'Uploader billede…');
    const path=`v55/${state.rideId}/${token()}.jpg`;
    const {error:uploadError}=await db.storage.from('ridez-photos').upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
    if(uploadError)throw uploadError;
    try{await rpc('ridez_register_photo_v55',{p_driver_token:state.driverToken,p_storage_path:path,p_lat:pos.lat,p_lng:pos.lng,p_captured_at:capturedAt.toISOString()})}
    catch(e){try{await db.storage.from('ridez-photos').remove([path])}catch(ignore){};throw e}
    const url=photoPublicUrl(path);addActivePhotoMarker(pos.lat,pos.lng,url,capturedAt.toISOString());
    setPhotoBusy(false,'✓ Billedet er gemt på turen.');
  }catch(e){console.error(e);setPhotoBusy(false,'Kunne ikke gemme billedet.');const fb=$('photoFeedback');if(fb)fb.classList.add('error');alert('Billedet kunne ikke gemmes: '+(e.message||'Ukendt fejl'))}
}
function setMotion(moving){state.moving=moving;const el=$('motionLight');el.textContent=moving?'KØRER':'STILLE';el.className=`motion ${moving?'moving':'stopped'}`;$('rideStatus').textContent=moving?(state.demo?'Demo kører':'På farten'):(state.demo?'Demo holder stille':'Holder stille');$('statusDetail').textContent=moving?'Beskeder holdes tilbage, mens du kører.':'Det er sikkert at vise ventende beskeder.'}

function formatAccelerationResult(sec){return Number.isFinite(sec)?`${sec.toFixed(1).replace('.',',')} sek.`:'–'}
function formatAccelerationRange(metric){
  if(!metric||!Number.isFinite(metric.seconds))return '–';
  return `${Math.round(metric.startKmh)} → ${Math.round(metric.endKmh)} km/t · ${formatAccelerationResult(metric.seconds)}`;
}
function normalizeAccelRule(raw){
  const r=raw&&typeof raw==='object'?raw:{};
  const mode=r.mode==='range'?'range':'delta';
  if(mode==='range'){
    const from=Math.max(0,Math.min(250,Number(r.from)||0));
    const to=Math.max(from+10,Math.min(350,Number(r.to)||100));
    return {mode:'range',from,to,delta:Math.max(10,to-from)};
  }
  return {mode:'delta',delta:Math.max(10,Math.min(200,Number(r.delta)||80)),from:0,to:100};
}
function loadAccelRule(kind){
  try{return normalizeAccelRule(JSON.parse(localStorage.getItem(`ridez_accel_${kind}_rule`)||'null'))}catch(e){return normalizeAccelRule(null)}
}
function saveAccelRule(kind,rule){
  const normalized=normalizeAccelRule(rule);
  localStorage.setItem(`ridez_accel_${kind}_rule`,JSON.stringify(normalized));
  if(kind==='fast')state.accelFastRule=normalized;else state.accelSlowRule=normalized;
  return normalized;
}
function accelRuleLabel(rule){rule=normalizeAccelRule(rule);return rule.mode==='range'?`${Math.round(rule.from)} → ${Math.round(rule.to)} km/t`:`+${Math.round(rule.delta)} km/t`}
state.accelFastRule=loadAccelRule('fast');
state.accelSlowRule=loadAccelRule('slow');
function renderAccelerationSummary(){
  const fastRule=$('accelFastRuleLabel'),slowRule=$('accelSlowRuleLabel'),fast=$('accelFastResult'),slow=$('accelSlowResult');
  if(fastRule)fastRule.textContent=`Måler ${accelRuleLabel(state.accelFastRule)}`;
  if(slowRule)slowRule.textContent=`Måler ${accelRuleLabel(state.accelSlowRule)}`;
  if(fast)fast.textContent=formatAccelerationRange(state.accelBest80);
  if(slow)slow.textContent=formatAccelerationRange(state.accelSlow80);
}
function resetAccelerationStats(){
  state.accelSamples=[];state.accelZeroStartMs=null;state.accelZeroActive=false;
  state.accelBest080=null;state.accelBest0100=null;state.accelBest80=null;state.accelSlow80=null;
  renderAccelerationSummary();
}
function crossTime(a,b,target){
  if(!a||!b||b.kmh<=a.kmh||a.kmh>target||b.kmh<target)return null;
  const f=(target-a.kmh)/(b.kmh-a.kmh);
  return a.t+(b.t-a.t)*Math.max(0,Math.min(1,f));
}
function candidatesForRule(rule,samples,prev,cur){
  rule=normalizeAccelRule(rule);const out=[];
  if(!prev||cur.kmh<=prev.kmh)return out;
  if(rule.mode==='delta'){
    for(const s of samples){
      const target=s.kmh+rule.delta;
      if(prev.kmh<target&&cur.kmh>=target){
        const t=crossTime(prev,cur,target);if(t===null)continue;
        const seconds=(t-s.t)/1000;
        if(seconds>0&&seconds<=90)out.push({seconds,startKmh:s.kmh,endKmh:target});
      }
    }
    return out;
  }
  if(!(prev.kmh<rule.to&&cur.kmh>=rule.to))return out;
  let startT=null;
  if(samples.length&&Math.abs(samples[0].kmh-rule.from)<0.001)startT=samples[0].t;
  for(let i=1;startT===null&&i<samples.length;i++){
    const t=crossTime(samples[i-1],samples[i],rule.from);if(t!==null)startT=t;
  }
  if(startT===null)return out;
  const endT=crossTime(prev,cur,rule.to);if(endT===null)return out;
  const seconds=(endT-startT)/1000;
  if(seconds>0&&seconds<=90)out.push({seconds,startKmh:rule.from,endKmh:rule.to});
  return out;
}
function updateAccelerationStats(now,speedMs){
  const speedKmh=Math.max(0,(speedMs||0)*3.6),samples=state.accelSamples,prev=samples.length?samples[samples.length-1]:null;
  const maxGapMs=5000,dropToleranceKmh=3;
  if(!prev||now<=prev.t||now-prev.t>maxGapMs||speedKmh<prev.kmh-dropToleranceKmh){
    state.accelSamples=[{t:now,kmh:speedKmh}];renderAccelerationSummary();return;
  }
  const cur={t:now,kmh:speedKmh};
  for(const metric of candidatesForRule(state.accelFastRule,samples,prev,cur))if(!state.accelBest80||metric.seconds<state.accelBest80.seconds)state.accelBest80=metric;
  for(const metric of candidatesForRule(state.accelSlowRule,samples,prev,cur))if(!state.accelSlow80||metric.seconds>state.accelSlow80.seconds)state.accelSlow80=metric;
  samples.push(cur);
  while(samples.length>2&&(samples.length>300||now-samples[0].t>90000))samples.shift();
  renderAccelerationSummary();
}
function renderAccelEditorFields(){
  const mode=$('accelConfigMode');if(!mode)return;
  $('accelDeltaGroup').classList.toggle('hidden',mode.value!=='delta');
  $('accelRangeGroup').classList.toggle('hidden',mode.value!=='range');
}
function openAccelEditor(kind){
  const dialog=$('accelConfigDialog');if(!dialog)return;
  state.accelEditorKind=kind;
  const rule=kind==='fast'?state.accelFastRule:state.accelSlowRule;
  $('accelConfigTitle').textContent=kind==='fast'?'🚀 Hurtigste acceleration':'🐢 Langsomste acceleration';
  $('accelConfigHelp').textContent=kind==='fast'?'RIDEZ finder turens hurtigste sammenhængende acceleration, der matcher din valgte måling.':'RIDEZ finder turens langsomste gyldige sammenhængende acceleration, der matcher din valgte måling.';
  $('accelConfigMode').value=rule.mode;
  $('accelConfigDelta').value=Math.round(rule.delta||80);
  $('accelConfigFrom').value=Math.round(rule.from||0);
  $('accelConfigTo').value=Math.round(rule.to||100);
  renderAccelEditorFields();
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
}
function saveAccelEditor(e){
  e.preventDefault();const kind=state.accelEditorKind||'fast',mode=$('accelConfigMode').value;
  let rule;
  if(mode==='range'){
    const from=Number($('accelConfigFrom').value),to=Number($('accelConfigTo').value);
    if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to-from<10){alert('Sluthastigheden skal være mindst 10 km/t højere end starthastigheden.');return}
    rule={mode:'range',from,to};
  }else{
    const delta=Number($('accelConfigDelta').value);
    if(!Number.isFinite(delta)||delta<10||delta>200){alert('Hastighedsstigningen skal være mellem 10 og 200 km/t.');return}
    rule={mode:'delta',delta};
  }
  saveAccelRule(kind,rule);
  if(state.rideId)resetAccelerationStats();else renderAccelerationSummary();
  const dialog=$('accelConfigDialog');if(dialog&&typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
}
function normalizeDeg(v){while(v>180)v-=360;while(v<-180)v+=360;return v}
function orientationAngle(){const a=(screen.orientation&&Number.isFinite(screen.orientation.angle))?screen.orientation.angle:(Number(window.orientation)||0);return ((a%360)+360)%360}
function rawRollFromOrientation(e){
  const beta=Number(e.beta),gamma=Number(e.gamma);if(!Number.isFinite(beta)||!Number.isFinite(gamma))return null;
  const a=orientationAngle();let roll;
  if(a===90)roll=beta;else if(a===270)roll=-beta;else if(a===180)roll=-gamma;else roll=gamma;
  return Math.max(-90,Math.min(90,roll));
}
function leanLabel(v){const n=Math.round(Math.abs(v||0));if(n<1)return '0°';return `${n}° ${v<0?'V':'H'}`}
function renderLeanSummary(){
  const live=$('leanLive'),left=$('leanLeftMax'),right=$('leanRightMax'),lc=$('leftTurnCount'),rc=$('rightTurnCount');
  if(live)live.textContent=state.demo||state.leanCalibration!==null?leanLabel(state.leanLiveDeg):'Kalibrér';
  if(left)left.textContent=`${Math.round(state.maxLeanLeftDeg)}°`;
  if(right)right.textContent=`${Math.round(state.maxLeanRightDeg)}°`;
  if(lc)lc.textContent=String(state.leftTurnCount);
  if(rc)rc.textContent=String(state.rightTurnCount);
}
const TURN_ENTER_DEG=14;      // Et muligt sving starter først ved tydelig hældning.
const TURN_EXIT_DEG=7;        // Hysterese: svinget afsluttes først tættere på lodret.
const TURN_MIN_PEAK_DEG=17;   // Små vejkurver/rystelser tælles ikke som et sving.
const TURN_MIN_MS=650;        // Hældningen skal være reel og vare lidt tid.
const TURN_REARM_MS=400;      // Efter et sving skal cyklen være nær lodret før samme retning kan tælles igen.
const TURN_MIN_SPEED_MS=2.8;  // Ca. 10 km/t. Ingen sving tælles ved parkering/manøvrering.
function resetLeanStats(){
  state.leanFilteredDeg=0;state.leanLiveDeg=0;state.maxLeanLeftDeg=0;state.maxLeanRightDeg=0;state.leftTurnCount=0;state.rightTurnCount=0;
  state.turnActive=null;state.turnArmed=true;state.turnNeutralSince=null;renderLeanSummary();
}
function finishTurn(now){
  const t=state.turnActive;if(!t)return false;
  const duration=Math.max(0,now-t.startedAt),valid=duration>=TURN_MIN_MS&&t.peak>=TURN_MIN_PEAK_DEG;
  if(valid){if(t.dir==='left')state.leftTurnCount++;else state.rightTurnCount++;}
  state.turnActive=null;state.turnArmed=false;state.turnNeutralSince=null;renderLeanSummary();return valid;
}
function updateLeanStats(rawLean,now=Date.now(),speedMs=state.currentSpeedMs,{demo=false}={}){
  if(!Number.isFinite(rawLean))return;
  // Filtrering dæmper telefon-/vejvibrationer. Demoen må reagere hurtigere, så testen er tydelig.
  const alpha=demo?0.45:0.16;
  state.leanFilteredDeg=state.leanFilteredDeg+(rawLean-state.leanFilteredDeg)*alpha;
  const lean=Math.max(-60,Math.min(60,state.leanFilteredDeg));state.leanLiveDeg=lean;
  const movingFastEnough=Number(speedMs||0)>=TURN_MIN_SPEED_MS;
  if(movingFastEnough){
    if(lean<0)state.maxLeanLeftDeg=Math.max(state.maxLeanLeftDeg,Math.abs(lean));
    if(lean>0)state.maxLeanRightDeg=Math.max(state.maxLeanRightDeg,Math.abs(lean));
  }
  const absLean=Math.abs(lean),dir=lean<0?'left':'right',rearmMs=demo?150:TURN_REARM_MS;
  if(!movingFastEnough){
    if(state.turnActive)finishTurn(now);
    state.turnArmed=false;
    if(absLean<=TURN_EXIT_DEG){
      if(state.turnNeutralSince===null)state.turnNeutralSince=now;
      if(now-state.turnNeutralSince>=rearmMs)state.turnArmed=true;
    }else state.turnNeutralSince=null;
    renderLeanSummary();return;
  }
  if(state.turnActive){
    state.turnActive.peak=Math.max(state.turnActive.peak,absLean);
    // Et tydeligt skift direkte fra venstre til højre (eller omvendt) er et nyt S-sving.
    if(dir!==state.turnActive.dir&&absLean>=TURN_ENTER_DEG){
      finishTurn(now);
      state.turnActive={dir,startedAt:now,peak:absLean};state.turnArmed=false;state.turnNeutralSince=null;
    }else if(absLean<=TURN_EXIT_DEG){
      if(state.turnNeutralSince===null)state.turnNeutralSince=now;
      if(now-state.turnNeutralSince>=rearmMs){finishTurn(now);state.turnArmed=true;state.turnNeutralSince=now;}
    }else state.turnNeutralSince=null;
  }else if(absLean<=TURN_EXIT_DEG){
    if(state.turnNeutralSince===null)state.turnNeutralSince=now;
    if(now-state.turnNeutralSince>=rearmMs)state.turnArmed=true;
  }else{
    state.turnNeutralSince=null;
    if(state.turnArmed&&absLean>=TURN_ENTER_DEG){state.turnActive={dir,startedAt:now,peak:absLean};state.turnArmed=false;}
  }
  renderLeanSummary();
}
function formatCalibrationDeg(v){
  if(!Number.isFinite(v))return '–';
  const n=Math.abs(v)<0.05?0:v;
  return `${n.toFixed(1).replace('.',',')}°`;
}
function updateCalibrationLive(raw=state.lastRawRoll){
  const rawEl=$('calibrationRawValue'),correctedEl=$('calibrationCorrectedValue'),statusEl=$('calibrationReadingStatus'),dot=$('calibrationReadingDot');
  if(!Number.isFinite(raw)){
    if(rawEl)rawEl.textContent='Venter…';
    if(correctedEl)correctedEl.textContent=state.leanCalibration===null?'Kalibrér først':'–';
    if(statusEl)statusEl.textContent='Venter på telefonens hældningssensor…';
    if(dot)dot.className='calibration-reading-dot unknown';
    return;
  }
  const corrected=state.leanCalibration===null?null:normalizeDeg(raw-state.leanCalibration);
  if(rawEl)rawEl.textContent=formatCalibrationDeg(raw);
  if(correctedEl)correctedEl.textContent=corrected===null?'Kalibrér først':formatCalibrationDeg(corrected);
  const check=corrected===null?raw:corrected,abs=Math.abs(check);
  const level=abs<=2?'good':abs<=5?'warn':'bad';
  if(dot)dot.className=`calibration-reading-dot ${level}`;
  if(statusEl){
    if(state.leanCalibration===null){
      statusEl.textContent=level==='good'?'Telefonen står tæt på 0° – klar til kalibrering.':level==='warn'?'Telefonen står lidt skævt. Hold motorcyklen oprejst og kalibrér.':'Telefonen afviger tydeligt fra 0°. Det er netop denne vinkel, kalibreringen vil gemme som nulpunkt.';
    }else{
      statusEl.textContent=level==='good'?'Godt – korrigeret måling ligger tæt på 0°.':level==='warn'?'Lille afvigelse fra nulpunktet.':'Tydelig afvigelse fra nulpunktet – kontrollér at motorcyklen står oprejst eller kalibrér igen.';
    }
  }
}
function updateCalibrationStatus(text){
  const el=$('calibrationStatus'),panel=$('settingsPanel');
  const calibrated=state.leanCalibration!==null;
  if(el)el.textContent=text||(calibrated?'Kalibreret ✓':'Ikke kalibreret');
  if(panel){
    panel.classList.toggle('calibration-ok',calibrated);
    panel.classList.toggle('calibration-missing',!calibrated);
    panel.classList.toggle('calibration-working',!!text&&text.includes('oprejst'));
  }
}
function onDeviceOrientation(e){
  const raw=rawRollFromOrientation(e);if(raw===null)return;state.lastRawRoll=raw;updateCalibrationLive(raw);
  if(state.calibrating)state.calibrationSamples.push(raw);
  if(state.demo||state.leanCalibration===null)return;
  const lean=normalizeDeg(raw-state.leanCalibration);updateLeanStats(lean,Date.now(),state.currentSpeedMs);
}
async function ensureOrientationPermission(){
  if(typeof DeviceOrientationEvent==='undefined')throw new Error('Telefonen giver ikke adgang til hældningssensoren i denne browser.');
  if(typeof DeviceOrientationEvent.requestPermission==='function'){
    const result=await DeviceOrientationEvent.requestPermission();if(result!=='granted')throw new Error('Adgang til bevægelsessensor blev ikke tilladt.');
  }
  if(!state.orientationBound){window.addEventListener('deviceorientation',onDeviceOrientation,true);state.orientationBound=true;}
}
async function calibratePhone(){
  if(state.moving){alert('Kalibrering kan kun udføres, når motorcyklen holder stille.');return}
  const btn=$('calibrateBtn');if(btn){btn.disabled=true;btn.textContent='Kalibrerer…'}
  try{
    await ensureOrientationPermission();state.calibrationSamples=[];state.calibrating=true;updateCalibrationStatus('Hold motorcyklen helt oprejst…');
    await new Promise(r=>setTimeout(r,2200));state.calibrating=false;
    const a=state.calibrationSamples.filter(Number.isFinite);if(a.length<4)throw new Error('Der kom ikke nok sensordata. Sørg for, at telefonens bevægelsessensor er tilladt, og prøv igen.');
    // Trim de yderste målinger, så et enkelt ryk ikke flytter nulpunktet.
    a.sort((x,y)=>x-y);const trim=Math.floor(a.length*.15),use=a.slice(trim,a.length-trim||a.length);const avg=use.reduce((s,x)=>s+x,0)/use.length;
    state.leanCalibration=avg;localStorage.setItem('ridez_lean_calibration',String(avg));state.leanFilteredDeg=0;state.leanLiveDeg=0;updateCalibrationStatus('Kalibreret ✓');updateCalibrationLive(state.lastRawRoll);renderLeanSummary();
  }catch(e){state.calibrating=false;updateCalibrationStatus('Kalibrering mislykkedes');alert(e.message||'Kalibrering mislykkedes.');}
  finally{if(btn){btn.disabled=false;btn.textContent='Kalibrer telefon'}}
}
function initLeanSensor(){
  updateCalibrationStatus();updateCalibrationLive();renderLeanSummary();
  // Android/Chrome tillader normalt dette direkte. iPhone aktiveres via knappen pga. krav om brugertryk.
  if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission!=='function'&&!state.orientationBound){window.addEventListener('deviceorientation',onDeviceOrientation,true);state.orientationBound=true;}
}
function demoLean(type,t,total,speedMs){
  if(speedMs<2.8)return 0;
  if(type==='turntest'){
    // Seks tydelige sving: V/H/V/H/V/H. Neutralzone mellem hvert sving tester anti-dobbelttælling.
    const cycle=3.3,idx=Math.floor(t/cycle),x=t-idx*cycle;
    if(idx>=6||x<0.45||x>2.75)return 0;
    const p=(x-0.45)/2.30,sign=idx%2===0?-1:1;
    return sign*32*Math.sin(Math.PI*Math.max(0,Math.min(1,p)));
  }
  if(type==='rightturntest'){
    // Fem tydelige højresving på 20 sekunder. Hvert sving har en klar neutralzone,
    // så højresvingstælleren skal ende på præcis 5 og venstresving på 0.
    const cycle=4.0,idx=Math.floor(t/cycle),x=t-idx*cycle;
    if(idx>=5||x<0.45||x>2.00)return 0;
    const p=(x-0.45)/1.55;
    return 38*Math.sin(Math.PI*Math.max(0,Math.min(1,p)));
  }
  if(type==='speed')return 4*Math.sin(t*1.4);
  if(type==='twisty'){
    // Hold motorcyklen omtrent lige under de to accelerationstests; derefter simuleres sving normalt.
    if((t>=3&&t<12)||(t>=44&&t<62))return 0;
    return 42*Math.sin(t*0.78)+5*Math.sin(t*1.7);
  }
  if(type==='country')return 25*Math.sin(t*0.42)+3*Math.sin(t*1.15);
  if(type==='city')return 24*Math.sin(t*0.62);
  return 24*Math.sin(t*0.48);
}
function updateRideStats(now,speed){state.maxSpeedMs=Math.max(state.maxSpeedMs,Math.max(0,speed||0));if(state.statsLastT!==null){const dt=Math.max(0,Math.min(now-state.statsLastT,15000));if(speed>C.STOPPED_THRESHOLD_MS)state.movingMs+=dt;else state.stoppedMs+=dt}state.statsLastT=now;const top=$('topSpeedValue'),moving=$('movingTimeValue'),stopped=$('stoppedTimeValue');if(top)top.textContent=fmtSpeed(state.maxSpeedMs);if(moving)moving.textContent=fmtDuration(state.movingMs/1000);if(stopped)stopped.textContent=fmtDuration(state.stoppedMs/1000)}
async function rpc(name,args){const{data,error}=await db.rpc(name,args);if(error)throw error;return data}
function resetDriverTripDisplay({clearMarker=true}={}){resetAccelerationStats();resetLeanStats();state.currentSpeedMs=0;state.lastPos=null;state.lastUpload=0;state.distanceM=0;state.moving=false;state.stoppedSince=null;state.maxSpeedMs=0;state.movingMs=0;state.stoppedMs=0;state.statsLastT=null;if(state.topSpeedUpdateTimer){clearTimeout(state.topSpeedUpdateTimer);state.topSpeedUpdateTimer=null}state.points=[];state.messagesSeen=new Set();clearActivePhotoMarkers();if(state.line&&state.map){state.map.removeLayer(state.line);state.line=null}if(clearMarker&&state.marker&&state.map){state.map.removeLayer(state.marker);state.marker=null}$('speedValue').textContent='0 km/t';applySpeedColor($('speedValue'),0);$('distanceValue').textContent='0,0 km';if($('topSpeedValue'))$('topSpeedValue').textContent='0 km/t';if($('movingTimeValue'))$('movingTimeValue').textContent='0 sek.';if($('stoppedTimeValue'))$('stoppedTimeValue').textContent='0 sek.';$('messageCount').textContent='0';const el=$('messagesList');if(el){el.className='empty';el.textContent='Ingen beskeder endnu.'}}
function setRideButtons(active){$('startBtn').classList.toggle('hidden',active);$('stopBtn').classList.toggle('hidden',!active);$('shareBtn').classList.toggle('hidden',!active);const photos=$('photoActions');if(photos)photos.classList.toggle('hidden',!active);$('demoBtn').disabled=active&&!state.demo;$('demoType').disabled=active;if(!active){const fb=$('photoFeedback');if(fb)fb.textContent=''}}
async function createRide(title){state.driverToken=token();state.publicToken=token();state.rideStartedAt=Date.now();localStorage.setItem('ridez_driver_token',state.driverToken);ensureOwnerToken();try{state.rideId=await rpc('ridez_create_ride_v16',{p_owner_token:state.ownerToken,p_driver_token:state.driverToken,p_public_token:state.publicToken,p_title:title})}catch(e){console.error(e);throw new Error('Historik v17 er ikke aktiveret i Supabase endnu. Kør først v16-migrationen og derefter supabase-historik-v17.sql én gang.')}setRideButtons(true);pollMessages()}
async function startRide(){if(!navigator.geolocation){alert('GPS understøttes ikke på denne enhed.');return}stopDemoTimer();state.demo=false;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');resetDriverTripDisplay({clearMarker:true});resetSpeedDemoResults(false);await createRide('RIDEZ live-tur');$('rideStatus').textContent='Starter GPS…';state.watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
function onGeoError(e){$('statusDetail').textContent=`GPS-fejl: ${e.message}`}
async function processPosition(cur,speed,accuracy=5){const now=cur.t||Date.now();if(state.lastPos){const dist=hav(state.lastPos,cur);if(dist<1000&&accuracy<80)state.distanceM+=dist}speed=Math.max(0,speed||0);state.currentSpeedMs=speed;const newTop=speed>state.maxSpeedMs+0.05;updateRideStats(now,speed);updateAccelerationStats(now,speed);if(newTop)schedulePublicTopSpeed();if(speed>=C.MOVING_THRESHOLD_MS){state.stoppedSince=null;setMotion(true)}else if(speed<=C.STOPPED_THRESHOLD_MS){if(!state.stoppedSince)state.stoppedSince=now;if(now-state.stoppedSince>=C.STATIONARY_SECONDS*1000)setMotion(false)}state.lastPos=cur;$('speedValue').textContent=fmtSpeed(speed);applySpeedColor($('speedValue'),speed);$('distanceValue').textContent=`${(state.distanceM/1000).toFixed(1).replace('.',',')} km`;updateMap(cur.lat,cur.lng,true);if(now-state.lastUpload>=C.LOCATION_UPLOAD_MS){state.lastUpload=now;try{await rpc('ridez_update_location',{p_driver_token:state.driverToken,p_lat:cur.lat,p_lng:cur.lng,p_speed_ms:speed,p_moving:state.moving,p_accuracy_m:accuracy});await publishLiveStats()}catch(e){console.error(e)}}}
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
  state.demoPrevTimeS=0;
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
function syncSpeedDemoToAccelerationSummary(){renderAccelerationSummary();}
function renderSpeedDemoResults(currentSpeedMs=0){
  const attempts=state.speedDemoAttempts;
  const active=state.speedDemoAttempt;
  const completed80=attempts.filter(a=>Number.isFinite(a.t80));
  const completed100=attempts.filter(a=>Number.isFinite(a.t100));
  const best80=completed80.reduce((m,a)=>Math.min(m,a.t80),Infinity);
  const best100=completed100.reduce((m,a)=>Math.min(m,a.t100),Infinity);
  syncSpeedDemoToAccelerationSummary();
  const el80=$('speedBest80'),el100=$('speedBest100'),top=$('speedDemoTop'),live=$('speedDemoLive'),list=$('speedAttemptList');
  if(el80)el80.textContent=Number.isFinite(best80)?formatAccel(best80):'–';
  if(el100)el100.textContent=Number.isFinite(best100)?formatAccel(best100):'–';
  if(top)top.textContent=fmtSpeed(Math.max(state.maxSpeedMs,currentSpeedMs||0));
  if(live){
    if(active){
      const n=attempts.length+1;
      if(Number.isFinite(active.t100)) live.textContent=`Forsøg ${n}/3 · 0–80 km/t: ${formatAccel(active.t80)} · 0–100 km/t: ${formatAccel(active.t100)}`;
      else if(Number.isFinite(active.t80)) live.textContent=`Forsøg ${n}/3 · 0–80 km/t: ${formatAccel(active.t80)} · måler 0–100 km/t…`;
      else live.textContent=`Forsøg ${n}/3 · ACCELERERER…`;
      live.classList.add('measuring');
    }else{
      live.classList.remove('measuring');
      if(attempts.length>=3) live.textContent='FÆRDIG · 3 accelerationer målt';
      else if(attempts.length) live.textContent=`Forsøg ${attempts.length} gemt · klar til ${attempts.length+1}/3`;
      else live.textContent='Klar til første acceleration';
    }
  }
  if(list){
    if(!attempts.length){list.innerHTML='<div class="empty">0–80 km/t og 0–100 km/t vises straks, når grænsen passeres.</div>';return;}
    list.innerHTML=attempts.map((a,idx)=>`<div class="speed-attempt"><strong>Forsøg ${idx+1}</strong><span>0–80 km/t: <b>${formatAccel(a.t80)}</b></span><span>0–100 km/t: <b>${formatAccel(a.t100)}</b></span><span>Top: <b>${Math.round(a.topMs*3.6)} km/t</b></span></div>`).join('');
  }
}
function updateSpeedDemoAttempt(t,speedMs){
  const prev=state.demoPrevSpeedMs||0;
  const prevT=Number.isFinite(state.demoPrevTimeS)?state.demoPrevTimeS:t;
  const stop=C.STOPPED_THRESHOLD_MS||0.8;
  if(!state.speedDemoAttempt && prev<=stop && speedMs>stop && state.speedDemoAttempts.length<3){
    state.speedDemoAttempt={startT:prevT,t80:null,t100:null,topMs:speedMs};
  }
  const a=state.speedDemoAttempt;
  if(a){
    a.topMs=Math.max(a.topMs,speedMs);
    const prevK=prev*3.6,curK=speedMs*3.6;
    const cross=(target)=>{
      if(curK<=prevK||prevK>=target||curK<target)return null;
      const span=Math.max(0.001,t-prevT);
      const f=(target-prevK)/(curK-prevK);
      return prevT+span*Math.max(0,Math.min(1,f));
    };
    if(a.t80===null){const ct=cross(80);if(ct!==null)a.t80=Math.max(0,ct-a.startT)}
    if(a.t100===null){const ct=cross(100);if(ct!==null)a.t100=Math.max(0,ct-a.startT)}
    if(speedMs<=stop && prev>stop){
      state.speedDemoAttempts.push(a);
      state.speedDemoAttempt=null;
    }
  }
  state.demoPrevSpeedMs=speedMs;
  state.demoPrevTimeS=t;
  renderSpeedDemoResults(speedMs);
}
function demoSpeed(type,i,total){
  if(type==='policereplay'){
    // v59: Hurtig test af Replay-politiet. 0-10 s accelererer til 135 km/t,
    // 10-30 s holdes 135 km/t (tydeligt over 130), 30-40 s bremses roligt ned til 0.
    if(i<10)return (135/3.6)*(i/10);
    if(i<30)return 135/3.6;
    if(i<40)return Math.max(0,(135/3.6)*(1-(i-30)/10));
    return 0;
  }
  if(type==='speedcolors'){
    // v49: Farvedemo. Farven skifter KUN fordi hastigheden krydser de normale tærskler.
    // 0-20 s: 60 km/t (grøn), 20-40 s: 100 km/t (gul),
    // 40-60 s: 140 km/t (rød), 60-80 s: 160 km/t (kraftigt blinkende rød).
    if(i<20)return 60/3.6;
    if(i<40)return 100/3.6;
    if(i<60)return 140/3.6;
    return 160/3.6;
  }
  if(type==='speed'){
    // v35: Tre komplette accelerationer på ca. 18 sekunder i alt.
    // Hvert forsøg: kort stilstand -> hurtig 0-120/130+ -> kort hold -> nedbremsning -> stop.
    const cycleLen=6.0;
    const attempt=Math.min(2,Math.floor(i/cycleLen));
    const x=i-attempt*cycleLen;
    const targets=[34.0,36.0,38.0]; // ca. 122, 130 og 137 km/t
    const target=targets[attempt];
    if(x<0.7)return 0;
    if(x<3.5)return target*((x-0.7)/2.8);
    if(x<4.1)return target;
    if(x<5.1)return Math.max(0,target*(1-(x-4.1)/1.0));
    return 0;
  }
  if(type==='turntest'||type==='rightturntest'){if(i<0.5||i>total-0.5)return 0;return 50/3.6;}
  if(type==='short'){if(i<4||i>total-5)return 0;if(i<10)return 4+(i-4)*1.8;if(i<22)return 14;if(i<27)return 0;if(i<38)return 20;if(i<43)return 4;return 12}
  if(type==='city'){const cycle=i%24;if(cycle<5)return 0;if(cycle<10)return 4+cycle;if(cycle<18)return 10;if(cycle<22)return 5;return 0}
  if(type==='twisty'){
    // v39: Snoet demo tester både lean/sving og de almindelige accelerationsbokse.
    // Først en tydelig hurtig 0-108 km/t acceleration, senere en langsommere 0-108 km/t.
    if(i<3||i>total-5)return 0;
    if(i<8)return 30*((i-3)/5);                 // 0 -> 108 km/t på 5 sek.
    if(i<12)return 30-(i-8)*3.5;               // roligt ned til ca. 58 km/t
    if(i>=44&&i<48)return Math.max(0,16-(i-44)*4); // stop før andet forsøg
    if(i>=48&&i<58)return 30*((i-48)/10);       // 0 -> 108 km/t på 10 sek.
    if(i>=58&&i<62)return 30-(i-58)*3.5;
    const phase=i%20;
    if(phase<5)return 10+phase*1.4;
    if(phase<12)return 17+3*Math.sin(i/2.5);
    if(phase<16)return 12;
    return 15;
  }
  const phase=i%36;if(i<4||i>total-5)return 0;if(phase<8)return 8+phase*1.8;if(phase<28)return 22+6*Math.sin(i/4);return 10
}
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
  if(type==='speedcolors') return [start,bognaes,kattinge,brewery,start];
  if(type==='policereplay') return [start,bognaes,kattinge,brewery,start];
  if(type==='turntest') return [start,brewery,bognaes,start];
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
async function startDemo(){
  if(state.rideId){alert('Afslut den aktive tur først.');return}
  resetDriverTripDisplay({clearMarker:true});
  state.demo=true;state.demoIndex=0;state.demoTravelM=0;state.demoProfile=$('demoType').value;
  $('demoBadge').textContent='DEMO v71';$('demoBadge').classList.remove('hidden');
  $('demoBtn').textContent='Stop demo';$('demoBtn').classList.add('active');
  $('rideStatus').textContent='Klargør demo…';
  $('statusDetail').textContent='Demo v66 henter din GPS-position og låser rutestarten til en vej højst 120 m væk.';
  try{
    const gpsBase=await getDemoBase();
    state.demoBase=await snapDemoBaseToRoad(gpsBase);
    $('rideStatus').textContent='Finder vej-rute…';
    $('statusDetail').textContent=`Starter på ${state.demoBase.name||'Toftevej, Herslev'} og følger vejnettet.`;
    state.demoRoute=await buildRoadDemoRoute(state.demoBase,state.demoProfile);
  }catch(e){
    state.demo=false;state.demoBase=null;state.demoRoute=null;
    $('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');
    $('rideStatus').textContent='Ikke startet';$('statusDetail').textContent=e.message||'Kunne ikke finde en vej-rute til demoen.';
    throw e;
  }
  const demoName=state.demoProfile==='short'?'kort test':state.demoProfile==='city'?'bykørsel':state.demoProfile==='twisty'?'snoet tur':state.demoProfile==='speed'?'speed':state.demoProfile==='speedcolors'?'hastighedsfarver':state.demoProfile==='turntest'?'svingtest':state.demoProfile==='rightturntest'?'5 højresving':state.demoProfile==='policereplay'?'raket Replay-test':'landevej';
  await createRide(`RIDEZ demo · ${demoName}`);
  await publishDemoChannel();
  $('rideStatus').textContent='Demo starter…';
  const isSpeed=state.demoProfile==='speed';
  const isSpeedColors=state.demoProfile==='speedcolors';
  const isTurnTest=state.demoProfile==='turntest';
  const isRightTurnTest=state.demoProfile==='rightturntest';
  const isPoliceReplay=state.demoProfile==='policereplay';
  $('statusDetail').textContent=isSpeed
    ?'Speed-demo: 3 accelerationer gennemføres på ca. 18 sekunder.'
    :isSpeedColors
      ?'Hastighedsfarver: 20 sek. grøn, 20 sek. gul, 20 sek. rød og 20 sek. kraftigt blinkende rød.'
      :isTurnTest
        ?'Svingtest: 6 tydelige sving (3 venstre + 3 højre) på ca. 22 sekunder. Små udsving skal ignoreres.'
        :isRightTurnTest
          ?'Højresvingtest: 5 tydelige højresving på ca. 20 sekunder. Venstresving skal blive på 0.'
          :isPoliceReplay
            ?'Raket Replay-test: 10 sek. op til 135 km/t, 20 sek. ved 135 km/t og derefter rolig nedbremsning. Åbn turen i Historik og start Replay bagefter.'
            :`Starter på ${state.demoBase.name||'Toftevej, Herslev'} og simulerer hastighed og stop.`;
  const total=isSpeed?18:isSpeedColors?80:isTurnTest?22:isRightTurnTest?20:isPoliceReplay?40:state.demoProfile==='short'?60:state.demoProfile==='city'?90:state.demoProfile==='twisty'?110:90;
  const tickMs=isSpeed?200:(isTurnTest||isRightTurnTest)?250:1000;
  const stepS=tickMs/1000;
  if(isSpeed)resetSpeedDemoResults(true);else resetSpeedDemoResults(false);
  async function tick(){
    if(!state.demo||!state.rideId)return;
    const step=state.demoIndex++;
    const t=(isSpeed||isTurnTest||isRightTurnTest)?step*stepS:step;
    const speed=demoSpeed(state.demoProfile,t,total);
    if(isSpeed)updateSpeedDemoAttempt(t,speed);
    state.demoTravelM+=speed*((isSpeed||isTurnTest||isRightTurnTest)?stepS:1);
    const cur=demoPointAt(state.demoRoute,state.demoTravelM);
    if(!cur){await stopRide();return}
    updateLeanStats(demoLean(state.demoProfile,t,total,speed),cur.t,speed,{demo:true});
    if(isSpeed){processPosition(cur,speed,4).catch(e=>console.error(e));}
    else await processPosition(cur,speed,4);
    if(t>=total||state.demoTravelM>=state.demoRoute.total-5){
      // If the final stop just completed, preserve the third attempt before ending.
      if(isSpeed&&state.speedDemoAttempt){
        const a=state.speedDemoAttempt;
        if(speed<=C.STOPPED_THRESHOLD_MS){state.speedDemoAttempts.push(a);state.speedDemoAttempt=null;renderSpeedDemoResults(speed)}
      }
      await stopRide();return;
    }
    state.demoTimer=setTimeout(tick,tickMs);
  }
  await tick();
}
async function stopRide(){
  if(state.watchId!==null)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;stopDemoTimer();
  try{await flushPublicTopSpeed()}catch(e){console.warn(e)}
  const finishedDistance=state.distanceM,
    finishedDuration=state.rideStartedAt?Math.max(0,Math.round((Date.now()-state.rideStartedAt)/1000)):0,
    finishedMoving=Math.max(0,Math.round(state.movingMs/1000)),
    finishedStopped=Math.max(0,Math.round(state.stoppedMs/1000)),
    finishedMaxSpeed=Math.max(0,state.maxSpeedMs),
    best80=state.accelBest80,slow80=state.accelSlow80;
  finishTurn(Date.now());
  const finishedLeanLeft=Math.max(0,state.maxLeanLeftDeg),finishedLeanRight=Math.max(0,state.maxLeanRightDeg),
    finishedTurnsLeft=Math.max(0,state.leftTurnCount),finishedTurnsRight=Math.max(0,state.rightTurnCount);
  try{
    if(state.driverToken)await rpc('ridez_end_ride_v38',{
      p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,
      p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped,
      p_accel_0_80_s:state.accelBest080,p_accel_0_100_s:state.accelBest0100,
      p_accel_best_80_s:best80?best80.seconds:null,p_accel_best_80_start_kmh:best80?best80.startKmh:null,p_accel_best_80_end_kmh:best80?best80.endKmh:null,
      p_accel_slowest_80_s:slow80?slow80.seconds:null,p_accel_slowest_80_start_kmh:slow80?slow80.startKmh:null,p_accel_slowest_80_end_kmh:slow80?slow80.endKmh:null,
      p_max_lean_left_deg:finishedLeanLeft,p_max_lean_right_deg:finishedLeanRight,p_turn_left_count:finishedTurnsLeft,p_turn_right_count:finishedTurnsRight
    })
  }catch(e){
    console.error(e);
    try{if(state.driverToken)await rpc('ridez_end_ride_v36',{p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped,p_accel_0_80_s:state.accelBest080,p_accel_0_100_s:state.accelBest0100,p_accel_best_80_s:best80?best80.seconds:null,p_accel_best_80_start_kmh:best80?best80.startKmh:null,p_accel_best_80_end_kmh:best80?best80.endKmh:null,p_accel_slowest_80_s:slow80?slow80.seconds:null,p_accel_slowest_80_start_kmh:slow80?slow80.startKmh:null,p_accel_slowest_80_end_kmh:slow80?slow80.endKmh:null})}
    catch(e0){console.error(e0);try{if(state.driverToken)await rpc('ridez_end_ride_v19',{p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped})}
    catch(e2){console.error(e2);try{if(state.driverToken)await rpc('ridez_end_ride_v18',{p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped})}catch(e3){console.error(e3)}}}
  }
  resetDriverTripDisplay({clearMarker:true});state.rideId=null;state.publicToken=null;state.driverToken=null;state.rideStartedAt=null;localStorage.removeItem('ridez_driver_token');state.demo=false;state.demoIndex=0;state.demoBase=null;state.demoProfile=null;state.demoRoute=null;state.demoTravelM=0;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');setRideButtons(false);$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent='Start en tur for at dele din position.';setMotion(false);$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent='Start en tur for at dele din position.';await loadHistory()
}
async function shareRide(){const url=state.demo?`${location.origin}${location.pathname}?demo=${encodeURIComponent(ensureDemoChannelToken())}`:`${location.origin}${location.pathname}?ride=${encodeURIComponent(state.publicToken)}`;const text=state.demo?'Følg mine RIDEZ-demoer live på det samme link':'Følg min motorcykeltur live på RIDEZ';if(navigator.share){try{await navigator.share({title:'Følg min RIDEZ-tur',text,url});return}catch(e){}}await navigator.clipboard.writeText(url);alert(state.demo?'Fast demo-følgelink kopieret. Det samme link kan bruges til kommende demo-ture.':'Følgelink kopieret.')}
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
  let photoPaths=[];
  try{const photos=await rpc('ridez_history_photos',{p_owner_token:state.ownerToken,p_ride_id:rideId});photoPaths=(photos||[]).map(p=>p.storage_path).filter(Boolean)}catch(e){console.warn('Kunne ikke hente billedstier før sletning',e)}
  const deleted=await rpc('ridez_delete_history_ride_v17',{p_owner_token:state.ownerToken,p_ride_id:rideId});
  if(!deleted)throw new Error('Turen kunne ikke slettes');
  if(photoPaths.length){try{const {error}=await db.storage.from('ridez-photos').remove(photoPaths);if(error)console.warn('Billedfiler kunne ikke slettes',error)}catch(e){console.warn(e)}}
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
    const rows=await rpc('ridez_history_v38',{p_owner_token:state.ownerToken}).catch(()=>rpc('ridez_history_v36',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v18',{p_owner_token:state.ownerToken}));
    const visibleRows=rows.filter(r=>!isEmptyRide(r));
    if(!visibleRows.length){list.className='history-list empty';list.textContent='Ingen afsluttede ture endnu.';state.selectedRideIds.clear();state.historySelectMode=false;updateHistorySelectionUi();return}
    list.innerHTML=visibleRows.map(r=>{
      const avgMoving=Number(r.avg_moving_speed_ms||0)*3.6,top=Number(r.max_speed_ms||0)*3.6;
      return `<div class="history-item" data-ride-id="${r.ride_id}"><button class="history-swipe-delete" type="button" aria-label="Slet tur">Slet</button><div class="history-slide"><label class="history-select-wrap" aria-label="Vælg tur"><input class="history-select-check" type="checkbox"><span></span></label><button class="history-card" type="button"><div><strong>${fmtDate(r.created_at)}</strong><span>${escapeHtml(r.title||'RIDEZ tur')}</span></div><div class="history-summary"><b>${(Number(r.distance_m||0)/1000).toFixed(1).replace('.',',')} km</b><span>${fmtDuration(r.duration_s)}</span><span>Top ${top.toFixed(0)} km/t</span><span>Gns. ${avgMoving.toFixed(0)} km/t</span><span>📷 ${Number(r.photo_count||0)}</span></div></button></div></div>`
    }).join('');
    list.querySelectorAll('.history-item').forEach(bindHistoryItem);
    updateHistorySelectionUi();
  }catch(e){console.error(e);list.className='history-list empty';list.textContent='Historik kunne ikke hentes. Kontroller at SQL-opdateringen til Lean & Sving v38 er kørt i Supabase.'}
}
// RIDEZ Replay v58
function replayMotorcycleIcon(){return L.divIcon({className:'ridez-replay-marker-wrap',html:'<div class="ridez-replay-marker">🏍️</div>',iconSize:[44,44],iconAnchor:[22,22]})}
function replayPoliceIcon(speedKmh){
  const s=Math.max(0,Math.round(Number(speedKmh)||0));
  return L.divIcon({className:'ridez-rocket-marker-wrap',html:`<div class="ridez-rocket-marker"><span class="rocket-flame" aria-hidden="true">🔥</span><span class="rocket-body" aria-hidden="true">🚀</span><b>TOPFART ${s} km/t</b></div>`,iconSize:[118,70],iconAnchor:[59,35]});
}
function replaySoundIsActive(){return !!state.soundsEnabled}
function syncSoundSettingsUi(){
  const master=$('settingsSoundsEnabled'),masterStatus=$('settingsSoundsEnabledStatus');
  if(master)master.checked=state.soundsEnabled;
  if(masterStatus)masterStatus.textContent=state.soundsEnabled?'Til':'Fra';
}
function setSoundsEnabled(enabled,persist=true){
  state.soundsEnabled=!!enabled;
  if(persist)localStorage.setItem('ridez_sounds_enabled',state.soundsEnabled?'1':'0');
  if(!state.soundsEnabled)stopReplayPoliceSound();
  syncSoundSettingsUi();
}
function initSoundSettings(){
  const master=$('settingsSoundsEnabled');
  syncSoundSettingsUi();
  if(master)master.addEventListener('change',()=>setSoundsEnabled(master.checked,true));
}
function stopReplayPoliceSound(){
  if(state.replayPoliceAudioSource){try{state.replayPoliceAudioSource.stop()}catch(e){}state.replayPoliceAudioSource=null}
}
async function armReplayPoliceAudio(){
  if(!replaySoundIsActive())return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    if(!state.replayAudioCtx)state.replayAudioCtx=new AC();
    if(state.replayAudioCtx.state==='suspended')await state.replayAudioCtx.resume().catch(()=>{});
    if(!state.replayPoliceAudioBuffer){
      const res=await fetch('./RIDEZ_Sportsbike_4-8sek.wav?v=71',{cache:'force-cache'});
      if(!res.ok)throw new Error('Kunne ikke hente motorcykellyden');
      const raw=await res.arrayBuffer();
      state.replayPoliceAudioBuffer=await state.replayAudioCtx.decodeAudioData(raw.slice(0));
    }
  }catch(e){console.warn('Motorcykellyd kunne ikke klargøres',e)}
}
async function playReplayPoliceSound(){
  if(!replaySoundIsActive())return;
  try{
    await armReplayPoliceAudio();
    const ctx=state.replayAudioCtx,buffer=state.replayPoliceAudioBuffer;
    if(!ctx||!buffer)return;
    stopReplayPoliceSound();
    if(ctx.state==='suspended')await ctx.resume().catch(()=>{});
    const source=ctx.createBufferSource();
    const gain=ctx.createGain();
    gain.gain.value=1.0;
    source.buffer=buffer;
    source.connect(gain);gain.connect(ctx.destination);
    source.onended=()=>{if(state.replayPoliceAudioSource===source)state.replayPoliceAudioSource=null};
    state.replayPoliceAudioSource=source;
    source.start(0);
  }catch(e){console.warn('Motorcykellyd kunne ikke afspilles',e)}
}
function replayPoliceTrailingLatLng(index,trailMeters=12){
  const track=state.historyTrack||[];if(!track.length)return null;
  let i=Math.max(0,Math.min(Number(index)||0,track.length-1)),remaining=Math.max(0,trailMeters);
  let cur=track[i];
  for(;i>0;i--){
    const prev=track[i-1],seg=hav(cur,prev);
    if(Number.isFinite(seg)&&seg>0&&seg>=remaining){
      const f=remaining/seg;
      return [cur.lat+(prev.lat-cur.lat)*f,cur.lng+(prev.lng-cur.lng)*f];
    }
    if(Number.isFinite(seg))remaining-=seg;
    cur=prev;
  }
  return [cur.lat,cur.lng];
}
function updateReplayPolicePosition(){
  if(!state.replayPoliceMarker)return;
  const ll=replayPoliceTrailingLatLng(state.replayIndex,8);if(ll)state.replayPoliceMarker.setLatLng(ll);
}
function clearReplayPolice(){
  if(state.replayPoliceTimer){clearTimeout(state.replayPoliceTimer);state.replayPoliceTimer=null}
  if(state.historyMap&&state.replayPoliceMarker){try{state.historyMap.removeLayer(state.replayPoliceMarker)}catch(e){}}
  state.replayPoliceMarker=null;stopReplayPoliceSound();
}
function prepareReplayPoliceTrigger(){
  state.replayPoliceTriggered=false;state.replayPoliceIndex=-1;clearReplayPolice();
  let maxKmh=0,maxIndex=-1;
  state.historyTrack.forEach((p,i)=>{const kmh=Math.max(0,Number(p.speed_ms||0)*3.6);if(kmh>maxKmh){maxKmh=kmh;maxIndex=i}});
  if(maxKmh>130)state.replayPoliceIndex=maxIndex;
}
function triggerReplayPolice(p){
  if(state.replayPoliceTriggered||!p||!state.historyMap)return;
  state.replayPoliceTriggered=true;
  const kmh=Math.max(0,Number(p.speed_ms||0)*3.6),latlng=replayPoliceTrailingLatLng(state.replayIndex,8)||[p.lat,p.lng];
  state.replayPoliceMarker=L.marker(latlng,{icon:replayPoliceIcon(kmh),zIndexOffset:2200,interactive:false}).addTo(state.historyMap);
  playReplayPoliceSound();
  const status=$('historyReplayStatus');if(status)status.textContent=`🚀 Topfart ${Math.round(kmh)} km/t · raketten følger tæt bag motorcyklen`;
  state.replayPoliceTimer=setTimeout(()=>{if(state.historyMap&&state.replayPoliceMarker){try{state.historyMap.removeLayer(state.replayPoliceMarker)}catch(e){}}state.replayPoliceMarker=null;state.replayPoliceTimer=null;stopReplayPoliceSound()},9000);
}
function prepareReplayTrack(track){
  let cum=0,firstTs=null,prev=null;
  return (track||[]).map((p,i)=>{
    const lat=Number(p.lat),lng=Number(p.lng),tsRaw=new Date(p.created_at).getTime();
    const ts=Number.isFinite(tsRaw)?tsRaw:(firstTs===null?Date.now():firstTs+i*3000);
    if(firstTs===null)firstTs=ts;
    const cur={lat,lng};if(prev&&Number.isFinite(lat)&&Number.isFinite(lng))cum+=hav(prev,cur);prev=cur;
    return {...p,lat,lng,replayTs:ts,replayElapsedS:Math.max(0,(ts-firstTs)/1000),replayDistanceM:cum};
  }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
}
function setReplayControls(mode='ready'){
  const start=$('historyReplayStart'),pause=$('historyReplayPause'),stop=$('historyReplayStop');
  if(!start||!pause||!stop)return;
  const hasTrack=state.historyTrack.length>1;
  start.disabled=!hasTrack||mode==='running'||mode==='paused';
  pause.disabled=!hasTrack||!(mode==='running'||mode==='paused');
  stop.disabled=!hasTrack||mode==='ready';
  start.textContent=mode==='finished'?'↻ Start igen':'▶ Start Replay';
  pause.textContent=mode==='paused'?'▶ Fortsæt':'⏸ Pause';
}
function setReplaySpeedFactor(factor){
  const next=[1,2,5,10].includes(Number(factor))?Number(factor):2;
  state.replaySpeedFactor=next;
  localStorage.setItem('ridez_replay_speed',String(next));
  document.querySelectorAll('.replay-rate-button').forEach(btn=>{
    const active=Number(btn.dataset.replayRate)===next;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
  });
  const status=$('historyReplayStatus');
  if(state.replayRunning&&!state.replayPaused){
    if(state.replayTimer){clearTimeout(state.replayTimer);state.replayTimer=null}
    if(status)status.textContent=`Replay · ${state.replaySpeedFactor}× hastighed`;
    scheduleReplayNext();
  }else if(state.replayPaused){
    if(status)status.textContent=`Replay er sat på pause · ${state.replaySpeedFactor}× valgt.`;
  }else if(status&&state.historyTrack.length>1){
    status.textContent=`Klar · ${state.replaySpeedFactor}× hastighed valgt.`;
  }
}
function syncReplaySpeedButtons(){setReplaySpeedFactor(state.replaySpeedFactor)}
function updateReplayLive(p,index){
  if(!p)return;
  const speed=$('historyReplaySpeed'),distance=$('historyReplayDistance'),elapsed=$('historyReplayElapsed'),status=$('historyReplayStatus');
  if(speed){speed.textContent=fmtSpeed(Number(p.speed_ms||0));applySpeedColor(speed,Number(p.speed_ms||0))}
  if(distance)distance.textContent=`${(Math.max(0,Number(p.replayDistanceM||0))/1000).toFixed(1).replace('.',',')} km`;
  if(elapsed)elapsed.textContent=fmtDuration(Number(p.replayElapsedS||0));
  if(status)status.textContent=`Replay · ${index+1} af ${state.historyTrack.length} punkter · ${state.replaySpeedFactor}× hastighed`;
}
function addHistoryPhotoMarkerForItem(p){
  if(!state.historyMap||!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))return null;
  const lat=Number(p.lat),lng=Number(p.lng),when=p.captured_at?fmtDate(p.captured_at):'';
  const marker=L.marker([lat,lng],{icon:photoMarkerIcon()}).addTo(state.historyMap).bindPopup(photoPopupElement(p.url||photoPublicUrl(p.storage_path),when),{maxWidth:320});
  state.historyPhotoMarkers[p.index]=marker;return marker;
}
function revealReplayPhotos(currentTs){
  (state.historyPhotosData||[]).forEach(p=>{
    if(state.replayPhotoShown.has(p.index))return;
    const photoTs=new Date(p.captured_at).getTime();
    if(!Number.isFinite(photoTs)||photoTs<=currentTs){addHistoryPhotoMarkerForItem(p);state.replayPhotoShown.add(p.index)}
  });
}
function restoreHistoryPhotoMarkers(){
  clearHistoryPhotoMarkers();
  (state.historyPhotosData||[]).forEach(p=>addHistoryPhotoMarkerForItem(p));
}
function clearReplayLayers(){
  if(state.replayTimer){clearTimeout(state.replayTimer);state.replayTimer=null}
  if(state.historyMap&&state.replayMarker){try{state.historyMap.removeLayer(state.replayMarker)}catch(e){}}
  if(state.historyMap&&state.replayProgressLine){try{state.historyMap.removeLayer(state.replayProgressLine)}catch(e){}}
  state.replayMarker=null;state.replayProgressLine=null;state.replayProgressPoints=[];clearReplayPolice();
}
function resetHistoryReplay({restorePhotos=true,fitRoute=true}={}){
  clearReplayLayers();state.replayRunning=false;state.replayPaused=false;state.replayIndex=0;state.replayPhotoShown=new Set();state.replayPoliceTriggered=false;state.replayPoliceIndex=-1;
  if(state.historyLine)state.historyLine.setStyle({weight:5,color:'#e11d24',opacity:1});
  if(restorePhotos)restoreHistoryPhotoMarkers();
  if(fitRoute&&state.historyMap&&state.historyLine){try{state.historyMap.fitBounds(state.historyLine.getBounds(),{padding:[20,20]})}catch(e){}}
  const speed=$('historyReplaySpeed'),distance=$('historyReplayDistance'),elapsed=$('historyReplayElapsed'),status=$('historyReplayStatus');
  if(speed){speed.textContent='0 km/t';applySpeedColor(speed,0)}if(distance)distance.textContent='0,0 km';if(elapsed)elapsed.textContent='0 sek.';if(status)status.textContent=state.historyTrack.length>1?`Klar · afspilles ${state.replaySpeedFactor}× hurtigere end turen`:'Der er ikke nok GPS-punkter til Replay.';
  setReplayControls('ready');
}
function finishHistoryReplay(){
  if(state.replayTimer){clearTimeout(state.replayTimer);state.replayTimer=null}
  state.replayRunning=false;state.replayPaused=false;
  const last=state.historyTrack[state.historyTrack.length-1];if(last)revealReplayPhotos(last.replayTs);
  const status=$('historyReplayStatus');if(status)status.textContent='Replay færdig · tryk Start igen for at se turen en gang til.';
  setReplayControls('finished');
}
function scheduleReplayNext(){
  if(!state.replayRunning||state.replayPaused)return;
  const i=state.replayIndex;if(i>=state.historyTrack.length-1){finishHistoryReplay();return}
  const cur=state.historyTrack[i],next=state.historyTrack[i+1];
  const rawDelta=Math.max(0,Number(next.replayTs||0)-Number(cur.replayTs||0));
  const delay=Math.max(40,Math.min(15000,rawDelta/Math.max(1,state.replaySpeedFactor)||120));
  state.replayTimer=setTimeout(()=>{state.replayTimer=null;if(!state.replayRunning||state.replayPaused)return;state.replayIndex++;renderReplayFrame();scheduleReplayNext()},delay);
}
function renderReplayFrame(){
  const p=state.historyTrack[state.replayIndex];if(!p||!state.historyMap)return;
  const latlng=[p.lat,p.lng];
  if(!state.replayMarker)state.replayMarker=L.marker(latlng,{icon:replayMotorcycleIcon(),zIndexOffset:1000}).addTo(state.historyMap);else state.replayMarker.setLatLng(latlng);
  if(!state.replayProgressPoints.length)state.replayProgressPoints.push(latlng);else state.replayProgressPoints.push(latlng);
  if(!state.replayProgressLine)state.replayProgressLine=L.polyline(state.replayProgressPoints,{weight:6,color:'#f2b705',opacity:.95}).addTo(state.historyMap);else state.replayProgressLine.setLatLngs(state.replayProgressPoints);
  if(state.replayIndex===0)state.historyMap.setView(latlng,16);else state.historyMap.panTo(latlng,{animate:true,duration:.18});
  revealReplayPhotos(p.replayTs);updateReplayLive(p,state.replayIndex);if(!state.replayPoliceTriggered&&state.replayPoliceIndex>=0&&state.replayIndex>=state.replayPoliceIndex)triggerReplayPolice(p);if(state.replayPoliceMarker)updateReplayPolicePosition();
}
function startHistoryReplay(){
  if(state.historyTrack.length<2){alert('Der er ikke nok GPS-punkter på denne tur til Replay.');return}
  clearReplayLayers();clearHistoryPhotoMarkers();state.replayPhotoShown=new Set();state.replayIndex=0;state.replayRunning=true;state.replayPaused=false;prepareReplayPoliceTrigger();armReplayPoliceAudio();
  if(state.historyLine)state.historyLine.setStyle({weight:4,color:'#5b616b',opacity:.65});
  renderReplayFrame();setReplayControls('running');scheduleReplayNext();
}
function toggleHistoryReplayPause(){
  if(!state.replayRunning)return;
  if(state.replayPaused){state.replayPaused=false;setReplayControls('running');scheduleReplayNext()}
  else{state.replayPaused=true;if(state.replayTimer){clearTimeout(state.replayTimer);state.replayTimer=null}setReplayControls('paused');const status=$('historyReplayStatus');if(status)status.textContent='Replay er sat på pause.'}
}
function stopHistoryReplay(){resetHistoryReplay({restorePhotos:true,fitRoute:true})}

function renderHistoryPhotos(photos){
  clearHistoryPhotoMarkers();
  const grid=$('historyPhotos');if(!grid)return;
  const items=(photos||[]).map((p,i)=>{const url=photoPublicUrl(p.storage_path);return {...p,url,index:i}});
  state.historyPhotosData=items;
  if(!items.length){grid.innerHTML='<div class="empty">Ingen billeder på denne tur endnu.</div>';return}
  grid.innerHTML=items.map(p=>`<button class="photo-card" type="button" data-photo-index="${p.index}"><img src="${escapeHtml(p.url)}" alt="Billede fra turen" loading="lazy"><span>${p.captured_at?fmtDate(p.captured_at):'Billede fra turen'}</span></button>`).join('');
  items.forEach(p=>addHistoryPhotoMarkerForItem(p));
  grid.querySelectorAll('.photo-card').forEach(btn=>btn.addEventListener('click',()=>{const p=items[Number(btn.dataset.photoIndex)];if(!p)return;let marker=state.historyPhotoMarkers[p.index];if(!marker&&state.historyMap)marker=addHistoryPhotoMarkerForItem(p);if(marker&&state.historyMap){state.historyMap.setView(marker.getLatLng(),17);marker.openPopup();$('historyMap').scrollIntoView({behavior:'smooth',block:'center'})}else if(p.url)window.open(p.url,'_blank','noopener')}));
}
async function openHistoryRide(rideId){
  resetHistoryReplay({restorePhotos:false,fitRoute:false});state.historyTrack=[];state.historyPhotosData=[];
  const detail=$('historyDetail');
  detail.classList.remove('hidden');
  detail.dataset.rideId=rideId;
  $('historyDetailMeta').textContent='Henter tur…';
  $('historyPhotos').innerHTML='<div class="empty">Henter billeder…</div>';
  try{
    const [rows,track,photos]=await Promise.all([
      rpc('ridez_history_v38',{p_owner_token:state.ownerToken}).catch(()=>rpc('ridez_history_v36',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v18',{p_owner_token:state.ownerToken})),
      rpc('ridez_history_track',{p_owner_token:state.ownerToken,p_ride_id:rideId}),
      rpc('ridez_history_photos',{p_owner_token:state.ownerToken,p_ride_id:rideId})
    ]);
    const ride=rows.find(r=>r.ride_id===rideId);
    if(!ride)throw new Error('Turen findes ikke');
    const avgMoving=Number(ride.avg_moving_speed_ms||0)*3.6,top=Number(ride.max_speed_ms||0)*3.6;
    $('historyDetailTitle').textContent=fmtDate(ride.created_at);
    $('historyDetailMeta').textContent=`${(Number(ride.distance_m||0)/1000).toFixed(1).replace('.',',')} km · samlet ${fmtDuration(ride.duration_s)}`;
    if($('historyStats'))$('historyStats').innerHTML=`<div><span>Topfart</span><strong>${top.toFixed(0)} km/t</strong></div><div><span>Gns. under kørsel</span><strong>${avgMoving.toFixed(0)} km/t</strong></div><div><span>Kørselstid</span><strong>${fmtDuration(ride.moving_s)}</strong></div><div><span>Stilstand</span><strong>${fmtDuration(ride.stopped_s)}</strong></div>`;
    const histAccel=$('historyAcceleration');if(histAccel){const bestMetric=Number.isFinite(Number(ride.accel_best_80_s))&&ride.accel_best_80_s!==null?{seconds:Number(ride.accel_best_80_s),startKmh:Number(ride.accel_best_80_start_kmh),endKmh:Number(ride.accel_best_80_end_kmh)}:null;const slowMetric=Number.isFinite(Number(ride.accel_slowest_80_s))&&ride.accel_slowest_80_s!==null?{seconds:Number(ride.accel_slowest_80_s),startKmh:Number(ride.accel_slowest_80_start_kmh),endKmh:Number(ride.accel_slowest_80_end_kmh)}:null;histAccel.innerHTML=`<div class="accel-card accel-fast"><div class="accel-title"><span class="accel-icon">🚀</span><div><span>HURTIGSTE ACCELERATION</span><strong>Turens bedste måling</strong></div></div><div class="accel-metrics accel-metrics-single"><div class="wide"><span>Målt interval</span><b>${formatAccelerationRange(bestMetric)}</b></div></div></div><div class="accel-card accel-slow"><div class="accel-title"><span class="accel-icon">🐢</span><div><span>LANGSOMSTE ACCELERATION</span><strong>Turens langsomste gyldige måling</strong></div></div><div class="accel-metrics accel-metrics-single"><div class="wide"><span>Målt interval</span><b>${formatAccelerationRange(slowMetric)}</b></div></div></div>`;}
    const histLean=$('historyLean');if(histLean){histLean.innerHTML=`<div class="lean-card"><div class="lean-title"><span class="lean-icon">🏍️</span><div><span>LEAN & SVING</span><strong>Turens hældning</strong></div></div><div class="lean-grid"><div class="degree-metric"><span>Maks venstre</span><b>${Math.round(Number(ride.max_lean_left_deg||0))}°</b></div><div class="degree-metric"><span>Maks højre</span><b>${Math.round(Number(ride.max_lean_right_deg||0))}°</b></div><div><span>Venstresving</span><b>${Number(ride.turn_left_count||0)}</b></div><div><span>Højresving</span><b>${Number(ride.turn_right_count||0)}</b></div></div></div>`;}
    if(!state.historyMap){state.historyMap=initMap('historyMap')}else{clearHistoryPhotoMarkers();if(state.historyLine){state.historyMap.removeLayer(state.historyLine);state.historyLine=null}}
    state.historyTrack=prepareReplayTrack(track);
    const pts=state.historyTrack.map(p=>[p.lat,p.lng]);
    if(pts.length){state.historyLine=L.polyline(pts,{weight:5,color:'#e11d24'}).addTo(state.historyMap);state.historyMap.fitBounds(state.historyLine.getBounds(),{padding:[20,20]})}
    setTimeout(()=>state.historyMap&&state.historyMap.invalidateSize(),50);
    renderHistoryPhotos(photos);resetHistoryReplay({restorePhotos:true,fitRoute:false})
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
function closeHistoryRide(){resetHistoryReplay({restorePhotos:false,fitRoute:false});clearHistoryPhotoMarkers();state.historyTrack=[];state.historyPhotosData=[];$('historyDetail').classList.add('hidden');$('historyDetail').dataset.rideId=''}

async function initViewer(){
  $('viewerView').classList.remove('hidden');
  state.map=initMap('viewerMap');
  let lastTrackCount=0,viewerRideToken=publicRideToken||null;
  async function resolveViewerRideToken(){
    if(!demoChannelToken)return publicRideToken;
    const result=await rpc('ridez_resolve_demo_channel_v50',{p_channel_token:demoChannelToken});
    const row=Array.isArray(result)?result[0]:result;
    return row&&row.public_token?row.public_token:null;
  }
  function resetViewerForNewRide(){
    lastTrackCount=0;state.points=[];
    if(state.line){state.map.removeLayer(state.line);state.line=null}
    if(state.marker){state.map.removeLayer(state.marker);state.marker=null}
  }
  async function refresh(){
    try{
      const resolvedToken=await resolveViewerRideToken();
      if(!resolvedToken){$('viewerStatus').textContent=demoChannelToken?'Venter på at en demo bliver startet.':'Turen findes ikke eller er udløbet.';setTimeout(refresh,3000);return}
      if(viewerRideToken!==resolvedToken){viewerRideToken=resolvedToken;resetViewerForNewRide()}
      const rideResult=await rpc('ridez_public_ride_v45',{p_public_token:viewerRideToken})
        .catch(()=>rpc('ridez_public_ride_v23',{p_public_token:viewerRideToken}))
        .catch(()=>rpc('ridez_public_ride_v21',{p_public_token:viewerRideToken}))
        .catch(()=>rpc('ridez_public_ride_v19',{p_public_token:viewerRideToken}));
      const ride=Array.isArray(rideResult)?rideResult[0]:rideResult;
      if(!ride){$('viewerStatus').textContent=demoChannelToken?'Venter på næste demo.':'Turen findes ikke eller er udløbet.';setTimeout(refresh,3000);return}
      $('viewerTitle').textContent=ride.title||'RIDEZ live-tur';
      $('viewerSpeed').textContent=fmtSpeed(ride.speed_ms);applySpeedColor($('viewerSpeed'),ride.speed_ms);
      showViewerTopSpeed(ride);
      renderViewerDashboard(ride);
      $('viewerUpdated').textContent=ride.updated_at?new Date(ride.updated_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'}):'–';
      $('viewerStatus').textContent=ride.active?(ride.moving?'Føreren er på farten':'Motorcyklen holder stille'):(demoChannelToken?'Demoen er afsluttet – linket venter på næste demo':'Turen er afsluttet');
      const mo=$('viewerMotion');mo.textContent=ride.moving?'KØRER':'STILLE';mo.className=`motion ${ride.moving?'moving':'stopped'}`;
      if(ride.lat!=null)updateMap(ride.lat,ride.lng,true);
      const pts=await rpc('ridez_public_track',{p_public_token:viewerRideToken});
      if(pts.length!==lastTrackCount){lastTrackCount=pts.length;state.points=pts.map(x=>[x.lat,x.lng]);if(state.line)state.line.setLatLngs(state.points);else if(state.points.length)state.line=L.polyline(state.points,{weight:5,color:'#e11d24'}).addTo(state.map)}
    }catch(e){console.error(e);$('viewerStatus').textContent='Kunne ikke hente live-data.'}
    setTimeout(refresh,3000)
  }
  refresh();
  $('messageForm').addEventListener('submit',async e=>{
    e.preventDefault();const name=$('senderName').value.trim(),body=$('messageBody').value.trim();if(!name||!body)return;
    $('sendFeedback').textContent='Sender…';
    try{
      const tokenNow=await resolveViewerRideToken();
      if(!tokenNow){$('sendFeedback').textContent='Der er ingen aktiv demo at sende beskeden til endnu.';return}
      viewerRideToken=tokenNow;
      const result=await rpc('ridez_send_message',{p_public_token:viewerRideToken,p_sender_name:name,p_body:body});$('messageBody').value='';$('sendFeedback').textContent=result==='moving'?'🏍️ Beskeden er modtaget. Føreren er på farten, så den bliver først vist, når motorcyklen holder stille.':'✓ Beskeden er sendt og kan vises til føreren nu.'
    }catch(err){$('sendFeedback').textContent='Beskeden kunne ikke sendes. Prøv igen.'}
  })
}
async function initDriver(){$('driverView').classList.remove('hidden');ensureOwnerToken();state.map=initMap('driverMap');initLeanSensor();const settingsPanel=$('settingsPanel');if(settingsPanel)settingsPanel.addEventListener('toggle',async()=>{if(!settingsPanel.open)return;updateCalibrationLive();if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission!=='function')return;});const calibrationPanel=$('calibrationPanel');if(calibrationPanel)calibrationPanel.addEventListener('toggle',()=>{if(calibrationPanel.open)updateCalibrationLive(state.lastRawRoll);});renderAccelerationSummary();document.querySelectorAll('.accel-edit').forEach(btn=>btn.addEventListener('click',()=>openAccelEditor(btn.dataset.accelKind)));if($('accelConfigMode'))$('accelConfigMode').addEventListener('change',renderAccelEditorFields);if($('accelConfigForm'))$('accelConfigForm').addEventListener('submit',saveAccelEditor);if($('accelConfigCancel'))$('accelConfigCancel').addEventListener('click',()=>{const d=$('accelConfigDialog');if(d&&typeof d.close==='function')d.close();else if(d)d.removeAttribute('open')});if($('calibrateBtn'))$('calibrateBtn').onclick=calibratePhone;if($('takePhotoBtn'))$('takePhotoBtn').onclick=()=>$('cameraInput').click();if($('galleryBtn'))$('galleryBtn').onclick=()=>$('galleryInput').click();if($('cameraInput'))$('cameraInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)handleRidePhoto(f,'camera')});if($('galleryInput'))$('galleryInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)handleRidePhoto(f,'gallery')});$('startBtn').onclick=()=>startRide().catch(e=>alert('Kunne ikke starte turen: '+e.message));$('stopBtn').onclick=()=>stopRide();$('shareBtn').onclick=shareRide;$('demoBtn').onclick=()=>{if(state.demo)stopRide();else startDemo().catch(e=>{console.error(e);alert('Kunne ikke starte demo: '+e.message)})};$('historyCloseBtn').onclick=closeHistoryRide;$('historyDeleteBtn').onclick=deleteHistoryRide;if($('historyReplayStart'))$('historyReplayStart').onclick=startHistoryReplay;if($('historyReplayPause'))$('historyReplayPause').onclick=toggleHistoryReplayPause;if($('historyReplayStop'))$('historyReplayStop').onclick=stopHistoryReplay;document.querySelectorAll('.replay-rate-button').forEach(btn=>btn.addEventListener('click',()=>setReplaySpeedFactor(btn.dataset.replayRate)));syncReplaySpeedButtons();initSoundSettings();$('historySelectBtn').onclick=toggleHistorySelectMode;$('historyBulkDeleteBtn').onclick=deleteSelectedHistoryRides;loadHistory()}
document.addEventListener('click',e=>{
  const openBtn=e.target.closest&&e.target.closest('.photo-popup-open');
  if(openBtn){e.preventDefault();e.stopPropagation();const img=openBtn.querySelector('img');const popup=openBtn.closest('.photo-popup');const caption=popup&&popup.querySelector('span')?popup.querySelector('span').textContent:'';if(img)openPhotoViewer(img.currentSrc||img.src,caption);return}
  if(e.target&&e.target.id==='photoViewerDialog')closePhotoViewer();
},true);
if($('photoViewerClose'))$('photoViewerClose').addEventListener('click',closePhotoViewer);
if($('photoViewerDialog'))$('photoViewerDialog').addEventListener('close',()=>{const img=$('photoViewerImage');if(img)img.src=''});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=71').catch(()=>{}));
(publicRideToken||demoChannelToken)?initViewer():initDriver();
})();
