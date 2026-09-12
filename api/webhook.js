const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ============================================================
// FIREBASE ADMIN (ENV VARS)
// ============================================================
const serviceAccount = {
  "type": "service_account",
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL,
  "universe_domain": "googleapis.com"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://project1-f57d6-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}
const db = admin.database();

// ============================================================
// WEBHOOK TAKO
// ============================================================
app.post('/api/webhook/tako', async (req, res) => {
  try {
    console.log('🔥 WEBHOOK TAKO MASUK:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    const donation = {
      source: 'tako',
      amount: data.amount || data.total || 0,
      donator: data.donator || data.name || 'Anonim',
      message: data.message || '',
      raw: data,
      timestamp: Date.now()
    };

    await db.ref('warungdigital/donations').push(donation);
    
    // Auto-match order pending
    const ordersSnap = await db.ref('warungdigital/orders')
      .orderByChild('status').equalTo('waiting_payment').once('value');
    
    if (ordersSnap.exists()) {
      ordersSnap.forEach(child => {
        const order = child.val();
        if (order.total == donation.amount) {
          child.ref.update({
            status: 'paid',
            paidAt: Date.now(),
            paymentSource: 'tako',
            paymentData: donation
          });
          console.log('✅ Order auto-matched:', order.orderId);
        }
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook Tako error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// WEBHOOK SAWERIA
// ============================================================
app.post('/api/webhook/saweria', async (req, res) => {
  try {
    console.log('🔥 WEBHOOK SAWERIA MASUK:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    const donation = {
      source: 'saweria',
      amount: data.amount || 0,
      donator: data.donator || data.name || 'Anonim',
      message: data.message || '',
      raw: data,
      timestamp: Date.now()
    };

    await db.ref('warungdigital/donations').push(donation);

    const ordersSnap = await db.ref('warungdigital/orders')
      .orderByChild('status').equalTo('waiting_payment').once('value');
    
    if (ordersSnap.exists()) {
      ordersSnap.forEach(child => {
        const order = child.val();
        if (order.total == donation.amount) {
          child.ref.update({
            status: 'paid',
            paidAt: Date.now(),
            paymentSource: 'saweria',
            paymentData: donation
          });
        }
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook Saweria error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENDPOINT CEK STATUS
// ============================================================
app.get('/api/webhook/tako', (req, res) => {
  res.send('Webhook Tako WarungDigital aktif! ✅');
});

app.get('/api/webhook/saweria', (req, res) => {
  res.send('Webhook Saweria WarungDigital aktif! ✅');
});

module.exports = app;
