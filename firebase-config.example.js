// ============================================================================
// CONTOH KONFIGURASI FIREBASE
// ============================================================================
// Petunjuk Pengisian:
// 1. Salin (copy) file ini dan ubah namanya menjadi: firebase-config.js
//    (Pastikan berada di folder utama yang sama dengan index.html)
// 2. Buka Firebase Console (https://console.firebase.google.com/)
// 3. Pilih project sekolah Anda, lalu klik ikon roda gigi (Project Settings)
// 4. Di bagian bawah "Your apps", pilih Web App (ikon </>) dan salin nilainya
//    ke dalam tanda kutip di bawah ini.
// 5. Jangan bagikan file firebase-config.js jika repository GitHub bersifat publik,
//    atau pastikan Firestore Security Rules sudah aktif dengan benar.
// ============================================================================

const firebaseConfig = {
  apiKey: "ISI_DENGAN_API_KEY_ANDA",
  authDomain: "nama-project-anda.firebaseapp.com",
  projectId: "nama-project-anda",
  storageBucket: "nama-project-anda.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890",

  // Opsional: Biarkan kosong ("") jika memakai database Firestore standar "(default)".
  // Isi hanya jika Anda membuat database Firestore dengan nama khusus.
  firestoreDatabaseId: ""
};

export default firebaseConfig;
