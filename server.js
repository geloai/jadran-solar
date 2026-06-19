const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { getSolarEstimate } = require('./solar-api');
const { createLead } = require('./airtable');
const { sendMessage } = require('./whatsapp');
const { handleMessage } = require('./qualifier');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Frontend config — Maps browser key (zaseban od backend ključa ako je postavljen)
app.get('/api/config', (req, res) => {
  res.json({ mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.GOOGLE_MAPS_API_KEY || '' });
});

// Form estimate endpoint
app.post('/api/estimate', async (req, res) => {
  const { name, phone, email, address, monthlyBill, lat, lng, roofArea } = req.body;

  if ((!address && (lat == null || lng == null)) || !monthlyBill) {
    return res.status(400).json({ error: 'Adresa i račun za struju su obavezni.' });
  }

  try {
    const estimate = await getSolarEstimate(address, parseFloat(monthlyBill), { lat, lng, roofArea });
    // Lead se NE sprema ovdje — samo kad korisnik pošalje kontakt formu (ime + telefon).
    res.json(estimate);
  } catch (err) {
    console.error('Estimate error:', err.message);
    res.status(500).json({ error: 'Nije moguće izračunati procjenu za tu adresu. Provjerite adresu i pokušajte ponovo.' });
  }
});

// Contact form submission (after seeing estimate)
app.post('/api/contact', async (req, res) => {
  const { name, phone, email, address, monthlyBill, whatsappOptIn, estimateData } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Ime i telefon su obavezni.' });
  }

  try {
    await createLead({ name, phone, email: email || '', address, monthlyBill, whatsappOptIn, estimateData });
    res.json({ ok: true });
  } catch (err) {
    console.error('Contact/Airtable error:', err.message);
    res.status(500).json({ error: 'Greška pri spremanju.' });
  }
});

// ── WhatsApp webhook (Build B — AI kvalifikator) ──
// Meta provjera webhooka (GET)
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Dolazne poruke (POST) — AI odgovara i kvalificira
app.post('/api/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // odmah potvrdi Meti da smo primili
  try {
    const value = req.body && req.body.entry && req.body.entry[0]
      && req.body.entry[0].changes && req.body.entry[0].changes[0]
      && req.body.entry[0].changes[0].value;
    const msg = value && value.messages && value.messages[0];
    if (!msg || msg.type !== 'text') return;

    const from = msg.from;          // broj pošiljatelja (E.164 bez +)
    const text = msg.text.body;
    console.log('📩 WhatsApp od ' + from + ': ' + text);
    const reply = await handleMessage(from, text);
    if (reply) {
      await sendMessage(from, reply);
      console.log('🤖 Ana → ' + from + ': ' + reply.replace(/\n/g, ' ⏎ '));
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err.message);
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Jadran Solar kalkulator radi na http://localhost:${PORT}`);
});
