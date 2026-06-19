const axios = require('axios');

const BASE_URL = 'https://api.airtable.com/v0';
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME;

async function createLead(data) {
  const res = await axios.post(
    `${BASE_URL}/${BASE_ID}/${encodeURIComponent(TABLE)}`,
    {
      fields: {
        'Name': data.name || '',
        'Phone': data.phone || '',
        'Email': data.email || '',
        'Address': data.address || '',
        'Monthly Bill': Number(data.monthlyBill) || 0,
        'WhatsApp Opt In': !!data.whatsappOptIn,
        'Status': 'New',
        'Estimate Data': data.estimateData || ''   // sve ostalo (paneli, ušteda, sunce, krov...) u JSON-u
      },
      typecast: true  // Airtable sam stvori npr. "New" opciju u Status polju
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return res.data;
}

// Pronađi lead po telefonu (usporedba zadnjih 8 znamenki — robusno na +385 / 0 / razmake)
async function findLeadByPhone(phone) {
  const key = String(phone).replace(/\D/g, '').slice(-8);
  if (!key) return null;
  const res = await axios.get(
    `${BASE_URL}/${BASE_ID}/${encodeURIComponent(TABLE)}?pageSize=100`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  return res.data.records.find(
    r => String(r.fields.Phone || '').replace(/\D/g, '').endsWith(key)
  ) || null;
}

// Ažuriraj postojeći lead (npr. Status, bilješke)
async function updateLead(recordId, fields) {
  const res = await axios.patch(
    `${BASE_URL}/${BASE_ID}/${encodeURIComponent(TABLE)}/${recordId}`,
    { fields, typecast: true },
    { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

module.exports = { createLead, findLeadByPhone, updateLead };
