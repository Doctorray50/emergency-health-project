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




// --- Find Care Logic ---
function getLocation() {
  const output = document.getElementById("location-output");

  if (!navigator.geolocation) {
    output.innerHTML = "❌ Geolocation is not supported by your browser.";
    return;
  }

  output.innerHTML = "⏳ Locating you...";

  navigator.geolocation.getCurrentPosition(success, error);
}

function success(position) {
  const lat = position.coords.latitude.toFixed(4);
  const lon = position.coords.longitude.toFixed(4);
  const output = document.getElementById("location-output");
  const listBox = document.getElementById("hospital-list");
  const hospitalItems = document.getElementById("hospital-items");

  output.innerHTML = `📍 Your location: <b>${lat}</b>, <b>${lon}</b>`;

  // Mock hospital data
  const hospitals = [
    { name: "City General Hospital", distance: "1.2 km", phone: "0803 123 4567" },
    { name: "St. Mary’s Medical Center", distance: "2.8 km", phone: "0806 555 7823" },
    { name: "PrimeCare Emergency Clinic", distance: "4.1 km", phone: "0812 230 9981" }
  ];

  hospitalItems.innerHTML = "";
  hospitals.forEach(h => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${h.name}</strong><br>Distance: ${h.distance}<br>☎️ <a href="tel:${h.phone.replace(/\s/g,'')}">${h.phone}</a>`;
    hospitalItems.appendChild(li);
  });

  listBox.classList.remove("hidden");

  // ✅ Show map with markers
  showMap(parseFloat(lat), parseFloat(lon), hospitals);
}

function showMap(lat, lon, hospitals) {
  const mapDiv = document.getElementById("map");
  mapDiv.classList.remove("hidden");

  // 🔑 Replace with your Mapbox token
  mapboxgl.accessToken = "YOUR_MAPBOX_TOKEN_HERE";

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [lon, lat],
    zoom: 13
  });

  // 🧭 Add your location
  new mapboxgl.Marker({ color: "#2563eb" })
    .setLngLat([lon, lat])
    .setPopup(new mapboxgl.Popup().setHTML("<b>You are here</b>"))
    .addTo(map);

  // 🏥 Add hospital markers
  hospitals.forEach(h => {
    const offset = (Math.random() - 0.5) / 100; // small random offset
    new mapboxgl.Marker({ color: "#dc2626" })
      .setLngLat([lon + offset, lat + offset])
      .setPopup(new mapboxgl.Popup().setHTML(`<b>${h.name}</b><br>${h.distance} away`))
      .addTo(map);
  });
}




function error() {
  const output = document.getElementById("location-output");
  output.innerHTML = "⚠️ Unable to retrieve your location. Please enable GPS or location access.";
}





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















