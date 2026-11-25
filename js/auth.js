import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { initFirebase, getFirebaseServices, pesanRamahError } from './firebase.js';
import {
  initNavigasi,
  aturMenuAktif,
  onMenuChange,
  initHalamanSiswa,
  muatDataSiswa,
  tampilkanSukses,
  tampilkanError,
  konfirmasiAksi
} from './ui.js';
import { initHalamanAbsen, muatHalamanAbsen } from './absen.js';
import { initHalamanNilai, muatHalamanNilai } from './nilai.js';
import { initHalamanRekap, muatHalamanRekap } from './rekap.js';

let halamanSudahDiinit = false;

function tampilkanLayar(idLayar) {
  const daftarLayar = ['loading-screen', 'config-warning-screen', 'login-screen', 'app-shell'];
  daftarLayar.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = id !== idLayar;
  });
}

function tampilkanErrorLogin(pesan) {
  const box = document.getElementById('login-error-box');
  if (!box) return;
  if (!pesan) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.textContent = pesan;
  box.hidden = false;
}

async function sinkronkanProfilGuru(user) {
  const { db } = getFirebaseServices();
  const userRef = doc(db, 'users', user.uid);
  const namaDefault = (user.displayName || user.email?.split('@')[0] || 'Guru Al Furqan')
    .trim()
    .slice(0, 100);
  const emailAman = (user.email || '').trim().slice(0, 150);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        nama: namaDefault,
        email: emailAman,
        role: 'guru',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(userRef, {
        nama: snap.data().nama || namaDefault,
        email: emailAman,
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.warn('Profil guru belum tersinkron:', err);
  }
}

function pasangEventLogin() {
  const btnGoogle = document.getElementById('btn-login-google');
  const btnToggleEmail = document.getElementById('btn-toggle-email-form');
  const formEmail = document.getElementById('form-login-email');
  const btnDaftarEmail = document.getElementById('btn-daftar-email');
  const btnKirimVerifikasi = document.getElementById('btn-kirim-verifikasi');
  const btnCekVerifikasi = document.getElementById('btn-cek-verifikasi');

  btnGoogle?.addEventListener('click', async () => {
    tampilkanErrorLogin('');
    btnGoogle.disabled = true;
    const labelSpan = btnGoogle.querySelector('span');
    if (labelSpan) labelSpan.textContent = 'Membuka Login Google...';

    try {
      const { auth } = getFirebaseServices();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error) {
      tampilkanErrorLogin(pesanRamahError(error));
    } finally {
      btnGoogle.disabled = false;
      if (labelSpan) labelSpan.textContent = 'Masuk dengan Akun Google';
    }
  });

  btnToggleEmail?.addEventListener('click', () => {
    if (!formEmail) return;
    const terbuka = !formEmail.hidden;
    formEmail.hidden = terbuka;
    btnToggleEmail.setAttribute('aria-expanded', String(!terbuka));
    btnToggleEmail.textContent = terbuka
      ? 'Tampilkan Form Email & Kata Sandi'
      : 'Sembunyikan Form Email';
  });

  formEmail?.addEventListener('submit', async (e) => {
    e.preventDefault();
    tampilkanErrorLogin('');
    const email = document.getElementById('input-login-email')?.value.trim() || '';
    const password = document.getElementById('input-login-password')?.value || '';
    const submitBtn = document.getElementById('btn-submit-email-login');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sedang Masuk...';
    }

    try {
      const { auth } = getFirebaseServices();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      tampilkanErrorLogin(pesanRamahError(error));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk dengan Email';
      }
    }
  });

  btnDaftarEmail?.addEventListener('click', async () => {
    tampilkanErrorLogin('');
    const email = document.getElementById('input-login-email')?.value.trim() || '';
    const password = document.getElementById('input-login-password')?.value || '';

    if (!email || password.length < 6) {
      tampilkanErrorLogin('Isi alamat email dan kata sandi (minimal 6 karakter) terlebih dahulu.');
      return;
    }

    btnDaftarEmail.disabled = true;
    btnDaftarEmail.textContent = 'Mendaftarkan Akun...';

    try {
      const { auth } = getFirebaseServices();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      tampilkanSukses(
        'Akun berhasil dibuat! Silakan klik link verifikasi yang kami kirim ke email Anda.'
      );
    } catch (error) {
      tampilkanErrorLogin(pesanRamahError(error));
    } finally {
      btnDaftarEmail.disabled = false;
      btnDaftarEmail.textContent = 'Buat Akun Baru';
    }
  });

  btnKirimVerifikasi?.addEventListener('click', async () => {
    const { auth } = getFirebaseServices();
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      tampilkanSukses('Email verifikasi sudah dikirim ulang. Silakan cek kotak masuk atau folder spam.');
    } catch (error) {
      tampilkanError(pesanRamahError(error));
    }
  });

  btnCekVerifikasi?.addEventListener('click', async () => {
    const { auth } = getFirebaseServices();
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      window.location.reload();
    } else {
      tampilkanError('Email Anda masih belum terverifikasi. Mohon klik link di email terlebih dahulu.');
    }
  });

  async function prosesKeluar() {
    const yakin = await konfirmasiAksi({
      title: 'Keluar dari Aplikasi?',
      message: 'Apakah Anda ingin keluar dari akun guru sekarang?',
      confirmLabel: 'Ya, Keluar',
      danger: false
    });
    if (!yakin) return;

    const { auth } = getFirebaseServices();
    await signOut(auth);
    tampilkanSukses('Anda sudah keluar dari aplikasi.');
  }

  document.getElementById('btn-logout-desktop')?.addEventListener('click', prosesKeluar);
  document.getElementById('btn-logout-mobile')?.addEventListener('click', prosesKeluar);
}

function inisialisasiSekali() {
  if (halamanSudahDiinit) return;
  halamanSudahDiinit = true;

  initNavigasi();
  initHalamanSiswa();
  initHalamanAbsen();
  initHalamanNilai();
  initHalamanRekap();

  onMenuChange((menu) => {
    if (menu === 'absen') muatHalamanAbsen();
    else if (menu === 'nilai') muatHalamanNilai();
    else if (menu === 'rekap') muatHalamanRekap();
  });
}

async function mulaiAplikasi() {
  document.getElementById('btn-coba-ulang-config')?.addEventListener('click', () => {
    window.location.reload();
  });

  const services = await initFirebase();
  if (!services) {
    tampilkanLayar('config-warning-screen');
    return;
  }

  pasangEventLogin();

  onAuthStateChanged(services.auth, async (user) => {
    const verifyBox = document.getElementById('verify-email-box');

    if (!user) {
      if (verifyBox) verifyBox.hidden = true;
      tampilkanLayar('login-screen');
      return;
    }

    if (!user.emailVerified) {
      tampilkanLayar('login-screen');
      if (verifyBox) verifyBox.hidden = false;
      return;
    }

    if (verifyBox) verifyBox.hidden = true;
    tampilkanErrorLogin('');

    const nameEl = document.getElementById('sidebar-teacher-name');
    const emailEl = document.getElementById('sidebar-teacher-email');
    if (nameEl) nameEl.textContent = user.displayName || 'Guru SMP Muhammadiyah Al Furqan';
    if (emailEl) emailEl.textContent = user.email || '';

    tampilkanLayar('app-shell');
    inisialisasiSekali();

    await sinkronkanProfilGuru(user);
    await muatDataSiswa();
    aturMenuAktif('absen');
  });
}

mulaiAplikasi();
