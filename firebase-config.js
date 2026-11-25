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
  apiKey: "AIzaSyBW08hodRXrWvvjuvz5iDKHDltP1IPRUAw",
  authDomain: "gen-lang-client-0137016399.firebaseapp.com",
  projectId: "gen-lang-client-0137016399",
  storageBucket: "gen-lang-client-0137016399.firebasestorage.app",
  messagingSenderId: "540555040542",
  appId: "1:540555040542:web:43bd47113190dcf3b61b0f"

  // Opsional: Biarkan kosong ("") jika memakai database Firestore standar "(default)".
  // Isi hanya jika Anda membuat database Firestore dengan nama khusus.
  firestoreDatabaseId: ""
};

export default firebaseConfig;
