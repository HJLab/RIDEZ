(()=>{
'use strict';
const C=window.RIDEZ_CONFIG||{};
const configured=C.SUPABASE_URL&&!C.SUPABASE_URL.startsWith('PASTE_')&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.startsWith('PASTE_');
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),publicRideToken=params.get('ride'),demoChannelToken=params.get('demo');
if(!configured){$('setupView').classList.remove('hidden');return}
const db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const APP_VERSION='101';
const state={rideId:null,publicToken:null,driverToken:localStorage.getItem('ridez_driver_token')||null,ownerToken:localStorage.getItem('ridez_owner_token')||null,demoChannelToken:localStorage.getItem('ridez_demo_channel_token')||null,rideStartedAt:null,watchId:null,lastPos:null,lastUpload:0,distanceM:0,moving:false,stoppedSince:null,messagesSeen:new Set(),map:null,marker:null,line:null,points:[],demo:false,demoTimer:null,demoIndex:0,demoBase:null,demoProfile:null,demoRoute:null,demoTravelM:0,historyMap:null,historyLine:null,maxSpeedMs:0,movingMs:0,stoppedMs:0,statsLastT:null,topSpeedUpdateTimer:null,historySelectMode:false,selectedRideIds:new Set(),activePhotoMarkers:[],historyPhotoMarkers:[],photoBusy:false,demoPrevSpeedMs:0,demoPrevTimeS:0,speedDemoAttempt:null,speedDemoAttempts:[],accelSamples:[],accelZeroStartMs:null,accelZeroActive:false,accelBest080:null,accelBest0100:null,accelBest80:null,accelSlow80:null,accelFastRule:null,accelSlowRule:null,accelEditorKind:null,currentSpeedMs:0,leanCalibration:(localStorage.getItem('ridez_lean_calibration')===null?null:Number(localStorage.getItem('ridez_lean_calibration'))),leanFilteredDeg:0,leanLiveDeg:0,maxLeanLeftDeg:0,maxLeanRightDeg:0,leftTurnCount:0,rightTurnCount:0,turnActive:null,turnArmed:true,turnNeutralSince:null,lastRawRoll:null,orientationBound:false,calibrating:false,calibrationFailed:false,calibrationSamples:[],historyTrack:[],historyPhotosData:[],replayTimer:null,replayMarker:null,replayProgressLine:null,replayProgressPoints:[],replayIndex:0,replayPaused:false,replayRunning:false,replaySpeedFactor:([1,2,5,10].includes(Number(localStorage.getItem('ridez_replay_speed')))?Number(localStorage.getItem('ridez_replay_speed')):2),replayPhotoShown:new Set(),replayPoliceTriggered:false,replayPoliceIndex:-1,replayPoliceMarker:null,replayPoliceTimer:null,replayAudioCtx:null,replayPoliceAudioBuffer:null,replayPoliceAudioSource:null,soundsEnabled:(localStorage.getItem('ridez_sounds_enabled')===null?true:localStorage.getItem('ridez_sounds_enabled')==='1'),userName:(localStorage.getItem('ridez_username')||'').trim(),usernameRequired:false,lastDriverMessages:[],replyingMessageId:null,viewerUserName:(localStorage.getItem('ridez_viewer_username')||'').trim(),viewerToken:localStorage.getItem('ridez_viewer_token')||null,vehicleProfiles:[],activeVehicleId:localStorage.getItem('ridez_active_vehicle_id')||null,preferredVehicleType:localStorage.getItem('ridez_vehicle_type')||'',editingVehicleId:null,historyVehicleType:'motorcycle',viewerVehicleType:'motorcycle',tripLength:(['day','weekend','7days','14days'].includes(localStorage.getItem('ridez_trip_length'))?localStorage.getItem('ridez_trip_length'):'day'),profileReady:false,mapFollowHoldUntil:0,lastSessionPersist:0,gpsRejectCount:0,resumingRide:false,gpsMode:'high',lastLowMapPoint:0,tripDayNumber:1,tripSegmentNumber:1,segmentUploadCount:0,tripStartLocalDate:null,lastAcceptedAt:0,lastMovementAt:0,historyDays:[],historySelectedDay:0,historySelectedRide:null,historyAllPhotos:[],historyLines:[],viewerDayNumber:0,activeRouteLines:[],activeSegmentKey:null,viewerRouteLines:[],rideConsumptionL100:null,elevationMaxM:null,elevationMinM:null,elevationQueue:[],elevationLastQueuedAt:0,elevationLastQueuedPos:null,elevationFlushTimer:null,elevationBusy:false,fuel95Price:null,fuel95UpdatedAt:null,fuel95StationCount:0,fuel95Source:'',fuel95Busy:false};
const fmtSpeed=ms=>`${Math.max(0,Math.round((ms||0)*3.6))} km/t`;
const fmtKm=m=>`${(Math.max(0,Number(m)||0)/1000).toFixed(1).replace('.',',')} km`;
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
const isEmptyRide=r=>Number(r&&r.distance_m||0)<25&&Number(r&&r.duration_s||0)<20&&Number(r&&r.photo_count||0)===0;
const fmtDate=d=>new Date(d).toLocaleString('da-DK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function ensureOwnerToken(){if(!state.ownerToken){state.ownerToken=token();localStorage.setItem('ridez_owner_token',state.ownerToken)}return state.ownerToken}
function ensureDemoChannelToken(){if(!state.demoChannelToken){state.demoChannelToken=token();localStorage.setItem('ridez_demo_channel_token',state.demoChannelToken)}return state.demoChannelToken}
async function publishDemoChannel(){if(!state.demo||!state.publicToken)return;await rpc('ridez_set_demo_channel_v50',{p_owner_token:ensureOwnerToken(),p_channel_token:ensureDemoChannelToken(),p_public_token:state.publicToken})}
const escapeHtml=s=>(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function token(){const a=new Uint8Array(24);crypto.getRandomValues(a);return[...a].map(x=>x.toString(16).padStart(2,'0')).join('')}
function ensureViewerToken(){if(!state.viewerToken){state.viewerToken=token();localStorage.setItem('ridez_viewer_token',state.viewerToken)}return state.viewerToken}
function normalizeVehicleType(type){return type==='car'?'car':'motorcycle'}
function vehicleWords(type){const car=normalizeVehicleType(type)==='car';return car?{type:'car',noun:'bil',definite:'bilen',definiteCap:'Bilen',title:'Bil',emoji:'🚗',possessive:'biltur'}:{type:'motorcycle',noun:'motorcykel',definite:'motorcyklen',definiteCap:'Motorcyklen',title:'Motorcykel',emoji:'🏍️',possessive:'motorcykeltur'}}
function loadVehicleProfiles(){
  try{const raw=JSON.parse(localStorage.getItem('ridez_vehicle_profiles')||'[]');state.vehicleProfiles=Array.isArray(raw)?raw.filter(v=>v&&v.id).map(v=>({...v,type:normalizeVehicleType(v.type),consumptionL100:(Number.isFinite(Number(v.consumptionL100))&&Number(v.consumptionL100)>0?Number(v.consumptionL100):null)})):[]}catch(e){state.vehicleProfiles=[]}
  if(state.activeVehicleId&&!state.vehicleProfiles.some(v=>v.id===state.activeVehicleId))state.activeVehicleId=null;
}
function persistVehicleProfiles(){localStorage.setItem('ridez_vehicle_profiles',JSON.stringify(state.vehicleProfiles));if(state.activeVehicleId)localStorage.setItem('ridez_active_vehicle_id',state.activeVehicleId);else localStorage.removeItem('ridez_active_vehicle_id')}
function activeVehicle(){return state.vehicleProfiles.find(v=>v.id===state.activeVehicleId)||state.vehicleProfiles[0]||null}
function vehicleDisplayName(v){if(!v)return '';const details=[v.make,v.model].filter(Boolean).join(' ');return details?`${v.name} · ${details}`:v.name}
function createDefaultVehicle(type){const w=vehicleWords(type),v={id:'veh_'+token().slice(0,12),type:w.type,name:w.type==='car'?'Min bil':'Min motorcykel',make:'',model:'',year:null,consumptionL100:null};state.vehicleProfiles.push(v);state.activeVehicleId=v.id;state.preferredVehicleType=v.type;localStorage.setItem('ridez_vehicle_type',v.type);persistVehicleProfiles();return v}
function ensureActiveVehicle(){let v=activeVehicle();if(!v&&state.preferredVehicleType)v=createDefaultVehicle(state.preferredVehicleType);return v}
function currentVehicleType(){const v=activeVehicle();return normalizeVehicleType(v?v.type:state.preferredVehicleType)}
function setupComplete(){
  if(state.profileReady&&state.userName&&['motorcycle','car'].includes(state.preferredVehicleType)){loadVehicleProfiles();ensureActiveVehicle();return true}
  try{const p=JSON.parse(localStorage.getItem('ridez_onboarding_v87')||'null');if(p&&typeof p.name==='string'&&p.name.trim()&&['motorcycle','car'].includes(p.type)){state.userName=p.name.trim();state.preferredVehicleType=p.type;state.profileReady=true;localStorage.setItem('ridez_username',state.userName);localStorage.setItem('ridez_vehicle_type',p.type);loadVehicleProfiles();ensureActiveVehicle();return true}}catch(e){}
  // v87: username + vehicle type are the complete onboarding state.
  // Username + vehicle type are the only requirements. A concrete vehicle
  // profile is repaired/created automatically and must never block Start/Demo.
  let savedName=(localStorage.getItem('ridez_username')||state.userName||'').trim();
  let savedType=localStorage.getItem('ridez_vehicle_type')||state.preferredVehicleType||'';

  // New single profile record. This avoids older individual keys drifting apart.
  try{
    const saved=JSON.parse(localStorage.getItem('ridez_primary_profile')||'null');
    if(saved&&typeof saved==='object'){
      if(!savedName&&typeof saved.name==='string')savedName=saved.name.trim();
      if(!['motorcycle','car'].includes(savedType)&&['motorcycle','car'].includes(saved.type))savedType=saved.type;
    }
  }catch(e){}
  if(!savedName)return false;

  loadVehicleProfiles();
  let v=activeVehicle();
  if(!['motorcycle','car'].includes(savedType)&&v)savedType=normalizeVehicleType(v.type);

  // Older v80-v84 profiles may have been marked complete without a usable
  // vehicle-type key. Do not trap the user in setup: recover as motorcycle,
  // which was the original/default RIDEZ vehicle type. New saves always store
  // the explicit choice in ridez_primary_profile.
  if(!['motorcycle','car'].includes(savedType)&&localStorage.getItem('ridez_profile_complete')==='1')savedType='motorcycle';
  if(!['motorcycle','car'].includes(savedType))return false;

  state.userName=savedName;
  state.preferredVehicleType=savedType;
  localStorage.setItem('ridez_username',savedName);
  localStorage.setItem('ridez_vehicle_type',savedType);
  localStorage.setItem('ridez_primary_profile',JSON.stringify({name:savedName,type:savedType}));

  if(!v||normalizeVehicleType(v.type)!==savedType){
    const match=state.vehicleProfiles.find(x=>normalizeVehicleType(x.type)===savedType);
    if(match){state.activeVehicleId=match.id;v=match}
    else v=createDefaultVehicle(savedType);
  }
  if(v){state.activeVehicleId=v.id;persistVehicleProfiles()}
  localStorage.setItem('ridez_profile_complete','1');
  localStorage.setItem('ridez_onboarding_v87',JSON.stringify({name:savedName,type:savedType}));
  state.profileReady=true;
  return true;
}
function setDriverVehicleCopy(){
  const w=vehicleWords(currentVehicleType());
  const tag=$('brandTagline');if(tag)tag.textContent=`Din ${w.noun}. Din verden.`;
  const notice=$('chatMovingNotice');if(notice)notice.textContent=`${w.definiteCap} er i bevægelse. Chatfunktionen er deaktiveret.`;
  const copy=$('historyReplayCopy');if(copy)copy.textContent=`Følg ${w.definite} langs den gemte GPS-rute. Vælg selv afspilningshastighed.`;
  const inst=$('calibrationInstruction');if(inst)inst.textContent=w.type==='car'?'Monter telefonen, som den skal sidde under kørsel, og sørg for, at bilen står stille på et plant underlag.':'Monter telefonen, som den skal sidde under kørsel, og hold motorcyklen helt oprejst. Centralstøtteben er en god hjælp.';
  const hint=$('calibrationHint');if(hint)hint.textContent=w.type==='car'?'Rå måling viser telefonens aktuelle vinkel. Når du kalibrerer med bilen på et plant underlag, gemmer RIDEZ denne vinkel som nulpunkt, så den korrigerede måling bliver ca. 0°.':'Rå måling viser telefonens aktuelle vinkel. Når du kalibrerer med motorcyklen oprejst, gemmer RIDEZ denne vinkel som nulpunkt, så den korrigerede måling bliver ca. 0°.';
  updateReplyAvailability();
}
function setViewerVehicleCopy(type){
  state.viewerVehicleType=normalizeVehicleType(type);const w=vehicleWords(state.viewerVehicleType);
  const tag=$('brandTagline');if(tag)tag.textContent=`Din ${w.noun}. Din verden.`;
  const notice=$('viewerChatMovingNotice');if(notice)notice.textContent=`Modtageren kan ikke læse din besked lige nu, da ${w.definite} er i bevægelse. Beskeden bliver leveret, så snart ${w.definite} holder stille.`;
}
function syncVehicleUi(){
  // v90: keep the compact vehicle menu and color-code active/inactive vehicle names.
  const legacySummary=$('activeVehicleSummary');
  if(legacySummary){const legacyHead=legacySummary.closest('.vehicle-settings-head');if(legacyHead)legacyHead.remove();}
  const legacyAdd=$('addVehicleBtn');if(legacyAdd)legacyAdd.remove();
  const list=$('vehicleList');
  if(list){
    if(!state.vehicleProfiles.length){list.innerHTML=''}
    else list.innerHTML=state.vehicleProfiles.map(x=>{
      const active=x.id===state.activeVehicleId,w=vehicleWords(x.type),year=x.year?escapeHtml(String(x.year)):'';
      const consumption=Number.isFinite(Number(x.consumptionL100))&&Number(x.consumptionL100)>0?`${Number(x.consumptionL100).toFixed(1).replace('.',',')} l/100 km`:'';const details=[x.make,x.model,year,consumption].filter(Boolean).map(escapeHtml).join(' · ');
      return `<details class="vehicle-card ${active?'active':''}" data-vehicle-id="${escapeHtml(x.id)}">
        <summary class="vehicle-card-summary">
          <span class="vehicle-card-main"><span class="vehicle-card-icon">${w.emoji}</span><strong>${escapeHtml(x.name)}</strong></span>
          <span class="vehicle-card-chevron" aria-hidden="true">›</span>
        </summary>
        <div class="vehicle-card-body">
          ${details?`<div class="vehicle-card-details">${details}</div>`:''}
          <div class="vehicle-card-actions">
            <button class="secondary small-button vehicle-select-btn" type="button" ${active?'disabled':''}>${active?'Aktiv':'Gør aktiv'}</button>
            <button class="secondary small-button vehicle-edit-btn" type="button">Rediger</button>
            <button class="danger small-button vehicle-delete-btn" type="button">Slet</button>
          </div>
          ${active?'<button class="secondary vehicle-add-inline-btn" type="button">+ Tilføj køretøj</button>':''}
        </div>
      </details>`
    }).join('');
  }
  setDriverVehicleCopy();renderTripExtraSummary();
}
function setActiveVehicle(id){const v=state.vehicleProfiles.find(x=>x.id===id);if(!v)return;if(state.rideId){alert('Afslut den aktive tur, før du skifter køretøj.');return}state.activeVehicleId=v.id;state.preferredVehicleType=v.type;localStorage.setItem('ridez_vehicle_type',v.type);persistVehicleProfiles();syncVehicleUi()}
function openVehicleDialog(id=null){
  const dlg=$('vehicleDialog'),v=id?state.vehicleProfiles.find(x=>x.id===id):null;if(state.rideId&&v&&v.id===state.activeVehicleId){alert('Afslut den aktive tur, før du ændrer det aktive køretøj.');return}state.editingVehicleId=v?v.id:null;
  if($('vehicleDialogTitle'))$('vehicleDialogTitle').textContent=v?'Rediger køretøj':'Tilføj køretøj';
  if($('vehicleNameInput'))$('vehicleNameInput').value=v?v.name:'';
  if($('vehicleTypeInput'))$('vehicleTypeInput').value=v?v.type:(state.preferredVehicleType||'motorcycle');
  if($('vehicleMakeInput'))$('vehicleMakeInput').value=v?v.make||'':'';
  if($('vehicleModelInput'))$('vehicleModelInput').value=v?v.model||'':'';
  if($('vehicleYearInput'))$('vehicleYearInput').value=v&&v.year?v.year:'';if($('vehicleConsumptionInput'))$('vehicleConsumptionInput').value=v&&Number.isFinite(Number(v.consumptionL100))?Number(v.consumptionL100).toFixed(1).replace('.',','):'';
  if($('vehicleFeedback'))$('vehicleFeedback').textContent='';
  if(dlg&&typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else if(dlg)dlg.setAttribute('open','');
}
function closeVehicleDialog(){const dlg=$('vehicleDialog');if(dlg&&typeof dlg.close==='function'&&dlg.open)dlg.close();else if(dlg)dlg.removeAttribute('open');state.editingVehicleId=null}
function saveVehicle(e){
  if(e&&e.preventDefault)e.preventDefault();const name=($('vehicleNameInput')?.value||'').trim(),type=normalizeVehicleType($('vehicleTypeInput')?.value),make=($('vehicleMakeInput')?.value||'').trim(),model=($('vehicleModelInput')?.value||'').trim(),yearRaw=($('vehicleYearInput')?.value||'').trim(),consumptionRaw=($('vehicleConsumptionInput')?.value||'').trim().replace(',','.'),fb=$('vehicleFeedback');
  if(!name){if(fb)fb.textContent='Skriv et navn til køretøjet.';return}let year=null;if(yearRaw){year=Number(yearRaw);if(!Number.isInteger(year)||year<1900||year>2100){if(fb)fb.textContent='Årgangen skal være mellem 1900 og 2100.';return}}let consumptionL100=null;if(consumptionRaw){consumptionL100=Number(consumptionRaw);if(!Number.isFinite(consumptionL100)||consumptionL100<0.5||consumptionL100>50){if(fb)fb.textContent='Forbruget skal være mellem 0,5 og 50,0 l/100 km.';return}consumptionL100=Math.round(consumptionL100*10)/10}
  if(state.editingVehicleId){const v=state.vehicleProfiles.find(x=>x.id===state.editingVehicleId);if(v)Object.assign(v,{name,type,make,model,year,consumptionL100})}
  else{const v={id:'veh_'+token().slice(0,12),name,type,make,model,year,consumptionL100};state.vehicleProfiles.push(v);if(!state.activeVehicleId)state.activeVehicleId=v.id}
  const active=activeVehicle();if(active){state.preferredVehicleType=active.type;localStorage.setItem('ridez_vehicle_type',active.type)}persistVehicleProfiles();closeVehicleDialog();syncVehicleUi();
}
function deleteVehicle(id){
  const v=state.vehicleProfiles.find(x=>x.id===id);if(!v)return;if(state.rideId&&v.id===state.activeVehicleId){alert('Afslut den aktive tur, før du sletter det aktive køretøj.');return}if(state.vehicleProfiles.length<=1){alert('Du skal have mindst ét køretøj i RIDEZ. Rediger det i stedet.');return}if(!confirm(`Slet ${v.name}?`))return;
  state.vehicleProfiles=state.vehicleProfiles.filter(x=>x.id!==id);if(state.activeVehicleId===id)state.activeVehicleId=state.vehicleProfiles[0]?.id||null;const active=activeVehicle();if(active){state.preferredVehicleType=active.type;localStorage.setItem('ridez_vehicle_type',active.type)}persistVehicleProfiles();syncVehicleUi();
}
function initVehicleSettings(){
  loadVehicleProfiles();if(state.preferredVehicleType&&!state.vehicleProfiles.length)createDefaultVehicle(state.preferredVehicleType);syncVehicleUi();
  const form=$('vehicleForm');if(form)form.addEventListener('submit',saveVehicle);const cancel=$('vehicleCancelBtn');if(cancel)cancel.onclick=closeVehicleDialog;
  const list=$('vehicleList');if(list)list.addEventListener('click',e=>{const card=e.target.closest('.vehicle-card');if(!card)return;const id=card.dataset.vehicleId;if(e.target.closest('.vehicle-add-inline-btn'))openVehicleDialog();else if(e.target.closest('.vehicle-select-btn'))setActiveVehicle(id);else if(e.target.closest('.vehicle-edit-btn'))openVehicleDialog(id);else if(e.target.closest('.vehicle-delete-btn'))deleteVehicle(id)});
}

const FUEL_95_CACHE_KEY='ridez_fuel95_cache_v102';
function fmtLiters(v){return Number.isFinite(Number(v))?`${Number(v).toFixed(1).replace('.',',')} l`:'–'}
function hasNumber(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function fmtDkk(v){return hasNumber(v)?`${Number(v).toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})} kr.`:'–'}
function loadFuel95Cache(){
  try{const x=JSON.parse(localStorage.getItem(FUEL_95_CACHE_KEY)||'null');if(x&&Number.isFinite(Number(x.price))){state.fuel95Price=Number(x.price);state.fuel95UpdatedAt=x.updatedAt||null;state.fuel95StationCount=Number(x.stationCount)||0;state.fuel95Source=x.source||'OK'}}catch(e){}
}
function median(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
async function fetchFuel95Price(force=false){
  loadFuel95Cache();const now=Date.now(),age=state.fuel95UpdatedAt?now-new Date(state.fuel95UpdatedAt).getTime():Infinity;
  if(state.fuel95Price&&!force&&age<30*60*1000){renderTripExtraSummary();return state.fuel95Price}
  if(state.fuel95Busy)return state.fuel95Price;state.fuel95Busy=true;
  try{
    let data;
    try{data=await rpc('ridez_fuel95_price_v102',{})}
    catch(v102Error){console.warn('v102-prisfunktionen kunne ikke bruges; prøver v100',v102Error);data=await rpc('ridez_fuel95_price_v100',{})}
    const row=Array.isArray(data)?data[0]:data,price=Number(row&&row.price);
    if(!Number.isFinite(price)||price<5||price>40)throw new Error('Ugyldig Blyfri 95-pris fra serveren');
    state.fuel95Price=Math.round(price*100)/100;state.fuel95UpdatedAt=(row&&row.updated_at)||new Date().toISOString();state.fuel95StationCount=Number(row&&row.station_count)||0;state.fuel95Source=(row&&row.source)||'OK';
    localStorage.setItem(FUEL_95_CACHE_KEY,JSON.stringify({price:state.fuel95Price,updatedAt:state.fuel95UpdatedAt,stationCount:state.fuel95StationCount,source:state.fuel95Source}));
  }catch(serverError){
    console.warn('Serveren kunne ikke hente Blyfri 95-prisen; prøver direkte som reserve',serverError);
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);
    try{
      const res=await fetch('https://mobility-prices.ok.dk/api/v1/fuel-prices',{headers:{Accept:'application/json'},cache:'no-store',signal:ctrl.signal});if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json(),prices=[];for(const item of (data.items||[])){for(const p of (item.prices||[])){if(String(p.product_name||'').toLowerCase().includes('blyfri 95')){const n=Number(p.price);if(Number.isFinite(n)&&n>5&&n<40)prices.push(n)}}}
      const price=median(prices);if(!Number.isFinite(price))throw new Error('Ingen Blyfri 95-priser');
      state.fuel95Price=Math.round(price*100)/100;state.fuel95UpdatedAt=new Date().toISOString();state.fuel95StationCount=prices.length;state.fuel95Source='OK';
      localStorage.setItem(FUEL_95_CACHE_KEY,JSON.stringify({price:state.fuel95Price,updatedAt:state.fuel95UpdatedAt,stationCount:state.fuel95StationCount,source:state.fuel95Source}));
    }catch(directError){console.warn('Blyfri 95 dagspris kunne ikke hentes',directError)}finally{clearTimeout(timeout)}
  }finally{state.fuel95Busy=false;renderTripExtraSummary()}
  return state.fuel95Price;
}
function currentRideConsumption(){const n=Number(state.rideConsumptionL100);if(Number.isFinite(n)&&n>0)return n;const v=activeVehicle(),x=Number(v&&v.consumptionL100);return Number.isFinite(x)&&x>0?x:null}
function fuelPriceSourceText(price=state.fuel95Price,updatedAt=state.fuel95UpdatedAt,stationCount=state.fuel95StationCount,source=state.fuel95Source){
  if(!hasNumber(price))return 'Dagsprisen på Blyfri 95 kunne ikke hentes endnu.';
  const when=updatedAt?new Date(updatedAt).toLocaleString('da-DK',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  return `${source||'OK'} Blyfri 95-pris${stationCount?` · median af ${stationCount} stationer`:''}${when?` · hentet ${when}`:''}.`;
}
function calculateFuel(distanceM,consumption,price){const km=Math.max(0,Number(distanceM||0))/1000,c=Number(consumption),p=Number(price),liters=Number.isFinite(c)&&c>0?km*c/100:null,cost=liters!==null&&Number.isFinite(p)&&p>0?liters*p:null;return{liters,cost}}
function renderTripExtraSummary(){
  const consumption=currentRideConsumption(),km=Math.max(0,Number(state.distanceM||0))/1000,liters=consumption?km*consumption/100:null,cost=hasNumber(state.fuel95Price)&&liters!==null?liters*Number(state.fuel95Price):null;
  const set=(id,val)=>{const el=$(id);if(el)el.textContent=val};
  set('tripFuelLiters',consumption?fmtLiters(liters):'Angiv forbrug');set('tripFuelPrice',hasNumber(state.fuel95Price)?`${Number(state.fuel95Price).toFixed(2).replace('.',',')} kr./l`:'–');set('tripFuelCost',cost!==null?fmtDkk(cost):'–');set('tripElevationMax',hasNumber(state.elevationMaxM)?`${Math.round(Number(state.elevationMaxM))} m`:'–');
  const below=$('tripElevationBelow');if(below)below.classList.toggle('hidden',!(hasNumber(state.elevationMinM)&&Number(state.elevationMinM)<0));set('tripElevationMin',hasNumber(state.elevationMinM)&&Number(state.elevationMinM)<0?`${Math.round(Number(state.elevationMinM))} m`:'–');
  set('tripFuelPriceSource',consumption?fuelPriceSourceText():'Angiv køretøjets teoretiske forbrug under Indstillinger → Køretøjer for at få beregningen.');
}
function renderHistoryTripExtra(ride){
  const wrap=$('historyTripExtra');if(!wrap||!ride)return;
  const consumption=hasNumber(ride.vehicle_consumption_l100)?Number(ride.vehicle_consumption_l100):null,savedPrice=hasNumber(ride.fuel95_price_dkk_l)?Number(ride.fuel95_price_dkk_l):null,price=savedPrice!==null?savedPrice:(hasNumber(state.fuel95Price)?Number(state.fuel95Price):null),calculated=calculateFuel(ride.distance_m,consumption,price),liters=hasNumber(ride.estimated_fuel_liters)?Number(ride.estimated_fuel_liters):calculated.liters,cost=hasNumber(ride.estimated_fuel_cost_dkk)?Number(ride.estimated_fuel_cost_dkk):calculated.cost;
  const source=savedPrice!==null?fuelPriceSourceText(savedPrice,ride.fuel95_price_updated_at,ride.fuel95_station_count,ride.fuel95_source):fuelPriceSourceText();
  wrap.innerHTML=`<div class="trip-extra-card"><div class="trip-extra-title"><span class="trip-extra-icon">⛽</span><div><span>TEORETISK FORBRUG</span><strong>Turens teoretiske beregning</strong></div></div><div class="trip-extra-grid"><div><span>Teoretisk forbrug</span><b>${liters!==null?fmtLiters(liters):'Ikke angivet'}</b></div><div><span>Blyfri 95 dagspris</span><b>${price!==null?`${price.toFixed(2).replace('.',',')} kr./l`:'–'}</b></div><div class="wide"><span>Estimeret brændstofpris</span><b>${cost!==null?fmtDkk(cost):'–'}</b></div></div><p class="trip-extra-note">${liters!==null?source:'Køretøjet havde ikke et teoretisk forbrug angivet på denne tur.'}</p><p class="trip-extra-note">Brændstofforbrug og pris er estimater.</p></div>`;
}
async function storeFuelSnapshot(distanceM){
  const consumption=currentRideConsumption();if(!state.driverToken||!hasNumber(consumption))return false;
  if(!hasNumber(state.fuel95Price))await fetchFuel95Price(true);
  if(!hasNumber(state.fuel95Price))return false;
  const values=calculateFuel(distanceM,consumption,state.fuel95Price);
  await rpc('ridez_store_fuel_snapshot_v102',{p_driver_token:state.driverToken,p_price_dkk_l:Number(state.fuel95Price),p_price_updated_at:state.fuel95UpdatedAt||new Date().toISOString(),p_station_count:Number(state.fuel95StationCount)||0,p_source:state.fuel95Source||'OK',p_estimated_liters:values.liters,p_estimated_cost_dkk:values.cost});return true;
}
const ELEVATION_SAMPLE_MS=45000,ELEVATION_SAMPLE_M=500,ELEVATION_BATCH_MAX=25,ELEVATION_FLUSH_MS=8*60*1000;
function resetElevationState(){if(state.elevationFlushTimer){clearTimeout(state.elevationFlushTimer);state.elevationFlushTimer=null}state.elevationQueue=[];state.elevationMaxM=null;state.elevationMinM=null;state.elevationLastQueuedAt=0;state.elevationLastQueuedPos=null;state.elevationBusy=false;renderTripExtraSummary()}
function queueElevationSample(cur,now){
  if(state.demo||!state.rideId||!cur)return;if(!state.moving&&state.elevationLastQueuedAt)return;const moved=state.elevationLastQueuedPos?hav(state.elevationLastQueuedPos,cur):Infinity;if(state.elevationLastQueuedAt&&now-state.elevationLastQueuedAt<ELEVATION_SAMPLE_MS&&moved<ELEVATION_SAMPLE_M)return;
  state.elevationQueue.push({lat:Number(cur.lat),lng:Number(cur.lng)});state.elevationLastQueuedAt=now;state.elevationLastQueuedPos={lat:Number(cur.lat),lng:Number(cur.lng)};
  if(state.elevationQueue.length>=ELEVATION_BATCH_MAX)flushElevationQueue();else if(!state.elevationFlushTimer)state.elevationFlushTimer=setTimeout(()=>flushElevationQueue(),ELEVATION_FLUSH_MS);
}
async function flushElevationQueue(force=false){
  if(state.elevationBusy||!state.elevationQueue.length||!state.driverToken)return;state.elevationBusy=true;if(state.elevationFlushTimer){clearTimeout(state.elevationFlushTimer);state.elevationFlushTimer=null}
  const batch=state.elevationQueue.splice(0,100),driverToken=state.driverToken;const lat=batch.map(p=>p.lat.toFixed(6)).join(','),lng=batch.map(p=>p.lng.toFixed(6)).join(','),ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);
  try{
    const res=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`,{cache:'no-store',signal:ctrl.signal});if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json(),elev=(Array.isArray(data.elevation)?data.elevation:[data.elevation]).map(Number).filter(Number.isFinite);if(!elev.length)throw new Error('Ingen højdedata');
    const bmax=Math.max(...elev),bmin=Math.min(...elev);state.elevationMaxM=hasNumber(state.elevationMaxM)?Math.max(Number(state.elevationMaxM),bmax):bmax;state.elevationMinM=hasNumber(state.elevationMinM)?Math.min(Number(state.elevationMinM),bmin):bmin;renderTripExtraSummary();
    try{await rpc('ridez_update_elevation_v97',{p_driver_token:driverToken,p_max_elevation_m:state.elevationMaxM,p_min_elevation_m:state.elevationMinM,p_sample_count:elev.length})}catch(e){console.warn('Højdedata kunne ikke gemmes i Supabase',e)}
  }catch(e){console.warn('Terrænhøjde kunne ikke hentes',e);state.elevationQueue=batch.concat(state.elevationQueue).slice(0,100)}finally{clearTimeout(timeout);state.elevationBusy=false;if(state.elevationQueue.length&&!state.elevationFlushTimer)state.elevationFlushTimer=setTimeout(()=>flushElevationQueue(),force?15000:ELEVATION_FLUSH_MS)}
}

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

const MAP_MANUAL_HOLD_MS=15000;
function holdDriverMapFollow(){state.mapFollowHoldUntil=Date.now()+MAP_MANUAL_HOLD_MS}
function initMap(id){
  const m=L.map(id,{zoomControl:true}).setView([55.6761,12.5683],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);
  if(id==='driverMap'){
    const el=m.getContainer();
    ['wheel','pointerdown','touchstart','mousedown'].forEach(type=>el.addEventListener(type,holdDriverMapFollow,{passive:true}));
  }
  return m;
}
function clearActiveRouteLines(){if(!state.map)return;(state.activeRouteLines||[]).forEach(line=>{try{state.map.removeLayer(line)}catch(e){}});state.activeRouteLines=[];state.line=null;state.points=[];state.activeSegmentKey=null}
function updateMap(lat,lng,follow=true,appendPoint=true){
  if(!state.map)return;const p=[lat,lng];
  if(!state.marker)state.marker=L.circleMarker(p,{radius:9,weight:4,color:'#111',fillColor:'#e11d24',fillOpacity:1}).addTo(state.map);else state.marker.setLatLng(p);
  if(appendPoint){
    const partitioned=!!state.rideId&&!publicRideToken&&!demoChannelToken;
    if(partitioned){const key=`${state.tripDayNumber}:${state.tripSegmentNumber}`;if(state.activeSegmentKey!==key){state.activeSegmentKey=key;state.points=[];state.line=null}}
    state.points.push(p);
    if(!state.line){state.line=L.polyline(state.points,{weight:5,color:'#e11d24',smoothFactor:.2,noClip:false}).addTo(state.map);if(partitioned)state.activeRouteLines.push(state.line)}else state.line.setLatLngs(state.points)
  }
  if(follow&&Date.now()>=state.mapFollowHoldUntil)state.map.setView(p,16,{animate:true});
}
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
    try{await rpc('ridez_register_photo_v96',{p_driver_token:state.driverToken,p_storage_path:path,p_lat:pos.lat,p_lng:pos.lng,p_captured_at:capturedAt.toISOString(),p_day_number:state.tripDayNumber})}
    catch(e){try{await db.storage.from('ridez-photos').remove([path])}catch(ignore){};throw e}
    const url=photoPublicUrl(path);addActivePhotoMarker(pos.lat,pos.lng,url,capturedAt.toISOString());
    setPhotoBusy(false,'✓ Billedet er gemt på turen.');
  }catch(e){console.error(e);setPhotoBusy(false,'Kunne ikke gemme billedet.');const fb=$('photoFeedback');if(fb)fb.classList.add('error');alert('Billedet kunne ikke gemmes: '+(e.message||'Ukendt fejl'))}
}
function setMotion(moving){state.moving=moving;const el=$('motionLight');el.textContent=moving?'KØRER':'STILLE';el.className=`motion ${moving?'moving':'stopped'}`;$('rideStatus').textContent=moving?(state.demo?'Demo kører':'På farten'):(state.demo?'Demo holder stille':'Holder stille');$('statusDetail').textContent=moving?'Beskeder holdes tilbage, mens du kører.':'Det er sikkert at vise ventende beskeder.';updateReplyAvailability()}

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
      {const w=vehicleWords(currentVehicleType());statusEl.textContent=level==='good'?'Telefonen står tæt på 0° – klar til kalibrering.':level==='warn'?(w.type==='car'?'Telefonen står lidt skævt. Sørg for at bilen står plant og kalibrér.':'Telefonen står lidt skævt. Hold motorcyklen oprejst og kalibrér.'):'Telefonen afviger tydeligt fra 0°. Det er netop denne vinkel, kalibreringen vil gemme som nulpunkt.';}
    }else{
      {const w=vehicleWords(currentVehicleType());statusEl.textContent=level==='good'?'Godt – korrigeret måling ligger tæt på 0°.':level==='warn'?'Lille afvigelse fra nulpunktet.':(w.type==='car'?'Tydelig afvigelse fra nulpunktet – kontrollér at bilen står plant eller kalibrér igen.':'Tydelig afvigelse fra nulpunktet – kontrollér at motorcyklen står oprejst eller kalibrér igen.');}
    }
  }
}
function updateCalibrationStatus(text){
  const el=$('calibrationStatus'),panel=$('settingsPanel');
  const working=!!state.calibrating,failed=!!state.calibrationFailed,calibrated=state.leanCalibration!==null&&!failed&&!working,missing=!working&&(state.leanCalibration===null||failed);
  if(el)el.textContent=text||(calibrated?'Kalibreret ✓':'Ikke kalibreret');
  if(panel){
    panel.classList.toggle('calibration-ok',calibrated);
    panel.classList.toggle('calibration-missing',missing);
    panel.classList.toggle('calibration-working',working);
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
  if(state.moving){const w=vehicleWords(currentVehicleType());alert(`Kalibrering kan kun udføres, når ${w.definite} holder stille.`);return}
  const btn=$('calibrateBtn');if(btn){btn.disabled=true;btn.textContent='Kalibrerer…'}
  try{
    await ensureOrientationPermission();state.calibrationSamples=[];state.calibrating=true;state.calibrationFailed=false;updateCalibrationStatus(currentVehicleType()==='car'?'Sørg for at bilen står stille på et plant underlag…':'Hold motorcyklen helt oprejst…');
    await new Promise(r=>setTimeout(r,2200));state.calibrating=false;
    const a=state.calibrationSamples.filter(Number.isFinite);if(a.length<4)throw new Error('Der kom ikke nok sensordata. Sørg for, at telefonens bevægelsessensor er tilladt, og prøv igen.');
    // Trim de yderste målinger, så et enkelt ryk ikke flytter nulpunktet.
    a.sort((x,y)=>x-y);const trim=Math.floor(a.length*.15),use=a.slice(trim,a.length-trim||a.length);const avg=use.reduce((s,x)=>s+x,0)/use.length;
    state.calibrationFailed=false;state.leanCalibration=avg;localStorage.setItem('ridez_lean_calibration',String(avg));state.leanFilteredDeg=0;state.leanLiveDeg=0;updateCalibrationStatus('Kalibreret ✓');updateCalibrationLive(state.lastRawRoll);renderLeanSummary();
  }catch(e){state.calibrating=false;state.calibrationFailed=true;updateCalibrationStatus('Kalibrering mislykkedes');alert(e.message||'Kalibrering mislykkedes.');}
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
  if(type==='fuel123')return 0;
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
function updateRideStats(now,speed){state.maxSpeedMs=Math.max(state.maxSpeedMs,Math.max(0,speed||0));if(state.statsLastT!==null){const maxGap=state.gpsMode==='low'?90000:30000;const dt=Math.max(0,Math.min(now-state.statsLastT,maxGap));if(speed>C.STOPPED_THRESHOLD_MS)state.movingMs+=dt;else state.stoppedMs+=dt}state.statsLastT=now;const top=$('topSpeedValue'),moving=$('movingTimeValue'),stopped=$('stoppedTimeValue');if(top)top.textContent=fmtSpeed(state.maxSpeedMs);if(moving)moving.textContent=fmtDuration(state.movingMs/1000);if(stopped)stopped.textContent=fmtDuration(state.stoppedMs/1000)}
async function rpc(name,args){const{data,error}=await db.rpc(name,args);if(error)throw error;return data}
async function fetchTrackPages(name,baseArgs,{pageSize=1000,maxPages=40,afterId=0}={}){
  const all=[];let cursor=Math.max(0,Number(afterId)||0);
  for(let page=0;page<maxPages;page++){
    const rows=await rpc(name,{...baseArgs,p_after_id:cursor,p_limit:pageSize});
    const list=Array.isArray(rows)?rows:[];if(!list.length)break;
    all.push(...list);
    const ids=list.map(r=>Number(r.point_id)).filter(Number.isFinite);const next=ids.length?Math.max(...ids):cursor;
    if(next<=cursor||list.length<pageSize)break;cursor=next;
  }
  return all;
}
const ACTIVE_RIDE_SESSION_KEY='ridez_active_ride_v92';
function persistActiveRideSession(force=false){
  if(state.demo||!state.driverToken||!state.publicToken||!state.rideId)return;
  const now=Date.now();if(!force&&now-state.lastSessionPersist<1500)return;state.lastSessionPersist=now;
  const payload={rideId:state.rideId,driverToken:state.driverToken,publicToken:state.publicToken,startedAt:state.rideStartedAt,ownerToken:ensureOwnerToken(),vehicleId:state.activeVehicleId,distanceM:state.distanceM,maxSpeedMs:state.maxSpeedMs,movingMs:state.movingMs,stoppedMs:state.stoppedMs,maxLeanLeftDeg:state.maxLeanLeftDeg,maxLeanRightDeg:state.maxLeanRightDeg,leftTurnCount:state.leftTurnCount,rightTurnCount:state.rightTurnCount,tripLength:state.tripLength,tripDayNumber:state.tripDayNumber,tripSegmentNumber:state.tripSegmentNumber,segmentUploadCount:state.segmentUploadCount,tripStartLocalDate:state.tripStartLocalDate,rideConsumptionL100:state.rideConsumptionL100,elevationMaxM:state.elevationMaxM,elevationMinM:state.elevationMinM,savedAt:now};
  try{localStorage.setItem(ACTIVE_RIDE_SESSION_KEY,JSON.stringify(payload))}catch(e){console.warn('Aktiv tur kunne ikke sikkerhedsgemmes lokalt',e)}
}
function readActiveRideSession(){
  try{const x=JSON.parse(localStorage.getItem(ACTIVE_RIDE_SESSION_KEY)||'null');if(x&&typeof x==='object'&&x.driverToken)return x}catch(e){}
  return null;
}
function clearActiveRideSession(){try{localStorage.removeItem(ACTIVE_RIDE_SESSION_KEY)}catch(e){}state.lastSessionPersist=0}
async function loadExistingActiveTrack(){
  if(!state.publicToken||!state.map)return;
  try{
    let rows;
    try{rows=await fetchTrackPages('ridez_public_track_v96',{p_public_token:state.publicToken,p_day_number:state.tripDayNumber},{pageSize:1000,maxPages:30})}
    catch(e){rows=await rpc('ridez_public_track',{p_public_token:state.publicToken})}
    const list=(Array.isArray(rows)?rows:[]).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
    if(!list.length)return;
    clearActiveRouteLines();let currentKey='',currentPoints=[],currentLine=null;
    for(const row of list){
      const key=`${Number(row.day_number)||state.tripDayNumber}:${Number(row.segment_number)||1}`;
      if(key!==currentKey){currentKey=key;currentPoints=[];currentLine=L.polyline(currentPoints,{weight:5,color:'#e11d24',smoothFactor:.2,noClip:false}).addTo(state.map);state.activeRouteLines.push(currentLine)}
      currentPoints.push([Number(row.lat),Number(row.lng)]);currentLine.setLatLngs(currentPoints);
    }
    state.activeSegmentKey=currentKey;state.points=currentPoints;state.line=currentLine;
    const last=list[list.length-1],lastPos=[Number(last.lat),Number(last.lng)];
    if(!state.marker)state.marker=L.circleMarker(lastPos,{radius:9,weight:4,color:'#111',fillColor:'#e11d24',fillOpacity:1}).addTo(state.map);else state.marker.setLatLng(lastPos);
    state.map.setView(lastPos,16,{animate:false});
  }catch(e){console.warn('Eksisterende rute kunne ikke genindlæses',e)}
}
async function resumeInterruptedRide(){
  if(state.rideId||state.resumingRide)return false;
  const saved=readActiveRideSession();
  if(!saved){
    // A demo that failed after ride creation used to leave ridez_driver_token behind.
    // Demo sessions are never persisted as resumable real rides, so this token is stale and must not lock Demo Mode.
    localStorage.removeItem('ridez_driver_token');
    state.driverToken=null;
    return false;
  }
  state.resumingRide=true;
  try{
    let data;try{data=await rpc('ridez_resume_ride_v97',{p_owner_token:ensureOwnerToken(),p_driver_token:saved.driverToken})}catch(e){try{data=await rpc('ridez_resume_ride_v96',{p_owner_token:ensureOwnerToken(),p_driver_token:saved.driverToken})}catch(e2){data=await rpc('ridez_resume_ride_v92',{p_owner_token:ensureOwnerToken(),p_driver_token:saved.driverToken})}}
    const ride=Array.isArray(data)?data[0]:data;
    if(!ride){clearActiveRideSession();localStorage.removeItem('ridez_driver_token');return false}
    state.rideId=ride.ride_id||saved.rideId;state.driverToken=saved.driverToken;state.publicToken=ride.public_token||saved.publicToken;state.rideStartedAt=Number(saved.startedAt)||new Date(ride.created_at).getTime()||Date.now();
    state.distanceM=Math.max(Number(saved.distanceM)||0,Number(ride.distance_m)||0);state.maxSpeedMs=Math.max(Number(saved.maxSpeedMs)||0,Number(ride.max_speed_ms)||0);state.movingMs=Math.max(Number(saved.movingMs)||0,(Number(ride.moving_s)||0)*1000);state.stoppedMs=Math.max(Number(saved.stoppedMs)||0,(Number(ride.stopped_s)||0)*1000);state.rideConsumptionL100=hasNumber(ride.vehicle_consumption_l100)?Number(ride.vehicle_consumption_l100):(hasNumber(saved.rideConsumptionL100)?Number(saved.rideConsumptionL100):null);state.elevationMaxM=hasNumber(ride.max_elevation_m)?Number(ride.max_elevation_m):(hasNumber(saved.elevationMaxM)?Number(saved.elevationMaxM):null);state.elevationMinM=hasNumber(ride.min_elevation_m)?Number(ride.min_elevation_m):(hasNumber(saved.elevationMinM)?Number(saved.elevationMinM):null);
    state.maxLeanLeftDeg=Math.max(Number(saved.maxLeanLeftDeg)||0,Number(ride.max_lean_left_deg)||0);state.maxLeanRightDeg=Math.max(Number(saved.maxLeanRightDeg)||0,Number(ride.max_lean_right_deg)||0);state.leftTurnCount=Math.max(Number(saved.leftTurnCount)||0,Number(ride.turn_left_count)||0);state.rightTurnCount=Math.max(Number(saved.rightTurnCount)||0,Number(ride.turn_right_count)||0);
    const bestSec=Number(ride.accel_best_80_s),bestStart=Number(ride.accel_best_80_start_kmh),bestEnd=Number(ride.accel_best_80_end_kmh);if(Number.isFinite(bestSec)&&bestSec>0&&Number.isFinite(bestStart)&&Number.isFinite(bestEnd))state.accelBest80={seconds:bestSec,startKmh:bestStart,endKmh:bestEnd};
    const slowSec=Number(ride.accel_slowest_80_s),slowStart=Number(ride.accel_slowest_80_start_kmh),slowEnd=Number(ride.accel_slowest_80_end_kmh);if(Number.isFinite(slowSec)&&slowSec>0&&Number.isFinite(slowStart)&&Number.isFinite(slowEnd))state.accelSlow80={seconds:slowSec,startKmh:slowStart,endKmh:slowEnd};
    if(ride.accel_0_80_s!==null&&Number.isFinite(Number(ride.accel_0_80_s)))state.accelBest080=Number(ride.accel_0_80_s);if(ride.accel_0_100_s!==null&&Number.isFinite(Number(ride.accel_0_100_s)))state.accelBest0100=Number(ride.accel_0_100_s);
    state.tripLength=['day','weekend','7days','14days'].includes(ride.trip_length_code)?ride.trip_length_code:(saved.tripLength||state.tripLength);
    const dbDay=Math.max(1,Number(ride.current_day_number)||Number(saved.tripDayNumber)||1),calculatedDay=calculateTripDayNumber(Date.now());
    state.tripDayNumber=Math.max(calculatedDay,dbDay);
    state.tripSegmentNumber=state.tripDayNumber>dbDay?1:Math.max(1,Number(ride.current_segment_number)||Number(saved.tripSegmentNumber)||1);
    const lastPointAt=ride.last_point_at?new Date(ride.last_point_at).getTime():0;
    if(state.tripDayNumber===dbDay&&lastPointAt&&Date.now()-lastPointAt>=MULTIDAY_SEGMENT_STOP_MS)state.tripSegmentNumber++;
    state.segmentUploadCount=state.tripDayNumber===dbDay&&state.tripSegmentNumber===Number(ride.current_segment_number)?Math.max(0,Number(saved.segmentUploadCount)||0,Number(ride.current_segment_point_count)||0):0;
    state.tripStartLocalDate=saved.tripStartLocalDate||localDateKey(state.rideStartedAt);localStorage.setItem('ridez_trip_length',state.tripLength);updateTripProgressBadge(true);
    state.lastPos=null;state.lastUpload=0;state.statsLastT=Date.now();state.demo=false;localStorage.setItem('ridez_driver_token',state.driverToken);setRideButtons(true);$('rideStatus').textContent='Tur fortsætter';$('statusDetail').textContent=`RIDEZ har genfundet ${tripLengthLabel(state.tripLength).toLowerCase()}en · dag ${state.tripDayNumber}.`;
    $('distanceValue').textContent=`${(state.distanceM/1000).toFixed(1).replace('.',',')} km`;if($('topSpeedValue'))$('topSpeedValue').textContent=fmtSpeed(state.maxSpeedMs);if($('movingTimeValue'))$('movingTimeValue').textContent=fmtDuration(state.movingMs/1000);if($('stoppedTimeValue'))$('stoppedTimeValue').textContent=fmtDuration(state.stoppedMs/1000);renderAccelerationSummary();renderLeanSummary();renderTripExtraSummary();fetchFuel95Price(false).catch(()=>{});
    await loadExistingActiveTrack();if(navigator.geolocation)startGpsWatch('high');persistActiveRideSession(true);return true;
  }catch(e){console.warn('Aktiv tur kunne ikke genoptages',e);return false}
  finally{state.resumingRide=false}
}
function resetDriverTripDisplay({clearMarker=true}={}){updateTripProgressBadge(false);resetAccelerationStats();resetLeanStats();resetElevationState();state.rideConsumptionL100=null;state.currentSpeedMs=0;state.lastPos=null;state.lastUpload=0;state.gpsMode='high';state.lastLowMapPoint=0;state.tripDayNumber=1;state.tripSegmentNumber=1;state.segmentUploadCount=0;state.tripStartLocalDate=null;state.lastAcceptedAt=0;state.lastMovementAt=0;state.distanceM=0;state.moving=false;state.stoppedSince=null;state.maxSpeedMs=0;state.movingMs=0;state.stoppedMs=0;state.statsLastT=null;if(state.topSpeedUpdateTimer){clearTimeout(state.topSpeedUpdateTimer);state.topSpeedUpdateTimer=null}state.points=[];state.messagesSeen=new Set();state.lastDriverMessages=[];state.replyingMessageId=null;closeReplyDialog();clearActivePhotoMarkers();clearActiveRouteLines();if(clearMarker&&state.marker&&state.map){state.map.removeLayer(state.marker);state.marker=null}$('speedValue').textContent='0 km/t';applySpeedColor($('speedValue'),0);$('distanceValue').textContent='0,0 km';if($('topSpeedValue'))$('topSpeedValue').textContent='0 km/t';if($('movingTimeValue'))$('movingTimeValue').textContent='0 sek.';if($('stoppedTimeValue'))$('stoppedTimeValue').textContent='0 sek.';$('messageCount').textContent='0';const el=$('messagesList');if(el){el.className='empty';el.textContent='Ingen beskeder endnu.'}renderTripExtraSummary()}
function setRideButtons(active){$('startBtn').classList.toggle('hidden',active);$('stopBtn').classList.toggle('hidden',!active);$('shareBtn').classList.toggle('hidden',!active);const photos=$('photoActions');if(photos)photos.classList.toggle('hidden',!active);$('demoBtn').disabled=active&&!state.demo;$('demoType').disabled=active;if(!active){const fb=$('photoFeedback');if(fb)fb.textContent=''}}
async function createRide(title){
  const v=ensureActiveVehicle();if(!v)throw new Error('Vælg først et køretøj i Indstillinger.');
  state.driverToken=token();state.publicToken=token();state.rideStartedAt=Date.now();state.rideConsumptionL100=Number.isFinite(Number(v.consumptionL100))&&Number(v.consumptionL100)>0?Number(v.consumptionL100):null;state.elevationMaxM=null;state.elevationMinM=null;state.elevationQueue=[];state.elevationLastQueuedAt=0;state.elevationLastQueuedPos=null;state.tripDayNumber=1;state.tripSegmentNumber=1;state.segmentUploadCount=0;state.tripStartLocalDate=localDateKey(state.rideStartedAt);localStorage.setItem('ridez_driver_token',state.driverToken);ensureOwnerToken();
  try{
    state.rideId=await rpc('ridez_create_ride_v97',{p_owner_token:state.ownerToken,p_driver_token:state.driverToken,p_public_token:state.publicToken,p_title:title,p_vehicle_type:v.type,p_vehicle_name:v.name||'',p_vehicle_make:v.make||'',p_vehicle_model:v.model||'',p_vehicle_year:v.year||null,p_vehicle_consumption_l100:state.rideConsumptionL100,p_trip_length_code:state.tripLength});
  }catch(e){
    console.error(e);state.rideId=null;state.publicToken=null;state.driverToken=null;state.rideStartedAt=null;localStorage.removeItem('ridez_driver_token');updateTripProgressBadge(false);
    throw new Error('Forbrug & højde v97 er ikke aktiveret i Supabase endnu. Kør supabase-forbrug-hoejde-v97.sql én gang.');
  }
  updateTripProgressBadge(true);setRideButtons(true);renderTripExtraSummary();fetchFuel95Price(false).catch(()=>{});persistActiveRideSession(true);pollMessages();
}
const GPS_IDLE_AFTER_MS=5*60*1000;
const GPS_LOW_UPLOAD_MS=60000;
function clearGpsWatch(){
  if(state.watchId!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(state.watchId)}catch(e){}}
  state.watchId=null;
}
function startGpsWatch(mode='high'){
  if(state.demo||!state.rideId||!navigator.geolocation)return;
  clearGpsWatch();
  state.gpsMode=mode==='low'?'low':'high';
  const options=state.gpsMode==='low'
    ?{enableHighAccuracy:false,maximumAge:30000,timeout:60000}
    :{enableHighAccuracy:true,maximumAge:0,timeout:20000};
  state.watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,options);
  if(state.gpsMode==='low'){
    $('statusDetail').textContent='Lang stilstand registreret. GPS kører nu strømbesparende og går automatisk tilbage til normal ved bevægelse.';
  }
}
function maybeAdjustGpsMode(now,speed,cur,previousPos){
  if(state.demo||!state.rideId)return;
  if(state.gpsMode==='low'){
    const movedDistance=previousPos?hav(previousPos,cur):0;
    const movementDetected=speed>=C.MOVING_THRESHOLD_MS||movedDistance>Math.max(30,(Number(cur.accuracy)||0)*1.5);
    if(movementDetected){
      state.gpsMode='high';
      setTimeout(()=>startGpsWatch('high'),0);
      $('statusDetail').textContent='Bevægelse registreret. GPS er tilbage på normal registrering.';
    }
    return;
  }
  if(state.stoppedSince&&now-state.stoppedSince>=GPS_IDLE_AFTER_MS){
    state.gpsMode='low';
    state.lastLowMapPoint=0;
    setTimeout(()=>startGpsWatch('low'),0);
  }
}
async function startRide(){if(!setupComplete()){openUsernameDialog(true);return}requestMessageNotificationPermission();if(!navigator.geolocation){alert('GPS understøttes ikke på denne enhed.');return}stopDemoTimer();state.demo=false;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');resetDriverTripDisplay({clearMarker:true});resetSpeedDemoResults(false);await createRide('RIDEZ live-tur');$('rideStatus').textContent='Starter GPS…';startGpsWatch('high')}
function onGeoError(e){$('statusDetail').textContent=`GPS-fejl: ${e.message}`}
function gpsPointAcceptable(cur,accuracy,speed){
  if(!Number.isFinite(cur.lat)||!Number.isFinite(cur.lng))return false;
  accuracy=Number.isFinite(accuracy)?accuracy:999;
  if(accuracy>(state.gpsMode==='low'?250:100))return false;
  if(!state.lastPos)return true;
  const dt=Math.max(.05,(cur.t-state.lastPos.t)/1000),dist=hav(state.lastPos,cur),lastAcc=Number(state.lastPos.accuracy)||accuracy;
  const plausible=Math.max(90,dt*90+Math.min(accuracy,80)+Math.min(lastAcc,80));
  if(dist>plausible)return false;
  if(Number(speed)>95)return false;
  return true;
}
async function processPosition(cur,speed,accuracy=5){
  const now=cur.t||Date.now();accuracy=Number.isFinite(Number(accuracy))?Number(accuracy):999;cur.accuracy=accuracy;
  if(!gpsPointAcceptable(cur,accuracy,speed)){state.gpsRejectCount++;if(state.gpsRejectCount===1||state.gpsRejectCount%5===0)$('statusDetail').textContent=`GPS-punkt ignoreret pga. lav præcision (${Math.round(accuracy)} m). RIDEZ fortsætter automatisk.`;return}
  state.gpsRejectCount=0;const previousPos=state.lastPos;speed=Math.max(0,Number(speed)||0);syncTripPartition(now,speed);
  if(previousPos){const dist=hav(previousPos,cur);const lowPowerStationary=state.gpsMode==='low'&&speed<=C.STOPPED_THRESHOLD_MS;if(dist<1000&&!lowPowerStationary)state.distanceM+=dist}
  state.currentSpeedMs=speed;const newTop=speed>state.maxSpeedMs+0.05;updateRideStats(now,speed);updateAccelerationStats(now,speed);if(newTop)schedulePublicTopSpeed();
  if(speed>=C.MOVING_THRESHOLD_MS){state.stoppedSince=null;setMotion(true)}else if(speed<=C.STOPPED_THRESHOLD_MS){if(!state.stoppedSince)state.stoppedSince=now;if(now-state.stoppedSince>=C.STATIONARY_SECONDS*1000)setMotion(false)}
  maybeAdjustGpsMode(now,speed,cur,previousPos);queueElevationSample(cur,now);state.lastPos=cur;state.lastAcceptedAt=now;$('speedValue').textContent=fmtSpeed(speed);applySpeedColor($('speedValue'),speed);$('distanceValue').textContent=`${(state.distanceM/1000).toFixed(1).replace('.',',')} km`;renderTripExtraSummary();
  const appendLowPoint=state.gpsMode!=='low'||now-state.lastLowMapPoint>=GPS_LOW_UPLOAD_MS;updateMap(cur.lat,cur.lng,true,appendLowPoint);if(state.gpsMode==='low'&&appendLowPoint)state.lastLowMapPoint=now;persistActiveRideSession();
  const uploadInterval=state.gpsMode==='low'?GPS_LOW_UPLOAD_MS:C.LOCATION_UPLOAD_MS;
  if(now-state.lastUpload>=uploadInterval){state.lastUpload=now;try{await rpc('ridez_update_location_v96',{p_driver_token:state.driverToken,p_lat:cur.lat,p_lng:cur.lng,p_speed_ms:speed,p_moving:state.moving,p_accuracy_m:accuracy,p_recorded_at:new Date(now).toISOString(),p_day_number:state.tripDayNumber,p_segment_number:state.tripSegmentNumber});state.segmentUploadCount++;await publishLiveStats();persistActiveRideSession(true)}catch(e){console.error(e);$('statusDetail').textContent='GPS-punktet kunne ikke gemmes i Supabase. RIDEZ prøver igen automatisk.'}}
}
async function onPosition(pos){
  const now=Date.now(),cur={lat:Number(pos.coords.latitude),lng:Number(pos.coords.longitude),t:now,accuracy:Number(pos.coords.accuracy)};
  let speed=Number.isFinite(pos.coords.speed)?Math.max(0,pos.coords.speed):null;
  if(state.lastPos&&speed===null){const dt=(now-state.lastPos.t)/1000;if(dt>0)speed=hav(state.lastPos,cur)/dt}
  await processPosition(cur,speed||0,cur.accuracy);
}
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
  if(type==='fuel123'){return i>=total?0:80/3.6;}
  if(type==='messagetest'){
    // v76: Beskedtest. 10 s koersel -> 30 s stille -> 10 s koersel -> 30 s stille.
    // De lange stop giver tid til at modtage en ventende besked efter 3 s og sende et svar.
    if(i<10)return 40/3.6;
    if(i<40)return 0;
    if(i<50)return 40/3.6;
    if(i<80)return 0;
    return 0;
  }
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
  if(type==='messagetest') return [start,brewery,bognaes,start];
  if(type==='fuel123') return [start,brewery,bognaes,start];
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
async function startDemo(){if(!setupComplete()){openUsernameDialog(true);return}
  requestMessageNotificationPermission();
  if(state.rideId){alert('Afslut den aktive tur først.');return}
  resetDriverTripDisplay({clearMarker:true});
  state.demo=true;state.demoIndex=0;state.demoTravelM=0;state.demoProfile=$('demoType').value;
  if(state.demoProfile==='fuel123'&&!currentRideConsumption()){state.demo=false;alert('Angiv først køretøjets teoretiske forbrug under Indstillinger → Køretøjer. Derefter kan 123 km-brændstoftesten beregne liter og pris.');return;}
  $('demoBadge').textContent='DEMO v102';$('demoBadge').classList.remove('hidden');
  $('demoBtn').textContent='Stop demo';$('demoBtn').classList.add('active');
  $('rideStatus').textContent='Klargør demo…';
  $('statusDetail').textContent='Demo v102 henter din GPS-position og låser rutestarten til en vej højst 120 m væk.';
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
  const demoName=state.demoProfile==='short'?'kort test':state.demoProfile==='city'?'bykørsel':state.demoProfile==='twisty'?'snoet tur':state.demoProfile==='speed'?'speed':state.demoProfile==='speedcolors'?'hastighedsfarver':state.demoProfile==='turntest'?'svingtest':state.demoProfile==='rightturntest'?'5 højresving':state.demoProfile==='policereplay'?'raket Replay-test':state.demoProfile==='messagetest'?'beskedtest':state.demoProfile==='fuel123'?'brændstoftest 123 km':'landevej';
  await createRide(`RIDEZ demo · ${demoName}`);
  await publishDemoChannel();
  $('rideStatus').textContent='Demo starter…';
  const isSpeed=state.demoProfile==='speed';
  const isSpeedColors=state.demoProfile==='speedcolors';
  const isTurnTest=state.demoProfile==='turntest';
  const isRightTurnTest=state.demoProfile==='rightturntest';
  const isPoliceReplay=state.demoProfile==='policereplay';
  const isMessageTest=state.demoProfile==='messagetest';
  const isFuel123=state.demoProfile==='fuel123';
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
            :isMessageTest
              ?'Beskedtest: 10 sek. kørsel, 30 sek. stille, 10 sek. kørsel og 30 sek. stille. Brug følgelinket til at teste beskeder og svar.'
              :isFuel123
                ?'Brændstoftest: simulerer 123 km på ca. 5 sekunder og beregner teoretisk forbrug samt Blyfri 95-pris.'
                :`Starter på ${state.demoBase.name||'Toftevej, Herslev'} og simulerer hastighed og stop.`;
  const total=isFuel123?5:isSpeed?18:isSpeedColors?80:isTurnTest?22:isRightTurnTest?20:isPoliceReplay?40:isMessageTest?80:state.demoProfile==='short'?60:state.demoProfile==='city'?90:state.demoProfile==='twisty'?110:90;
  const tickMs=isFuel123?500:isSpeed?200:(isTurnTest||isRightTurnTest)?250:1000;
  const stepS=tickMs/1000;
  if(isSpeed)resetSpeedDemoResults(true);else resetSpeedDemoResults(false);
  async function tick(){
    if(!state.demo||!state.rideId)return;
    const step=state.demoIndex++;
    const t=(isFuel123||isSpeed||isTurnTest||isRightTurnTest)?step*stepS:step;
    const speed=demoSpeed(state.demoProfile,t,total);
    if(isSpeed)updateSpeedDemoAttempt(t,speed);
    if(isFuel123){
      const mapSpan=Math.min(Math.max(40,state.demoRoute.total*0.12),500);
      state.demoTravelM=Math.min(mapSpan,mapSpan*Math.min(1,t/total));
    }else state.demoTravelM+=speed*((isSpeed||isTurnTest||isRightTurnTest)?stepS:1);
    const cur=demoPointAt(state.demoRoute,state.demoTravelM);
    if(!cur){await stopRide();return}
    updateLeanStats(demoLean(state.demoProfile,t,total,speed),cur.t,speed,{demo:true});
    if(isSpeed){processPosition(cur,speed,4).catch(e=>console.error(e));}
    else await processPosition(cur,speed,4);
    if(isFuel123){
      state.distanceM=Math.min(123000,123000*Math.min(1,t/total));
      $('distanceValue').textContent=fmtKm(state.distanceM);
      renderTripExtraSummary();
    }
    if(t>=total||(!isFuel123&&state.demoTravelM>=state.demoRoute.total-5)){
      if(isFuel123){
        state.distanceM=123000;$('distanceValue').textContent=fmtKm(state.distanceM);renderTripExtraSummary();
        await fetchFuel95Price(true);
        const c=currentRideConsumption(),values=calculateFuel(state.distanceM,c,state.fuel95Price);
        alert(`123 km-brændstoftest færdig.\n\nTeoretisk forbrug: ${values.liters!==null?fmtLiters(values.liters):'ikke angivet'}\nBlyfri 95: ${hasNumber(state.fuel95Price)?Number(state.fuel95Price).toFixed(2).replace('.',',')+' kr./l':'kunne ikke hentes'}\nEstimeret pris: ${values.cost!==null?fmtDkk(values.cost):'–'}\n\nTuren gemmes også i Historik.`);
      }
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
async function endRideReliable(payload){
  let lastError=null;
  const calls=[
    ['ridez_end_ride_v96',payload],
    ['ridez_end_ride_v92',payload],
    ['ridez_end_ride_v38',payload],
    ['ridez_end_ride_v36',{p_driver_token:payload.p_driver_token,p_distance_m:payload.p_distance_m,p_duration_s:payload.p_duration_s,p_max_speed_ms:payload.p_max_speed_ms,p_moving_s:payload.p_moving_s,p_stopped_s:payload.p_stopped_s,p_accel_0_80_s:payload.p_accel_0_80_s,p_accel_0_100_s:payload.p_accel_0_100_s,p_accel_best_80_s:payload.p_accel_best_80_s,p_accel_best_80_start_kmh:payload.p_accel_best_80_start_kmh,p_accel_best_80_end_kmh:payload.p_accel_best_80_end_kmh,p_accel_slowest_80_s:payload.p_accel_slowest_80_s,p_accel_slowest_80_start_kmh:payload.p_accel_slowest_80_start_kmh,p_accel_slowest_80_end_kmh:payload.p_accel_slowest_80_end_kmh}],
    ['ridez_end_ride_v19',{p_driver_token:payload.p_driver_token,p_distance_m:payload.p_distance_m,p_duration_s:payload.p_duration_s,p_max_speed_ms:payload.p_max_speed_ms,p_moving_s:payload.p_moving_s,p_stopped_s:payload.p_stopped_s}],
    ['ridez_end_ride_v18',{p_driver_token:payload.p_driver_token,p_distance_m:payload.p_distance_m,p_duration_s:payload.p_duration_s,p_max_speed_ms:payload.p_max_speed_ms,p_moving_s:payload.p_moving_s,p_stopped_s:payload.p_stopped_s}],
    ['ridez_end_ride_v16',{p_driver_token:payload.p_driver_token,p_distance_m:payload.p_distance_m,p_duration_s:payload.p_duration_s}],
    ['ridez_end_ride',{p_driver_token:payload.p_driver_token}]
  ];
  for(const [name,args] of calls){try{await rpc(name,args);return true}catch(e){lastError=e;console.warn(name+' kunne ikke afslutte turen',e)}}
  throw lastError||new Error('Turen kunne ikke afsluttes i databasen.');
}
async function stopRide(){
  clearGpsWatch();state.gpsMode='high';stopDemoTimer();
  try{await flushPublicTopSpeed()}catch(e){console.warn(e)}
  const finishedDistance=state.distanceM,finishedDuration=state.rideStartedAt?Math.max(0,Math.round((Date.now()-state.rideStartedAt)/1000)):0,finishedMoving=Math.max(0,Math.round(state.movingMs/1000)),finishedStopped=Math.max(0,Math.round(state.stoppedMs/1000)),finishedMaxSpeed=Math.max(0,state.maxSpeedMs),best80=state.accelBest80,slow80=state.accelSlow80;
  finishTurn(Date.now());if(!state.demo&&state.elevationQueue.length){try{await flushElevationQueue(true)}catch(e){console.warn('Sidste højdepunkter kunne ikke færdigbehandles',e)}}const finishedLeanLeft=Math.max(0,state.maxLeanLeftDeg),finishedLeanRight=Math.max(0,state.maxLeanRightDeg),finishedTurnsLeft=Math.max(0,state.leftTurnCount),finishedTurnsRight=Math.max(0,state.rightTurnCount);
  const payload={p_driver_token:state.driverToken,p_distance_m:finishedDistance,p_duration_s:finishedDuration,p_max_speed_ms:finishedMaxSpeed,p_moving_s:finishedMoving,p_stopped_s:finishedStopped,p_accel_0_80_s:state.accelBest080,p_accel_0_100_s:state.accelBest0100,p_accel_best_80_s:best80?best80.seconds:null,p_accel_best_80_start_kmh:best80?best80.startKmh:null,p_accel_best_80_end_kmh:best80?best80.endKmh:null,p_accel_slowest_80_s:slow80?slow80.seconds:null,p_accel_slowest_80_start_kmh:slow80?slow80.startKmh:null,p_accel_slowest_80_end_kmh:slow80?slow80.endKmh:null,p_max_lean_left_deg:finishedLeanLeft,p_max_lean_right_deg:finishedLeanRight,p_turn_left_count:finishedTurnsLeft,p_turn_right_count:finishedTurnsRight};
  if(state.driverToken){
    persistActiveRideSession(true);
    try{await storeFuelSnapshot(finishedDistance)}catch(e){console.warn('Turens brændstofpris kunne ikke gemmes',e)}
    try{await endRideReliable(payload)}catch(e){console.error(e);if(!state.demo){$('rideStatus').textContent='Turen er ikke afsluttet';$('statusDetail').textContent='RIDEZ kunne ikke gemme afslutningen. Turen er bevaret og kan forsøges afsluttet igen.';setRideButtons(true);if(navigator.geolocation)startGpsWatch('high');alert('Turen kunne ikke gemmes som afsluttet. RIDEZ har derfor IKKE slettet turen lokalt. Kontrollér forbindelsen og tryk Stop tur igen.');return}}
  }
  clearActiveRideSession();
  resetDriverTripDisplay({clearMarker:true});state.rideId=null;state.publicToken=null;state.driverToken=null;state.rideStartedAt=null;localStorage.removeItem('ridez_driver_token');state.demo=false;state.demoIndex=0;state.demoBase=null;state.demoProfile=null;state.demoRoute=null;state.demoTravelM=0;$('demoBadge').classList.add('hidden');$('demoBtn').textContent='Start demo';$('demoBtn').classList.remove('active');setRideButtons(false);$('rideStatus').textContent='Ikke startet';$('statusDetail').textContent='Start en tur for at dele din position.';setMotion(false);await loadHistory();
}
function openEndRideDialog(){
  if(!state.rideId)return;
  const dlg=$('endRideDialog');if(!dlg){stopRide();return}
  const status=$('endRideHoldStatus'),btn=$('endRideHoldBtn');
  if(status)status.textContent='Hold knappen nede i 3 sekunder';
  if(btn){btn.style.setProperty('--hold-progress','0%');btn.classList.remove('holding')}
  if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','');
}
function closeEndRideDialog(){const dlg=$('endRideDialog');if(!dlg)return;if(typeof dlg.close==='function'&&dlg.open)dlg.close();else dlg.removeAttribute('open')}
function initEndRideDialog(){
  const dlg=$('endRideDialog'),btn=$('endRideHoldBtn'),cancel=$('endRideCancelBtn'),status=$('endRideHoldStatus');if(!dlg||!btn)return;
  let timer=null,raf=null,startAt=0,finishing=false;
  const reset=()=>{if(timer){clearTimeout(timer);timer=null}if(raf){cancelAnimationFrame(raf);raf=null}startAt=0;btn.classList.remove('holding');btn.style.setProperty('--hold-progress','0%');if(status&&!finishing)status.textContent='Hold knappen nede i 3 sekunder'};
  const draw=()=>{if(!startAt||finishing)return;const elapsed=performance.now()-startAt,pct=Math.min(100,elapsed/3000*100);btn.style.setProperty('--hold-progress',pct.toFixed(1)+'%');if(status)status.textContent=pct>=100?'Afslutter turen…':`Hold… ${(3-elapsed/1000).toFixed(1).replace('.',',')} sek.`;if(pct<100)raf=requestAnimationFrame(draw)};
  const finish=async()=>{if(finishing)return;finishing=true;if(timer){clearTimeout(timer);timer=null}if(raf){cancelAnimationFrame(raf);raf=null}btn.style.setProperty('--hold-progress','100%');btn.classList.add('holding');if(status)status.textContent='Afslutter turen…';closeEndRideDialog();try{await stopRide()}finally{finishing=false;reset()}};
  const begin=e=>{if(finishing||!state.rideId)return;e.preventDefault();reset();startAt=performance.now();btn.classList.add('holding');timer=setTimeout(finish,3000);raf=requestAnimationFrame(draw);try{if(e.pointerId!=null)btn.setPointerCapture(e.pointerId)}catch(err){}};
  const abort=e=>{if(finishing)return;if(e)e.preventDefault();reset()};
  btn.addEventListener('pointerdown',begin);btn.addEventListener('pointerup',abort);btn.addEventListener('pointercancel',abort);btn.addEventListener('lostpointercapture',abort);btn.addEventListener('contextmenu',e=>e.preventDefault());
  if(cancel)cancel.addEventListener('click',()=>{reset();closeEndRideDialog()});
  dlg.addEventListener('cancel',e=>{e.preventDefault();reset();closeEndRideDialog()});
}
async function shareRide(){const url=state.demo?`${location.origin}${location.pathname}?demo=${encodeURIComponent(ensureDemoChannelToken())}`:`${location.origin}${location.pathname}?ride=${encodeURIComponent(state.publicToken)}`;const w=vehicleWords(currentVehicleType());const text=state.demo?'Følg mine RIDEZ-demoer live på det samme link':`Følg min ${w.possessive} live på RIDEZ`;if(navigator.share){try{await navigator.share({title:'Følg min RIDEZ-tur',text,url});return}catch(e){}}await navigator.clipboard.writeText(url);alert(state.demo?'Fast demo-følgelink kopieret. Det samme link kan bruges til kommende demo-ture.':'Følgelink kopieret.')}
function requestMessageNotificationPermission(){
  try{if('Notification'in window&&Notification.permission==='default')Notification.requestPermission().catch(()=>{})}catch(e){}
}
function playMessageChime(){
  if(!state.soundsEnabled)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    const ctx=new AC(),now=ctx.currentTime;
    [[0,740,.12],[.14,980,.15]].forEach(([delay,freq,dur])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(freq,now+delay);g.gain.setValueAtTime(.0001,now+delay);g.gain.exponentialRampToValueAtTime(.11,now+delay+.018);g.gain.exponentialRampToValueAtTime(.0001,now+delay+dur);o.connect(g).connect(ctx.destination);o.start(now+delay);o.stop(now+delay+dur+.03)});
    setTimeout(()=>ctx.close().catch(()=>{}),700);
  }catch(e){}
}
function showMessageToast(message){
  const toast=$('messageNotification');if(!toast)return;
  const who=message&&message.sender_name?message.sender_name:'Ny besked';
  const body=message&&message.body?message.body:'';
  const title=$('messageNotificationTitle'),text=$('messageNotificationBody');
  if(title)title.textContent=`Ny besked fra ${who}`;
  if(text)text.textContent=body;
  toast.classList.remove('hidden');clearTimeout(showMessageToast.timer);
  showMessageToast.timer=setTimeout(()=>toast.classList.add('hidden'),7500);
}
async function notifyNewDriverMessages(unseen){
  if(!unseen||!unseen.length)return;
  const latest=unseen[0];showMessageToast(latest);
  if(navigator.vibrate)navigator.vibrate([140,80,140]);
  playMessageChime();
  try{
    if('Notification'in window&&Notification.permission==='granted'&&'serviceWorker'in navigator){
      const reg=await navigator.serviceWorker.ready;
      await reg.showNotification(`RIDEZ · ${latest.sender_name||'Ny besked'}`,{body:latest.body||'',tag:'ridez-driver-message',renotify:true,silent:!state.soundsEnabled,data:{kind:'ridez-message'}});
    }
  }catch(e){console.warn('Systemnotifikation kunne ikke vises',e)}
}
function updateReplyAvailability(){
  document.querySelectorAll('.message-reply-btn').forEach(btn=>{const canReply=btn.dataset.canReply==='1';btn.disabled=!!state.moving||!canReply;btn.title=!canReply?'Denne ældre besked kan ikke besvares direkte.':(state.moving?`Chatfunktionen er deaktiveret, mens ${vehicleWords(currentVehicleType()).definite} er i bevægelse.`:'Svar på beskeden')});
  const send=$('replySendBtn');if(send)send.disabled=!!state.moving;
  const hint=$('replySafetyHint');if(hint){const w=vehicleWords(currentVehicleType());hint.textContent=state.moving?`${w.definiteCap} er i bevægelse. Chatfunktionen er deaktiveret.`:`${w.definiteCap} holder stille – du kan sende svaret.`;}
  const movingNotice=$('chatMovingNotice');if(movingNotice)movingNotice.classList.toggle('hidden',!state.moving);
  const messageList=$('messagesList');if(messageList)messageList.classList.toggle('chat-locked-content',!!state.moving);
  if(state.moving&&$('replyDialog')&&$('replyDialog').open)closeReplyDialog();
}
function openReplyDialog(messageId){
  if(state.moving){const w=vehicleWords(currentVehicleType());alert(`Du kan først svare, når ${w.definite} har holdt stille i mindst 3 sekunder.`);return}
  const msg=state.lastDriverMessages.find(r=>String(r.id)===String(messageId));if(!msg)return;
  state.replyingMessageId=msg.id;
  const to=$('replyToName'),quoted=$('replyQuotedMessage'),body=$('replyBody'),fb=$('replyFeedback'),dlg=$('replyDialog');
  if(to)to.textContent=msg.sender_name||'følgeren';if(quoted)quoted.textContent=msg.body||'';if(body){body.value='';setTimeout(()=>body.focus(),30)}if(fb)fb.textContent='';
  updateReplyAvailability();if(dlg&&typeof dlg.showModal==='function')dlg.showModal();else if(dlg)dlg.setAttribute('open','');
}
function closeReplyDialog(){const dlg=$('replyDialog');if(dlg&&typeof dlg.close==='function'&&dlg.open)dlg.close();else if(dlg)dlg.removeAttribute('open');state.replyingMessageId=null}
async function sendDriverReply(){
  if(state.moving){updateReplyAvailability();return}
  if(!state.userName){openUsernameDialog(true);return}
  const body=$('replyBody'),fb=$('replyFeedback'),btn=$('replySendBtn');const text=body?body.value.trim():'';if(!text||!state.replyingMessageId)return;
  if(btn){btn.disabled=true;btn.textContent='Sender…'}if(fb)fb.textContent='';
  try{
    await rpc('ridez_driver_reply_v79',{p_driver_token:state.driverToken,p_message_id:Number(state.replyingMessageId),p_sender_name:state.userName,p_body:text});
    if(fb)fb.textContent='✓ Svar sendt til følgeren.';if(body)body.value='';setTimeout(closeReplyDialog,650);
  }catch(e){console.error(e);if(fb)fb.textContent=(String(e.message||'').toLowerCase().includes('moving'))?`${vehicleWords(currentVehicleType()).definiteCap} skal holde stille, før du kan svare.`:'Svaret kunne ikke sendes. Kontroller at v79 SQL-opdateringen er kørt.'}
  finally{if(btn){btn.textContent='Send svar';btn.disabled=!!state.moving}}
}
async function pollMessages(){
  if(!state.driverToken||!state.rideId)return;
  try{
    // Under kørsel henter førerens app slet ikke chatbeskeder. De bliver liggende i kø i Supabase.
    if(!state.moving){
      let rows;
      try{rows=await rpc('ridez_driver_messages_v77',{p_driver_token:state.driverToken})}
      catch(e){rows=await rpc('ridez_driver_messages_v73',{p_driver_token:state.driverToken})}
      rows=Array.isArray(rows)?rows:[];state.lastDriverMessages=rows;
      $('messageCount').textContent=rows.length;
      const unseen=rows.filter(r=>!state.messagesSeen.has(r.id));
      if(unseen.length){unseen.forEach(r=>state.messagesSeen.add(r.id));renderMessages(rows);notifyNewDriverMessages(unseen)}
      else renderMessages(rows);
    }
  }catch(e){console.error(e)}
  if(state.driverToken&&state.rideId)setTimeout(pollMessages,C.MESSAGE_POLL_MS)
}
function renderMessages(rows){
  const el=$('messagesList');if(!rows.length){el.className='empty';el.textContent='Ingen beskeder endnu.';return}
  el.className='';el.innerHTML=rows.map(r=>{const canReply=!!r.viewer_token;return `<div class="message"><div class="meta"><strong>${escapeHtml(r.sender_name)}</strong> · ${new Date(r.created_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}</div><div class="message-body">${escapeHtml(r.body)}</div><div class="message-actions"><button class="secondary small-button message-reply-btn" type="button" data-message-id="${r.id}" data-can-reply="${canReply?'1':'0'}" ${(state.moving||!canReply)?'disabled':''}>Svar</button></div></div>`}).join('');
  el.querySelectorAll('.message-reply-btn').forEach(btn=>btn.addEventListener('click',()=>openReplyDialog(btn.dataset.messageId)));updateReplyAvailability();
}
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
    const rows=await rpc('ridez_history_v102',{p_owner_token:state.ownerToken}).catch(()=>rpc('ridez_history_v97',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v96',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v80',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v38',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v36',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v18',{p_owner_token:state.ownerToken}));
    const visibleRows=rows.filter(r=>!isEmptyRide(r));
    if(!visibleRows.length){list.className='history-list empty';list.textContent='Ingen afsluttede ture endnu.';state.selectedRideIds.clear();state.historySelectMode=false;updateHistorySelectionUi();return}
    list.innerHTML=visibleRows.map(r=>{
      const avgMoving=Number(r.avg_moving_speed_ms||0)*3.6,top=Number(r.max_speed_ms||0)*3.6;
      return `<div class="history-item" data-ride-id="${r.ride_id}"><button class="history-swipe-delete" type="button" aria-label="Slet tur">Slet</button><div class="history-slide"><label class="history-select-wrap" aria-label="Vælg tur"><input class="history-select-check" type="checkbox"><span></span></label><button class="history-card" type="button"><div><strong>${fmtDate(r.created_at)}</strong><span>${vehicleWords(r.vehicle_type).emoji} ${escapeHtml(r.vehicle_name||vehicleWords(r.vehicle_type).title)} · ${escapeHtml(r.title||'RIDEZ tur')} · ${tripLengthLabel(r.trip_length_code||'day')}${Number(r.day_count||1)>1?` · ${Number(r.day_count)} dage`:''}</span></div><div class="history-summary"><b>${(Number(r.distance_m||0)/1000).toFixed(1).replace('.',',')} km</b><span>${fmtDuration(r.duration_s)}</span><span>Top ${top.toFixed(0)} km/t</span><span>Gns. ${avgMoving.toFixed(0)} km/t</span><span>📷 ${Number(r.photo_count||0)}</span></div></button></div></div>`
    }).join('');
    list.querySelectorAll('.history-item').forEach(bindHistoryItem);
    updateHistorySelectionUi();
  }catch(e){console.error(e);list.className='history-list empty';list.textContent='Historik kunne ikke hentes. Kontroller at SQL-opdateringen til Lean & Sving v38 er kørt i Supabase.'}
}
// RIDEZ Replay v58
function replayVehicleIcon(type=state.historyVehicleType){const w=vehicleWords(type);return L.divIcon({className:'ridez-replay-marker-wrap',html:`<div class="ridez-replay-marker">${w.emoji}</div>`,iconSize:[44,44],iconAnchor:[22,22]})}
function replayPoliceIcon(speedKmh){
  const s=Math.max(0,Math.round(Number(speedKmh)||0));
  return L.divIcon({className:'ridez-rocket-marker-wrap',html:`<div class="ridez-rocket-marker"><span class="rocket-flame" aria-hidden="true">🔥</span><span class="rocket-body" aria-hidden="true">🚀</span><b>TOPFART ${s} km/t</b></div>`,iconSize:[118,70],iconAnchor:[59,35]});
}
function replaySoundIsActive(){return !!state.soundsEnabled}
function syncUsernameUi(){
  const value=$('settingsUsernameValue');if(value)value.textContent=state.userName||'Ikke angivet';
}
function openUsernameDialog(required=false){
  const dlg=$('usernameDialog'),input=$('usernameInput'),cancel=$('usernameCancelBtn'),title=$('usernameDialogTitle'),help=$('usernameDialogHelp'),choice=$('setupVehicleChoice'),fb=$('usernameFeedback'),save=$('usernameSaveBtn');if(!dlg)return;
  state.usernameRequired=!!required;if(title)title.textContent=required?'Opsæt RIDEZ':'Rediger brugernavn';if(help)help.textContent=required?'Vælg dit brugernavn og om du bruger RIDEZ til motorcykel eller bil.':'Navnet gemmes på denne telefon og bruges automatisk, når du skriver i RIDEZ-chatten.';if(cancel)cancel.classList.toggle('hidden',!!required);if(choice)choice.classList.toggle('hidden',!required);if(save)save.textContent=required?'Gem og fortsæt':'Gem brugernavn';if(input)input.value=state.userName||'';if(fb)fb.textContent='';
  if(required){const selected=state.preferredVehicleType||activeVehicle()?.type||'';document.querySelectorAll('input[name="setupVehicleType"]').forEach(r=>r.checked=r.value===selected)}
  if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','');setTimeout(()=>{if(input)input.focus()},50);
}
function closeUsernameDialog(){
  const dlg=$('usernameDialog');if(state.usernameRequired&&!setupComplete())return;if(dlg&&typeof dlg.close==='function'&&dlg.open)dlg.close();else if(dlg)dlg.removeAttribute('open','');state.usernameRequired=false;
}
function saveUsername(e){
  if(e&&e.preventDefault)e.preventDefault();
  const input=$('usernameInput'),fb=$('usernameFeedback');
  const name=(input?input.value:'').trim();
  if(name.length<1){if(fb)fb.textContent='Skriv et brugernavn.';return}
  if(name.length>40){if(fb)fb.textContent='Brugernavnet må højst være 40 tegn.';return}
  let type=state.preferredVehicleType;
  const setupChoice=$('setupVehicleChoice');
  const checked=document.querySelector('input[name="setupVehicleType"]:checked');
  const completingProfile=state.usernameRequired||!!(setupChoice&&!setupChoice.classList.contains('hidden'));
  if(completingProfile&&!checked){if(fb)fb.textContent='Vælg Motorcykel eller Bil.';return}
  // If a type is selected, always persist it. This avoids a stale dialog-state
  // flag leaving the setup half-saved.
  if(checked)type=checked.value==='car'?'car':'motorcycle';
  state.userName=name;
  localStorage.setItem('ridez_username',name);
  if(completingProfile||checked){
    state.preferredVehicleType=type;
    localStorage.setItem('ridez_vehicle_type',type);
    loadVehicleProfiles();
    let v=activeVehicle();
    if(!v){
      v=createDefaultVehicle(type);
    }else if(normalizeVehicleType(v.type)!==type){
      const match=state.vehicleProfiles.find(x=>normalizeVehicleType(x.type)===type);
      if(match){state.activeVehicleId=match.id;v=match}
      else v=createDefaultVehicle(type);
    }else{
      state.activeVehicleId=v.id;
    }
    persistVehicleProfiles();
    localStorage.setItem('ridez_profile_complete','1');
    localStorage.setItem('ridez_primary_profile',JSON.stringify({name,type}));
    localStorage.setItem('ridez_onboarding_v87',JSON.stringify({name,type}));
    state.profileReady=true;
  }
  syncUsernameUi();
  syncVehicleUi();
  if(completingProfile&&!setupComplete()){
    if(fb)fb.textContent='Profilen kunne ikke gemmes. Prøv igen.';
    return;
  }
  state.usernameRequired=false;
  const dlg=$('usernameDialog');
  if(dlg&&typeof dlg.close==='function'&&dlg.open)dlg.close();
  else if(dlg)dlg.removeAttribute('open');
}
function initUsernameSettings(){
  syncUsernameUi();const edit=$('editUsernameBtn'),form=$('usernameForm'),cancel=$('usernameCancelBtn'),dlg=$('usernameDialog');
  if(edit)edit.onclick=()=>openUsernameDialog(false);if(form)form.addEventListener('submit',saveUsername);if(cancel)cancel.onclick=closeUsernameDialog;
  if(dlg)dlg.addEventListener('cancel',e=>{if(state.usernameRequired&&!setupComplete()){e.preventDefault();return}closeUsernameDialog()});
  if(!setupComplete())setTimeout(()=>openUsernameDialog(true),80);
}
function openViewerUsernameDialog(){
  const dlg=$('viewerUsernameDialog'),input=$('viewerUsernameInput'),fb=$('viewerUsernameFeedback');if(!dlg)return;
  if(input)input.value=state.viewerUserName||'';if(fb)fb.textContent='';
  if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','');
  setTimeout(()=>{if(input)input.focus()},60);
}
function closeViewerUsernameDialog(){
  if(!state.viewerUserName)return;const dlg=$('viewerUsernameDialog');if(dlg&&typeof dlg.close==='function'&&dlg.open)dlg.close();else if(dlg)dlg.removeAttribute('open');
}
function saveViewerUsername(e){
  if(e&&e.preventDefault)e.preventDefault();const input=$('viewerUsernameInput'),fb=$('viewerUsernameFeedback');const name=(input?input.value:'').trim();
  if(name.length<1){if(fb)fb.textContent='Skriv et brugernavn.';return}if(name.length>40){if(fb)fb.textContent='Brugernavnet må højst være 40 tegn.';return}
  state.viewerUserName=name;localStorage.setItem('ridez_viewer_username',name);closeViewerUsernameDialog();
}
function initViewerUsernameSettings(){
  const form=$('viewerUsernameForm'),dlg=$('viewerUsernameDialog');if(form)form.addEventListener('submit',saveViewerUsername);
  if(dlg)dlg.addEventListener('cancel',e=>{if(!state.viewerUserName){e.preventDefault();return}closeViewerUsernameDialog()});
  if(!state.viewerUserName)setTimeout(openViewerUsernameDialog,180);
}
function tripLengthLabel(value){return ({day:'Dagstur',weekend:'Weekendtur','7days':'7-dages tur','14days':'14-dages tur'})[value]||'Dagstur'}
function updateTripProgressBadge(active=!!state.rideId){const badge=$('tripProgressBadge');if(!badge)return;badge.classList.toggle('hidden',!active);if(active)badge.textContent=`${tripLengthLabel(state.tripLength)} · Dag ${Math.max(1,Number(state.tripDayNumber)||1)}`}
function localCalendarStamp(ts){const d=new Date(Number(ts)||Date.now());return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())}
function localDateKey(ts){const d=new Date(Number(ts)||Date.now());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function calculateTripDayNumber(ts){if(!state.rideStartedAt)return 1;return Math.max(1,Math.floor((localCalendarStamp(ts)-localCalendarStamp(state.rideStartedAt))/86400000)+1)}
const MULTIDAY_SEGMENT_STOP_MS=15*60*1000;
const MULTIDAY_SEGMENT_POINT_LIMIT=1200;
function syncTripPartition(now,speed){
  const nextDay=calculateTripDayNumber(now);
  if(nextDay!==state.tripDayNumber){state.tripDayNumber=nextDay;state.tripSegmentNumber=1;state.segmentUploadCount=0;state.tripStartLocalDate=state.tripStartLocalDate||localDateKey(state.rideStartedAt);clearActiveRouteLines();updateTripProgressBadge(true);persistActiveRideSession(true);return}
  const movingNow=Number(speed)>=Number(C.MOVING_THRESHOLD_MS||2.5);
  if(movingNow&&state.stoppedSince&&now-state.stoppedSince>=MULTIDAY_SEGMENT_STOP_MS){state.tripSegmentNumber++;state.segmentUploadCount=0;state.activeSegmentKey=null;state.stoppedSince=null;persistActiveRideSession(true)}
  if(state.segmentUploadCount>=MULTIDAY_SEGMENT_POINT_LIMIT){state.tripSegmentNumber++;state.segmentUploadCount=0;state.activeSegmentKey=null;persistActiveRideSession(true)}
  if(movingNow)state.lastMovementAt=now;
}
function clearHistoryRouteLines(){
  if(!state.historyMap)return;
  (state.historyLines||[]).forEach(line=>{try{state.historyMap.removeLayer(line)}catch(e){}});
  state.historyLines=[];state.historyLine=null;
}
function historyTrackDistance(track){
  let total=0,prev=null,prevKey='';
  for(const p of track||[]){const key=`${Number(p.day_number)||1}:${Number(p.segment_number)||1}`;if(prev&&key===prevKey){const d=hav(prev,p);if(Number.isFinite(d)&&d<1000)total+=d}prev=p;prevKey=key}
  return total;
}
function drawHistoryTrack(track){
  clearHistoryRouteLines();if(!state.historyMap)return;
  const groups=new Map();
  for(const p of track||[]){if(!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))continue;const key=`${Number(p.day_number)||1}:${Number(p.segment_number)||1}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push([Number(p.lat),Number(p.lng)])}
  for(const pts of groups.values()){if(!pts.length)continue;const line=L.polyline(pts,{weight:5,color:'#e11d24',smoothFactor:.2,noClip:false}).addTo(state.historyMap);state.historyLines.push(line)}
  state.historyLine=state.historyLines[0]||null;
  if(state.historyLines.length){try{const fg=L.featureGroup(state.historyLines);state.historyMap.fitBounds(fg.getBounds(),{padding:[20,20]})}catch(e){}}
}
function updateReplayForDaySelection(){
  const start=$('historyReplayStart'),status=$('historyReplayStatus');
  const whole=state.historySelectedDay===0&&state.historyDays.length>1;
  if(start)start.disabled=whole||state.historyTrack.length<2;
  if(whole&&status)status.textContent='Vælg en bestemt dag for at afspille Replay på en flerdagstur.';
}

function openTripLengthDialog(){
  if(state.rideId){alert('Turens længde kan ændres, når den aktuelle tur er afsluttet. Valget gælder den næste tur.');return}
  const dlg=$('tripLengthDialog');if(!dlg)return;
  const current=state.tripLength||'day';
  document.querySelectorAll('input[name="tripLength"]').forEach(input=>{input.checked=input.value===current});
  if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','');
}
function closeTripLengthDialog(){const dlg=$('tripLengthDialog');if(dlg&&typeof dlg.close==='function'&&dlg.open)dlg.close();else if(dlg)dlg.removeAttribute('open')}
function saveTripLength(e){
  if(e&&e.preventDefault)e.preventDefault();
  const checked=document.querySelector('input[name="tripLength"]:checked');
  const value=checked&&['day','weekend','7days','14days'].includes(checked.value)?checked.value:'day';
  state.tripLength=value;localStorage.setItem('ridez_trip_length',value);closeTripLengthDialog();
}
function initTripLengthSettings(){
  const btn=$('tripLengthSettingsBtn'),form=$('tripLengthForm'),cancel=$('tripLengthCancelBtn');
  if(btn)btn.addEventListener('click',openTripLengthDialog);
  if(form)form.addEventListener('submit',saveTripLength);
  if(cancel)cancel.addEventListener('click',closeTripLengthDialog);
}
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
      const res=await fetch('./RIDEZ_Sportsbike_4-8sek.wav?v=97',{cache:'force-cache'});
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
  const status=$('historyReplayStatus');if(status)status.textContent=`🚀 Topfart ${Math.round(kmh)} km/t · raketten følger tæt bag ${vehicleWords(state.historyVehicleType).definite}`;
  state.replayPoliceTimer=setTimeout(()=>{if(state.historyMap&&state.replayPoliceMarker){try{state.historyMap.removeLayer(state.replayPoliceMarker)}catch(e){}}state.replayPoliceMarker=null;state.replayPoliceTimer=null;stopReplayPoliceSound()},9000);
}
function prepareReplayTrack(track){
  const clean=[];let prev=null,prevKey='';
  for(const p of (track||[])){
    const lat=Number(p.lat),lng=Number(p.lng),ts=new Date(p.created_at).getTime(),key=`${Number(p.day_number)||1}:${Number(p.segment_number)||1}`;
    if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;if(key!==prevKey)prev=null;
    if(prev&&Number.isFinite(ts)&&Number.isFinite(prev.ts)){const dt=Math.max(.05,(ts-prev.ts)/1000),dist=hav(prev,{lat,lng});if(dist/dt>95)continue}
    clean.push({...p,lat,lng,_ts:Number.isFinite(ts)?ts:null,_segmentKey:key});prev={lat,lng,ts:Number.isFinite(ts)?ts:null};prevKey=key;
  }
  let cum=0,firstTs=null,last=null,lastKey='';
  return clean.map((p,i)=>{const ts=p._ts!==null?p._ts:(firstTs===null?Date.now():firstTs+i*3000);if(firstTs===null)firstTs=ts;if(last&&p._segmentKey===lastKey)cum+=hav(last,p);last=p;lastKey=p._segmentKey;const out={...p,replayTs:ts,replayElapsedS:Math.max(0,(ts-firstTs)/1000),replayDistanceM:cum};delete out._ts;delete out._segmentKey;return out});
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
  (state.historyLines.length?state.historyLines:[state.historyLine]).filter(Boolean).forEach(line=>line.setStyle({weight:5,color:'#e11d24',opacity:1}));
  if(restorePhotos)restoreHistoryPhotoMarkers();
  if(fitRoute&&state.historyMap&&state.historyLines.length){try{state.historyMap.fitBounds(L.featureGroup(state.historyLines).getBounds(),{padding:[20,20]})}catch(e){}}
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
  if(!state.replayMarker)state.replayMarker=L.marker(latlng,{icon:replayVehicleIcon(),zIndexOffset:1000}).addTo(state.historyMap);else state.replayMarker.setLatLng(latlng);
  if(!state.replayProgressPoints.length)state.replayProgressPoints.push(latlng);else state.replayProgressPoints.push(latlng);
  if(!state.replayProgressLine)state.replayProgressLine=L.polyline(state.replayProgressPoints,{weight:6,color:'#f2b705',opacity:.95}).addTo(state.historyMap);else state.replayProgressLine.setLatLngs(state.replayProgressPoints);
  if(state.replayIndex===0)state.historyMap.setView(latlng,16);else state.historyMap.panTo(latlng,{animate:true,duration:.18});
  revealReplayPhotos(p.replayTs);updateReplayLive(p,state.replayIndex);if(!state.replayPoliceTriggered&&state.replayPoliceIndex>=0&&state.replayIndex>=state.replayPoliceIndex)triggerReplayPolice(p);if(state.replayPoliceMarker)updateReplayPolicePosition();
}
function startHistoryReplay(){
  if(state.historySelectedDay===0&&state.historyDays.length>1){alert('Vælg først en bestemt dag for Replay. Hele flerdagsturen vises som samlet oversigt.');return}
  if(state.historyTrack.length<2){alert('Der er ikke nok GPS-punkter på denne tur til Replay.');return}
  clearReplayLayers();clearHistoryPhotoMarkers();state.replayPhotoShown=new Set();state.replayIndex=0;state.replayRunning=true;state.replayPaused=false;prepareReplayPoliceTrigger();armReplayPoliceAudio();
  (state.historyLines.length?state.historyLines:[state.historyLine]).filter(Boolean).forEach(line=>line.setStyle({weight:4,color:'#5b616b',opacity:.65}));
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
function renderHistoryDaySelector(){
  const wrap=$('historyDaySelector'),buttons=$('historyDayButtons'),summary=$('historyDaySummary');if(!wrap||!buttons)return;
  const days=state.historyDays||[];wrap.classList.toggle('hidden',days.length<=1);
  buttons.innerHTML=[`<button class="history-day-button active" type="button" data-history-day="0">Hele turen</button>`,...days.map(d=>`<button class="history-day-button" type="button" data-history-day="${d.day_number}">Dag ${d.day_number}</button>`)].join('');
  buttons.querySelectorAll('.history-day-button').forEach(btn=>btn.addEventListener('click',()=>selectHistoryDay(Number(btn.dataset.historyDay)||0)));
  if(summary)summary.textContent=days.length>1?`${days.length} registrerede dage · vælg hele turen eller en enkelt dag.`:'';
}
async function selectHistoryDay(dayNumber){
  const ride=state.historySelectedRide,rideId=ride&&ride.ride_id;if(!rideId)return;
  state.historySelectedDay=Math.max(0,Number(dayNumber)||0);resetHistoryReplay({restorePhotos:false,fitRoute:false});
  document.querySelectorAll('.history-day-button').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.historyDay)===state.historySelectedDay));
  const summary=$('historyDaySummary');if(summary)summary.textContent='Henter ruten…';
  try{
    let track;try{track=await fetchTrackPages('ridez_history_track_v96',{p_owner_token:state.ownerToken,p_ride_id:rideId,p_day_number:state.historySelectedDay},{pageSize:1000,maxPages:30})}catch(e){track=await rpc('ridez_history_track',{p_owner_token:state.ownerToken,p_ride_id:rideId})}
    state.historyTrack=prepareReplayTrack(Array.isArray(track)?track:[]);drawHistoryTrack(state.historyTrack);
    const photos=state.historySelectedDay===0?state.historyAllPhotos:state.historyAllPhotos.filter(p=>Number(p.day_number||1)===state.historySelectedDay);renderHistoryPhotos(photos);
    const d=state.historyDays.find(x=>Number(x.day_number)===state.historySelectedDay);
    if(summary){if(state.historySelectedDay===0)summary.textContent=`Hele turen · ${state.historyDays.length||1} dag${state.historyDays.length===1?'':'e'} · oversigtsruten er automatisk komprimeret ved meget lange ture.`;else summary.textContent=`Dag ${state.historySelectedDay} · ${d?`${(Number(d.distance_m||0)/1000).toFixed(1).replace('.',',')} km · top ${Math.round(Number(d.max_speed_ms||0)*3.6)} km/t · ${Number(d.segment_count||0)} segment${Number(d.segment_count||0)===1?'':'er'}`:'rute'}`}
    setTimeout(()=>state.historyMap&&state.historyMap.invalidateSize(),50);resetHistoryReplay({restorePhotos:true,fitRoute:false});updateReplayForDaySelection();
  }catch(e){console.error(e);if(summary)summary.textContent='Ruten kunne ikke hentes.'}
}
async function openHistoryRide(rideId){
  resetHistoryReplay({restorePhotos:false,fitRoute:false});state.historyTrack=[];state.historyPhotosData=[];state.historyAllPhotos=[];state.historyDays=[];state.historySelectedDay=0;
  const detail=$('historyDetail');detail.classList.remove('hidden');detail.dataset.rideId=rideId;$('historyDetailMeta').textContent='Henter tur…';$('historyPhotos').innerHTML='<div class="empty">Henter billeder…</div>';
  try{
    const [rows,days,photos]=await Promise.all([
      rpc('ridez_history_v102',{p_owner_token:state.ownerToken}).catch(()=>rpc('ridez_history_v97',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v96',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v80',{p_owner_token:state.ownerToken})).catch(()=>rpc('ridez_history_v38',{p_owner_token:state.ownerToken})),
      rpc('ridez_history_days_v96',{p_owner_token:state.ownerToken,p_ride_id:rideId}).catch(()=>[]),
      rpc('ridez_history_photos_v96',{p_owner_token:state.ownerToken,p_ride_id:rideId}).catch(()=>rpc('ridez_history_photos',{p_owner_token:state.ownerToken,p_ride_id:rideId}))
    ]);
    const ride=rows.find(r=>r.ride_id===rideId);if(!ride)throw new Error('Turen findes ikke');state.historySelectedRide=ride;state.historyDays=Array.isArray(days)&&days.length?days:[{day_number:1,distance_m:ride.distance_m,max_speed_ms:ride.max_speed_ms,segment_count:1}];state.historyAllPhotos=Array.isArray(photos)?photos:[];
    state.historyVehicleType=normalizeVehicleType(ride.vehicle_type);const replayCopy=$('historyReplayCopy');if(replayCopy)replayCopy.textContent=`Følg ${vehicleWords(state.historyVehicleType).definite} langs den valgte dags GPS-rute. Vælg selv afspilningshastighed.`;
    const avgMoving=Number(ride.avg_moving_speed_ms||0)*3.6,top=Number(ride.max_speed_ms||0)*3.6;$('historyDetailTitle').textContent=fmtDate(ride.created_at);$('historyDetailMeta').textContent=`${vehicleWords(ride.vehicle_type).emoji} ${ride.vehicle_name||vehicleWords(ride.vehicle_type).title} · ${tripLengthLabel(ride.trip_length_code||'day')} · ${state.historyDays.length} dag${state.historyDays.length===1?'':'e'} · ${(Number(ride.distance_m||0)/1000).toFixed(1).replace('.',',')} km · samlet ${fmtDuration(ride.duration_s)}`;
    if($('historyStats'))$('historyStats').innerHTML=`<div><span>Topfart</span><strong>${top.toFixed(0)} km/t</strong></div><div><span>Gns. under kørsel</span><strong>${avgMoving.toFixed(0)} km/t</strong></div><div><span>Kørselstid</span><strong>${fmtDuration(ride.moving_s)}</strong></div><div><span>Stilstand</span><strong>${fmtDuration(ride.stopped_s)}</strong></div>`;renderHistoryTripExtra(ride);fetchFuel95Price(true).then(()=>{if(state.historySelectedRide&&state.historySelectedRide.ride_id===ride.ride_id)renderHistoryTripExtra(ride)}).catch(()=>{});
    const histAccel=$('historyAcceleration');if(histAccel){const bestMetric=Number.isFinite(Number(ride.accel_best_80_s))&&ride.accel_best_80_s!==null?{seconds:Number(ride.accel_best_80_s),startKmh:Number(ride.accel_best_80_start_kmh),endKmh:Number(ride.accel_best_80_end_kmh)}:null;const slowMetric=Number.isFinite(Number(ride.accel_slowest_80_s))&&ride.accel_slowest_80_s!==null?{seconds:Number(ride.accel_slowest_80_s),startKmh:Number(ride.accel_slowest_80_start_kmh),endKmh:Number(ride.accel_slowest_80_end_kmh)}:null;histAccel.innerHTML=`<div class="accel-card accel-fast"><div class="accel-title"><span class="accel-icon">🚀</span><div><span>HURTIGSTE ACCELERATION</span><strong>Turens bedste måling</strong></div></div><div class="accel-metrics accel-metrics-single"><div class="wide"><span>Målt interval</span><b>${formatAccelerationRange(bestMetric)}</b></div></div></div><div class="accel-card accel-slow"><div class="accel-title"><span class="accel-icon">🐢</span><div><span>LANGSOMSTE ACCELERATION</span><strong>Turens langsomste gyldige måling</strong></div></div><div class="accel-metrics accel-metrics-single"><div class="wide"><span>Målt interval</span><b>${formatAccelerationRange(slowMetric)}</b></div></div></div>`}
    const histLean=$('historyLean');if(histLean){const histMaxElev=hasNumber(ride.max_elevation_m)?Number(ride.max_elevation_m):null,histMinElev=hasNumber(ride.min_elevation_m)?Number(ride.min_elevation_m):null;histLean.innerHTML=`<div class="lean-card"><div class="lean-title"><span class="lean-icon">${vehicleWords(ride.vehicle_type).emoji}</span><div><span>LEAN, SVING & HØJDE</span><strong>Turens hældning / sving &amp; højde</strong></div></div><div class="lean-grid"><div class="degree-metric"><span>Maks venstre</span><b>${Math.round(Number(ride.max_lean_left_deg||0))}°</b></div><div class="degree-metric"><span>Maks højre</span><b>${Math.round(Number(ride.max_lean_right_deg||0))}°</b></div><div><span>Venstresving</span><b>${Number(ride.turn_left_count||0)}</b></div><div><span>Højresving</span><b>${Number(ride.turn_right_count||0)}</b></div><div><span>Turens højeste punkt</span><b>${histMaxElev!==null?`${Math.round(histMaxElev)} m`:'–'}</b></div>${histMinElev!==null&&histMinElev<0?`<div><span>Turens laveste punkt</span><b>${Math.round(histMinElev)} m</b></div>`:''}</div></div>`;}
    if(!state.historyMap)state.historyMap=initMap('historyMap');else{clearHistoryPhotoMarkers();clearHistoryRouteLines()}renderHistoryDaySelector();await selectHistoryDay(0);detail.scrollIntoView({behavior:'smooth',block:'start'});
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
function closeHistoryRide(){if($('historyTripExtra'))$('historyTripExtra').innerHTML='';resetHistoryReplay({restorePhotos:false,fitRoute:false});clearHistoryPhotoMarkers();clearHistoryRouteLines();state.historyTrack=[];state.historyPhotosData=[];state.historyAllPhotos=[];state.historyDays=[];state.historySelectedRide=null;state.historySelectedDay=0;$('historyDetail').classList.add('hidden');$('historyDetail').dataset.rideId='';setDriverVehicleCopy()}

function renderViewerConversation(rows){
  const el=$('viewerConversation');if(!el)return;
  if(!rows.length){el.className='viewer-conversation empty';el.textContent='Ingen beskeder i samtalen endnu.';return}
  el.className='viewer-conversation';
  el.innerHTML=rows.map(r=>{const driver=r.direction==='driver_to_viewer';return `<div class="viewer-chat-bubble ${driver?'from-driver':'from-viewer'}"><div class="viewer-chat-meta">${driver?escapeHtml(r.sender_name||'Føreren'):'Dig'} · ${new Date(r.created_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}</div><div>${escapeHtml(r.body)}</div></div>`}).join('');
}

async function initViewer(){
  $('viewerView').classList.remove('hidden');initViewerUsernameSettings();
  state.map=initMap('viewerMap');
  let lastTrackPointId=0,viewerSegmentKey='',viewerSegmentPoints=[],viewerRideToken=publicRideToken||null;const viewerToken=ensureViewerToken();
  async function resolveViewerRideToken(){
    if(!demoChannelToken)return publicRideToken;
    const result=await rpc('ridez_resolve_demo_channel_v50',{p_channel_token:demoChannelToken});
    const row=Array.isArray(result)?result[0]:result;
    return row&&row.public_token?row.public_token:null;
  }
  function clearViewerRouteLines(){(state.viewerRouteLines||[]).forEach(line=>{try{state.map.removeLayer(line)}catch(e){}});state.viewerRouteLines=[];state.line=null;state.points=[];viewerSegmentKey='';viewerSegmentPoints=[]}
  function appendViewerTrack(rows,currentDay){
    for(const row of (rows||[])){
      const lat=Number(row.lat),lng=Number(row.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;
      const key=`${Number(row.day_number)||currentDay}:${Number(row.segment_number)||1}`;
      if(key!==viewerSegmentKey){viewerSegmentKey=key;viewerSegmentPoints=[];const line=L.polyline(viewerSegmentPoints,{weight:5,color:'#e11d24',smoothFactor:.2,noClip:false}).addTo(state.map);state.viewerRouteLines.push(line)}
      viewerSegmentPoints.push([lat,lng]);state.viewerRouteLines[state.viewerRouteLines.length-1].setLatLngs(viewerSegmentPoints);
      const id=Number(row.point_id||row.id);if(Number.isFinite(id))lastTrackPointId=Math.max(lastTrackPointId,id);
    }
    state.line=state.viewerRouteLines[state.viewerRouteLines.length-1]||null;state.points=viewerSegmentPoints.slice();
  }
  function resetViewerForNewRide(){
    lastTrackPointId=0;state.viewerDayNumber=0;clearViewerRouteLines();
    if(state.marker){state.map.removeLayer(state.marker);state.marker=null}
  }
  async function refresh(){
    try{
      const resolvedToken=await resolveViewerRideToken();
      if(!resolvedToken){$('viewerStatus').textContent=demoChannelToken?'Venter på at en demo bliver startet.':'Turen findes ikke eller er udløbet.';setTimeout(refresh,3000);return}
      if(viewerRideToken!==resolvedToken){viewerRideToken=resolvedToken;resetViewerForNewRide();const chat=$('viewerConversation');if(chat){chat.className='viewer-conversation empty';chat.textContent='Ingen svar fra føreren endnu.'}}
      const rideResult=await rpc('ridez_public_ride_v96',{p_public_token:viewerRideToken})
        .catch(()=>rpc('ridez_public_ride_v80',{p_public_token:viewerRideToken}))
        .catch(()=>rpc('ridez_public_ride_v45',{p_public_token:viewerRideToken}))
        .catch(()=>rpc('ridez_public_ride_v23',{p_public_token:viewerRideToken}))
        .catch(()=>rpc('ridez_public_ride_v21',{p_public_token:viewerRideToken}))
        .catch(()=>rpc('ridez_public_ride_v19',{p_public_token:viewerRideToken}));
      const ride=Array.isArray(rideResult)?rideResult[0]:rideResult;
      if(!ride){$('viewerStatus').textContent=demoChannelToken?'Venter på næste demo.':'Turen findes ikke eller er udløbet.';setTimeout(refresh,3000);return}
      state.viewerVehicleType=normalizeVehicleType(ride.vehicle_type);setViewerVehicleCopy(state.viewerVehicleType);$('viewerTitle').textContent=ride.title||'RIDEZ live-tur';
      $('viewerSpeed').textContent=fmtSpeed(ride.speed_ms);applySpeedColor($('viewerSpeed'),ride.speed_ms);
      showViewerTopSpeed(ride);
      renderViewerDashboard(ride);
      $('viewerUpdated').textContent=ride.updated_at?new Date(ride.updated_at).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'}):'–';
      {const w=vehicleWords(state.viewerVehicleType);$('viewerStatus').textContent=ride.active?(ride.moving?'Føreren er på farten':`${w.definiteCap} holder stille`):(demoChannelToken?'Demoen er afsluttet – linket venter på næste demo':'Turen er afsluttet');}
      const mo=$('viewerMotion');mo.textContent=ride.moving?'KØRER':'STILLE';mo.className=`motion ${ride.moving?'moving':'stopped'}`;
      const viewerMovingNotice=$('viewerChatMovingNotice');if(viewerMovingNotice)viewerMovingNotice.classList.toggle('hidden',!(ride.active&&ride.moving));
      if(ride.lat!=null)updateMap(ride.lat,ride.lng,true,false);
      const currentDay=Math.max(1,Number(ride.current_day_number)||1);if(state.viewerDayNumber!==currentDay){state.viewerDayNumber=currentDay;lastTrackPointId=0;clearViewerRouteLines()}
      let pts;try{pts=await fetchTrackPages('ridez_public_track_v96',{p_public_token:viewerRideToken,p_day_number:currentDay},{pageSize:1000,maxPages:30,afterId:lastTrackPointId})}catch(e){pts=await rpc('ridez_public_track',{p_public_token:viewerRideToken});lastTrackPointId=0;clearViewerRouteLines()}
      if(Array.isArray(pts)&&pts.length)appendViewerTrack(pts,currentDay);
      try{const chatRows=await rpc('ridez_public_conversation_v73',{p_public_token:viewerRideToken,p_viewer_token:viewerToken});renderViewerConversation(Array.isArray(chatRows)?chatRows:[])}catch(chatErr){console.debug('v73 chat endnu ikke aktiv',chatErr)}
    }catch(e){console.error(e);$('viewerStatus').textContent='Kunne ikke hente live-data.'}
    setTimeout(refresh,3000)
  }
  refresh();
  $('messageForm').addEventListener('submit',async e=>{
    e.preventDefault();const name=(state.viewerUserName||'').trim(),body=$('messageBody').value.trim();if(!name){openViewerUsernameDialog();return}if(!body)return;
    $('sendFeedback').textContent='Sender…';
    try{
      const tokenNow=await resolveViewerRideToken();
      if(!tokenNow){$('sendFeedback').textContent='Der er ingen aktiv demo at sende beskeden til endnu.';return}
      viewerRideToken=tokenNow;
      let result;try{result=await rpc('ridez_send_message_v73',{p_public_token:viewerRideToken,p_viewer_token:viewerToken,p_sender_name:name,p_body:body})}catch(e){result=await rpc('ridez_send_message',{p_public_token:viewerRideToken,p_sender_name:name,p_body:body})}$('messageBody').value='';$('sendFeedback').textContent=result==='moving'?`✓ Beskeden er sat i kø og bliver leveret, så snart ${vehicleWords(state.viewerVehicleType).definite} holder stille.`:'✓ Beskeden er sendt og kan vises til føreren nu.';try{const chatRows=await rpc('ridez_public_conversation_v73',{p_public_token:viewerRideToken,p_viewer_token:viewerToken});renderViewerConversation(Array.isArray(chatRows)?chatRows:[])}catch(e){}
    }catch(err){$('sendFeedback').textContent='Beskeden kunne ikke sendes. Prøv igen.'}
  })
}
async function initDriver(){loadFuel95Cache();renderTripExtraSummary();const extraPanel=$('tripExtraPanel');if(extraPanel)extraPanel.addEventListener('toggle',()=>{if(extraPanel.open){renderTripExtraSummary();fetchFuel95Price(false).catch(()=>{});if(state.elevationQueue.length)flushElevationQueue().catch(()=>{})}});$('driverView').classList.remove('hidden');ensureOwnerToken();state.map=initMap('driverMap');initLeanSensor();const settingsPanel=$('settingsPanel');if(settingsPanel)settingsPanel.addEventListener('toggle',async()=>{if(!settingsPanel.open)return;updateCalibrationLive();if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission!=='function')return;});const calibrationPanel=$('calibrationPanel');if(calibrationPanel)calibrationPanel.addEventListener('toggle',()=>{if(calibrationPanel.open)updateCalibrationLive(state.lastRawRoll);});renderAccelerationSummary();document.querySelectorAll('.accel-edit').forEach(btn=>btn.addEventListener('click',()=>openAccelEditor(btn.dataset.accelKind)));if($('accelConfigMode'))$('accelConfigMode').addEventListener('change',renderAccelEditorFields);if($('accelConfigForm'))$('accelConfigForm').addEventListener('submit',saveAccelEditor);if($('accelConfigCancel'))$('accelConfigCancel').addEventListener('click',()=>{const d=$('accelConfigDialog');if(d&&typeof d.close==='function')d.close();else if(d)d.removeAttribute('open')});if($('calibrateBtn'))$('calibrateBtn').onclick=calibratePhone;if($('takePhotoBtn'))$('takePhotoBtn').onclick=()=>$('cameraInput').click();if($('galleryBtn'))$('galleryBtn').onclick=()=>$('galleryInput').click();if($('cameraInput'))$('cameraInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)handleRidePhoto(f,'camera')});if($('galleryInput'))$('galleryInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)handleRidePhoto(f,'gallery')});$('startBtn').onclick=()=>startRide().catch(e=>alert('Kunne ikke starte turen: '+e.message));$('stopBtn').onclick=openEndRideDialog;$('shareBtn').onclick=shareRide;$('demoBtn').onclick=()=>{if(state.demo)stopRide();else startDemo().catch(e=>{console.error(e);alert('Kunne ikke starte demo: '+e.message)})};$('historyCloseBtn').onclick=closeHistoryRide;$('historyDeleteBtn').onclick=deleteHistoryRide;if($('historyReplayStart'))$('historyReplayStart').onclick=startHistoryReplay;if($('historyReplayPause'))$('historyReplayPause').onclick=toggleHistoryReplayPause;if($('historyReplayStop'))$('historyReplayStop').onclick=stopHistoryReplay;document.querySelectorAll('.replay-rate-button').forEach(btn=>btn.addEventListener('click',()=>setReplaySpeedFactor(btn.dataset.replayRate)));syncReplaySpeedButtons();initSoundSettings();initVehicleSettings();initTripLengthSettings();initUsernameSettings();initEndRideDialog();if($('replySendBtn'))$('replySendBtn').onclick=sendDriverReply;if($('replyCancelBtn'))$('replyCancelBtn').onclick=closeReplyDialog;if($('replyDialog'))$('replyDialog').addEventListener('cancel',e=>{e.preventDefault();closeReplyDialog()});if($('messageNotification'))$('messageNotification').onclick=()=>{const p=$('messagesPanel');if(p)p.scrollIntoView({behavior:'smooth',block:'start'});$('messageNotification').classList.add('hidden')};$('historySelectBtn').onclick=toggleHistorySelectMode;$('historyBulkDeleteBtn').onclick=deleteSelectedHistoryRides;await loadHistory();await resumeInterruptedRide()}
document.addEventListener('click',e=>{
  const openBtn=e.target.closest&&e.target.closest('.photo-popup-open');
  if(openBtn){e.preventDefault();e.stopPropagation();const img=openBtn.querySelector('img');const popup=openBtn.closest('.photo-popup');const caption=popup&&popup.querySelector('span')?popup.querySelector('span').textContent:'';if(img)openPhotoViewer(img.currentSrc||img.src,caption);return}
  if(e.target&&e.target.id==='photoViewerDialog')closePhotoViewer();
},true);
if($('photoViewerClose'))$('photoViewerClose').addEventListener('click',closePhotoViewer);
if($('photoViewerDialog'))$('photoViewerDialog').addEventListener('close',()=>{const img=$('photoViewerImage');if(img)img.src=''});
{const versionEl=$('appVersion');if(versionEl){versionEl.textContent='v'+APP_VERSION;versionEl.classList.add('runtime-ok');versionEl.title='RIDEZ app.js v'+APP_VERSION+' er indlæst';}}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=101').catch(()=>{}));
function handleInitFailure(error){
  console.error('RIDEZ kunne ikke starte korrekt',error);
  const versionEl=$('appVersion');
  if(versionEl){versionEl.textContent='v'+APP_VERSION+' · FEJL';versionEl.classList.remove('runtime-ok');versionEl.classList.add('runtime-error');versionEl.title=String(error&&error.message||error)}
  const badge=$('connectionBadge');if(badge){badge.textContent='Programfejl';badge.classList.add('error')}
  alert('RIDEZ kunne ikke starte korrekt. Genindlæs siden. Hvis fejlen fortsætter, oplys versionsnummeret v'+APP_VERSION+'.');
}
(publicRideToken||demoChannelToken)?initViewer().catch(handleInitFailure):initDriver().catch(handleInitFailure);
})();
