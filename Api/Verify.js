const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');

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
// GEMINI API KEY (FORMAT BARU AQ.)
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6I_Qe4ijniu5d1AQoq6-tagfeM91dtM8UYMlIwH5zF5Fw";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ============================================================
// VERIFIKASI BUKTI TRANSFER PAKE GEMINI AI
// ============================================================
app.post('/api/verify', async (req, res) => {
  try {
    const { orderKey, buktiBase64 } = req.body;

    if (!orderKey || !buktiBase64) {
      return res.status(400).json({ error: 'Data gak lengkap' });
    }

    // Ambil data order
    const orderSnap = await db.ref('warungdigital/orders').child(orderKey).once('value');
    if (!orderSnap.exists()) {
      return res.status(404).json({ error: 'Order gak ditemukan' });
    }
    const order = orderSnap.val();

    // ============================================================
    // 1. CEK DUPLIKAT (anti-timpa foto)
    // ============================================================
    const hash = crypto.createHash('sha256').update(buktiBase64).digest('hex');
    const dupSnap = await db.ref('warungdigital/proofs')
      .orderByChild('hash').equalTo(hash).once('value');
    
    if (dupSnap.exists()) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: '❌ Bukti transfer ini udah pernah dipake sebelumnya!'
      });
    }

    // ============================================================
    // 2. VERIFIKASI PAKE GEMINI AI
    // ============================================================
    const base64Data = buktiBase64.replace(/^data:image\/\w+;base64,/, '');
    
    const prompt = `Kamu adalah sistem verifikasi bukti transfer pembayaran.

Data pesanan:
- Nominal yang harus dibayar: Rp ${order.total.toLocaleString('id-ID')}
- Nama tujuan transfer: ${order.penjual}
- Metode pembayaran: ${order.metode}

Tugas kamu:
1. Baca gambar bukti transfer ini dengan teliti
2. Cek apakah nominal transfer SAMA PERSIS dengan Rp ${order.total.toLocaleString('id-ID')}
3. Cek apakah nama tujuan transfer COCOK dengan "${order.penjual}"
4. Cek apakah ini bukti transfer yang VALID

Jawab HANYA dalam format JSON seperti ini:
{
  "valid": true/false,
  "nominalTerbaca": "angka",
  "namaTujuanTerbaca": "nama",
  "nominalMatch": true/false,
  "namaMatch": true/false,
  "alasan": "penjelasan"
}`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
          ]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    let aiResult;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      aiResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      aiResult = { valid: false, nominalMatch: false, namaMatch: false, alasan: 'AI gak bisa baca bukti' };
    }

    // ============================================================
    // 3. SIMPEN PROOF
    // ============================================================
    const proofId = 'PROOF-' + Date.now();
    await db.ref('warungdigital/proofs').child(proofId).set({
      orderKey,
      hash,
      aiResult,
      timestamp: Date.now()
    });

    // ============================================================
    // 4. UPDATE ORDER
    // ============================================================
    const isVerified = aiResult.valid && aiResult.nominalMatch && aiResult.namaMatch;
    
    await db.ref('warungdigital/orders').child(orderKey).update({
      status: isVerified ? 'proof_uploaded' : 'proof_uploaded',
      proofId,
      proofAt: Date.now(),
      bukti: buktiBase64.substring(0, 2000),
      aiVerification: aiResult
    });

    res.json({
      success: true,
      verified: isVerified,
      proofId,
      aiResult,
      status: isVerified ? 'verified' : 'manual_review'
    });

  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/verify', (req, res) => {
  res.send('Verify endpoint WarungDigital aktif! ✅');
});

module.exports = app;
