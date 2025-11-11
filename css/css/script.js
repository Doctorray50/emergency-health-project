function callEmergency() {
  const confirmCall = confirm("Do you want to call emergency services?");
  if (confirmCall) {
    // You can change this based on the country
    window.location.href = "tel:112";
  }
}







// --- Triage Logic ---
const triageQuestions = [
  {
    q: "Do you have chest pain or trouble breathing?",
    urgent: true
  },
  {
    q: "Are you bleeding heavily or feeling faint?",
    urgent: true
  },
  {
    q: "Do you have a high fever above 39°C (102°F)?",
    urgent: false
  },
  {
    q: "Are you vomiting repeatedly or unable to keep fluids down?",
    urgent: false
  },
  {
    q: "Have you been in a serious accident or trauma?",
    urgent: true
  }
];

let currentQuestion = 0;
let urgentFlag = false;

function answerTriage(answer) {
  if (triageQuestions[currentQuestion].urgent && answer) {
    urgentFlag = true;
  }
  
  currentQuestion++;
  
  if (currentQuestion < triageQuestions.length) {
    document.getElementById("question").innerText = triageQuestions[currentQuestion].q;
  } else {
    showTriageResult();
  }
}

function showTriageResult() {
  document.getElementById("question-box").classList.add("hidden");
  document.getElementById("result-box").classList.remove("hidden");
  
  const title = document.getElementById("result-title");
  const msg = document.getElementById("result-message");
  
  if (urgentFlag) {
    title.innerText = "⚠️ Seek Emergency Care Now!";
    msg.innerText = "Your answers suggest a potentially serious condition. Please call emergency services immediately or go to the nearest hospital.";
  } else {
    title.innerText = "✅ No Immediate Emergency Detected";
    msg.innerText = "You may rest, hydrate, and monitor your symptoms. If they worsen, contact a doctor or visit a clinic.";
  }
}




// js/findcare-map.js
// Leaflet + Overpass Hybrid map for hospitals (no API key required)

// ---------- CONFIG ----------
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const MAX_OVERPASS_RADIUS_M = 5000; // search radius
const MAX_RESULTS = 20;

// Local fallback hospital list (edit these with known nearby hospitals for your area)
const LOCAL_FALLBACK = [
  // Example entries: add name, lat, lon, phone (optional)
  { name: "City General Hospital", lat: 6.4551, lon: 3.3942, phone: "+2348031234567" },
  { name: "St Mary Medical Center", lat: 6.4600, lon: 3.3950, phone: "+2348065557823" },
  { name: "PrimeCare Emergency Clinic", lat: 6.4500, lon: 3.3800, phone: "+2348122309981" }
];

// ---------- UTIL ----------

function el(id){ return document.getElementById(id); }
function setStatus(msg){ el('status').innerText = msg || ""; }
function show(elem){ elem.classList.remove('hidden'); }
function hide(elem){ elem.classList.add('hidden'); }

// Haversine distance (km)
function distanceKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Build Overpass Q to find hospitals + clinics + emergency healthcare within radius
function buildOverpassQuery(lat, lon, radius){
  // query amenity=hospital or healthcare=clinic or emergency=ambulance_station or amenity=doctors
  return `[out:json][timeout:25];
  (
    node["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon});
    way["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon});
    relation["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon});
  );
  out center ${MAX_RESULTS};`;
}

// Fetch Overpass, parse results to standardized hospital objects
async function fetchHospitalsOverpass(lat, lon, radius){
  const q = buildOverpassQuery(lat, lon, radius);
  const form = new URLSearchParams();
  form.append('data', q);
  const resp = await fetch(OVERPASS_ENDPOINT, { method: 'POST', body: form });
  if(!resp.ok) throw new Error('Overpass request failed: ' + resp.status);
  const data = await resp.json();
  const items = [];
  (data.elements || []).forEach(elm => {
    let latp = null, lonp = null;
    if(elm.type === 'node'){ latp = elm.lat; lonp = elm.lon; }
    else if(elm.type === 'way' || elm.type === 'relation'){
      if(elm.center){ latp = elm.center.lat; lonp = elm.center.lon; }
    }
    if(!latp || !lonp) return;
    const tags = elm.tags || {};
    items.push({
      name: tags.name || tags['ref'] || 'Unknown',
      lat: latp,
      lon: lonp,
      phone: tags.phone || tags['contact:phone'] || tags['telephone'] || '',
      tags: tags
    });
  });
  return items;
}

