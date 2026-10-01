(() => {
  "use strict";

  const STORAGE_SETTINGS = "kilompro_settings_v1";
  const STORAGE_TRIPS = "kilompro_trips_v1";

  const defaultSettings = {
    fuelPrice: 1.85,
    rateMode: "fixed",
    rate: 0.32,
    fiscalPower: "5",
    vehicles: [],
    activeVehicleId: null,
  };

  // kg de CO2 émis par litre de carburant consommé (indicatif) — pour
  // l'électrique, kg de CO2 par kWh (moyenne du réseau électrique français).
  const CO2_FACTORS = {
    diesel: 2.68,
    sp95: 2.28,
    sp98: 2.28,
    e10: 2.14,
    electrique: 0.06,
  };

  function computeCo2(distance, fuelType, conso) {
    const qty = distance * (conso / 100);
    return qty * (CO2_FACTORS[fuelType] ?? CO2_FACTORS.diesel);
  }

  // Barème kilométrique fiscal indicatif (voiture), à titre d'exemple.
  // Formule: montant(d) selon tranche de km annuel cumulé.
  const BAREME = {
    "3": { a: 0.529, b: 0.316, c: 1065, d: 0.370 },
    "4": { a: 0.606, b: 0.340, c: 1330, d: 0.407 },
    "5": { a: 0.636, b: 0.357, c: 1395, d: 0.427 },
    "6": { a: 0.665, b: 0.374, c: 1457, d: 0.447 },
    "7": { a: 0.697, b: 0.394, c: 1515, d: 0.470 },
  };

  function baremeCumulativeAmount(cv, km, table) {
    const t = (table || BAREME)[cv] || BAREME["5"];
    if (km <= 0) return 0;
    if (km <= 5000) return km * t.a;
    if (km <= 20000) return km * t.b + t.c;
    return km * t.d;
  }

  function loadSettings() {
    let s;
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS);
      s = raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch {
      s = { ...defaultSettings };
    }
    // Migration : les anciennes versions stockaient un seul véhicule à plat
    // (fuelType/conso/vehicleName) directement dans les paramètres.
    if (!s.vehicles || !s.vehicles.length) {
      const migrated = {
        id: cryptoId(),
        name: s.vehicleName || "Véhicule principal",
        fuelType: s.fuelType || "diesel",
        conso: s.conso || 6.5,
      };
      s.vehicles = [migrated];
      s.activeVehicleId = migrated.id;
    }
    if (!s.activeVehicleId || !s.vehicles.some((v) => v.id === s.activeVehicleId)) {
      s.activeVehicleId = s.vehicles[0].id;
    }
    delete s.fuelType;
    delete s.conso;
    delete s.vehicleName;
    return s;
  }

  function getVehicle(id) {
    return settings.vehicles.find((v) => v.id === id) || settings.vehicles[0];
  }

  function getActiveVehicle() {
    return getVehicle(settings.activeVehicleId);
  }

  function saveSettingsToStorage(s) {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(s));
  }

  function loadTrips() {
    try {
      const raw = localStorage.getItem(STORAGE_TRIPS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveTripsToStorage(trips) {
    localStorage.setItem(STORAGE_TRIPS, JSON.stringify(trips));
  }

  let settings = loadSettings();
  let trips = loadTrips();

  const fmtEur = (n) =>
    (isFinite(n) ? n : 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const fmtKm = (n) =>
    (isFinite(n) ? n : 0).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";

  // ---------- ProKil Pro (abonnement Play Billing, essai 3 jours) ----------
  // Produit à créer dans la Google Play Console : abonnement "prokil_pro_monthly"
  // avec une période d'essai gratuite de 3 jours. Fonctionne uniquement dans
  // l'app Android (TWA) — dans un navigateur classique, l'offre reste visible
  // mais indique qu'elle n'est disponible que via l'app Android.
  const PRO_SKU = "prokil_pro_monthly";
  const FREE_HISTORY_LIMIT = 15;
  let digitalGoodsService = null;
  let isPremium = false;

  async function initBilling() {
    const startBtn = document.getElementById("startProTrial");
    if (!("getDigitalGoodsService" in window)) {
      document.getElementById("proUnavailableHint").hidden = false;
      startBtn.disabled = true;
      updateProUI();
      return;
    }
    try {
      digitalGoodsService = await window.getDigitalGoodsService("https://play.google.com/billing");
      const details = await digitalGoodsService.getDetails([PRO_SKU]);
      if (details && details[0]) {
        document.getElementById("proPriceHint").textContent =
          `${details[0].price.value} ${details[0].price.currency} / mois après l'essai de 3 jours — annulable à tout moment depuis Google Play.`;
      }
      await refreshProStatus();
    } catch {
      digitalGoodsService = null;
      document.getElementById("proUnavailableHint").hidden = false;
      startBtn.disabled = true;
      updateProUI();
    }
  }

  async function refreshProStatus() {
    if (!digitalGoodsService) {
      updateProUI();
      return;
    }
    try {
      const purchases = await digitalGoodsService.listPurchases();
      isPremium = purchases.some((p) => p.itemId === PRO_SKU);
    } catch {
      isPremium = false;
    }
    updateProUI();
  }

  function updateProUI() {
    document.getElementById("proStatusFree").hidden = isPremium;
    document.getElementById("proStatusActive").hidden = !isPremium;

    document.getElementById("monthlyReportLock").hidden = isPremium;
    document.getElementById("monthlyChart").classList.toggle("locked", !isPremium);
    document.getElementById("monthlyList").classList.toggle("locked", !isPremium);

    document.getElementById("baremeLock").hidden = isPremium;
    document.getElementById("baremeTableWrap").classList.toggle("locked", !isPremium);
    document.getElementById("resetBareme").disabled = !isPremium;

    renderHistory();
  }

  async function startProPurchase() {
    if (!digitalGoodsService || !("PaymentRequest" in window)) {
      alert("L'abonnement ProKil Pro est disponible depuis l'application Android ProKil (Google Play).");
      return;
    }
    try {
      const request = new PaymentRequest(
        [{ supportedMethods: "https://play.google.com/billing", data: { sku: PRO_SKU } }],
        { total: { label: "ProKil Pro", amount: { currency: "EUR", value: "0" } } }
      );
      const response = await request.show();
      await response.complete("success");
      await refreshProStatus();
    } catch (err) {
      if (err && err.name !== "AbortError") {
        alert("Le paiement n'a pas pu aboutir. Réessaie depuis l'application Android.");
      }
    }
  }

  document.getElementById("startProTrial").addEventListener("click", startProPurchase);
  document.querySelectorAll(".pro-lock-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "settings"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-settings"));
      document.getElementById("proCard").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // ---------- Tabs ----------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.getElementById("goSettings").addEventListener("click", (e) => {
    e.preventDefault();
    switchTab("settings");
  });

  function switchTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
    if (tab === "history") renderHistory();
  }

  // ---------- Settings form ----------
  const els = {
    fuelPrice: document.getElementById("fuelPrice"),
    rateMode: document.getElementById("rateMode"),
    rate: document.getElementById("rate"),
    fiscalPower: document.getElementById("fiscalPower"),
    fixedRateField: document.getElementById("fixedRateField"),
    powerField: document.getElementById("powerField"),
    baremeTableField: document.getElementById("baremeTableField"),
    baremeTableBody: document.getElementById("baremeTableBody"),
  };

  const FUEL_TYPE_LABEL = { diesel: "Diesel", sp95: "SP95", sp98: "SP98", e10: "E10", electrique: "Électrique (kWh)" };

  function fuelTypeOptions(selected) {
    return Object.entries(FUEL_TYPE_LABEL)
      .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  function renderVehicleList() {
    const list = document.getElementById("vehicleList");
    list.innerHTML = settings.vehicles
      .map(
        (v) => `<div class="vehicle-row" data-id="${v.id}">
          <div class="vehicle-row-top">
            <label class="vehicle-active">
              <input type="radio" name="activeVehicle" value="${v.id}" ${v.id === settings.activeVehicleId ? "checked" : ""}>
              <span>Véhicule actif</span>
            </label>
            ${settings.vehicles.length > 1 ? `<button type="button" class="vehicle-delete" data-id="${v.id}" title="Supprimer ce véhicule">✕</button>` : ""}
          </div>
          <div class="grid">
            <label class="field">
              <span>Nom / plaque</span>
              <input type="text" data-field="name" value="${escapeAttr(v.name)}" placeholder="Ex: Peugeot 308 - AB-123-CD">
            </label>
            <label class="field">
              <span>Carburant</span>
              <select data-field="fuelType">${fuelTypeOptions(v.fuelType)}</select>
            </label>
            <label class="field">
              <span>Consommation (L/100km ou kWh/100km)</span>
              <input type="number" step="0.1" data-field="conso" value="${v.conso}">
            </label>
          </div>
        </div>`
      )
      .join("");

    list.querySelectorAll(".vehicle-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        settings.vehicles = settings.vehicles.filter((v) => v.id !== btn.dataset.id);
        if (!settings.vehicles.some((v) => v.id === settings.activeVehicleId)) {
          settings.activeVehicleId = settings.vehicles[0].id;
        }
        renderVehicleList();
      });
    });
  }

  function readVehiclesFromForm() {
    const rows = document.querySelectorAll("#vehicleList .vehicle-row");
    const vehicles = [];
    let activeId = settings.activeVehicleId;
    rows.forEach((row) => {
      const id = row.dataset.id;
      const name = row.querySelector('[data-field="name"]').value.trim() || "Véhicule";
      const fuelType = row.querySelector('[data-field="fuelType"]').value;
      const conso = parseFloat(row.querySelector('[data-field="conso"]').value) || 0;
      vehicles.push({ id, name, fuelType, conso });
      if (row.querySelector('input[name="activeVehicle"]').checked) activeId = id;
    });
    return { vehicles: vehicles.length ? vehicles : settings.vehicles, activeId };
  }

  document.getElementById("addVehicle").addEventListener("click", () => {
    const { vehicles } = readVehiclesFromForm();
    settings.vehicles = vehicles;
    settings.vehicles.push({
      id: cryptoId(),
      name: `Véhicule ${settings.vehicles.length + 1}`,
      fuelType: "diesel",
      conso: 6.5,
    });
    renderVehicleList();
  });

  function updateVehicleSelector() {
    const field = document.getElementById("vehicleSelectField");
    const select = document.getElementById("tripVehicle");
    if (settings.vehicles.length <= 1) {
      field.hidden = true;
      return;
    }
    field.hidden = false;
    select.innerHTML = settings.vehicles
      .map((v) => `<option value="${v.id}" ${v.id === settings.activeVehicleId ? "selected" : ""}>${escapeHtml(v.name)}</option>`)
      .join("");
  }

  function getSelectedTripVehicle() {
    const field = document.getElementById("vehicleSelectField");
    const select = document.getElementById("tripVehicle");
    if (!field.hidden && select.value) return getVehicle(select.value);
    return getActiveVehicle();
  }

  const BAREME_CVS = ["3", "4", "5", "6", "7"];
  const BAREME_CV_LABEL = { 3: "3 et -", 4: "4", 5: "5", 6: "6", 7: "7 et +" };

  function renderBaremeTable(table) {
    els.baremeTableBody.innerHTML = BAREME_CVS.map((cv) => {
      const t = table[cv];
      return `<tr data-cv="${cv}">
        <td>${BAREME_CV_LABEL[cv]}</td>
        <td><input type="number" step="0.001" data-field="a" value="${t.a}"></td>
        <td><input type="number" step="0.001" data-field="b" value="${t.b}"></td>
        <td><input type="number" step="1" data-field="c" value="${t.c}"></td>
        <td><input type="number" step="0.001" data-field="d" value="${t.d}"></td>
      </tr>`;
    }).join("");
  }

  function readBaremeTable() {
    const table = {};
    els.baremeTableBody.querySelectorAll("tr").forEach((row) => {
      const cv = row.dataset.cv;
      table[cv] = {
        a: parseFloat(row.querySelector('[data-field="a"]').value) || 0,
        b: parseFloat(row.querySelector('[data-field="b"]').value) || 0,
        c: parseFloat(row.querySelector('[data-field="c"]').value) || 0,
        d: parseFloat(row.querySelector('[data-field="d"]').value) || 0,
      };
    });
    return table;
  }

  document.getElementById("resetBareme").addEventListener("click", () => {
    renderBaremeTable(BAREME);
  });

  function populateSettingsForm() {
    els.fuelPrice.value = settings.fuelPrice;
    els.rateMode.value = settings.rateMode;
    els.rate.value = settings.rate;
    els.fiscalPower.value = settings.fiscalPower;
    renderVehicleList();
    renderBaremeTable(settings.bareme || BAREME);
    toggleRateFields();
  }

  function toggleRateFields() {
    const isFixed = els.rateMode.value === "fixed";
    els.fixedRateField.style.display = isFixed ? "" : "none";
    els.powerField.style.display = isFixed ? "none" : "";
    els.baremeTableField.style.display = isFixed ? "none" : "";
  }

  els.rateMode.addEventListener("change", toggleRateFields);

  document.getElementById("saveSettings").addEventListener("click", () => {
    const { vehicles, activeId } = readVehiclesFromForm();
    settings = {
      fuelPrice: parseFloat(els.fuelPrice.value) || 0,
      rateMode: els.rateMode.value,
      rate: parseFloat(els.rate.value) || 0,
      fiscalPower: els.fiscalPower.value,
      bareme: readBaremeTable(),
      vehicles,
      activeVehicleId: activeId,
    };
    saveSettingsToStorage(settings);
    const msg = document.getElementById("settingsSaved");
    msg.textContent = "Paramètres enregistrés ✅";
    setTimeout(() => (msg.textContent = ""), 2500);
    updateQuickParams();
    updateVehicleSelector();
    computeCurrent();
  });

  function updateQuickParams() {
    const v = getActiveVehicle();
    document.getElementById("quickFuelPrice").textContent = settings.fuelPrice.toFixed(3) + " €";
    document.getElementById("quickConso").textContent = v.conso.toFixed(1);
    const rateLabel =
      settings.rateMode === "fixed"
        ? settings.rate.toFixed(3) + " €"
        : `Barème ${settings.fiscalPower} CV`;
    document.getElementById("quickRate").textContent = rateLabel;
  }

  // ---------- Calculator ----------
  const calcEls = {
    date: document.getElementById("tripDate"),
    label: document.getElementById("tripLabel"),
    distance: document.getElementById("tripDistance"),
    loopBack: document.getElementById("loopBack"),
  };

  // ---------- Stops (tournée) ----------
  let stops = [
    { id: cryptoId(), value: "" },
    { id: cryptoId(), value: "" },
  ];

  function cryptoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function stopPlaceholder(index, total) {
    if (index === 0) return "Adresse de départ";
    if (index === total - 1) return "Adresse d'arrivée (dernier client)";
    return `Étape ${index} — adresse client`;
  }

  function renderStops() {
    const list = document.getElementById("stopsList");
    list.innerHTML = stops
      .map(
        (s, i) => `<div class="stop-row" data-id="${s.id}">
          <span class="stop-index">${i + 1}</span>
          <div class="stop-input-wrap">
            <input type="text" autocomplete="off" data-id="${s.id}" placeholder="${stopPlaceholder(i, stops.length)}" value="${escapeAttr(s.value)}">
          </div>
          ${stops.length > 2 && i > 0 && i < stops.length - 1 ? `<button type="button" class="stop-remove" data-id="${s.id}" title="Supprimer cette étape">✕</button>` : ""}
        </div>`
      )
      .join("");

    list.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const stop = stops.find((s) => s.id === input.dataset.id);
        if (stop) {
          stop.value = input.value;
          delete stop.lat;
          delete stop.lon;
        }
        clearAutoStatus();
        scheduleAddressSuggestions(input, stop);
      });
      input.addEventListener("blur", () => {
        setTimeout(hideSuggestions, 150); // laisse le temps au clic sur une suggestion de s'exécuter
      });
    });
    list.querySelectorAll(".stop-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        stops = stops.filter((s) => s.id !== btn.dataset.id);
        renderStops();
      });
    });
  }

  // ---------- Suggestions d'adresse ----------
  let suggestionsTimer = null;
  let suggestionsRequestId = 0;
  let suggestionsController = null;
  const suggestionsBox = document.createElement("div");
  suggestionsBox.className = "address-suggestions";
  suggestionsBox.hidden = true;
  document.body.appendChild(suggestionsBox);

  function hideSuggestions() {
    suggestionsBox.hidden = true;
    suggestionsBox.innerHTML = "";
  }

  function scheduleAddressSuggestions(input, stop) {
    clearTimeout(suggestionsTimer);
    if (suggestionsController) suggestionsController.abort();
    const query = input.value.trim();
    if (query.length < 3) {
      hideSuggestions();
      return;
    }
    suggestionsTimer = setTimeout(() => fetchAddressSuggestions(input, stop, query), 200);
  }

  // Construit un libellé court (numéro + rue, code postal + ville) à partir
  // des champs structurés Nominatim, sans département/région/pays.
  function formatShortAddress(item) {
    const a = item.address || {};
    const streetPart = [a.house_number, a.road].filter(Boolean).join(" ");
    const city = a.city || a.town || a.village || a.municipality || a.suburb || "";
    const cityPart = [a.postcode, city].filter(Boolean).join(" ");
    const parts = [streetPart, cityPart].filter(Boolean);
    if (parts.length) return parts.join(", ");
    return (a.name || item.display_name || "").split(",").slice(0, 2).join(",").trim();
  }

  // Recherche structurée quand un code postal français (5 chiffres) est repérable dans la
  // saisie : Nominatim filtre alors beaucoup plus précisément (utile pour les rues au nom
  // courant qui existent dans plusieurs communes, ex. "Allée des Platanes").
  function buildSuggestionParams(query) {
    const postcodeMatch = query.match(/\b(\d{5})\b/);
    const base = { format: "json", limit: "5", addressdetails: "1", "accept-language": "fr", countrycodes: "fr" };
    if (postcodeMatch) {
      const street = query.replace(postcodeMatch[0], "").trim();
      return { ...base, postalcode: postcodeMatch[1], street: street || query };
    }
    return { ...base, q: query };
  }

  async function nominatimSearch(paramsObj, signal) {
    const params = new URLSearchParams(paramsObj);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error("suggest_failed");
    return res.json();
  }

  async function fetchAddressSuggestions(input, stop, query) {
    const requestId = ++suggestionsRequestId;
    suggestionsController = new AbortController();
    const signal = suggestionsController.signal;
    try {
      let data = await nominatimSearch(buildSuggestionParams(query), signal);
      if (requestId !== suggestionsRequestId) return; // une saisie plus récente a pris le relais
      if (!data.length) {
        // repli en recherche libre si la recherche structurée (code postal + rue) ne trouve rien
        data = await nominatimSearch({ format: "json", limit: "5", addressdetails: "1", "accept-language": "fr", countrycodes: "fr", q: query }, signal);
        if (requestId !== suggestionsRequestId) return;
      }
      if (!data.length) return hideSuggestions();
      renderSuggestions(input, stop, data);
    } catch (err) {
      if (err.name !== "AbortError") hideSuggestions();
    }
  }

  function renderSuggestions(input, stop, results) {
    const labels = results.map(formatShortAddress);
    const rect = input.getBoundingClientRect();
    suggestionsBox.style.left = `${rect.left + window.scrollX}px`;
    suggestionsBox.style.top = `${rect.bottom + window.scrollY + 4}px`;
    suggestionsBox.style.width = `${rect.width}px`;
    suggestionsBox.innerHTML = labels
      .map((label, i) => `<div class="address-suggestion" data-index="${i}">${escapeHtml(label)}</div>`)
      .join("");
    suggestionsBox.hidden = false;

    suggestionsBox.querySelectorAll(".address-suggestion").forEach((el, i) => {
      // mousedown (avant le blur de l'input) pour que le clic soit bien pris en compte
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const r = results[i];
        const label = labels[i];
        input.value = label;
        stop.value = label;
        stop.lat = parseFloat(r.lat);
        stop.lon = parseFloat(r.lon);
        hideSuggestions();
      });
    });
  }

  document.addEventListener("scroll", hideSuggestions, true);
  window.addEventListener("resize", hideSuggestions);

  function escapeAttr(str) {
    return String(str || "").replace(/"/g, "&quot;");
  }

  document.getElementById("addStop").addEventListener("click", () => {
    stops.splice(stops.length - 1, 0, { id: cryptoId(), value: "" });
    renderStops();
  });

  function setAutoStatus(msg, isError) {
    const el = document.getElementById("autoCalcStatus");
    el.textContent = msg;
    el.style.color = isError ? "var(--danger)" : "";
  }
  function clearAutoStatus() {
    setAutoStatus("", false);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("geocoding_failed");
    const data = await res.json();
    if (!data.length) throw new Error(`Adresse introuvable : "${address}"`);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  }

  async function geocodeAll(stopsList, onProgress) {
    const coords = [];
    for (let i = 0; i < stopsList.length; i++) {
      const s = stopsList[i];
      onProgress(i + 1, stopsList.length);
      if (typeof s.lat === "number" && typeof s.lon === "number") {
        coords.push({ lat: s.lat, lon: s.lon }); // déjà connu via une suggestion choisie
        continue;
      }
      coords.push(await geocodeAddress(s.value.trim()));
      if (i < stopsList.length - 1) await sleep(1100);
    }
    return coords;
  }

  async function computeRouteDistanceKm(coords) {
    const coordStr = coords.map((c) => `${c.lon},${c.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("routing_failed");
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || !data.routes.length) throw new Error("no_route");
    return data.routes[0].distance / 1000;
  }

  document.getElementById("autoCalc").addEventListener("click", async () => {
    const activeStops = stops.filter((s) => s.value.trim());
    if (activeStops.length < 2) {
      setAutoStatus("Renseigne au moins une adresse de départ et une adresse d'arrivée.", true);
      return;
    }
    const routeStops = calcEls.loopBack.checked ? [...activeStops, activeStops[0]] : activeStops;
    const btn = document.getElementById("autoCalc");
    btn.disabled = true;
    try {
      const coords = await geocodeAll(routeStops, (i, n) =>
        setAutoStatus(`Géocodage de l'adresse ${i}/${n}...`)
      );
      setAutoStatus("Calcul de l'itinéraire...");
      const km = await computeRouteDistanceKm(coords);
      calcEls.distance.value = km.toFixed(1);
      computeCurrent();
      setAutoStatus(`Distance calculée automatiquement : ${km.toFixed(1)} km ✅`);
      const resultCard = document.querySelector(".result-card");
      resultCard.classList.remove("pulse");
      void resultCard.offsetWidth; // relance l'animation même si elle vient de jouer
      resultCard.classList.add("pulse");
    } catch (err) {
      setAutoStatus(
        `Calcul automatique impossible (${err.message || "connexion indisponible"}). Tu peux saisir la distance manuellement ci-dessous.`,
        true
      );
    } finally {
      btn.disabled = false;
    }
  });

  function getYear(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    return d.getFullYear();
  }

  function kmDoneThisYearBefore(year) {
    return trips
      .filter((t) => getYear(t.date) === year)
      .reduce((sum, t) => sum + t.distance, 0);
  }

  function computeReimbursement(distance, dateStr) {
    if (settings.rateMode === "fixed") {
      return distance * settings.rate;
    }
    const year = getYear(dateStr);
    const priorKm = kmDoneThisYearBefore(year);
    const table = (isPremium && settings.bareme) || BAREME;
    const before = baremeCumulativeAmount(settings.fiscalPower, priorKm, table);
    const after = baremeCumulativeAmount(settings.fiscalPower, priorKm + distance, table);
    return Math.max(0, after - before);
  }

  function computeCurrent() {
    const distance = parseFloat(calcEls.distance.value) || 0;
    const vehicle = getSelectedTripVehicle();
    const fuelCost = distance * (vehicle.conso / 100) * settings.fuelPrice;
    const reimb = computeReimbursement(distance, calcEls.date.value);
    const balance = reimb - fuelCost;
    const co2 = computeCo2(distance, vehicle.fuelType, vehicle.conso);

    document.getElementById("resDistance").textContent = fmtKm(distance);
    document.getElementById("resFuelCost").textContent = fmtEur(fuelCost);
    document.getElementById("resReimb").textContent = fmtEur(reimb);
    document.getElementById("resCo2").textContent = co2.toFixed(1) + " kg";
    const balBox = document.getElementById("resBalance");
    balBox.textContent = (balance >= 0 ? "+" : "") + fmtEur(balance);
    balBox.closest(".result-box").classList.toggle("negative", balance < 0);

    const hint = document.getElementById("calcHint");
    if (settings.rateMode === "baremeFiscal") {
      hint.textContent = "Barème fiscal appliqué sur le cumul kilométrique annuel du véhicule.";
    } else {
      hint.textContent = "";
    }

    return { distance, fuelCost, reimb, balance, co2, vehicle };
  }

  ["input", "change"].forEach((evt) => {
    calcEls.distance.addEventListener(evt, computeCurrent);
    calcEls.date.addEventListener(evt, computeCurrent);
  });
  document.getElementById("tripVehicle").addEventListener("change", computeCurrent);

  document.getElementById("saveTrip").addEventListener("click", () => {
    const distanceVal = parseFloat(calcEls.distance.value) || 0;
    if (distanceVal <= 0) {
      alert("Merci d'indiquer une distance valide (saisie manuelle ou calcul automatique).");
      return;
    }
    const { distance, fuelCost, reimb, balance, co2, vehicle } = computeCurrent();
    const addresses = stops.map((s) => s.value.trim()).filter(Boolean);
    const trip = {
      id: cryptoId(),
      date: calcEls.date.value || new Date().toISOString().slice(0, 10),
      label: calcEls.label.value.trim(),
      stops: addresses,
      loopBack: calcEls.loopBack.checked,
      distance,
      fuelCost,
      reimb,
      balance,
      co2,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      fuelPrice: settings.fuelPrice,
      conso: vehicle.conso,
      rateMode: settings.rateMode,
      rate: settings.rateMode === "fixed" ? settings.rate : null,
      fiscalPower: settings.rateMode === "baremeFiscal" ? settings.fiscalPower : null,
    };
    trips.push(trip);
    saveTripsToStorage(trips);

    calcEls.label.value = "";
    calcEls.distance.value = "";
    calcEls.loopBack.checked = false;
    stops = [{ id: cryptoId(), value: "" }, { id: cryptoId(), value: "" }];
    renderStops();
    clearAutoStatus();
    computeCurrent();

    switchTab("history");
  });

  // ---------- History ----------
  function renderHistory() {
    const list = document.getElementById("tripList");
    const limitNotice = document.getElementById("historyLimitNotice");
    if (trips.length === 0) {
      list.innerHTML = `<p class="hint empty-hint">Aucun trajet enregistré pour le moment.</p>`;
      limitNotice.hidden = true;
    } else {
      const sorted = [...trips].sort((a, b) => (a.date < b.date ? 1 : -1));
      const hiddenCount = isPremium ? 0 : Math.max(0, sorted.length - FREE_HISTORY_LIMIT);
      const visible = isPremium ? sorted : sorted.slice(0, FREE_HISTORY_LIMIT);
      limitNotice.hidden = hiddenCount === 0;
      if (hiddenCount > 0) {
        limitNotice.innerHTML = `<span class="pro-pill">PRO</span>${hiddenCount} trajet${hiddenCount > 1 ? "s" : ""} plus ancien${hiddenCount > 1 ? "s" : ""} masqué${hiddenCount > 1 ? "s" : ""} — passe à ProKil Pro pour un historique illimité.`;
      }
      list.innerHTML = visible
        .map((t) => {
          const balClass = t.balance >= 0 ? "" : "negative";
          const stopsList = t.stops || [];
          const route = stopsList.join(" → ") + (t.loopBack ? " → (retour)" : "");
          return `<div class="trip-card" data-id="${t.id}">
            <div class="trip-card-top">
              <div>
                <div class="trip-card-title">${escapeHtml(t.label) || "Trajet"}</div>
                <div class="trip-card-date">${t.date}</div>
              </div>
              <div class="trip-card-balance ${balClass}">${(t.balance >= 0 ? "+" : "") + fmtEur(t.balance)}</div>
            </div>
            <div class="trip-card-route">${escapeHtml(route) || "-"}${t.vehicleName && settings.vehicles.length > 1 ? ` · ${escapeHtml(t.vehicleName)}` : ""}</div>
            <div class="trip-card-meta">
              <span>${fmtKm(t.distance)}</span>
              <span>${fmtEur(t.fuelCost)} carburant</span>
              <span>${fmtEur(t.reimb)} indemnité</span>
              <span>${(t.co2 || 0).toFixed(1)} kg CO2</span>
            </div>
            <div class="trip-card-actions">
              <button class="trip-card-duplicate" data-id="${t.id}">Dupliquer</button>
              <button class="trip-card-delete" data-id="${t.id}">Supprimer</button>
            </div>
          </div>`;
        })
        .join("");
    }

    list.querySelectorAll(".trip-card-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        trips = trips.filter((t) => t.id !== btn.dataset.id);
        saveTripsToStorage(trips);
        renderHistory();
      });
    });

    list.querySelectorAll(".trip-card-duplicate").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trip = trips.find((t) => t.id === btn.dataset.id);
        if (trip) duplicateTrip(trip);
      });
    });

    const totalDistance = trips.reduce((s, t) => s + t.distance, 0);
    const totalFuel = trips.reduce((s, t) => s + t.fuelCost, 0);
    const totalReimb = trips.reduce((s, t) => s + t.reimb, 0);
    const totalCo2 = trips.reduce((s, t) => s + (t.co2 || 0), 0);
    const totalBalance = totalReimb - totalFuel;

    document.getElementById("sumCount").textContent = trips.length;
    document.getElementById("sumDistance").textContent = fmtKm(totalDistance);
    document.getElementById("sumFuel").textContent = fmtEur(totalFuel);
    document.getElementById("sumReimb").textContent = fmtEur(totalReimb);
    document.getElementById("sumCo2").textContent = totalCo2.toFixed(1) + " kg";
    const sumBalBox = document.getElementById("sumBalance");
    sumBalBox.textContent = (totalBalance >= 0 ? "+" : "") + fmtEur(totalBalance);
    sumBalBox.closest(".summary-box").classList.toggle("negative", totalBalance < 0);

    renderMonthlyReport();
  }

  function duplicateTrip(t) {
    calcEls.label.value = t.label || "";
    calcEls.loopBack.checked = !!t.loopBack;
    const addresses = t.stops && t.stops.length ? t.stops : ["", ""];
    stops = addresses.map((addr) => ({ id: cryptoId(), value: addr }));
    if (stops.length < 2) stops.push({ id: cryptoId(), value: "" });
    renderStops();
    calcEls.date.value = new Date().toISOString().slice(0, 10);
    calcEls.distance.value = t.distance ? t.distance.toFixed(1) : "";
    if (t.vehicleId && settings.vehicles.some((v) => v.id === t.vehicleId)) {
      const select = document.getElementById("tripVehicle");
      if (!document.getElementById("vehicleSelectField").hidden) select.value = t.vehicleId;
    }
    clearAutoStatus();
    computeCurrent();
    switchTab("calc");
  }

  // ---------- Rapport mensuel ----------
  function getMonthlyStats(limit) {
    const map = new Map();
    trips.forEach((t) => {
      const key = (t.date || "").slice(0, 7);
      if (!key) return;
      if (!map.has(key)) map.set(key, { key, count: 0, distance: 0, fuelCost: 0, reimb: 0, balance: 0 });
      const m = map.get(key);
      m.count += 1;
      m.distance += t.distance;
      m.fuelCost += t.fuelCost;
      m.reimb += t.reimb;
      m.balance += t.balance;
    });
    const arr = Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    return limit ? arr.slice(-limit) : arr;
  }

  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  }

  function renderMonthlyReport() {
    const chart = document.getElementById("monthlyChart");
    const list = document.getElementById("monthlyList");
    const stats = getMonthlyStats(6);

    if (!stats.length) {
      chart.innerHTML = "";
      list.innerHTML = `<p class="hint empty-hint">Pas encore assez de trajets pour un rapport mensuel.</p>`;
      return;
    }

    const maxAbs = Math.max(1, ...stats.map((s) => Math.abs(s.balance)));
    chart.innerHTML = stats
      .map((s) => {
        const h = Math.max(2, Math.round((Math.abs(s.balance) / maxAbs) * 56));
        const positive = s.balance >= 0;
        return `<div class="chart-col">
          <div class="chart-half top">${positive ? `<div class="chart-bar positive" style="height:${h}px"></div>` : ""}</div>
          <div class="chart-half bottom">${!positive ? `<div class="chart-bar negative" style="height:${h}px"></div>` : ""}</div>
          <div class="chart-value">${(s.balance >= 0 ? "+" : "") + fmtEur(s.balance)}</div>
          <div class="chart-monthlabel">${monthLabel(s.key)}</div>
        </div>`;
      })
      .join("");

    list.innerHTML = [...stats]
      .reverse()
      .map((s) => {
        const cls = s.balance >= 0 ? "" : "negative";
        return `<div class="month-row">
          <div class="month-row-top">
            <span class="month-row-label">${monthLabel(s.key)}</span>
            <span class="month-row-balance ${cls}">${(s.balance >= 0 ? "+" : "") + fmtEur(s.balance)}</span>
          </div>
          <div class="month-row-meta">${s.count} trajet${s.count > 1 ? "s" : ""} · ${fmtKm(s.distance)} · ${fmtEur(s.fuelCost)} carburant · ${fmtEur(s.reimb)} indemnité</div>
        </div>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById("clearHistory").addEventListener("click", () => {
    if (trips.length === 0) return;
    if (confirm("Supprimer définitivement tous les trajets enregistrés ?")) {
      trips = [];
      saveTripsToStorage(trips);
      renderHistory();
    }
  });

  document.getElementById("exportCsv").addEventListener("click", () => {
    if (trips.length === 0) {
      alert("Aucun trajet à exporter.");
      return;
    }
    const header = ["Date", "Client/Motif", "Vehicule", "Itineraire", "Retour au depart", "Distance (km)", "Cout carburant (EUR)", "Indemnite (EUR)", "Solde (EUR)", "CO2 (kg)"];
    const rows = [...trips]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => [
        t.date,
        t.label,
        t.vehicleName || "",
        (t.stops || []).join(" -> "),
        t.loopBack ? "Oui" : "Non",
        t.distance.toFixed(1),
        t.fuelCost.toFixed(2),
        t.reimb.toFixed(2),
        t.balance.toFixed(2),
        (t.co2 || 0).toFixed(1),
      ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prokil_trajets_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById("exportPdf").addEventListener("click", () => {
    if (trips.length === 0) {
      alert("Aucun trajet à exporter.");
      return;
    }
    buildPrintReport();
    window.print();
  });

  function buildPrintReport() {
    const sorted = [...trips].sort((a, b) => (a.date < b.date ? -1 : 1));
    const totalDistance = trips.reduce((s, t) => s + t.distance, 0);
    const totalFuel = trips.reduce((s, t) => s + t.fuelCost, 0);
    const totalReimb = trips.reduce((s, t) => s + t.reimb, 0);
    const totalCo2 = trips.reduce((s, t) => s + (t.co2 || 0), 0);
    const totalBalance = totalReimb - totalFuel;
    const period = sorted.length ? `${sorted[0].date} → ${sorted[sorted.length - 1].date}` : "";

    const rows = sorted
      .map(
        (t) => `<tr>
          <td>${t.date}</td>
          <td>${escapeHtml(t.label) || "-"}</td>
          <td>${escapeHtml((t.stops || []).join(" → ")) || "-"}</td>
          <td>${fmtKm(t.distance)}</td>
          <td>${fmtEur(t.fuelCost)}</td>
          <td>${fmtEur(t.reimb)}</td>
          <td>${(t.balance >= 0 ? "+" : "") + fmtEur(t.balance)}</td>
        </tr>`
      )
      .join("");

    document.getElementById("printReport").innerHTML = `
      <div class="print-report">
        <h1>ProKil — Note de frais kilométriques</h1>
        <p class="print-sub">Période : ${period} · Généré le ${new Date().toLocaleDateString("fr-FR")}</p>
        <table>
          <thead><tr><th>Date</th><th>Motif</th><th>Itinéraire</th><th>Distance</th><th>Carburant</th><th>Indemnité</th><th>Solde</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="print-totals">
          <div><strong>Nombre de trajets :</strong> ${trips.length}</div>
          <div><strong>Distance totale :</strong> ${fmtKm(totalDistance)}</div>
          <div><strong>Coût carburant total :</strong> ${fmtEur(totalFuel)}</div>
          <div><strong>Indemnités totales :</strong> ${fmtEur(totalReimb)}</div>
          <div><strong>Solde total :</strong> ${(totalBalance >= 0 ? "+" : "") + fmtEur(totalBalance)}</div>
          <div><strong>Empreinte CO2 totale :</strong> ${totalCo2.toFixed(1)} kg</div>
        </div>
      </div>
    `;
  }

  // ---------- Onboarding ----------
  const ONBOARDING_KEY = "prokil_onboarded_v1";
  const ROUTE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 15.3l1.4-4.2a2 2 0 011.9-1.3h8.4a2 2 0 011.9 1.3l1.4 4.2"/><path d="M3 15.3h18v2.2a.8.8 0 01-.8.8h-1.2a.8.8 0 01-.8-.8v-.7H5.8v.7a.8.8 0 01-.8.8H3.8a.8.8 0 01-.8-.8v-2.2z"/><circle cx="7.2" cy="15.3" r="1.3"/><circle cx="16.8" cy="15.3" r="1.3"/><path d="M2 20h20" stroke-dasharray="2.4 2.4"/></svg>';
  const STOPS_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8 19h7a3 3 0 003-3v-1a3 3 0 00-3-3H9a3 3 0 01-3-3v-1a3 3 0 013-3h7"/></svg>';
  const WALLET_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><circle cx="16" cy="13.5" r="1.6"/></svg>';

  const onboardingSteps = [
    {
      icon: ROUTE_ICON,
      title: "Bienvenue sur ProKil",
      text: "Calcule tes frais kilométriques en tournée : carburant, indemnité employeur et solde, en quelques secondes.",
    },
    {
      icon: STOPS_ICON,
      title: "Ajoute tes étapes",
      text: "Saisis les adresses de tes clients (avec suggestions automatiques) et calcule la distance réelle de ta tournée en un tap.",
    },
    {
      icon: WALLET_ICON,
      title: "Configure tes paramètres",
      text: "Renseigne le prix du carburant, la consommation de ton véhicule et ton taux d'indemnisation dans l'onglet Paramètres.",
    },
  ];
  let onboardingStep = 0;

  const onboardingEls = {
    overlay: document.getElementById("onboarding"),
    icon: document.getElementById("onboardingIcon"),
    title: document.getElementById("onboardingTitle"),
    text: document.getElementById("onboardingText"),
    dots: document.getElementById("onboardingDots"),
    next: document.getElementById("onboardingNext"),
    skip: document.getElementById("onboardingSkip"),
  };

  function renderOnboardingStep() {
    const s = onboardingSteps[onboardingStep];
    onboardingEls.icon.innerHTML = s.icon;
    onboardingEls.title.textContent = s.title;
    onboardingEls.text.textContent = s.text;
    onboardingEls.dots.innerHTML = onboardingSteps
      .map((_, i) => `<span class="onboarding-dot${i === onboardingStep ? " active" : ""}"></span>`)
      .join("");
    onboardingEls.next.textContent = onboardingStep === onboardingSteps.length - 1 ? "Commencer" : "Suivant";
  }

  function showOnboarding() {
    onboardingStep = 0;
    renderOnboardingStep();
    onboardingEls.overlay.hidden = false;
  }

  function hideOnboarding() {
    onboardingEls.overlay.hidden = true;
    localStorage.setItem(ONBOARDING_KEY, "1");
  }

  onboardingEls.next.addEventListener("click", () => {
    if (onboardingStep < onboardingSteps.length - 1) {
      onboardingStep += 1;
      renderOnboardingStep();
    } else {
      hideOnboarding();
    }
  });
  onboardingEls.skip.addEventListener("click", hideOnboarding);
  document.getElementById("replayOnboarding").addEventListener("click", (e) => {
    e.preventDefault();
    showOnboarding();
  });

  // ---------- PWA ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }

  // ---------- Init ----------
  function init() {
    calcEls.date.value = new Date().toISOString().slice(0, 10);
    populateSettingsForm();
    updateQuickParams();
    updateVehicleSelector();
    renderStops();
    computeCurrent();
    updateProUI();
    initBilling();
    if (!localStorage.getItem(ONBOARDING_KEY)) showOnboarding();
  }

  init();
})();
