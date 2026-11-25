import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirebaseServices,
  OperationType,
  handleFirestoreError,
  buatAkunAuthOlehAdmin,
  pesanRamahError
} from './firebase.js';
import { downloadTemplateSiswaExcel, parseSiswaExcelFile } from './excel.js';

// ==========================================================================
// State Bersama Data Siswa, Profil Pengguna & Menu Aktif
// ==========================================================================

let daftarSiswa = [];
let daftarAkun = [];
let profilPengguna = null;
let menuAktif = 'absen';
let adminTabAktif = 'siswa';
const menuChangeCallbacks = [];

const JUDUL_HALAMAN_HP = {
  absen: 'Absen Siswa',
  nilai: 'Input Nilai',
  rekap: 'Rekap & Excel',
  siswa: 'Data Siswa'
};

export const DAFTAR_MAPEL_STANDAR = [
  'PAI & Budi Pekerti',
  'Kemuhammadiyahan',
  'Bahasa Indonesia',
  'Matematika',
  'Bahasa Inggris',
  'IPA',
  'IPS',
  'PPKn',
  'Informatika',
  'PJOK',
  'Seni Budaya',
  'Bahasa Arab'
];

const CONTOH_SISWA = [
  { nis: '2026001', nama: 'Ahmad Fauzi', kelas: '7A', jenisKelamin: 'L' },
  { nis: '2026002', nama: 'Aisyah Putri Ramadhani', kelas: '7A', jenisKelamin: 'P' },
  { nis: '2026003', nama: 'Bagus Pratama', kelas: '7A', jenisKelamin: 'L' },
  { nis: '2026004', nama: 'Fatimah Azzahra', kelas: '7A', jenisKelamin: 'P' },
  { nis: '2026005', nama: 'Muhammad Rizky', kelas: '7A', jenisKelamin: 'L' },
  { nis: '2026006', nama: 'Nadia Khairunnisa', kelas: '7B', jenisKelamin: 'P' },
  { nis: '2026007', nama: 'Rafi Akbar', kelas: '7B', jenisKelamin: 'L' },
  { nis: '2026008', nama: 'Siti Aminah', kelas: '7B', jenisKelamin: 'P' },
  { nis: '2026009', nama: 'Umar Al Faruq', kelas: '7B', jenisKelamin: 'L' },
  { nis: '2026010', nama: 'Zahra Maulida', kelas: '7B', jenisKelamin: 'P' }
];

// ==========================================================================
// Pengelolaan Peran Pengguna (admin, guru, wali_kelas)
// ==========================================================================

export function setProfilPengguna(profile) {
  profilPengguna = profile;
}

export function getProfilPengguna() {
  return profilPengguna;
}

export function getPeranPengguna() {
  return profilPengguna?.role || 'guru';
}

export function isAdmin() {
  return getPeranPengguna() === 'admin';
}

export function isGuru() {
  return getPeranPengguna() === 'guru';
}

export function isWaliKelas() {
  return getPeranPengguna() === 'wali_kelas';
}

export function getPeranLabel(profile = profilPengguna) {
  if (!profile) return 'Guru';
  if (profile.role === 'admin') return 'Admin Sekolah';
  if (profile.role === 'wali_kelas') {
    return profile.waliKelas ? `Wali Kelas ${profile.waliKelas}` : 'Wali Kelas';
  }
  return 'Guru Mata Pelajaran';
}

export function getKelasYangDiizinkan() {
  if (!profilPengguna) return [];
  if (profilPengguna.role === 'admin') return null; // null = semua kelas
  if (profilPengguna.role === 'wali_kelas') {
    return profilPengguna.waliKelas ? [profilPengguna.waliKelas] : [];
  }
  return Array.isArray(profilPengguna.kelasDiampu) ? profilPengguna.kelasDiampu : [];
}

export function getMapelYangDiizinkan() {
  if (!profilPengguna) return [];
  if (profilPengguna.role === 'admin' || profilPengguna.role === 'wali_kelas') {
    return null; // null = semua mapel
  }
  return Array.isArray(profilPengguna.mapelDiampu) ? profilPengguna.mapelDiampu : [];
}

// ==========================================================================
// Helper Keamanan & Format Tanggal
// ==========================================================================

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function tanggalHariIni() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function bulanIni() {
  return tanggalHariIni().slice(0, 7);
}

const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

export function formatTanggalIndonesia(yyyyMmDd) {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return yyyyMmDd || '-';
  const [y, m, d] = yyyyMmDd.split('-');
  const idx = Number(m) - 1;
  return `${Number(d)} ${NAMA_BULAN[idx] || m} ${y}`;
}

export function formatBulanIndonesia(yyyyMm) {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return 'Semua Tanggal';
  const [y, m] = yyyyMm.split('-');
  const idx = Number(m) - 1;
  return `${NAMA_BULAN[idx] || m} ${y}`;
}

// ==========================================================================
// Notifikasi Ramah (Toast) & Dialog Konfirmasi
// ==========================================================================