// Create OSM directions URL (opens OSM directions panel)
function osmDirectionsUrl(fromLat, fromLon, toLat, toLon){
  // using the global openstreetmap.org directions with OSRM engine
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${fromLat}%2C${fromLon}%3B${toLat}%2C${toLon}`;
}

// ---------- MAP APP ----------

let map = null;
let userMarker = null;
let hospitalMarkers = [];

async function renderMapAndList(userLat, userLon, hospitals){
  // initialize map if needed
  if(!map){
    map = L.map('map', { zoomControl: true }).setView([userLat, userLon], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  } else {
    map.setView([userLat, userLon], 13);
  }

  // clear markers
  hospitalMarkers.forEach(m => map.removeLayer(m));
  hospitalMarkers = [];

  if(userMarker) map.removeLayer(userMarker);
  userMarker = L.marker([userLat, userLon], { title: 'You are here' }).addTo(map).bindPopup('You are here');

  const listEl = el('hospital-items');
  listEl.innerHTML = '';

  // sort by distance
  hospitals.forEach(h => {
    h.distance = distanceKm(userLat, userLon, h.lat, h.lon);
  });
  hospitals.sort((a,b) => a.distance - b.distance);

  hospitals.slice(0, MAX_RESULTS).forEach(h => {
    // map marker
    const m = L.marker([h.lat, h.lon], { title: h.name, icon: L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconSize:[25,41], iconAnchor:[12,41] }) })
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(h.name)}</strong><br>${(h.phone?('☎ ' + escapeHtml(h.phone)):'')}`);
    hospitalMarkers.push(m);

    // list item
    const item = document.createElement('div');
    item.className = 'hospital-item';
    item.innerHTML = `
      <div class="meta">
        <div style="font-weight:700">${escapeHtml(h.name)}</div>
        <div class="small-muted">${h.distance.toFixed(2)} km • ${h.tags && h.tags['amenity'] ? h.tags['amenity'] : 'Hospital/Clinic'}</div>
      </div>
      <div class="actions">
        ${ h.phone ? `<a class="pill" href="tel:${h.phone.replace(/\s/g,'')}">Call</a>` : `<span class="pill small-muted">No phone</span>` }
        <a class="pill" href="${osmDirectionsUrl(userLat, userLon, h.lat, h.lon)}" target="_blank" rel="noopener">Directions</a>
      </div>
    `;
    listEl.appendChild(item);
  });

  show(el('map'));
  show(el('hospital-list'));
}

// escape to avoid XSS in popup (simple)
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

// main locate flow
async function locateAndFindHospitals(){
  setStatus('Requesting location...');
  hide(el('hospital-list'));
  try{
    if(!navigator.geolocation) {
      setStatus('Geolocation not supported in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(async function(pos){
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setStatus(`Located: ${lat.toFixed(4)}, ${lon.toFixed(4)} — searching for hospitals...`);

      // first try Overpass
      let hospitals = [];
      try{
        hospitals = await fetchHospitalsOverpass(lat, lon, MAX_OVERPASS_RADIUS_M);
        if(!hospitals || hospitals.length === 0) throw new Error('No results from Overpass');
      } catch(e){
        console.warn('Overpass failed or returned empty:', e);
        // fallback: use local list but compute distances (transform to objects)
        hospitals = LOCAL_FALLBACK.map(h => ({ ...h, tags: {} }));
        setStatus('Using local backup hospital list (Overpass failed).');
      }

      await renderMapAndList(lat, lon, hospitals);
      setStatus('');
    }, function(err){
      console.error('Geolocation error', err);
      setStatus('Unable to retrieve location. Please enable GPS and refresh.');
    }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });

  } catch(e){
    console.error(e);
    setStatus('Unexpected error: ' + (e.message || e));
  }
}

