(() => {
  "use strict";

  const STORAGE_SETTINGS = "kilompro_settings_v1";
  const STORAGE_TRIPS = "kilompro_trips_v1";

  const defaultSettings = {
    fuelPrice: 1.85,
    fuelType: "diesel",
    conso: 6.5,
    rateMode: "fixed",
    rate: 0.32,
    fiscalPower: "5",
    vehicleName: "",
  };

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
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS);
      return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch {
      return { ...defaultSettings };
    }
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
    fuelType: document.getElementById("fuelType"),
    conso: document.getElementById("conso"),
    rateMode: document.getElementById("rateMode"),
    rate: document.getElementById("rate"),
    fiscalPower: document.getElementById("fiscalPower"),
    vehicleName: document.getElementById("vehicleName"),
    fixedRateField: document.getElementById("fixedRateField"),
    powerField: document.getElementById("powerField"),
    baremeTableField: document.getElementById("baremeTableField"),
    baremeTableBody: document.getElementById("baremeTableBody"),
  };

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
    els.fuelType.value = settings.fuelType;
    els.conso.value = settings.conso;
    els.rateMode.value = settings.rateMode;
    els.rate.value = settings.rate;
    els.fiscalPower.value = settings.fiscalPower;
    els.vehicleName.value = settings.vehicleName;
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
    settings = {
      fuelPrice: parseFloat(els.fuelPrice.value) || 0,
      fuelType: els.fuelType.value,
      conso: parseFloat(els.conso.value) || 0,
      rateMode: els.rateMode.value,
      rate: parseFloat(els.rate.value) || 0,
      fiscalPower: els.fiscalPower.value,
      vehicleName: els.vehicleName.value.trim(),
      bareme: readBaremeTable(),
    };
    saveSettingsToStorage(settings);
    const msg = document.getElementById("settingsSaved");
    msg.textContent = "Paramètres enregistrés ✅";
    setTimeout(() => (msg.textContent = ""), 2500);
    updateQuickParams();
    computeCurrent();
  });

  function updateQuickParams() {
    document.getElementById("quickFuelPrice").textContent = settings.fuelPrice.toFixed(3) + " €";
    document.getElementById("quickConso").textContent = settings.conso.toFixed(1);
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
    const query = input.value.trim();
    if (query.length < 3) {
      hideSuggestions();
      return;
    }
    suggestionsTimer = setTimeout(() => fetchAddressSuggestions(input, stop, query), 400);
  }

  async function fetchAddressSuggestions(input, stop, query) {
    const requestId = ++suggestionsRequestId;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&accept-language=fr&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (requestId !== suggestionsRequestId) return; // une saisie plus récente a pris le relais
      if (!res.ok) return hideSuggestions();
      const data = await res.json();
      if (requestId !== suggestionsRequestId) return;
      if (!data.length) return hideSuggestions();
      renderSuggestions(input, stop, data);
    } catch {
      hideSuggestions();
    }
  }

  function renderSuggestions(input, stop, results) {
    const rect = input.getBoundingClientRect();
    suggestionsBox.style.left = `${rect.left + window.scrollX}px`;
    suggestionsBox.style.top = `${rect.bottom + window.scrollY + 4}px`;
    suggestionsBox.style.width = `${rect.width}px`;
    suggestionsBox.innerHTML = results
      .map((r, i) => `<div class="address-suggestion" data-index="${i}">${escapeHtml(r.display_name)}</div>`)
      .join("");
    suggestionsBox.hidden = false;

    suggestionsBox.querySelectorAll(".address-suggestion").forEach((el, i) => {
      // mousedown (avant le blur de l'input) pour que le clic soit bien pris en compte
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const r = results[i];
        input.value = r.display_name;
        stop.value = r.display_name;
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
    const table = settings.bareme || BAREME;
    const before = baremeCumulativeAmount(settings.fiscalPower, priorKm, table);
    const after = baremeCumulativeAmount(settings.fiscalPower, priorKm + distance, table);
    return Math.max(0, after - before);
  }

  function computeCurrent() {
    const distance = parseFloat(calcEls.distance.value) || 0;
    const fuelCost = distance * (settings.conso / 100) * settings.fuelPrice;
    const reimb = computeReimbursement(distance, calcEls.date.value);
    const balance = reimb - fuelCost;

    document.getElementById("resDistance").textContent = fmtKm(distance);
    document.getElementById("resFuelCost").textContent = fmtEur(fuelCost);
    document.getElementById("resReimb").textContent = fmtEur(reimb);
    const balBox = document.getElementById("resBalance");
    balBox.textContent = (balance >= 0 ? "+" : "") + fmtEur(balance);
    balBox.closest(".result-box").classList.toggle("negative", balance < 0);

    const hint = document.getElementById("calcHint");
    if (settings.rateMode === "baremeFiscal") {
      hint.textContent = "Barème fiscal appliqué sur le cumul kilométrique annuel du véhicule.";
    } else {
      hint.textContent = "";
    }

    return { distance, fuelCost, reimb, balance };
  }

  ["input", "change"].forEach((evt) => {
    calcEls.distance.addEventListener(evt, computeCurrent);
    calcEls.date.addEventListener(evt, computeCurrent);
  });

  document.getElementById("saveTrip").addEventListener("click", () => {
    const distanceVal = parseFloat(calcEls.distance.value) || 0;
    if (distanceVal <= 0) {
      alert("Merci d'indiquer une distance valide (saisie manuelle ou calcul automatique).");
      return;
    }
    const { distance, fuelCost, reimb, balance } = computeCurrent();
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
      fuelPrice: settings.fuelPrice,
      conso: settings.conso,
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
    if (trips.length === 0) {
      list.innerHTML = `<p class="hint empty-hint">Aucun trajet enregistré pour le moment.</p>`;
    } else {
      const sorted = [...trips].sort((a, b) => (a.date < b.date ? 1 : -1));
      list.innerHTML = sorted
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
            <div class="trip-card-route">${escapeHtml(route) || "-"}</div>
            <div class="trip-card-meta">
              <span>${fmtKm(t.distance)}</span>
              <span>${fmtEur(t.fuelCost)} carburant</span>
              <span>${fmtEur(t.reimb)} indemnité</span>
            </div>
            <button class="trip-card-delete" data-id="${t.id}">Supprimer</button>
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

    const totalDistance = trips.reduce((s, t) => s + t.distance, 0);
    const totalFuel = trips.reduce((s, t) => s + t.fuelCost, 0);
    const totalReimb = trips.reduce((s, t) => s + t.reimb, 0);
    const totalBalance = totalReimb - totalFuel;

    document.getElementById("sumCount").textContent = trips.length;
    document.getElementById("sumDistance").textContent = fmtKm(totalDistance);
    document.getElementById("sumFuel").textContent = fmtEur(totalFuel);
    document.getElementById("sumReimb").textContent = fmtEur(totalReimb);
    const sumBalBox = document.getElementById("sumBalance");
    sumBalBox.textContent = (totalBalance >= 0 ? "+" : "") + fmtEur(totalBalance);
    sumBalBox.closest(".summary-box").classList.toggle("negative", totalBalance < 0);

    renderMonthlyReport();
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
    const header = ["Date", "Client/Motif", "Itineraire", "Retour au depart", "Distance (km)", "Cout carburant (EUR)", "Indemnite (EUR)", "Solde (EUR)"];
    const rows = [...trips]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => [
        t.date,
        t.label,
        (t.stops || []).join(" -> "),
        t.loopBack ? "Oui" : "Non",
        t.distance.toFixed(1),
        t.fuelCost.toFixed(2),
        t.reimb.toFixed(2),
        t.balance.toFixed(2),
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
    renderStops();
    computeCurrent();
    renderHistory();
    if (!localStorage.getItem(ONBOARDING_KEY)) showOnboarding();
  }

  init();
})();
