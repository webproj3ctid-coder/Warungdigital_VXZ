const express = require('express');
const admin = require('firebase-admin');
const app = express();

// Biar bisa baca body JSON dari Tako
app.use(express.json());

// ============================================================
// FIREBASE ADMIN SETUP
// ============================================================
// Isi pake service account dari Firebase Console lo
// (caranya di bawah)
const serviceAccount = {
  "type": "service_account",
  "project_id": "project1-f57d6",
  "private_key_id": "GANTI_INI",
  "private_key": "GANTI_INI",
  "client_email": "GANTI_INI",
  "client_id": "GANTI_INI",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "GANTI_INI"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://project1-f57d6-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const db = admin.database();

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================
app.post('/api/webhook', async (req, res) => {
  try {
    console.log("🔥 DONASI MASUK DARI TAKO:");
    console.log(JSON.stringify(req.body, null, 2));

    const data = req.body;

    // Simpen ke Firebase
    await db.ref('warungdigital/donations').push({
      amount: data.amount || data.total || 0,
      donator: data.donator || data.name || 'Anonim',
      message: data.message || '',
      raw: data,
      timestamp: Date.now()
    });

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Buat tes doang
app.get('/api/webhook', (req, res) => {
  res.send('Webhook WarungDigital aktif! ✅');
});

module.exports = app;
