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
// CREATE ORDER
// ============================================================
app.post('/api/orders', async (req, res) => {
  try {
    const { produkId, produkNama, harga, pembeli, penjual, metode } = req.body;
    
    if (!produkNama || !harga || !pembeli || !penjual) {
      return res.status(400).json({ error: 'Data gak lengkap' });
    }

    const orderId = 'ORD-' + Date.now();
    const order = {
      orderId,
      produkId,
      produkNama,
      harga: parseInt(harga),
      total: parseInt(harga),
      pembeli,
      penjual,
      metode,
      status: 'waiting_payment',
      createdAt: Date.now()
    };

    await db.ref('warungdigital/orders').child(orderId).set(order);
    res.json({ success: true, orderId, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET ORDERS
// ============================================================
app.get('/api/orders', async (req, res) => {
  try {
    const { user, role } = req.query;
    const snap = await db.ref('warungdigital/orders').once('value');
    const orders = [];
    snap.forEach(child => {
      const o = child.val();
      if (role === 'penjual' && o.penjual === user) orders.push(o);
      else if (role === 'pembeli' && o.pembeli === user) orders.push(o);
      else if (!role && (o.penjual === user || o.pembeli === user)) orders.push(o);
    });
    res.json({ success: true, orders: orders.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// KONFIRMASI ORDER (oleh penjual)
// ============================================================
app.post('/api/orders/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { penjual } = req.body;
    
    const snap = await db.ref('warungdigital/orders').child(id).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Order gak ada' });
    
    const order = snap.val();
    if (order.penjual !== penjual) {
      return res.status(403).json({ error: 'Bukan order lo!' });
    }
    
    await db.ref('warungdigital/orders').child(id).update({
      status: 'confirmed',
      confirmedAt: Date.now()
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