function buatToast(pesan, tipe) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${tipe}`;

  const textSpan = document.createElement('span');
  textSpan.textContent = pesan;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Tutup pemberitahuan');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => toast.remove());

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  window.setTimeout(() => {
    if (toast.isConnected) toast.remove();
  }, 4500);
}

export function tampilkanSukses(pesan) {
  buatToast(pesan, 'success');
}

export function tampilkanError(pesan) {
  buatToast(pesan, 'error');
}

export function tampilkanInfo(pesan) {
  buatToast(pesan, 'info');
}

export function bukaModal({ title, bodyElement }) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  if (!overlay || !titleEl || !bodyEl) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = '';
  bodyEl.appendChild(bodyElement);
  overlay.hidden = false;
}

export function tutupModal() {
  const overlay = document.getElementById('modal-overlay');
  const bodyEl = document.getElementById('modal-body');
  if (overlay) overlay.hidden = true;
  if (bodyEl) bodyEl.innerHTML = '';
}

export function konfirmasiAksi({ title, message, confirmLabel = 'Ya, Lanjutkan', danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.style.margin = '0 0 12px';
    p.textContent = message;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const btnBatal = document.createElement('button');
    btnBatal.type = 'button';
    btnBatal.className = 'btn btn-secondary';
    btnBatal.textContent = 'Batal';
    btnBatal.addEventListener('click', () => {
      tutupModal();
      resolve(false);
    });

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    btnOk.textContent = confirmLabel;
    btnOk.addEventListener('click', () => {
      tutupModal();
      resolve(true);
    });

    footer.appendChild(btnBatal);
    footer.appendChild(btnOk);
    wrap.appendChild(p);
    wrap.appendChild(footer);

    bukaModal({ title, bodyElement: wrap });
  });
}

// ==========================================================================
// Navigasi 4 Menu & Pengaturan Tampilan Sesuai Peran
// ==========================================================================

export function onMenuChange(cb) {
  menuChangeCallbacks.push(cb);
}

export function terapkanTampilanPeran() {
  const role = getPeranPengguna();
  const isWali = role === 'wali_kelas';
  const adminMode = role === 'admin';

  // Wali kelas hanya melihat menu Rekap & Data Siswa
  document.querySelectorAll('[data-menu]').forEach((btn) => {
    const target = btn.dataset.menu;
    if (isWali && (target === 'absen' || target === 'nilai')) {
      btn.hidden = true;
    } else {
      btn.hidden = false;
    }
  });

  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) {
    bottomNav.classList.toggle('is-two-cols', isWali);
  }

  // Kontrol Admin di halaman Data Siswa
  const adminTabs = document.getElementById('admin-data-tabs');
  const adminExcelControls = document.getElementById('admin-excel-controls');
  const btnTambahSiswa = document.getElementById('btn-tambah-siswa');
  const btnTambahAkun = document.getElementById('btn-tambah-akun');
  const descEl = document.getElementById('siswa-page-desc');

  if (adminTabs) adminTabs.hidden = !adminMode;
  if (adminExcelControls) adminExcelControls.hidden = !adminMode;

  if (!adminMode) {
    adminTabAktif = 'siswa';
    if (btnTambahSiswa) btnTambahSiswa.hidden = true;
    if (btnTambahAkun) btnTambahAkun.hidden = true;
    const panelSiswa = document.getElementById('panel-data-siswa');
    const panelAkun = document.getElementById('panel-data-akun');
    if (panelSiswa) panelSiswa.hidden = false;
    if (panelAkun) panelAkun.hidden = true;
    if (descEl) {
      descEl.textContent = isWali
        ? `Daftar siswa di kelas perwalian Anda (${profilPengguna?.waliKelas || '-'}).`
        : 'Daftar siswa di kelas yang Anda ajar.';
    }
  } else {
    if (descEl) {
      descEl.textContent =
        'Kelola data siswa, impor daftar siswa dari Excel, serta atur akun guru dan wali kelas.';
    }
    aturTabAdmin(adminTabAktif);
  }
}

export function aturMenuAktif(menu) {
  if (isWaliKelas() && (menu === 'absen' || menu === 'nilai')) {
    menu = 'rekap';
  }
  menuAktif = menu;

  document.querySelectorAll('[data-menu]').forEach((btn) => {
    const aktif = btn.dataset.menu === menu;
    btn.classList.toggle('is-active', aktif);
    if (aktif) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  const sections = {
    absen: document.getElementById('halaman-absen'),
    nilai: document.getElementById('halaman-nilai'),
    rekap: document.getElementById('halaman-rekap'),
    siswa: document.getElementById('halaman-siswa')
  };

  Object.entries(sections).forEach(([key, el]) => {
    if (el) el.hidden = key !== menu;
  });

  const mobileTitle = document.getElementById('mobile-page-title');
  if (mobileTitle) {
    mobileTitle.textContent = JUDUL_HALAMAN_HP[menu] || 'SMP Muhammadiyah Al Furqan';
  }

  menuChangeCallbacks.forEach((cb) => cb(menu));
}

export function getMenuAktif() {
  return menuAktif;
}

export function initNavigasi() {
  document.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.menu;
      if (target) aturMenuAktif(target);
    });
  });

  const btnCloseModal = document.getElementById('btn-modal-close');
  const overlay = document.getElementById('modal-overlay');
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', tutupModal);
  }
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) tutupModal();
    });
  }
}

// ==========================================================================
// Pengelolaan Data Siswa (Sesuai Peran)
// ==========================================================================

export function getDaftarSiswa() {
  return daftarSiswa;
}

export function getDaftarKelas() {
  const diizinkan = getKelasYangDiizinkan();
  const setKelas = new Set(daftarSiswa.map((s) => s.kelas).filter(Boolean));
  if (Array.isArray(diizinkan)) {
    diizinkan.forEach((k) => {
      if (k) setKelas.add(k);
    });
  }
  return Array.from(setKelas).sort((a, b) => a.localeCompare(b, 'id'));
}

export function sinkronkanDropdownKelas() {
  const kelasList = getDaftarKelas();
  const wali = isWaliKelas();
  const selectIds = [
    { id: 'absen-kelas', defaultLabel: 'Semua Kelas Yang Diajar' },
    { id: 'nilai-kelas', defaultLabel: 'Pilih Kelas' },
    { id: 'rekap-absen-kelas', defaultLabel: wali ? 'Kelas Perwalian' : 'Semua Kelas' },
    { id: 'rekap-nilai-kelas', defaultLabel: wali ? 'Kelas Perwalian' : 'Semua Kelas' },
    { id: 'siswa-filter-kelas', defaultLabel: wali ? 'Kelas Perwalian' : 'Semua Kelas' }
  ];

  selectIds.forEach(({ id, defaultLabel }) => {
    const select = document.getElementById(id);
    if (!select) return;
    const prevValue = select.value;

    select.innerHTML = '';

    if (wali && profilPengguna?.waliKelas) {
      const opt = document.createElement('option');
      opt.value = profilPengguna.waliKelas;
      opt.textContent = `Kelas ${profilPengguna.waliKelas}`;
      select.appendChild(opt);
      select.value = profilPengguna.waliKelas;
      select.disabled = true;
      return;
    }

    select.disabled = false;
    const optDefault = document.createElement('option');
    optDefault.value = '';
    optDefault.textContent = defaultLabel;
    select.appendChild(optDefault);

    kelasList.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = `Kelas ${k}`;
      select.appendChild(opt);
    });

    if (prevValue && kelasList.includes(prevValue)) {
      select.value = prevValue;
    } else if (id === 'nilai-kelas' && kelasList.length > 0 && !prevValue) {
      select.value = kelasList[0];
    }
  });
}

export async function muatDataSiswa() {
  const { db } = getFirebaseServices();
  const role = getPeranPengguna();
  const kelasDiizinkan = getKelasYangDiizinkan();

  // Jika Guru/Wali Kelas belum diberi penugasan kelas, jangan jalankan query "in []"
  if (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) {
    daftarSiswa = [];
    sinkronkanDropdownKelas();
    renderHalamanSiswa();
    return daftarSiswa;
  }

  try {
    let q;
    if (role === 'admin') {
      q = collection(db, 'siswa');
    } else if (role === 'wali_kelas') {
      q = query(collection(db, 'siswa'), where('kelas', '==', kelasDiizinkan[0]));
    } else {
      q = query(collection(db, 'siswa'), where('kelas', 'in', kelasDiizinkan.slice(0, 30)));
    }

    const snap = await getDocs(q);
    const items = [];
    snap.forEach((d) => {
      items.push({ id: d.id, ...d.data() });
    });

    items.sort((a, b) => {
      const cmpKelas = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
      if (cmpKelas !== 0) return cmpKelas;
      return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
    });

    daftarSiswa = items;
    sinkronkanDropdownKelas();
    renderHalamanSiswa();
    return daftarSiswa;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'siswa');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage || 'Gagal memuat daftar siswa.');
    }
    return daftarSiswa;
  }
}

export async function isiDataContohSiswa() {
  if (!isAdmin()) {
    tampilkanError('Hanya Admin sekolah yang dapat menambahkan data siswa.');
    return;
  }

  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;
  if (!user) return;

  try {
    const batch = writeBatch(db);
    CONTOH_SISWA.forEach((s) => {
      const ref = doc(collection(db, 'siswa'));
      batch.set(ref, {
        ownerId: user.uid,
        nis: s.nis,
        nama: s.nama,
        kelas: s.kelas,
        jenisKelamin: s.jenisKelamin,
        aktif: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
    tampilkanSukses('10 contoh data siswa SMP Muhammadiyah Al Furqan berhasil ditambahkan.');
    await muatDataSiswa();
    menuChangeCallbacks.forEach((cb) => cb(menuAktif));
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, 'siswa');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }
}

function bukaFormSiswa(siswaEdit = null) {
  if (!isAdmin()) return;

  const isEdit = Boolean(siswaEdit);
  const form = document.createElement('form');
  form.className = 'email-form';
  form.style.marginTop = '0';

  form.innerHTML = `
    <div class="form-group">
      <label for="modal-siswa-nama" class="form-label">Nama Lengkap Siswa</label>
      <input
        type="text"
        id="modal-siswa-nama"
        class="form-input"
        placeholder="Contoh: Ahmad Fauzi"
        maxlength="100"
        required
        value="${escapeHtml(siswaEdit?.nama || '')}"
      />
    </div>
    <div class="form-group">
      <label for="modal-siswa-nis" class="form-label">NIS (Nomor Induk Siswa)</label>
      <input
        type="text"
        id="modal-siswa-nis"
        class="form-input"
        placeholder="Contoh: 2026001"
        maxlength="30"
        required
        value="${escapeHtml(siswaEdit?.nis || '')}"
      />
    </div>
    <div class="form-group">
      <label for="modal-siswa-kelas" class="form-label">Kelas</label>
      <input
        type="text"
        id="modal-siswa-kelas"
        class="form-input"
        placeholder="Contoh: 7A, 8B, atau 9C"
        maxlength="20"
        required
        value="${escapeHtml(siswaEdit?.kelas || '')}"
      />
    </div>
    <div class="form-group">
      <label for="modal-siswa-jk" class="form-label">Jenis Kelamin</label>
      <select id="modal-siswa-jk" class="form-input">
        <option value="L" ${siswaEdit?.jenisKelamin !== 'P' ? 'selected' : ''}>Laki-laki (L)</option>
        <option value="P" ${siswaEdit?.jenisKelamin === 'P' ? 'selected' : ''}>Perempuan (P)</option>
      </select>
    </div>
    <div class="modal-footer">
      <button type="button" id="btn-batal-form-siswa" class="btn btn-secondary">Batal</button>
      <button type="submit" id="btn-simpan-form-siswa" class="btn btn-primary">
        ${isEdit ? 'Simpan Perubahan' : 'Simpan Siswa'}
      </button>
    </div>
  `;

  form.querySelector('#btn-batal-form-siswa').addEventListener('click', tutupModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = form.querySelector('#modal-siswa-nama').value.trim();
    const nis = form.querySelector('#modal-siswa-nis').value.trim();
    const kelas = form.querySelector('#modal-siswa-kelas').value.trim().toUpperCase();
    const jenisKelamin = form.querySelector('#modal-siswa-jk').value;

    if (!nama) {
      tampilkanError('Nama siswa belum diisi.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(nis)) {
      tampilkanError('NIS hanya boleh berisi huruf, angka, titik, atau tanda hubung (tanpa spasi).');
      return;
    }
    if (!kelas) {
      tampilkanError('Kelas siswa belum diisi.');
      return;
    }

    const submitBtn = form.querySelector('#btn-simpan-form-siswa');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    const { auth, db } = getFirebaseServices();
    const user = auth.currentUser;

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'siswa', siswaEdit.id), {
          nis,
          nama,
          kelas,
          jenisKelamin,
          aktif: true,
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(`Data siswa ${nama} berhasil diperbarui.`);
      } else {
        await addDoc(collection(db, 'siswa'), {
          ownerId: user.uid,
          nis,
          nama,
          kelas,
          jenisKelamin,
          aktif: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(`Siswa baru ${nama} berhasil ditambahkan.`);
      }
      tutupModal();
      await muatDataSiswa();
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan Siswa';
      try {
        handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, 'siswa');
      } catch (wrapped) {
        tampilkanError(wrapped.friendlyMessage);
      }
    }
  });

  bukaModal({
    title: isEdit ? 'Ubah Data Siswa' : 'Tambah Siswa Baru',
    bodyElement: form
  });
}

async function hapusSiswa(siswa) {
  if (!isAdmin()) return;

  const yakin = await konfirmasiAksi({
    title: 'Hapus Data Siswa?',
    message: `Apakah Anda yakin ingin menghapus data siswa "${siswa.nama}" (Kelas ${siswa.kelas})?`,
    confirmLabel: 'Ya, Hapus',
    danger: true
  });
  if (!yakin) return;

  const { db } = getFirebaseServices();
  try {
    await deleteDoc(doc(db, 'siswa', siswa.id));
    tampilkanSukses(`Data siswa ${siswa.nama} berhasil dihapus.`);
    await muatDataSiswa();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, `siswa/${siswa.id}`);
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }
}

export function renderHalamanSiswa() {
  const container = document.getElementById('siswa-container');
  if (!container) return;

  const adminMode = isAdmin();
  const kelasDiizinkan = getKelasYangDiizinkan();

  if (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Penugasan Kelas Belum Diatur</h2>
        <p class="empty-desc">
          ${
            isWaliKelas()
              ? 'Kelas perwalian Anda belum diatur. Silakan hubungi Admin SMP Muhammadiyah Al Furqan.'
              : 'Anda belum ditugaskan ke kelas mana pun. Silakan hubungi Admin SMP Muhammadiyah Al Furqan.'
          }
        </p>
      </div>
    `;
    return;
  }

  const kataCari = (document.getElementById('siswa-cari')?.value || '').trim().toLowerCase();
  const filterKelas = document.getElementById('siswa-filter-kelas')?.value || '';

  const filtered = daftarSiswa.filter((s) => {
    const cocokKelas = !filterKelas || s.kelas === filterKelas;
    const cocokCari =
      !kataCari ||
      String(s.nama || '').toLowerCase().includes(kataCari) ||
      String(s.nis || '').toLowerCase().includes(kataCari);
    return cocokKelas && cocokCari;
  });

  if (daftarSiswa.length === 0) {
    if (adminMode) {
      container.innerHTML = `
        <div class="empty-state">
          <h2 class="empty-title">Belum Ada Data Siswa</h2>
          <p class="empty-desc">
            Tambahkan siswa terlebih dahulu agar guru dapat mencatat absen dan mengisi nilai. Anda
            juga bisa mencoba dengan 10 data contoh.
          </p>
          <div class="empty-actions">
            <button type="button" id="btn-empty-tambah-siswa" class="btn btn-primary">
              + Tambah Siswa Pertama
            </button>
            <button type="button" id="btn-empty-contoh-siswa" class="btn btn-secondary">
              Isi 10 Siswa Contoh
            </button>
          </div>
        </div>
      `;
      container
        .querySelector('#btn-empty-tambah-siswa')
        ?.addEventListener('click', () => bukaFormSiswa(null));
      container
        .querySelector('#btn-empty-contoh-siswa')
        ?.addEventListener('click', isiDataContohSiswa);
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <h2 class="empty-title">Belum Ada Siswa di Kelas Anda</h2>
          <p class="empty-desc">
            Admin sekolah belum memasukkan data siswa untuk kelas ini. Silakan hubungi Admin jika
            daftar siswa belum tampil.
          </p>
        </div>
      `;
    }
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Siswa Tidak Ditemukan</h2>
        <p class="empty-desc">Tidak ada siswa yang cocok dengan pencarian atau kelas yang dipilih.</p>
      </div>
    `;
    return;
  }

  const cardsHtml = filtered
    .map(
      (s) => `
      <article class="student-card" data-siswa-id="${escapeHtml(s.id)}">
        <div class="student-card-top">
          <div>
            <h3 class="student-name">${escapeHtml(s.nama)}</h3>
            <p class="student-meta num">
              NIS ${escapeHtml(s.nis)} · Kelas ${escapeHtml(s.kelas)} · ${
        s.jenisKelamin === 'P' ? 'Perempuan' : 'Laki-laki'
      }
            </p>
          </div>
        </div>
        ${
          adminMode
            ? `<div class="button-pair">
                <button type="button" class="btn btn-secondary btn-sm btn-edit-siswa" data-id="${escapeHtml(
                  s.id
                )}">Ubah</button>
                <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-siswa" data-id="${escapeHtml(
                  s.id
                )}">Hapus</button>
              </div>`
            : ''
        }
      </article>
    `
    )
    .join('');

  const rowsHtml = filtered
    .map(
      (s, idx) => `
      <tr>
        <td class="td-center">${idx + 1}</td>
        <td class="num">${escapeHtml(s.nis)}</td>
        <td><strong>${escapeHtml(s.nama)}</strong></td>
        <td>Kelas ${escapeHtml(s.kelas)}</td>
        <td>${s.jenisKelamin === 'P' ? 'Perempuan' : 'Laki-laki'}</td>
        ${
          adminMode
            ? `<td>
                <div class="table-actions">
                  <button type="button" class="btn btn-secondary btn-sm btn-edit-siswa" data-id="${escapeHtml(
                    s.id
                  )}">Ubah</button>
                  <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-siswa" data-id="${escapeHtml(
                    s.id
                  )}">Hapus</button>
                </div>
              </td>`
            : ''
        }
      </tr>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="card-list">${cardsHtml}</div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="td-center">No</th>
            <th>NIS</th>
            <th>Nama Lengkap</th>
            <th>Kelas</th>
            <th>Jenis Kelamin</th>
            ${adminMode ? '<th class="td-num">Tindakan</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  if (adminMode) {
    container.querySelectorAll('.btn-edit-siswa').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = daftarSiswa.find((item) => item.id === btn.dataset.id);
        if (target) bukaFormSiswa(target);
      });
    });

    container.querySelectorAll('.btn-hapus-siswa').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = daftarSiswa.find((item) => item.id === btn.dataset.id);
        if (target) hapusSiswa(target);
      });
    });
  }
}

// ==========================================================================
// Pengelolaan Akun Guru & Wali Kelas (Khusus Admin)
// ==========================================================================

function formatRingkasanTugas(akun) {
  if (akun.role === 'admin') return 'Semua kelas & semua data';
  if (akun.role === 'wali_kelas') {
    return akun.waliKelas ? `Wali Kelas ${akun.waliKelas}` : 'Kelas perwalian belum diisi';
  }
  const kelas = Array.isArray(akun.kelasDiampu) && akun.kelasDiampu.length
    ? akun.kelasDiampu.join(', ')
    : 'Belum ada kelas';
  const mapel = Array.isArray(akun.mapelDiampu) && akun.mapelDiampu.length
    ? akun.mapelDiampu.join(', ')
    : 'Belum ada mapel';
  return `Kelas: ${kelas} · Mapel: ${mapel}`;
}

function pisahDaftarKoma(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function bukaFormAkun(akunEdit = null) {
  if (!isAdmin()) return;
  const isEdit = Boolean(akunEdit);

  const semuaKelas = getDaftarKelas();
  const pilihanKelas = Array.from(
    new Set([...semuaKelas, ...(akunEdit?.kelasDiampu || []), '7A', '7B', '8A', '8B', '9A', '9B'])
  ).sort((a, b) => a.localeCompare(b, 'id'));

  const kelasTerpilih = new Set(akunEdit?.kelasDiampu || []);
  const mapelTerpilih = new Set(akunEdit?.mapelDiampu || []);
  const mapelTambahan = (akunEdit?.mapelDiampu || []).filter(
    (m) => !DAFTAR_MAPEL_STANDAR.includes(m)
  );

  const form = document.createElement('form');
  form.className = 'email-form';
  form.style.marginTop = '0';

  const checkboxKelasHtml = pilihanKelas
    .map(
      (k) => `
      <label class="checkbox-option">
        <input type="checkbox" name="akun-kelas-cb" value="${escapeHtml(k)}" ${
        kelasTerpilih.has(k) ? 'checked' : ''
      } />
        <span>Kelas ${escapeHtml(k)}</span>
      </label>
    `
    )
    .join('');

  const checkboxMapelHtml = DAFTAR_MAPEL_STANDAR.map(
    (m) => `
      <label class="checkbox-option">
        <input type="checkbox" name="akun-mapel-cb" value="${escapeHtml(m)}" ${
      mapelTerpilih.has(m) ? 'checked' : ''
    } />
        <span>${escapeHtml(m)}</span>
      </label>
    `
  ).join('');

  form.innerHTML = `
    <div class="form-group">
      <label for="modal-akun-nama" class="form-label">Nama Lengkap Guru / Staf</label>
      <input
        type="text"
        id="modal-akun-nama"
        class="form-input"
        placeholder="Contoh: Ibu Siti Rahmawati, S.Pd"
        maxlength="100"
        required
        value="${escapeHtml(akunEdit?.nama || '')}"
      />
    </div>
    <div class="form-group">
      <label for="modal-akun-email" class="form-label">Alamat Email</label>
      <input
        type="email"
        id="modal-akun-email"
        class="form-input"
        placeholder="contoh: siti@gmail.com"
        maxlength="150"
        required
        ${isEdit ? 'readonly' : ''}
        value="${escapeHtml(akunEdit?.email || '')}"
      />
    </div>
    ${
      isEdit
        ? ''
        : `<div class="form-group">
            <label for="modal-akun-password" class="form-label">Kata Sandi Sementara (min. 6 huruf/angka)</label>
            <input
              type="text"
              id="modal-akun-password"
              class="form-input"
              placeholder="Contoh: AlFurqan2026"
              minlength="6"
              required
            />
          </div>`
    }
    <div class="form-group">
      <label for="modal-akun-role" class="form-label">Peran Akun</label>
      <select id="modal-akun-role" class="form-input">
        <option value="guru" ${(!akunEdit || akunEdit.role === 'guru') ? 'selected' : ''}>
          Guru (Input Nilai Mapel &amp; Absen Kelas)
        </option>
        <option value="wali_kelas" ${akunEdit?.role === 'wali_kelas' ? 'selected' : ''}>
          Wali Kelas (Lihat Rekap Kelasnya)
        </option>
        <option value="admin" ${akunEdit?.role === 'admin' ? 'selected' : ''}>
          Admin (Kelola Semua Data &amp; Akun)
        </option>
      </select>
    </div>

    <div id="wrap-akun-guru" class="email-form" style="margin-top:0">
      <div class="form-group">
        <span class="form-label">Kelas yang Diajar</span>
        <div class="checkbox-grid">${checkboxKelasHtml}</div>
        <input
          type="text"
          id="modal-akun-kelas-extra"
          class="form-input"
          placeholder="Kelas lain jika belum ada di atas (pisah koma, misal: 7C, 8C)"
          style="margin-top:8px"
        />
      </div>
      <div class="form-group">
        <span class="form-label">Mata Pelajaran yang Diampu</span>
        <div class="checkbox-grid">${checkboxMapelHtml}</div>
        <input
          type="text"
          id="modal-akun-mapel-extra"
          class="form-input"
          placeholder="Mapel lain jika perlu (pisah koma)"
          style="margin-top:8px"
          value="${escapeHtml(mapelTambahan.join(', '))}"
        />
      </div>
    </div>

    <div id="wrap-akun-wali" class="form-group" hidden>
      <label for="modal-akun-walikelas" class="form-label">Kelas Perwalian</label>
      <input
        type="text"
        id="modal-akun-walikelas"
        class="form-input"
        placeholder="Contoh: 7A"
        maxlength="20"
        value="${escapeHtml(akunEdit?.waliKelas || '')}"
      />
    </div>

    ${
      isEdit
        ? `<div class="form-group">
            <label for="modal-akun-aktif" class="form-label">Status Akun</label>
            <select id="modal-akun-aktif" class="form-input">
              <option value="true" ${akunEdit.aktif !== false ? 'selected' : ''}>Aktif (Bisa Masuk)</option>
              <option value="false" ${akunEdit.aktif === false ? 'selected' : ''}>Nonaktif (Diblokir)</option>
            </select>
          </div>`
        : ''
    }

    <div class="modal-footer">
      <button type="button" id="btn-batal-akun" class="btn btn-secondary">Batal</button>
      <button type="submit" id="btn-simpan-akun" class="btn btn-primary">
        ${isEdit ? 'Simpan Perubahan' : 'Buat Akun Guru'}
      </button>
    </div>
  `;

  const roleSelect = form.querySelector('#modal-akun-role');
  const wrapGuru = form.querySelector('#wrap-akun-guru');
  const wrapWali = form.querySelector('#wrap-akun-wali');

  function perbaruiBagianPeran() {
    const r = roleSelect.value;
    wrapGuru.hidden = r !== 'guru';
    wrapWali.hidden = r !== 'wali_kelas';
  }
  perbaruiBagianPeran();
  roleSelect.addEventListener('change', perbaruiBagianPeran);
  form.querySelector('#btn-batal-akun').addEventListener('click', tutupModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = form.querySelector('#modal-akun-nama').value.trim();
    const email = form.querySelector('#modal-akun-email').value.trim();
    const password = form.querySelector('#modal-akun-password')?.value || '';
    const role = roleSelect.value;

    const checkedKelas = Array.from(form.querySelectorAll('input[name="akun-kelas-cb"]:checked')).map(
      (cb) => cb.value
    );
    const extraKelas = pisahDaftarKoma(form.querySelector('#modal-akun-kelas-extra')?.value).map((k) =>
      k.toUpperCase()
    );
    const kelasDiampu =
      role === 'guru' ? Array.from(new Set([...checkedKelas, ...extraKelas])).slice(0, 20) : [];

    const checkedMapel = Array.from(form.querySelectorAll('input[name="akun-mapel-cb"]:checked')).map(
      (cb) => cb.value
    );
    const extraMapel = pisahDaftarKoma(form.querySelector('#modal-akun-mapel-extra')?.value);
    const mapelDiampu =
      role === 'guru' ? Array.from(new Set([...checkedMapel, ...extraMapel])).slice(0, 20) : [];

    const waliKelas =
      role === 'wali_kelas'
        ? (form.querySelector('#modal-akun-walikelas')?.value || '').trim().toUpperCase()
        : '';

    const aktif = isEdit ? form.querySelector('#modal-akun-aktif').value === 'true' : true;

    if (!nama || !email) {
      tampilkanError('Nama dan alamat email wajib diisi.');
      return;
    }
    if (role === 'guru' && (kelasDiampu.length === 0 || mapelDiampu.length === 0)) {
      tampilkanError('Untuk peran Guru, pilih minimal 1 kelas yang diajar dan 1 mata pelajaran.');
      return;
    }
    if (role === 'wali_kelas' && !waliKelas) {
      tampilkanError('Untuk peran Wali Kelas, isi nama kelas perwalian (misal: 7A).');
      return;
    }

    const submitBtn = form.querySelector('#btn-simpan-akun');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    const { db } = getFirebaseServices();

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'users', akunEdit.id), {
          nama,
          role,
          kelasDiampu,
          mapelDiampu,
          waliKelas,
          aktif,
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(`Data akun ${nama} berhasil diperbarui.`);
      } else {
        const newUid = await buatAkunAuthOlehAdmin(email, password);
        await setDoc(doc(db, 'users', newUid), {
          uid: newUid,
          nama,
          email,
          role,
          kelasDiampu,
          mapelDiampu,
          waliKelas,
          aktif: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(
          `Akun ${nama} (${email}) berhasil dibuat! Minta guru membuka email untuk verifikasi sebelum masuk.`
        );
      }
      tutupModal();
      await muatDaftarAkun();
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Buat Akun Guru';
      if (error?.code?.startsWith('auth/')) {
        tampilkanError(pesanRamahError(error));
      } else {
        try {
          handleFirestoreError(error, OperationType.WRITE, 'users');
        } catch (wrapped) {
          tampilkanError(wrapped.friendlyMessage);
        }
      }
    }
  });

  bukaModal({
    title: isEdit ? 'Ubah Peran & Penugasan Akun' : 'Tambah Akun Guru / Wali Kelas',
    bodyElement: form
  });
}

export async function muatDaftarAkun() {
  if (!isAdmin()) return;
  const { db } = getFirebaseServices();
  try {
    const snap = await getDocs(collection(db, 'users'));
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    daftarAkun = list;
    renderDaftarAkun();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'users');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }
}

function renderDaftarAkun() {
  const container = document.getElementById('akun-container');
  if (!container) return;

  if (daftarAkun.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Belum Ada Akun Guru Terdaftar</h2>
        <p class="empty-desc">
          Klik tombol "+ Tambah Akun Guru" di atas untuk membuatkan akun untuk guru atau wali kelas.
        </p>
      </div>
    `;
    return;
  }

  const cardsHtml = daftarAkun
    .map(
      (a) => `
      <article class="student-card">
        <div>
          <h3 class="student-name">${escapeHtml(a.nama)}</h3>
          <p class="student-meta">
            ${escapeHtml(a.email)} · ${escapeHtml(getPeranLabel(a))} · ${
        a.aktif === false ? 'Nonaktif' : 'Aktif'
      }
          </p>
          <p class="student-meta">${escapeHtml(formatRingkasanTugas(a))}</p>
        </div>
        <div class="button-pair">
          <button type="button" class="btn btn-secondary btn-sm btn-edit-akun" data-id="${escapeHtml(
            a.id
          )}">
            Ubah Peran
          </button>
          <button type="button" class="btn btn-ghost btn-sm btn-reset-sandi-akun" data-email="${escapeHtml(
            a.email
          )}">
            Kirim Reset Sandi
          </button>
        </div>
      </article>
    `
    )
    .join('');

  const rowsHtml = daftarAkun
    .map(
      (a, idx) => `
      <tr>
        <td class="td-center">${idx + 1}</td>
        <td><strong>${escapeHtml(a.nama)}</strong><br><span style="color:var(--text-muted);font-size:14px">${escapeHtml(
        a.email
      )}</span></td>
        <td>${escapeHtml(getPeranLabel(a))}</td>
        <td>${escapeHtml(formatRingkasanTugas(a))}</td>
        <td>${a.aktif === false ? 'Nonaktif' : 'Aktif'}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-akun" data-id="${escapeHtml(
              a.id
            )}">
              Ubah Peran
            </button>
            <button type="button" class="btn btn-ghost btn-sm btn-reset-sandi-akun" data-email="${escapeHtml(
              a.email
            )}">
              Reset Sandi
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="card-list">${cardsHtml}</div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="td-center">No</th>
            <th>Nama &amp; Email</th>
            <th>Peran</th>
            <th>Penugasan Kelas &amp; Mapel</th>
            <th>Status</th>
            <th class="td-num">Tindakan</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.btn-edit-akun').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = daftarAkun.find((item) => item.id === btn.dataset.id);
      if (target) bukaFormAkun(target);
    });
  });

  container.querySelectorAll('.btn-reset-sandi-akun').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email;
      if (!email) return;
      try {
        const { auth } = getFirebaseServices();
        await sendPasswordResetEmail(auth, email);
        tampilkanSukses(`Link atur ulang kata sandi sudah dikirim ke ${email}.`);
      } catch (error) {
        tampilkanError(pesanRamahError(error));
      }
    });
  });
}

function aturTabAdmin(tab) {
  adminTabAktif = tab;
  const tabSiswa = document.getElementById('tab-admin-siswa');
  const tabAkun = document.getElementById('tab-admin-akun');
  const panelSiswa = document.getElementById('panel-data-siswa');
  const panelAkun = document.getElementById('panel-data-akun');
  const btnTambahSiswa = document.getElementById('btn-tambah-siswa');
  const btnTambahAkun = document.getElementById('btn-tambah-akun');

  if (tabSiswa) {
    tabSiswa.classList.toggle('is-active', tab === 'siswa');
    tabSiswa.setAttribute('aria-selected', String(tab === 'siswa'));
  }
  if (tabAkun) {
    tabAkun.classList.toggle('is-active', tab === 'akun');
    tabAkun.setAttribute('aria-selected', String(tab === 'akun'));
  }
  if (panelSiswa) panelSiswa.hidden = tab !== 'siswa';
  if (panelAkun) panelAkun.hidden = tab !== 'akun';

  if (btnTambahSiswa) btnTambahSiswa.hidden = !isAdmin() || tab !== 'siswa';
  if (btnTambahAkun) btnTambahAkun.hidden = !isAdmin() || tab !== 'akun';

  if (tab === 'akun' && isAdmin()) {
    muatDaftarAkun();
  }
}

export function initHalamanSiswa() {
  document.getElementById('btn-tambah-siswa')?.addEventListener('click', () => bukaFormSiswa(null));
  document.getElementById('btn-tambah-akun')?.addEventListener('click', () => bukaFormAkun(null));
  document.getElementById('tab-admin-siswa')?.addEventListener('click', () => aturTabAdmin('siswa'));
  document.getElementById('tab-admin-akun')?.addEventListener('click', () => aturTabAdmin('akun'));
  document.getElementById('siswa-cari')?.addEventListener('input', renderHalamanSiswa);
  document.getElementById('siswa-filter-kelas')?.addEventListener('change', renderHalamanSiswa);

  document.getElementById('btn-template-excel')?.addEventListener('click', () => {
    try {
      downloadTemplateSiswaExcel();
      tampilkanSukses('File contoh data siswa berhasil diunduh. Silakan buka dan isi di Excel.');
    } catch (err) {
      tampilkanError(err.message);
    }
  });

  const importInput = document.getElementById('input-import-excel');
  importInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isAdmin()) {
      tampilkanError('Hanya Admin sekolah yang dapat mengimpor data siswa.');
      return;
    }

    try {
      tampilkanInfo('Sedang membaca file Excel siswa...');
      const { validRows, skippedRows } = await parseSiswaExcelFile(file);
      if (validRows.length === 0) {
        tampilkanError('Tidak ada baris siswa yang lengkap (wajib ada kolom Nama dan Kelas).');
        return;
      }

      const { auth, db } = getFirebaseServices();
      const user = auth.currentUser;
      const chunkSize = 400;

      for (let i = 0; i < validRows.length; i += chunkSize) {
        const chunk = validRows.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((s) => {
          const ref = doc(collection(db, 'siswa'));
          batch.set(ref, {
            ownerId: user.uid,
            nis: s.nis,
            nama: s.nama,
            kelas: s.kelas.toUpperCase(),
            jenisKelamin: s.jenisKelamin,
            aktif: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
      }

      const infoLewat =
        skippedRows.length > 0
          ? ` (${skippedRows.length} baris dilewati karena Nama atau Kelas kosong.)`
          : '';
      tampilkanSukses(`${validRows.length} siswa berhasil diimpor dari Excel.${infoLewat}`);
      await muatDataSiswa();
    } catch (error) {
      if (error?.message && !error?.code) {
        tampilkanError(error.message);
      } else {
        try {
          handleFirestoreError(error, OperationType.WRITE, 'siswa');
        } catch (wrapped) {
          tampilkanError(wrapped.friendlyMessage);
        }
      }
    }
  });
}
