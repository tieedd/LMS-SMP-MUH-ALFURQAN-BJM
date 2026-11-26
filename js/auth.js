import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { initFirebase, getFirebaseServices, pesanRamahError } from './firebase.js';
import {
  initNavigasi,
  aturMenuAktif,
  terapkanTampilanPeran,
  setProfilPengguna,
  getPeranLabel,
  onMenuChange,
  initHalamanSiswa,
  muatDataSiswa,
  tampilkanSukses,
  tampilkanError,
  konfirmasiAksi,
  bukaModal,
  tutupModal,
  escapeHtml
} from './ui.js';
import { initHalamanAbsen, muatHalamanAbsen } from './absen.js';
import { initHalamanNilai, muatHalamanNilai } from './nilai.js';
import { initHalamanRekap, muatHalamanRekap } from './rekap.js';

const INITIAL_ADMIN_EMAIL = 'darry.hafidh20@admin.sd.belajar.id';
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

function bukaModalLupaSandi() {
  const emailAwal = document.getElementById('input-login-email')?.value.trim() || '';

  const form = document.createElement('form');
  form.className = 'email-form';
  form.style.marginTop = '0';

  form.innerHTML = `
    <p style="margin:0; color:var(--text-secondary);">
      Masukkan alamat email akun Anda. Kami akan mengirimkan tautan untuk membuat kata sandi baru.
    </p>
    <div class="form-group">
      <label for="modal-reset-email" class="form-label">Alamat Email</label>
      <input
        type="email"
        id="modal-reset-email"
        class="form-input"
        placeholder="contoh: ibu.siti@gmail.com"
        required
        value="${escapeHtml(emailAwal)}"
      />
    </div>
    <div class="modal-footer">
      <button type="button" id="btn-batal-reset" class="btn btn-secondary">Batal</button>
      <button type="submit" id="btn-kirim-reset" class="btn btn-primary">
        Kirim Link Reset Sandi
      </button>
    </div>
  `;

  form.querySelector('#btn-batal-reset').addEventListener('click', tutupModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('#modal-reset-email').value.trim();
    if (!email) {
      tampilkanError('Silakan masukkan alamat email Anda terlebih dahulu.');
      return;
    }

    const submitBtn = form.querySelector('#btn-kirim-reset');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim...';

    try {
      const { auth } = getFirebaseServices();
      await sendPasswordResetEmail(auth, email);
      tutupModal();
      tampilkanSukses(
        `Link untuk mengatur ulang kata sandi sudah dikirim ke ${email}. Periksa kotak masuk atau folder spam Anda.`
      );
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Kirim Link Reset Sandi';
      tampilkanError(pesanRamahError(error));
    }
  });

  bukaModal({
    title: 'Lupa Kata Sandi?',
    bodyElement: form
  });
}

