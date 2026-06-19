const axios = require('axios');

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodeAddress(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json`;
  const res = await axios.get(url, {
    params: { address, key: MAPS_KEY }
  });

  if (res.data.status !== 'OK' || !res.data.results.length) {
    throw new Error(`Geocoding failed: ${res.data.status}`);
  }

  const loc = res.data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng, formattedAddress: res.data.results[0].formatted_address };
}

async function getSolarData(lat, lng) {
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest`;
  const res = await axios.get(url, {
    params: {
      'location.latitude': lat,
      'location.longitude': lng,
      requiredQuality: 'MEDIUM',
      key: MAPS_KEY
    }
  });
  return res.data;
}

// PVGIS (EU JRC) — točna sunčanost i optimalni nagib za TOČNE koordinate (besplatno).
// Vraća stvarnu godišnju proizvodnju po kWp (već uključuje gubitke sustava) i optimalni nagib.
async function getPvgis(lat, lng) {
  try {
    const res = await axios.get('https://re.jrc.ec.europa.eu/api/v5_2/PVcalc', {
      params: { lat, lon: lng, peakpower: 1, loss: 14, optimalangles: 1, outputformat: 'json' },
      timeout: 8000
    });
    const eY = res.data?.outputs?.totals?.fixed?.E_y;
    const slope = res.data?.inputs?.mounting_system?.fixed?.slope?.value;
    if (!eY) return null;
    return { sunPerKwp: Math.round(eY), tilt: slope != null ? Math.round(slope) : null };
  } catch (err) {
    console.log('PVGIS nedostupan:', err.message);
    return null;
  }
}

// Fallback kalkulacija kad Solar API nema podatke za lokaciju
function calculateFallback(lat, lng, monthlyBill, pvgis) {
  const avgCostPerKwh = 0.18;
  const annualUsageKwh = (monthlyBill / avgCostPerKwh) * 12;

  // Točna sunčanost za TOČNE koordinate (PVGIS). Ako PVGIS ne odgovori,
  // padamo na grubu procjenu po zemljopisnoj širini.
  const sunHours = (pvgis && pvgis.sunPerKwp) ? pvgis.sunPerKwp : (lat < 44 ? 1550 : 1350);

  // Koliko kWp treba da pokrije godišnju potrošnju
  const systemSizeKw = Math.round((annualUsageKwh / sunHours) * 10) / 10;
  const panelWatt = 400;
  const recommendedPanels = Math.ceil((systemSizeKw * 1000) / panelWatt);
  const yearlyEnergyKwh = Math.round(systemSizeKw * sunHours);
  // Mjesečno i godišnje moraju biti dosljedni (god = mj × 12)
  const monthlySavings = Math.round((yearlyEnergyKwh * avgCostPerKwh) / 12);
  const annualSavings = monthlySavings * 12;

  // Cijena ~900 EUR/kWp instalirano u Hrvatskoj
  const grossCost = Math.round(systemSizeKw * 900);
  const paybackYears = Math.round((grossCost / annualSavings) * 10) / 10;

  return {
    recommendedPanels,
    maxPanels: recommendedPanels,
    yearlyEnergyKwh,
    annualSavings,
    monthlySavings,
    systemSizeKw,
    grossCost,
    federalCredit: 0,
    netCost: grossCost,
    paybackYears,
    stateIncentive: 'Net billing (2026): otkup viška ~0,05 €/kWh, FZOEU potpore, PDV 5% umjesto 25%',
    federalIncentive: 'PDV olakšica 5%',
    sunPerKwp: Math.round(sunHours),
    tilt: pvgis && pvgis.tilt != null ? pvgis.tilt : null,
    fallback: true
  };
}

function parseSolarData(solarData, monthlyBill) {
  try {
    const configs = solarData.solarPotential?.solarPanelConfigs || [];
    const maxPanels = solarData.solarPotential?.maxArrayPanelsCount || 0;
    const maxEnergy = solarData.solarPotential?.maxArrayAnnualEnergyKwh || 0;

    const avgCostPerKwh = 0.18;
    const annualUsageKwh = (monthlyBill / avgCostPerKwh) * 12;

    let bestConfig = configs[0];
    let closestDiff = Infinity;
    for (const config of configs) {
      const diff = Math.abs(config.yearlyEnergyDcKwh - annualUsageKwh);
      if (diff < closestDiff) {
        closestDiff = diff;
        bestConfig = config;
      }
    }

    const recommendedPanels = bestConfig?.panelsCount || Math.min(Math.ceil(annualUsageKwh / 400), maxPanels);
    const yearlyEnergyKwh = bestConfig?.yearlyEnergyDcKwh || maxEnergy;
    const monthlySavings = Math.round((yearlyEnergyKwh * avgCostPerKwh) / 12);
    const annualSavings = monthlySavings * 12;

    const systemSizeKw = (recommendedPanels * 400) / 1000;
    const grossCost = Math.round(systemSizeKw * 900);
    const paybackYears = Math.round((grossCost / annualSavings) * 10) / 10;

    return {
      recommendedPanels,
      maxPanels,
      yearlyEnergyKwh: Math.round(yearlyEnergyKwh),
      annualSavings,
      monthlySavings,
      systemSizeKw: Math.round(systemSizeKw * 10) / 10,
      grossCost,
      federalCredit: 0,
      netCost: grossCost,
      paybackYears,
      stateIncentive: 'Net billing (2026): otkup viška ~0,05 €/kWh, FZOEU potpore, PDV 5% umjesto 25%',
      federalIncentive: 'PDV olakšica 5%'
    };
  } catch (err) {
    throw new Error('Greška pri obradi solarnih podataka: ' + err.message);
  }
}

