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

  function baremeCumulativeAmount(cv, km) {
    const t = BAREME[cv] || BAREME["5"];
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
  };

  function populateSettingsForm() {
    els.fuelPrice.value = settings.fuelPrice;
    els.fuelType.value = settings.fuelType;
    els.conso.value = settings.conso;
    els.rateMode.value = settings.rateMode;
    els.rate.value = settings.rate;
    els.fiscalPower.value = settings.fiscalPower;
    els.vehicleName.value = settings.vehicleName;
    toggleRateFields();
  }

  function toggleRateFields() {
    const isFixed = els.rateMode.value === "fixed";
    els.fixedRateField.style.display = isFixed ? "" : "none";
    els.powerField.style.display = isFixed ? "none" : "";
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
    from: document.getElementById("tripFrom"),
    to: document.getElementById("tripTo"),
    distance: document.getElementById("tripDistance"),
    roundtrip: document.getElementById("tripRoundtrip"),
  };

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
    const before = baremeCumulativeAmount(settings.fiscalPower, priorKm);
    const after = baremeCumulativeAmount(settings.fiscalPower, priorKm + distance);
    return Math.max(0, after - before);
  }

  function computeCurrent() {
    const base = parseFloat(calcEls.distance.value) || 0;
    const distance = calcEls.roundtrip.value === "1" ? base * 2 : base;
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
    calcEls.roundtrip.addEventListener(evt, computeCurrent);
    calcEls.date.addEventListener(evt, computeCurrent);
  });

  document.getElementById("saveTrip").addEventListener("click", () => {
    const base = parseFloat(calcEls.distance.value) || 0;
    if (base <= 0) {
      alert("Merci d'indiquer une distance valide.");
      return;
    }
    const { distance, fuelCost, reimb, balance } = computeCurrent();
    const trip = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      date: calcEls.date.value || new Date().toISOString().slice(0, 10),
      label: calcEls.label.value.trim(),
      from: calcEls.from.value.trim(),
      to: calcEls.to.value.trim(),
      roundtrip: calcEls.roundtrip.value === "1",
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
    calcEls.from.value = "";
    calcEls.to.value = "";
    calcEls.distance.value = "";
    calcEls.roundtrip.value = "0";
    computeCurrent();

    switchTab("history");
  });

  // ---------- History ----------
  function renderHistory() {
    const tbody = document.getElementById("tripTableBody");
    if (trips.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Aucun trajet enregistré pour le moment.</td></tr>`;
    } else {
      const sorted = [...trips].sort((a, b) => (a.date < b.date ? 1 : -1));
      tbody.innerHTML = sorted
        .map((t) => {
          const balClass = t.balance >= 0 ? "row-balance-pos" : "row-balance-neg";
          const route = [t.from, t.to].filter(Boolean).join(" → ") + (t.roundtrip ? " (A/R)" : "");
          return `<tr data-id="${t.id}">
            <td>${t.date}</td>
            <td>${escapeHtml(t.label) || "-"}</td>
            <td>${escapeHtml(route) || "-"}</td>
            <td>${fmtKm(t.distance)}</td>
            <td>${fmtEur(t.fuelCost)}</td>
            <td>${fmtEur(t.reimb)}</td>
            <td class="${balClass}">${(t.balance >= 0 ? "+" : "") + fmtEur(t.balance)}</td>
            <td><button class="delete-btn" data-id="${t.id}" title="Supprimer">✕</button></td>
          </tr>`;
        })
        .join("");
    }

    tbody.querySelectorAll(".delete-btn").forEach((btn) => {
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
    const header = ["Date", "Client/Motif", "Depart", "Arrivee", "Aller-retour", "Distance (km)", "Cout carburant (EUR)", "Indemnite (EUR)", "Solde (EUR)"];
    const rows = [...trips]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => [
        t.date,
        t.label,
        t.from,
        t.to,
        t.roundtrip ? "Oui" : "Non",
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
    a.download = `kilompro_trajets_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- Init ----------
  function init() {
    calcEls.date.value = new Date().toISOString().slice(0, 10);
    populateSettingsForm();
    updateQuickParams();
    computeCurrent();
    renderHistory();
  }

  init();
})();
