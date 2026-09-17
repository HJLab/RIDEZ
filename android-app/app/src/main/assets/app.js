(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const bridge=window.RidezAndroid;
  let lastTracking=false;
  let trackingNow=false;
  let historySelectMode=false;
  let historyRides=[];
  const selectedRideIds=new Set();
  const kmh=ms=>Math.round((Number(ms)||0)*3.6);
  const one=n=>(Number(n)||0).toLocaleString('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1});
  const time=ms=>{const total=Math.max(0,Math.floor((Number(ms)||0)/60000));return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0')};
  const seconds=ms=>ms==null?'—':(Number(ms)/1000).toLocaleString('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1});
  const meters=value=>value==null?'—':Math.round(Number(value)).toLocaleString('da-DK')+' m';
  const forceLevel=value=>{const v=Math.abs(Number(value)||0);if(v<0.5)return'Ingen tydelig måling';if(v<1.5)return'Let';if(v<3)return'Moderat';if(v<4.5)return'Kraftig';return'Meget kraftig'};
  const forceRate=value=>one((Number(value)||0)*3.6)+' km/t pr. sekund';
  const forceClass=value=>{const v=Math.abs(Number(value)||0);if(v<0.5)return'force-none';if(v<1.5)return'force-light';if(v<3)return'force-moderate';if(v<4.5)return'force-strong';return'force-extreme'};
  const forceLevelHtml=value=>'<strong class="force-level '+forceClass(value)+'">'+forceLevel(value)+'</strong>';
  const date=ms=>new Intl.DateTimeFormat('da-DK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));
  const parse=value=>{try{return JSON.parse(value)}catch(e){return {}}};

  function render(s){
    const tracking=!!s.tracking;
    trackingNow=tracking;
    $('status').textContent=tracking?(s.autoPaused?'Automatisk pause':'Tur i gang'):'Ikke startet';
    $('quality').textContent=tracking?(s.autoPaused?'Stille i over 2 minutter · fortsætter automatisk ved bevægelse':(s.gpsReady?('GPS klar · præcision '+Math.round(s.gpsAccuracyM||0)+' m'):'Venter på præcis GPS…')):'Klar til en ny tur';
    $('speed').textContent=kmh(s.currentSpeedMs);
    $('distance').textContent=one((s.distanceM||0)/1000);
    $('activeTime').textContent=time(s.activeMs);
    $('elapsedTime').textContent=time(s.elapsedMs);
    $('averageSpeed').textContent=s.activeMs>0?Math.round((s.distanceM/1000)/(s.activeMs/3600000)):0;
    $('maxSpeed').textContent=kmh(s.maxSpeedMs);
    $('currentAltitude').textContent=meters(s.currentAltitudeM);
    $('maxAltitude').textContent=meters(s.maxAltitudeM);
    $('belowSeaMetric').classList.toggle('hidden',s.minBelowSeaM==null);
    $('minBelowSea').textContent=meters(s.minBelowSeaM);
    const lean=Number(s.currentLeanDeg)||0;
    $('liveLean').textContent=(lean<0?'V ':'H ')+one(Math.abs(lean))+'°';
    $('leanNeedle').style.transform='rotate('+Math.max(-60,Math.min(60,lean))+'deg)';
    $('maxLeft').textContent=one(s.maxLeftDeg)+'°';
    $('maxRight').textContent=one(s.maxRightDeg)+'°';
    $('leftTurns').textContent=s.leftTurns||0;
    $('rightTurns').textContent=s.rightTurns||0;
    $('maxAccel').textContent=one(s.maxAccelMs2);
    $('maxBrake').textContent=one(s.maxBrakeMs2);
    $('maxAccelRate').textContent=forceRate(s.maxAccelMs2);
    $('maxBrakeRate').textContent=forceRate(s.maxBrakeMs2);
    $('maxAccelLevel').textContent=forceLevel(s.maxAccelMs2);
    $('maxBrakeLevel').textContent=forceLevel(s.maxBrakeMs2);
    $('maxAccelLevel').className='force-level '+forceClass(s.maxAccelMs2);
    $('maxBrakeLevel').className='force-level '+forceClass(s.maxBrakeMs2);
    $('zero50').textContent=seconds(s.zero50Ms);
    $('zero80').textContent=seconds(s.zero80Ms);
    $('zero100').textContent=seconds(s.zero100Ms);
    $('standstill').textContent=time(Math.max(0,(s.elapsedMs||0)-(s.activeMs||0)));
    $('pausedTime').textContent=time(s.pausedMs);
    $('start').classList.toggle('hidden',tracking);
    $('stop').classList.toggle('hidden',!tracking);
    updateHistoryActions();
    if(lastTracking&&!tracking) loadHistory();
    lastTracking=tracking;
  }

  function refresh(){
    if(!bridge){$('quality').textContent='Android-forbindelsen mangler';return}
    render(parse(bridge.getSnapshot()));
  }

  function loadHistory(){
    if(!bridge)return;
    const data=parse(bridge.getHistory()), rides=Array.isArray(data.rides)?data.rides:[];
    historyRides=rides;
    const validIds=new Set(rides.map(r=>Number(r.id)));
    for(const id of selectedRideIds)if(!validIds.has(id))selectedRideIds.delete(id);
    if(!rides.length){historySelectMode=false;selectedRideIds.clear()}
    $('historyTotal').textContent=one((data.totalDistanceM||0)/1000)+' km i alt';
    $('history').innerHTML=rides.length?rides.map(r=>{
      const avg=r.activeMs>0?Math.round((r.distanceM/1000)/(r.activeMs/3600000)):0;
      const elapsed=Math.max(0,Number(r.elapsedMs)||0);
      const standstill=Math.max(0,elapsed-(Number(r.activeMs)||0));
      const checked=selectedRideIds.has(Number(r.id));
      return '<article class="ride'+(checked?' selected':'')+'" data-ride-id="'+Number(r.id)+'">'
        +'<label class="ride-select'+(historySelectMode?'':' hidden')+'"><input class="ride-check" type="checkbox" '+(checked?'checked':'')+'><span>Markér tur</span></label>'
        +'<div class="ride-head"><span>'+date(r.startedAt)+'</span><strong>'+one(r.distanceM/1000)+' km</strong></div>'
        +'<h3>Fart og tid</h3><div class="ride-stats">'
        +'<span><b>'+time(elapsed)+'</b>samlet turtid</span><span><b>'+time(r.activeMs)+'</b>aktiv køretid</span><span><b>'+time(standstill)+'</b>stilstand</span><span><b>'+time(r.pausedMs)+'</b>automatisk pause</span>'
        +'<span><b>'+avg+' km/t</b>gennemsnitsfart</span><span><b>'+kmh(r.maxSpeedMs)+' km/t</b>topfart</span></div>'
        +'<h3>Acceleration og bremsning</h3><div class="ride-stats">'
        +'<span><b>'+one(r.maxAccelMs2)+' m/s²</b><i class="rate-note"><span>'+forceRate(r.maxAccelMs2)+'</span>'+forceLevelHtml(r.maxAccelMs2)+'</i>bedste acceleration</span><span><b>'+one(r.maxBrakeMs2)+' m/s²</b><i class="rate-note"><span>'+forceRate(r.maxBrakeMs2)+'</span>'+forceLevelHtml(r.maxBrakeMs2)+'</i>hårdeste bremsning</span>'
        +'<span><b>'+seconds(r.zero50Ms)+' s</b>0–50 km/t</span><span><b>'+seconds(r.zero80Ms)+' s</b>0–80 km/t</span><span><b>'+seconds(r.zero100Ms)+' s</b>0–100 km/t</span></div>'
        +'<h3>Lean og sving</h3><div class="ride-stats">'
        +'<span><b>'+one(r.maxLeftDeg)+'°</b>maks venstre</span><span><b>'+one(r.maxRightDeg)+'°</b>maks højre</span><span><b>'+r.leftTurns+'</b>venstresving</span><span><b>'+r.rightTurns+'</b>højresving</span></div>'
        +'<h3>Højde</h3><div class="ride-stats"><span><b>'+meters(r.maxAltitudeM)+'</b>højeste punkt</span>'
        +(r.minBelowSeaM==null?'':'<span><b>'+meters(r.minBelowSeaM)+'</b>laveste under havet</span>')+'</div></article>';
    }).join(''):'<p class="muted">Ingen gemte ture endnu.</p>';
    document.querySelectorAll('.ride-check').forEach(input=>input.addEventListener('change',onRideSelection));
    updateHistoryActions();
  }

  function onRideSelection(event){
    const ride=event.target.closest('.ride'),id=Number(ride&&ride.dataset.rideId);
    if(!id||trackingNow)return;
    if(event.target.checked)selectedRideIds.add(id);else selectedRideIds.delete(id);
    ride.classList.toggle('selected',event.target.checked);
    updateHistoryActions();
  }

  function updateHistoryActions(){
    const hasRides=historyRides.length>0;
    if(trackingNow&&historySelectMode){historySelectMode=false;selectedRideIds.clear();loadHistory();return}
    $('selectRides').classList.toggle('hidden',trackingNow||!hasRides);
    $('historyLocked').classList.toggle('hidden',!trackingNow||!hasRides);
    $('selectRides').textContent=historySelectMode?'ANNULLER':'VÆLG TURE';
    $('deleteRides').classList.toggle('hidden',!historySelectMode||trackingNow);
    $('deleteRides').disabled=selectedRideIds.size===0;
    $('deleteRides').textContent=selectedRideIds.size?'SLET VALGTE ('+selectedRideIds.size+')':'SLET VALGTE';
  }

  function toggleRideSelection(){
    if(trackingNow||!historyRides.length)return;
    historySelectMode=!historySelectMode;
    selectedRideIds.clear();
    loadHistory();
  }

  function deleteSelectedRides(){
    if(trackingNow){alert('Afslut den aktive tur, før du sletter gemte ture.');return}
    const ids=Array.from(selectedRideIds);
    if(!ids.length)return;
    const word=ids.length===1?'den valgte tur':ids.length+' valgte ture';
    if(!confirm('Slet '+word+' permanent? Det kan ikke fortrydes.'))return;
    const deleted=bridge?Number(bridge.deleteRides(JSON.stringify(ids))):0;
    if(deleted!==ids.length){alert('Ikke alle valgte ture kunne slettes. Historikken opdateres nu.')}
    historySelectMode=false;
    selectedRideIds.clear();
    loadHistory();
  }

  $('start').addEventListener('click',()=>bridge&&bridge.startRide());
  $('stop').addEventListener('click',()=>$('confirmStop').classList.remove('hidden'));
  $('cancelStop').addEventListener('click',()=>$('confirmStop').classList.add('hidden'));
  $('confirmStopButton').addEventListener('click',()=>{bridge&&bridge.stopRide();$('confirmStop').classList.add('hidden')});
  $('calibrate').addEventListener('click',()=>{
    if(!bridge)return;
    const ok=bridge.calibrateLean();
    $('calibrationStatus').textContent=ok
      ? 'Kalibreret til 0°. Maksima og svingtal er nulstillet.'
      : 'Sensoren er ikke klar endnu – vent et øjeblik og prøv igen.';
  });
  $('swapSides').addEventListener('change',e=>bridge&&bridge.setSwapSides(e.target.checked));
  $('selectRides').addEventListener('click',toggleRideSelection);
  $('deleteRides').addEventListener('click',deleteSelectedRides);
  if(bridge)$('swapSides').checked=bridge.getSwapSides();
  loadHistory();
  refresh();
  setInterval(refresh,500);
})();