// Iz površine krova izračunaj MAKSIMALNI broj panela koji stane i njegov potencijal.
// Ovo je drugi scenarij — može biti i VIŠE panela nego što potrošnja traži.
function computeRoofScenario(base, roofArea, annualUsageKwh) {
  const panelArea = 2.0;    // m² po panelu od 400W (uklj. razmak po redovima)
  const usableFactor = 0.7; // realno iskoristiv dio krova (orijentacija, dimnjaci, rubovi)
  const price = 0.18;        // cijena struje koju izbjegnete plaćati (€/kWh)
  const surplusPrice = 0.05; // net billing 2026: otkup viška u mrežu (€/kWh)

  const maxPanels = Math.floor((roofArea * usableFactor) / panelArea);
  if (maxPanels <= 0) return null;

  // koliko kWh godišnje proizvede 1 kWp na ovoj lokaciji (iz osnovne procjene)
  const energyPerKw = base.systemSizeKw > 0 ? (base.yearlyEnergyKwh / base.systemSizeKw) : 1400;
  const systemSizeKw = Math.round((maxPanels * 400 / 1000) * 10) / 10;
  const yearlyEnergyKwh = Math.round(systemSizeKw * energyPerKw);

  // ušteda na računu se ne može popeti iznad vlastite potrošnje
  const billSavingsAnnual = Math.round(Math.min(yearlyEnergyKwh, annualUsageKwh) * price);
  // sve preko potrošnje je višak koji se prodaje/kreditira u mrežu
  const surplusKwh = Math.max(0, Math.round(yearlyEnergyKwh - annualUsageKwh));
  const surplusValueAnnual = Math.round(surplusKwh * surplusPrice);
  const totalBenefitAnnual = billSavingsAnnual + surplusValueAnnual;

  // Baterija: dio viška (realno do ~3.500 kWh/god) iskoristite sami (0,18 €)
  // umjesto da ga prodate u mrežu (0,05 €) — dobitak je razlika (0,13 €/kWh).
  const batteryShiftKwh = Math.min(surplusKwh, 3500);
  const batteryBenefitAnnual = Math.round(batteryShiftKwh * (price - surplusPrice));

  return {
    area: Math.round(roofArea),
    maxPanels,
    systemSizeKw,
    yearlyEnergyKwh,
    coversConsumption: maxPanels >= base.recommendedPanels,
    billSavingsAnnual,
    surplusKwh,
    surplusValueAnnual,
    totalBenefitAnnual,
    totalBenefitMonthly: Math.round(totalBenefitAnnual / 12),
    batteryBenefitAnnual
  };
}

async function getSolarEstimate(address, monthlyBill, opts = {}) {
  const { lat: optLat, lng: optLng, roofArea } = opts;

  let lat, lng, formattedAddress;

  // Ako su koordinate poslane (pin s karte) — koristimo njih direktno, bez ponovnog geocodinga
  if (optLat != null && optLng != null) {
    lat = Number(optLat);
    lng = Number(optLng);
    formattedAddress = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } else {
    const fullAddress = /croatia|hrvatska/i.test(address) ? address : `${address}, Croatia`;
    const geo = await geocodeAddress(fullAddress);
    lat = geo.lat;
    lng = geo.lng;
    formattedAddress = geo.formattedAddress;
  }

  // Točna sunčanost + optimalni nagib za TOČNE koordinate (PVGIS, EU)
  const pvgis = await getPvgis(lat, lng);

  let parsed;
  try {
    const solarData = await getSolarData(lat, lng);
    parsed = parseSolarData(solarData, monthlyBill);
  } catch (err) {
    // Solar API nema podatke za ovu lokaciju — koristimo fallback kalkulaciju
    console.log('Solar API fallback za:', formattedAddress, '| Razlog:', err.message);
    parsed = calculateFallback(lat, lng, monthlyBill, pvgis);
  }

  // PVGIS sunčanost + nagib za prikaz (vrijedi i kad je Solar API uspio)
  if (pvgis) {
    if (pvgis.sunPerKwp) parsed.sunPerKwp = pvgis.sunPerKwp;
    if (pvgis.tilt != null) parsed.tilt = pvgis.tilt;
  }

  // Osnovna procjena (prema potrošnji) OSTAJE nepromijenjena
  const result = { ...parsed, formattedAddress, lat, lng };

  // Ako je iscrtan krov — dodaj drugi scenarij (maksimum na krov)
  if (roofArea && roofArea > 0) {
    const annualUsageKwh = (monthlyBill / 0.18) * 12;
    result.roof = computeRoofScenario(parsed, roofArea, annualUsageKwh);
  }

  return result;
}

module.exports = { getSolarEstimate };
