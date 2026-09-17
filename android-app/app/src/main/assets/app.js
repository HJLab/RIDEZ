(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const bridge=window.RidezAndroid;
  let lastTracking=false;
  const kmh=ms=>Math.round((Number(ms)||0)*3.6);
  const one=n=>(Number(n)||0).toLocaleString('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1});
  const time=ms=>{const total=Math.max(0,Math.floor((Number(ms)||0)/60000));return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0')};
  const seconds=ms=>ms==null?'—':(Number(ms)/1000).toLocaleString('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1});
  const date=ms=>new Intl.DateTimeFormat('da-DK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));
  const parse=value=>{try{return JSON.parse(value)}catch(e){return {}}};

  function render(s){
    const tracking=!!s.tracking;
    $('status').textContent=tracking?'Tur i gang':'Ikke startet';
    $('quality').textContent=tracking?(s.gpsReady?('GPS klar · præcision '+Math.round(s.gpsAccuracyM||0)+' m'):'Venter på præcis GPS…'):'Klar til en ny tur';
    $('speed').textContent=kmh(s.currentSpeedMs);
    $('distance').textContent=one((s.distanceM||0)/1000);
    $('activeTime').textContent=time(s.activeMs);
    $('elapsedTime').textContent=time(s.elapsedMs);
    $('averageSpeed').textContent=s.activeMs>0?Math.round((s.distanceM/1000)/(s.activeMs/3600000)):0;
    $('maxSpeed').textContent=kmh(s.maxSpeedMs);
    const lean=Number(s.currentLeanDeg)||0;
    $('liveLean').textContent=(lean<0?'V ':'H ')+one(Math.abs(lean))+'°';
    $('leanNeedle').style.transform='rotate('+Math.max(-60,Math.min(60,lean))+'deg)';
    $('maxLeft').textContent=one(s.maxLeftDeg)+'°';
    $('maxRight').textContent=one(s.maxRightDeg)+'°';
    $('leftTurns').textContent=s.leftTurns||0;
    $('rightTurns').textContent=s.rightTurns||0;
    $('maxAccel').textContent=one(s.maxAccelMs2);
    $('maxBrake').textContent=one(s.maxBrakeMs2);
    $('zero50').textContent=seconds(s.zero50Ms);
    $('zero80').textContent=seconds(s.zero80Ms);
    $('zero100').textContent=seconds(s.zero100Ms);
    $('standstill').textContent=time(Math.max(0,(s.elapsedMs||0)-(s.activeMs||0)));
    $('start').classList.toggle('hidden',tracking);
    $('stop').classList.toggle('hidden',!tracking);
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
    $('historyTotal').textContent=one((data.totalDistanceM||0)/1000)+' km i alt';
    $('history').innerHTML=rides.length?rides.map(r=>{
      const avg=r.activeMs>0?Math.round((r.distanceM/1000)/(r.activeMs/3600000)):0;
      return '<article class="ride"><div class="ride-head"><span>'+date(r.startedAt)+'</span><strong>'+one(r.distanceM/1000)+' km</strong></div><div class="ride-stats"><span><b>'+time(r.activeMs)+'</b>aktiv tid</span><span><b>'+avg+' km/t</b>gennemsnit</span><span><b>'+kmh(r.maxSpeedMs)+' km/t</b>topfart</span><span><b>'+one(r.maxLeftDeg)+'° / '+one(r.maxRightDeg)+'°</b>V / H lean</span><span><b>'+r.leftTurns+' / '+r.rightTurns+'</b>V / H sving</span><span><b>'+seconds(r.zero100Ms)+' s</b>0–100</span></div></article>';
    }).join(''):'<p class="muted">Ingen gemte ture endnu.</p>';
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
  if(bridge)$('swapSides').checked=bridge.getSwapSides();
  loadHistory();
  refresh();
  setInterval(refresh,500);
})();