// ---------- UI wiring ----------
document.addEventListener('DOMContentLoaded', function(){
  el('btn-locate').addEventListener('click', function(){ locateAndFindHospitals(); });
  el('btn-refresh').addEventListener('click', function(){ locateAndFindHospitals(); });

  el('btn-share').addEventListener('click', function(){
    if(!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(function(pos){
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${lat}&lon=${lon}`;
      if(navigator.share){
        navigator.share({ title: 'My location', text:'My location to share', url: shareUrl }).catch(()=>{ prompt('Copy link:', shareUrl); });
      } else {
        prompt('Copy this link to share:', shareUrl);
      }
    }, function(){ alert('Unable to get location for sharing'); });
  });

  el('btn-copy').addEventListener('click', function(){
    if(!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(function(pos){
      const lat = pos.coords.latitude.toFixed(6), lon = pos.coords.longitude.toFixed(6);
      const str = `${lat},${lon}`;
      navigator.clipboard && navigator.clipboard.writeText(str).then(()=> alert('Coordinates copied to clipboard')).catch(()=> prompt('Copy coordinates:', str));
    }, function(){ alert('Unable to get location'); });
  });
});





/* ---------------------------
   Medical ID JS (localStorage + QR + emergency)
   --------------------------- */

const MI_KEY = "rapid_aid_medical_id_v1";

// DOM references
const miFields = {
  name: document.getElementById("mi-name"),
  dob: document.getElementById("mi-dob"),
  blood: document.getElementById("mi-blood"),
  allergies: document.getElementById("mi-allergies"),
  meds: document.getElementById("mi-meds"),
  conditions: document.getElementById("mi-conditions"),
  ecName: document.getElementById("mi-ec-name"),
  ecPhone: document.getElementById("mi-ec-phone")
};

const btnSave = document.getElementById("mi-save");
const btnClear = document.getElementById("mi-clear");
const btnExport = document.getElementById("mi-export");
const btnPrint = document.getElementById("mi-print");

const pv = {
  name: document.getElementById("pv-name"),
  dob: document.getElementById("pv-dob"),
  blood: document.getElementById("pv-blood"),
  allergies: document.getElementById("pv-allergies"),
  meds: document.getElementById("pv-meds"),
  conditions: document.getElementById("pv-conditions"),
  ec: document.getElementById("pv-ec"),
  call: document.getElementById("pv-call"),
  copy: document.getElementById("pv-copy")
};

const qrcodeContainer = document.getElementById("qrcode");
let qr = null;

const toggleThemeBtn = document.getElementById("toggle-theme");
const showEmergencyBtn = document.getElementById("show-emergency");
const emOverlay = document.getElementById("emergency-overlay");
const emClose = document.getElementById("em-close");

// load saved data on start
function loadMedicalID() {
  try {
    const raw = localStorage.getItem(MI_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    miFields.name.value = data.name || "";
    miFields.dob.value = data.dob || "";
    miFields.blood.value = data.blood || "";
    miFields.allergies.value = data.allergies || "";
    miFields.meds.value = data.meds || "";
    miFields.conditions.value = data.conditions || "";
    miFields.ecName.value = data.ecName || "";
    miFields.ecPhone.value = data.ecPhone || "";

    updatePreview(data);
  } catch (e) {
    console.error("Failed to load Medical ID:", e);
  }
}

// update preview panel and QR
function updatePreview(data) {
  const d = data || {
    name: miFields.name.value,
    dob: miFields.dob.value,
    blood: miFields.blood.value,
    allergies: miFields.allergies.value,
    meds: miFields.meds.value,
    conditions: miFields.conditions.value,
    ecName: miFields.ecName.value,
    ecPhone: miFields.ecPhone.value
  };

  pv.name.innerText = d.name || "—";
  pv.dob.innerText = d.dob ? `DOB ${d.dob}` : "DOB —";
  pv.blood.innerText = d.blood || "—";
  pv.allergies.innerText = d.allergies || "—";
  pv.meds.innerText = d.meds || "—";
  pv.conditions.innerText = d.conditions || "—";

  pv.ec.innerHTML = `${d.ecName || "—"}<br><a href="tel:${(d.ecPhone||"").replace(/\s/g,'')}" id="pv-call-link">${d.ecPhone || "—"}</a>`;
  const callLink = document.getElementById("pv-call-link");
  if (callLink) pv.call.href = callLink.href;

  // QR: encode a compact JSON string
  const payload = {
    name: d.name || "",
    dob: d.dob || "",
    blood: d.blood || "",
    allergies: d.allergies || "",
    meds: d.meds || "",
    conditions: d.conditions || "",
    ecName: d.ecName || "",
    ecPhone: d.ecPhone || ""
  };

  // create QR (clear previous)
  qrcodeContainer.innerHTML = "";
  try {
    qr = new QRCode(qrcodeContainer, {
      text: JSON.stringify(payload),
      width: 140,
      height: 140
    });
  } catch (e) {
    console.error("QR error", e);
  }

  // update emergency overlay values
  document.getElementById("em-name-large").innerText = d.name || "—";
  document.getElementById("em-blood").innerText = d.blood || "—";
  document.getElementById("em-allergies").innerText = d.allergies || "—";
  document.getElementById("em-meds").innerText = d.meds || "—";
  document.getElementById("em-conditions").innerText = d.conditions || "—";
  document.getElementById("em-call").innerText = (d.ecName ? `${d.ecName} • ` : "") + (d.ecPhone || "—");
  document.getElementById("em-call").href = `tel:${(d.ecPhone||"").replace(/\s/g,'')}`;
}

// save action
btnSave && btnSave.addEventListener("click", function () {
  const data = {
    name: miFields.name.value.trim(),
    dob: miFields.dob.value,
    blood: miFields.blood.value.trim(),
    allergies: miFields.allergies.value.trim(),
    meds: miFields.meds.value.trim(),
    conditions: miFields.conditions.value.trim(),
    ecName: miFields.ecName.value.trim(),
    ecPhone: miFields.ecPhone.value.trim()
  };

  localStorage.setItem(MI_KEY, JSON.stringify(data));
  updatePreview(data);
  alert("Medical ID saved locally on this device.");
});

// clear action
btnClear && btnClear.addEventListener("click", function () {
  if (!confirm("Clear local Medical ID data? This cannot be undone.")) return;
  localStorage.removeItem(MI_KEY);
  Object.values(miFields).forEach(f => f.value = "");
  updatePreview({});
});

// export JSON
btnExport && btnExport.addEventListener("click", function () {
  const raw = localStorage.getItem(MI_KEY);
  if (!raw) { alert("No saved Medical ID to export."); return; }
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "medical-id.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// print
btnPrint && btnPrint.addEventListener("click", function () {
  window.print();
});

// copy contact
pv.copy && pv.copy.addEventListener("click", function () {
  const raw = localStorage.getItem(MI_KEY);
  if (!raw) return alert("No data to copy");
  navigator.clipboard && navigator.clipboard.writeText(raw).then(() => {
    alert("Medical ID copied to clipboard (JSON).");
  }).catch(() => alert("Copy failed."));
});

// theme toggle (light/dark)
toggleThemeBtn && toggleThemeBtn.addEventListener("click", function () {
  document.body.classList.toggle("mi-dark");
});

// emergency overlay
showEmergencyBtn && showEmergencyBtn.addEventListener("click", function () {
  emOverlay.classList.remove("hidden");
  // focus for accessibility
  emOverlay.focus && emOverlay.focus();
});

emClose && emClose.addEventListener("click", function () {
  emOverlay.classList.add("hidden");
});

// initialize preview on load
document.addEventListener("DOMContentLoaded", function () {
  loadMedicalID();
});















