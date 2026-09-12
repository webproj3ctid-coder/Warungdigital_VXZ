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
// GET ALL PRODUCTS
// ============================================================
app.get('/api/products', async (req, res) => {
  try {
    const snap = await db.ref('warungdigital/products').once('value');
    const products = [];
    snap.forEach(child => products.push({ id: child.key, ...child.val() }));
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CREATE PRODUCT
// ============================================================
app.post('/api/products', async (req, res) => {
  try {
    const { nama, harga, kategori, deskripsi, penjual, tipe, waLink, fileBase64 } = req.body;
    
    if (!nama || !harga || !penjual) {
      return res.status(400).json({ error: 'Data gak lengkap' });
    }

    const product = {
      nama,
      harga: parseInt(harga),
      kategori: kategori || 'Umum',
      deskripsi: deskripsi || '',
      penjual,
      tipe: tipe || 'digital',
      waLink: waLink || '',
      fileBase64: fileBase64 || '',
      createdAt: Date.now()
    };

    const ref = await db.ref('warungdigital/products').push(product);
    res.json({ success: true, id: ref.key, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE PRODUCT
// ============================================================
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { penjual } = req.body;
    
    const snap = await db.ref('warungdigital/products').child(id).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Produk gak ada' });
    
    if (snap.val().penjual !== penjual) {
      return res.status(403).json({ error: 'Bukan produk lo!' });
    }
    
    await db.ref('warungdigital/products').child(id).remove();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
