// Interactive map layer script
(async function(){
  const apiBase = window.API_BASE || '';

  async function getMapsKey(){
    try{
      const res = await fetch(`${apiBase}/api/maps_key`);
      const j = await res.json();
      return j.key;
    }catch(e){
      console.error('無法取得 maps key', e);
      return null;
    }
  }

  function loadGoogleMaps(key){
    return new Promise((resolve, reject) => {
      if(!key) return reject(new Error('No API key'));
      window._gmaps_init_cb = () => { resolve(window.google.maps); };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=_gmaps_init_cb`;
      s.async = true; s.defer = true;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function rampColor(v){
    v = Math.max(0, Math.min(100, Number(v)||0));
    if(v <= 50){
      const t = v/50;
      const r = Math.round(0 + t*255);
      const g = 200;
      return `rgb(${r},${g},0)`;
    } else {
      const t = (v-50)/50;
      const r = 255;
      const g = Math.round(200 - t*200);
      return `rgb(${r},${g},0)`;
    }
  }

  function radiusForValue(v){
    // map 0-100 to meters (tweakable)
    const base = 120; // min radius
    const max = 1200; // max radius
    const t = Math.max(0, Math.min(100, Number(v)||0))/100;
    return base + t*(max-base);
  }

  async function fetchScamPoints(){
    try{
      const res = await fetch(`${apiBase}/api/village_scam_data`);
      return await res.json();
    }catch(e){
      console.error('fetchScamPoints error', e);
      return [];
    }
  }

  // main
  const key = await getMapsKey();
  try{
    await loadGoogleMaps(key);
  }catch(e){
    console.error('Google Maps load failed', e);
    // show a simple message
    const el = document.getElementById('map');
    if(el) el.innerText = '無法載入 Google Maps，請檢查 API Key。';
    return;
  }

  const google = window.google;
  const points = await fetchScamPoints();
  if(!Array.isArray(points)){
    console.error('points not array', points);
  }

  // default center: compute average
  let center = {lat:24.803, lng:120.968};
  if(points.length){
    const avg = points.reduce((acc,p)=>{acc.lat+=p.location.lat; acc.lng+=p.location.lng; return acc},{lat:0,lng:0});
    center = {lat: avg.lat/points.length, lng: avg.lng/points.length};
  }

  const map = new google.maps.Map(document.getElementById('map'), {center, zoom:12, mapTypeId:'roadmap'});

  // layers container
  const metrics = [
    {key:'investment', label:'投資'},
    {key:'shopping', label:'網購'},
    {key:'auction', label:'假網拍'},
    {key:'dating', label:'假交友'},
    {key:'marriage', label:'徵婚'},
  ];
  const layers = {};

  // create circles per metric
  metrics.forEach(m => layers[m.key] = []);

  points.forEach(p => {
    const lat = p.location.lat; const lng = p.location.lng;
    metrics.forEach(m => {
      const val = Number(p[m.key]) || 0;
      const circle = new google.maps.Circle({
        center: {lat, lng},
        radius: radiusForValue(val),
        strokeWeight: 0.6,
        strokeColor: '#222',
        fillColor: rampColor(val),
        fillOpacity: 0.65,
        clickable: true,
        map: null
      });
      // tooltip
      circle.addListener('mouseover', e => {
        const iw = new google.maps.InfoWindow({content:`<strong>${(p.name||p.location.name||'里')}</strong><br>${m.label}: ${val}`});
        iw.setPosition(e.latLng);
        iw.open(map);
        circle._iw = iw;
      });
      circle.addListener('mouseout', ()=>{ if(circle._iw) circle._iw.close(); });
      layers[m.key].push(circle);
    });
  });

  // build UI controls
  const ctrl = document.getElementById('map-layer-controls');
  if(ctrl){
    metrics.forEach((m, idx)=>{
      const label = document.createElement('label');
      label.className = 'flex items-center gap-2 text-sm text-white';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (idx===0); // default show first
      cb.addEventListener('change', ()=>{
        setLayerVisible(m.key, cb.checked);
      });
      const span = document.createElement('span');
      span.innerText = m.label;
      label.appendChild(cb);
      label.appendChild(span);
      ctrl.appendChild(label);
    });
  }

  function setLayerVisible(key, visible){
    (layers[key]||[]).forEach(c=> c.setMap(visible?map:null));
  }

  // show default first layer
  if(metrics.length) setLayerVisible(metrics[0].key, true);

})();
