const express = require('express');
const app = express();
app.use(express.json());

// ============================================================
// VERIFIKASI E-WALLET PENJUAL
// ============================================================
app.post('/api/verify-ewallet', async (req, res) => {
  try {
    const { jenis, namaAkun, nomor, user } = req.body;

    // Validasi data
    if(!jenis || !namaAkun || !nomor){
      return res.json({ success: false, verified: false, error: 'Data gak lengkap' });
    }

    // Validasi panjang nama akun
    if(namaAkun.length < 2){
      return res.json({ success: false, verified: false, error: 'Nama akun terlalu pendek' });
    }

    // Validasi panjang nomor
    const nomorBersih = nomor.replace(/[^0-9]/g, '');
    if(nomorBersih.length < 8){
      return res.json({ success: false, verified: false, error: 'Nomor tidak valid' });
    }

    // Validasi format nomor sesuai jenis
    const validasi = {
      'DANA': /^08[0-9]{8,12}$/,
      'OVO': /^08[0-9]{8,12}$/,
      'GoPay': /^08[0-9]{8,12}$/,
      'ShopeePay': /^08[0-9]{8,12}$/,
      'BCA': /^[0-9]{10,16}$/,
      'BRI': /^[0-9]{10,16}$/,
      'BNI': /^[0-9]{10,16}$/,
      'Mandiri': /^[0-9]{10,16}$/
    };

    const regex = validasi[jenis];
    if(regex && !regex.test(nomorBersih)){
      return res.json({
        success: false,
        verified: false,
        error: `Format nomor ${jenis} tidak valid`
      });
    }

    // Kalau lolos semua → verified
    res.json({
      success: true,
      verified: true,
      message: 'E-wallet valid',
      data: {
        jenis,
        namaAkun,
        nomor: nomorBersih,
        verifiedAt: Date.now()
      }
    });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/verify-ewallet', (req, res) => {
  res.send('Verify E-Wallet endpoint aktif! ✅');
});

module.exports = app;
