import {
  initializeApp,
  deleteApp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDocFromServer
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write'
});

let cachedServices = null;

function isValidConfig(cfg) {
  return (
    cfg &&
    typeof cfg.apiKey === 'string' &&
    cfg.apiKey.trim().length > 0 &&
    !cfg.apiKey.includes('ISI_DENGAN') &&
    typeof cfg.projectId === 'string' &&
    cfg.projectId.trim().length > 0 &&
    !cfg.projectId.includes('nama-project-anda')
  );
}

async function muatKonfigurasiFirebase() {
  // 1. Coba muat firebase-config.js (standar untuk GitHub Pages)
  try {
    const configUrl = new URL('firebase-config.js', document.baseURI).href;
    const mod = await import(/* @vite-ignore */ configUrl);
    const cfg = mod.default || mod.firebaseConfig;
    if (isValidConfig(cfg)) {
      return cfg;
    }
  } catch {
    // Belum ada firebase-config.js, lanjut cek konfigurasi preview
  }

  // 2. Fallback ke firebase-applet-config.json (lingkungan preview)
  try {
    const jsonUrl = new URL('firebase-applet-config.json', document.baseURI).href;
    const response = await fetch(jsonUrl, { cache: 'no-store' });
    if (response.ok) {
      const cfg = await response.json();
      if (isValidConfig(cfg)) {
        return cfg;
      }
    }
  } catch {
    // Tidak tersedia
  }

  return null;
}

async function testConnection(db) {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Koneksi ke Firebase Firestore gagal. Periksa konfigurasi atau jaringan.');
    }
  }
}

export async function initFirebase() {
  if (cachedServices) {
    return cachedServices;
  }

  const config = await muatKonfigurasiFirebase();
  if (!config) {
    return null;
  }

  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = 'id';

  const db = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  testConnection(db);

  cachedServices = { app, auth, db, config };
  return cachedServices;
}

export function getFirebaseServices() {
  if (!cachedServices) {
    throw new Error('Firebase belum selesai disiapkan.');
  }
  return cachedServices;
}

/**
 * Membuat akun Firebase Auth baru lewat instance sementara agar Admin tidak ikut keluar.
 */
export async function buatAkunAuthOlehAdmin(email, password) {
  const { config } = getFirebaseServices();
  const secondaryApp = initializeApp(config, `AdminBuatAkun_${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  secondaryAuth.languageCode = 'id';

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    try {
      await sendEmailVerification(cred.user);
    } catch {
      // Tetap kembalikan UID walau email verifikasi tertunda
    }
    const newUid = cred.user.uid;
    await signOut(secondaryAuth);
    return newUid;
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch {
      // Abaikan jika sudah dihapus
    }
  }
}

export function pesanRamahError(error) {
  const code = error?.code || '';
  const msg = error?.message || String(error || '');

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Jendela masuk Google ditutup sebelum selesai. Silakan tekan tombol Masuk lagi.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Browser menahan jendela masuk Google. Izinkan jendela baru muncul lalu coba lagi.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Email atau kata sandi belum cocok. Silakan periksa kembali dengan teliti.';
  }
  if (code === 'auth/user-disabled') {
    return 'Akun ini sedang dinonaktifkan. Silakan hubungi Admin sekolah.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Email ini sudah dipakai oleh akun lain. Silakan gunakan email yang berbeda.';
  }
  if (code === 'auth/weak-password') {
    return 'Kata sandi terlalu singkat. Gunakan minimal 6 huruf atau angka.';
  }
  if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
    return 'Penulisan alamat email belum tepat. Contoh yang benar: nama@gmail.com.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Cara masuk dengan email belum diaktifkan oleh Admin sekolah. Silakan hubungi Admin atau masuk dengan Google.';
  }
  if (code === 'auth/network-request-failed' || msg.includes('offline')) {
    return 'Koneksi internet sedang terputus. Periksa Wi-Fi atau paket data Anda, lalu coba lagi.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.';
  }
  if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
    return 'Maaf, akun Anda tidak memiliki izin untuk membuka atau mengubah data ini.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Koneksi ke tempat penyimpanan data sedang lambat. Silakan coba sebentar lagi.';
  }
  if (code === 'resource-exhausted' || msg.includes('Quota exceeded')) {
    return 'Batas pemakaian harian aplikasi sudah penuh. Data Anda aman, silakan coba lagi besok.';
  }

  return 'Maaf, data belum berhasil diproses. Silakan coba beberapa saat lagi.';
}

export function handleFirestoreError(error, operationType, path) {
  const auth = cachedServices?.auth;
  const user = auth?.currentUser;

  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: user?.uid ?? null,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      tenantId: user?.tenantId ?? null,
      providerInfo:
        user?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    }
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  const wrapped = new Error(JSON.stringify(errInfo));
  wrapped.friendlyMessage = pesanRamahError(error);
  throw wrapped;
}

export function buatIdAman(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}