async function muatAtauSiapkanProfil(user) {
  const { db } = getFirebaseServices();
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  const isBootstrappedAdmin =
    String(user.email || '').toLowerCase() === INITIAL_ADMIN_EMAIL.toLowerCase();

  if (snap.exists()) {
    const data = snap.data();
    // Lengkapi field jika dokumen lama belum punya format peran baru
    if (
      isBootstrappedAdmin &&
      (!Array.isArray(data.kelasDiampu) ||
        !Array.isArray(data.mapelDiampu) ||
        typeof data.aktif !== 'boolean')
    ) {
      const upgraded = {
        uid: user.uid,
        nama: data.nama || user.displayName || 'Admin Sekolah',
        email: data.email || user.email || '',
        role: 'admin',
        kelasDiampu: Array.isArray(data.kelasDiampu) ? data.kelasDiampu : [],
        mapelDiampu: Array.isArray(data.mapelDiampu) ? data.mapelDiampu : [],
        waliKelas: typeof data.waliKelas === 'string' ? data.waliKelas : '',
        aktif: true,
        createdAt: data.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(userRef, upgraded);
      return upgraded;
    }
    return { id: snap.id, ...data };
  }

  if (isBootstrappedAdmin) {
    const adminProfile = {
      uid: user.uid,
      nama: (user.displayName || 'Admin SMP Muhammadiyah Al Furqan').trim().slice(0, 100),
      email: (user.email || '').trim().slice(0, 150),
      role: 'admin',
      kelasDiampu: [],
      mapelDiampu: [],
      waliKelas: '',
      aktif: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(userRef, adminProfile);
    return adminProfile;
  }

  return null;
}

function pasangEventLogin() {
  const btnGoogle = document.getElementById('btn-login-google');
  const formEmail = document.getElementById('form-login-email');
  const btnLupaSandi = document.getElementById('btn-lupa-sandi');
  const btnKirimVerifikasi = document.getElementById('btn-kirim-verifikasi');
  const btnCekVerifikasi = document.getElementById('btn-cek-verifikasi');
  const btnKeluarVerifikasi = document.getElementById('btn-keluar-verifikasi');
  const btnKeluarNoProfile = document.getElementById('btn-keluar-noprofile');

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
        submitBtn.textContent = 'Masuk';
      }
    }
  });

  btnLupaSandi?.addEventListener('click', bukaModalLupaSandi);

  btnKirimVerifikasi?.addEventListener('click', async () => {
    const { auth } = getFirebaseServices();
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      tampilkanSukses(
        'Email verifikasi sudah dikirim ulang. Silakan cek kotak masuk atau folder spam.'
      );
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
      tampilkanError(
        'Email Anda masih belum terverifikasi. Mohon klik link verifikasi di email terlebih dahulu.'
      );
    }
  });

  async function keluarLangsung() {
    const { auth } = getFirebaseServices();
    await signOut(auth);
    tampilkanErrorLogin('');
  }

  btnKeluarVerifikasi?.addEventListener('click', keluarLangsung);
  btnKeluarNoProfile?.addEventListener('click', keluarLangsung);

  async function prosesKeluarDenganKonfirmasi() {
    const yakin = await konfirmasiAksi({
      title: 'Keluar dari Aplikasi?',
      message: 'Apakah Anda ingin keluar dari akun sekarang?',
      confirmLabel: 'Ya, Keluar',
      danger: false
    });
    if (!yakin) return;

    const { auth } = getFirebaseServices();
    await signOut(auth);
    tampilkanSukses('Anda sudah keluar dari aplikasi.');
  }

  document
    .getElementById('btn-logout-desktop')
    ?.addEventListener('click', prosesKeluarDenganKonfirmasi);
  document
    .getElementById('btn-logout-mobile')
    ?.addEventListener('click', prosesKeluarDenganKonfirmasi);
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
    const noProfileBox = document.getElementById('no-profile-box');
    const noProfileText = document.getElementById('no-profile-text');

    if (!user) {
      setProfilPengguna(null);
      if (verifyBox) verifyBox.hidden = true;
      if (noProfileBox) noProfileBox.hidden = true;
      tampilkanLayar('login-screen');
      return;
    }

    if (!user.emailVerified) {
      setProfilPengguna(null);
      if (noProfileBox) noProfileBox.hidden = true;
      if (verifyBox) verifyBox.hidden = false;
      tampilkanLayar('login-screen');
      return;
    }

    if (verifyBox) verifyBox.hidden = true;

    let profile = null;
    try {
      profile = await muatAtauSiapkanProfil(user);
    } catch (error) {
      tampilkanLayar('login-screen');
      tampilkanErrorLogin(pesanRamahError(error));
      return;
    }

    if (!profile) {
      setProfilPengguna(null);
      if (noProfileText) {
        noProfileText.textContent = `Akun ${user.email} belum didaftarkan oleh Admin SMP Muhammadiyah Al Furqan. Hubungi Admin sekolah untuk mengaktifkan akun Anda (kode akun: ${user.uid}).`;
      }
      if (noProfileBox) noProfileBox.hidden = false;
      tampilkanLayar('login-screen');
      return;
    }

    if (profile.aktif === false) {
      setProfilPengguna(null);
      if (noProfileText) {
        noProfileText.textContent = `Akun ${user.email} sedang dinonaktifkan oleh Admin sekolah. Silakan hubungi Admin SMP Muhammadiyah Al Furqan.`;
      }
      if (noProfileBox) noProfileBox.hidden = false;
      tampilkanLayar('login-screen');
      return;
    }

    if (noProfileBox) noProfileBox.hidden = true;
    tampilkanErrorLogin('');
    setProfilPengguna(profile);

    const peranLabel = getPeranLabel(profile);
    const nameEl = document.getElementById('sidebar-teacher-name');
    const roleEl = document.getElementById('sidebar-teacher-role');
    const emailEl = document.getElementById('sidebar-teacher-email');
    const mobileRoleEl = document.getElementById('mobile-role-label');

    if (nameEl) nameEl.textContent = profile.nama || user.displayName || 'Guru';
    if (roleEl) roleEl.textContent = peranLabel;
    if (emailEl) emailEl.textContent = profile.email || user.email || '';
    if (mobileRoleEl) mobileRoleEl.textContent = `${peranLabel} · Al Furqan`;

    tampilkanLayar('app-shell');
    inisialisasiSekali();
    terapkanTampilanPeran();

    await muatDataSiswa();
    const menuAwal = profile.role === 'wali_kelas' ? 'rekap' : 'absen';
    aturMenuAktif(menuAwal);
  });
}

mulaiAplikasi();
