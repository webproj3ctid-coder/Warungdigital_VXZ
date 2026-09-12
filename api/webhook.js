const express = require('express');
const app = express();

// Biar bisa baca body JSON dari Tako
app.use(express.json());

app.post('/api/webhook', (req, res) => {
  // Ini bakal ke-trigger tiap ada donasi sukses dari Tako
  console.log("🔥 DONASI MASUK DARI TAKO:");
  console.log(JSON.stringify(req.body, null, 2));
  
  // Kirim respon sukses biar Tako tau notif udah diterima
  res.status(200).json({ received: true });
});

// Buat tes doang, cek webhook udah jalan apa belum
app.get('/api/webhook', (req, res) => {
  res.send('Webhook WarungDigital aktif! ✅');
});

module.exports = app;