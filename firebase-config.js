// ============================================================================
// KONFIGURASI FIREBASE — LMS SMP MUHAMMADIYAH AL FURQAN
// ============================================================================
// Catatan Keamanan Penting:
// 1. Nilai di bawah ini (apiKey, authDomain, projectId, dll.) adalah kunci
//    klien Web Firebase yang memang dirancang bersifat PUBLIK agar aplikasi
//    web statis dapat terhubung ke Firebase dari browser.
// 2. Keamanan data sekolah TIDAK bergantung pada kerahasiaan file ini,
//    melainkan dijaga sepenuhnya oleh Firestore Security Rules (aturan akses
//    berbasis peran admin, guru, wali_kelas) dan verifikasi akun Firebase Auth.
// 3. Jika ingin mengganti ke project Firebase lain, salin konfigurasi Web App
//    dari Firebase Console > Project Settings > Your apps ke bagian di bawah ini.
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyBW08hodRXrWvvjuvz5iDKHDltP1IPRUAw",
  authDomain: "gen-lang-client-0137016399.firebaseapp.com",
  projectId: "gen-lang-client-0137016399",
  storageBucket: "gen-lang-client-0137016399.firebasestorage.app",
  messagingSenderId: "540555040542",
  appId: "1:540555040542:web:43bd47113190dcf3b61b0f",

  // Opsional: Biarkan kosong ("") jika memakai database Firestore standar "(default)".
  // Isi hanya jika Anda membuat database Firestore dengan nama khusus.
  firestoreDatabaseId: "ai-studio-4f526c77-d9e6-40e6-a915-3d5e4fc267d1"
};

export default firebaseConfig;
