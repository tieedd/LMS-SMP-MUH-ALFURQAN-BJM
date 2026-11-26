import {
  collection,
  getDocs,
  getDoc,
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
  pesanRamahError,
  buatIdAman
} from './firebase.js';
import { APP_NAME, APP_SHORT_NAME, SEKOLAH } from './config.js';
import {
  downloadTemplateSiswaExcel,
  parseSiswaExcelFile,
  exportBackupSemuaDataExcel
} from './excel.js';

// ==========================================================================
// State Bersama Data Master (Siswa, Kelas, Mapel, Akun) & Navigasi
// ==========================================================================

let daftarSiswa = [];
let daftarKelas = [];
let daftarMapel = [];
let daftarAkun = [];
let akunSudahDimuat = false;
let profilPengguna = null;
let menuAktif = 'absen';
let adminTabAktif = 'siswa';
let previewImportState = null;
const menuChangeCallbacks = [];
const rekapPerluRefresh = { absen: true, nilai: true };

const JUDUL_HALAMAN_HP = {
  absen: `${APP_SHORT_NAME} · Absen Siswa`,
  nilai: `${APP_SHORT_NAME} · Input Nilai`,
  rekap: `${APP_SHORT_NAME} · Rekap & Excel`,
  siswa: `${APP_SHORT_NAME} · Data Siswa`,
  panduan: `${APP_SHORT_NAME} · Panduan Guru`
};

export function tandaiRekapPerluRefresh(jenis = 'semua') {
  if (jenis === 'absen' || jenis === 'semua') rekapPerluRefresh.absen = true;
  if (jenis === 'nilai' || jenis === 'semua') rekapPerluRefresh.nilai = true;
}

export function ambilDanResetRefreshRekap(jenis) {
  const perlu = Boolean(rekapPerluRefresh[jenis]);
  rekapPerluRefresh[jenis] = false;
  return perlu;
}

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

const KELAS_AWAL = ['7A', '7B', '8A', '8B', '9A', '9B'];

const CONTOH_SISWA = [
  { nis: '2026001', nama: 'Ahmad Fauzi', kelas: '7A', jk: 'L' },
  { nis: '2026002', nama: 'Aisyah Putri Ramadhani', kelas: '7A', jk: 'P' },
  { nis: '2026003', nama: 'Bagus Pratama', kelas: '7A', jk: 'L' },
  { nis: '2026004', nama: 'Fatimah Azzahra', kelas: '7A', jk: 'P' },
  { nis: '2026005', nama: 'Muhammad Rizky', kelas: '7A', jk: 'L' },
  { nis: '2026006', nama: 'Nadia Khairunnisa', kelas: '7B', jk: 'P' },
  { nis: '2026007', nama: 'Rafi Akbar', kelas: '7B', jk: 'L' },
  { nis: '2026008', nama: 'Siti Aminah', kelas: '7B', jk: 'P' },
  { nis: '2026009', nama: 'Umar Al Faruq', kelas: '7B', jk: 'L' },
  { nis: '2026010', nama: 'Zahra Maulida', kelas: '7B', jk: 'P' }
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
  const setMapel = new Set(
    Array.isArray(profilPengguna.mapelDiampu) ? profilPengguna.mapelDiampu : []
  );
  const uid = profilPengguna.uid || profilPengguna.id;
  daftarMapel.forEach((m) => {
    if (uid && m.guruId === uid && m.nama) {
      setMapel.add(m.nama);
    }
  });
  return Array.from(setMapel);
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

function buatToast(pesan, tipe, { large = false, duration = 4500 } = {}) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${tipe}${large ? ' toast--large' : ''}`;

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
  }, duration);
}

export function tampilkanSukses(pesan) {
  buatToast(pesan, 'success');
}

export function tampilkanSuksesBesar(pesan) {
  buatToast(pesan, 'success', { large: true, duration: 5500 });
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

  const adminTabs = document.getElementById('admin-data-tabs');
  const adminBackupBar = document.getElementById('admin-backup-bar');
  const adminExcelControls = document.getElementById('admin-excel-controls');
  const btnTambahSiswa = document.getElementById('btn-tambah-siswa');
  const btnTambahAkun = document.getElementById('btn-tambah-akun');
  const descEl = document.getElementById('siswa-page-desc');

  if (adminTabs) adminTabs.hidden = !adminMode;
  if (adminBackupBar) adminBackupBar.hidden = !adminMode;
  if (adminExcelControls) adminExcelControls.hidden = !adminMode;

  document.querySelectorAll('[data-guide-menu]').forEach((btn) => {
    const target = btn.dataset.guideMenu;
    if (isWali && (target === 'absen' || target === 'nilai')) {
      btn.hidden = true;
    } else {
      btn.hidden = false;
    }
  });

  if (!adminMode) {
    adminTabAktif = 'siswa';
    if (btnTambahSiswa) btnTambahSiswa.hidden = true;
    if (btnTambahAkun) btnTambahAkun.hidden = true;
    const panelSiswa = document.getElementById('panel-data-siswa');
    const panelAkademik = document.getElementById('panel-data-akademik');
    const panelAkun = document.getElementById('panel-data-akun');
    if (panelSiswa) panelSiswa.hidden = false;
    if (panelAkademik) panelAkademik.hidden = true;
    if (panelAkun) panelAkun.hidden = true;
    if (descEl) {
      descEl.textContent = isWali
        ? `Daftar siswa di kelas perwalian Anda (${profilPengguna?.waliKelas || '-'}).`
        : 'Daftar siswa di kelas yang Anda ajar.';
    }
  } else {
    if (descEl) {
      descEl.textContent =
        'Kelola data siswa, unggah Excel dengan pratinjau, atur kelas & mapel, serta kelola akun guru.';
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
    siswa: document.getElementById('halaman-siswa'),
    panduan: document.getElementById('halaman-panduan')
  };

  Object.entries(sections).forEach(([key, el]) => {
    if (el) el.hidden = key !== menu;
  });

  const mobileTitle = document.getElementById('mobile-page-title');
  if (mobileTitle) {
    mobileTitle.textContent = JUDUL_HALAMAN_HP[menu] || APP_NAME;
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

  document.querySelectorAll('[data-guide-menu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.guideMenu;
      if (target) {
        aturMenuAktif(target);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
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
// Pengelolaan Data Master (Kelas, Mapel, Siswa)
// ==========================================================================

export function getDaftarSiswa() {
  return daftarSiswa;
}

export function getDaftarKelasMaster() {
  return daftarKelas;
}

export function getDaftarMapelMaster() {
  return daftarMapel;
}

export function getDaftarKelas() {
  const diizinkan = getKelasYangDiizinkan();
  const setKelas = new Set([
    ...daftarKelas.map((k) => k.nama || k.id).filter(Boolean),
    ...daftarSiswa.map((s) => s.kelas).filter(Boolean)
  ]);
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
    { id: 'absen-kelas', defaultLabel: 'Pilih Kelas', autoSelectFirst: true },
    { id: 'nilai-kelas', defaultLabel: 'Pilih Kelas', autoSelectFirst: true },
    {
      id: 'rekap-absen-kelas',
      defaultLabel: wali ? 'Kelas Perwalian' : 'Semua Kelas',
      autoSelectFirst: false
    },
    {
      id: 'rekap-nilai-kelas',
      defaultLabel: wali ? 'Kelas Perwalian' : 'Semua Kelas',
      autoSelectFirst: false
    },
    {
      id: 'siswa-filter-kelas',
      defaultLabel: wali ? 'Kelas Perwalian' : 'Semua Kelas',
      autoSelectFirst: false
    }
  ];

  selectIds.forEach(({ id, defaultLabel, autoSelectFirst }) => {
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
    } else if (autoSelectFirst && kelasList.length > 0) {
      select.value = kelasList[0];
    }
  });
}

export async function muatDataKelasDanMapel() {
  const { auth, db } = getFirebaseServices();
  const role = getPeranPengguna();
  const kelasDiizinkan = getKelasYangDiizinkan();
  const mapelDiampu = Array.isArray(profilPengguna?.mapelDiampu) ? profilPengguna.mapelDiampu : [];
  const uid = auth.currentUser?.uid || '';

  try {
    // 1. Muat kelas
    const kelasMap = new Map();
    if (role === 'admin') {
      const snap = await getDocs(collection(db, 'kelas'));
      snap.forEach((d) => kelasMap.set(d.id, { id: d.id, ...d.data() }));
    } else if (role === 'wali_kelas' && kelasDiizinkan.length > 0) {
      const snap = await getDocs(
        query(collection(db, 'kelas'), where('nama', '==', kelasDiizinkan[0]))
      );
      snap.forEach((d) => kelasMap.set(d.id, { id: d.id, ...d.data() }));
    } else if (role === 'guru' && kelasDiizinkan.length > 0) {
      const kelasUnik = Array.from(new Set(kelasDiizinkan.filter(Boolean)));
      const snaps = await Promise.all(
        kelasUnik.map((k) => getDocs(query(collection(db, 'kelas'), where('nama', '==', k))))
      );
      snaps.forEach((snap) => {
        snap.forEach((d) => kelasMap.set(d.id, { id: d.id, ...d.data() }));
      });
    }
    const kelasItems = Array.from(kelasMap.values());
    kelasItems.sort((a, b) => String(a.nama || a.id).localeCompare(String(b.nama || b.id), 'id'));
    daftarKelas = kelasItems;

    // 2. Muat mapel (query penuh tanpa filter hanya untuk admin)
    const mapelMap = new Map();
    if (role === 'admin') {
      const snap = await getDocs(collection(db, 'mapel'));
      snap.forEach((d) => mapelMap.set(d.id, { id: d.id, ...d.data() }));
    } else if (role === 'guru') {
      const tugasQuery = [];
      if (uid) {
        tugasQuery.push(getDocs(query(collection(db, 'mapel'), where('guruId', '==', uid))));
      }
      const mapelUnik = Array.from(new Set(mapelDiampu.filter(Boolean)));
      mapelUnik.forEach((m) => {
        tugasQuery.push(getDocs(query(collection(db, 'mapel'), where('nama', '==', m))));
      });
      if (tugasQuery.length > 0) {
        const snaps = await Promise.all(tugasQuery);
        snaps.forEach((snap) => {
          snap.forEach((d) => mapelMap.set(d.id, { id: d.id, ...d.data() }));
        });
      }
    }
    daftarMapel = Array.from(mapelMap.values()).sort((a, b) =>
      String(a.nama || '').localeCompare(String(b.nama || ''), 'id')
    );

    if (isAdmin() && adminTabAktif === 'akademik') {
      renderHalamanAkademik();
    }
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'kelas/mapel');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage || 'Gagal memuat daftar kelas dan mapel.');
    }
  }
}

export async function muatDataSiswa() {
  const { db } = getFirebaseServices();
  const role = getPeranPengguna();
  const kelasDiizinkan = getKelasYangDiizinkan();

  await muatDataKelasDanMapel();

  if (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) {
    daftarSiswa = [];
    sinkronkanDropdownKelas();
    renderHalamanSiswa();
    return daftarSiswa;
  }

  try {
    const siswaMap = new Map();
    if (role === 'admin') {
      const snap = await getDocs(collection(db, 'siswa'));
      snap.forEach((d) => {
        const data = d.data();
        siswaMap.set(d.id, {
          id: d.id,
          nis: d.id,
          nama: data.nama || '',
          kelas: data.kelas || '',
          jk: data.jk || data.jenisKelamin || 'L'
        });
      });
    } else if (role === 'wali_kelas' && kelasDiizinkan.length > 0) {
      const snap = await getDocs(
        query(collection(db, 'siswa'), where('kelas', '==', kelasDiizinkan[0]))
      );
      snap.forEach((d) => {
        const data = d.data();
        siswaMap.set(d.id, {
          id: d.id,
          nis: d.id,
          nama: data.nama || '',
          kelas: data.kelas || '',
          jk: data.jk || data.jenisKelamin || 'L'
        });
      });
    } else if (role === 'guru' && kelasDiizinkan.length > 0) {
      const kelasUnik = Array.from(new Set(kelasDiizinkan.filter(Boolean)));
      const snaps = await Promise.all(
        kelasUnik.map((k) => getDocs(query(collection(db, 'siswa'), where('kelas', '==', k))))
      );
      snaps.forEach((snap) => {
        snap.forEach((d) => {
          const data = d.data();
          siswaMap.set(d.id, {
            id: d.id,
            nis: d.id,
            nama: data.nama || '',
            kelas: data.kelas || '',
            jk: data.jk || data.jenisKelamin || 'L'
          });
        });
      });
    }

    const items = Array.from(siswaMap.values());

    items.sort((a, b) => {
      const cmpKelas = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
      if (cmpKelas !== 0) return cmpKelas;
      return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
    });

    daftarSiswa = items;
    tandaiRekapPerluRefresh('semua');
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

export async function isiKelasDanMapelAwal() {
  if (!isAdmin()) return;
  const { db } = getFirebaseServices();

  try {
    const batch = writeBatch(db);
    KELAS_AWAL.forEach((k) => {
      if (!daftarKelas.some((item) => item.id === k)) {
        batch.set(doc(db, 'kelas', k), {
          nama: k,
          waliKelas: '',
          tahunAjaran: '2026/2027',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });
    DAFTAR_MAPEL_STANDAR.forEach((m) => {
      const id = buatIdAman(m.toLowerCase());
      if (!daftarMapel.some((item) => item.id === id)) {
        batch.set(doc(db, 'mapel', id), {
          nama: m,
          guruId: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });
    await batch.commit();
    tampilkanSukses('Daftar kelas (7A–9B) dan 12 mata pelajaran standar berhasil dibuat.');
    await muatDataKelasDanMapel();
    sinkronkanDropdownKelas();
    renderHalamanAkademik();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, 'kelas/mapel');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }
}

export async function isiDataContohSiswa() {
  if (!isAdmin()) {
    tampilkanError('Hanya Admin sekolah yang dapat menambahkan data siswa.');
    return;
  }

  const { db } = getFirebaseServices();

  try {
    const batch = writeBatch(db);
    // Pastikan kelas 7A & 7B ada sebelum menulis siswa/{nis}
    ['7A', '7B'].forEach((k) => {
      if (!daftarKelas.some((item) => item.id === k)) {
        batch.set(doc(db, 'kelas', k), {
          nama: k,
          waliKelas: '',
          tahunAjaran: '2026/2027',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });

    CONTOH_SISWA.forEach((s) => {
      batch.set(doc(db, 'siswa', s.nis), {
        nama: s.nama,
        kelas: s.kelas,
        jk: s.jk,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    tampilkanSukses('10 contoh data siswa dan kelas 7A/7B berhasil ditambahkan.');
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

// ==========================================================================
// Form Tambah / Ubah / Hapus Siswa (Manual)
// ==========================================================================

function bukaFormSiswa(siswaEdit = null) {
  if (!isAdmin()) return;

  const kelasList = daftarKelas.map((k) => k.nama || k.id);
  if (kelasList.length === 0) {
    tampilkanError(
      'Daftar kelas masih kosong. Buat minimal 1 kelas terlebih dahulu di tab "Kelas & Mapel".'
    );
    aturTabAdmin('akademik');
    return;
  }

  const isEdit = Boolean(siswaEdit);
  const form = document.createElement('form');
  form.className = 'email-form';
  form.style.marginTop = '0';

  const opsiKelasHtml = kelasList
    .map(
      (k) =>
        `<option value="${escapeHtml(k)}" ${siswaEdit?.kelas === k ? 'selected' : ''}>Kelas ${escapeHtml(
          k
        )}</option>`
    )
    .join('');

  form.innerHTML = `
    <div class="form-group">
      <label for="modal-siswa-nis" class="form-label">NIS (Nomor Induk Siswa)</label>
      <input
        type="text"
        id="modal-siswa-nis"
        class="form-input"
        placeholder="Contoh: 2026001"
        maxlength="30"
        required
        ${isEdit ? 'readonly' : ''}
        value="${escapeHtml(siswaEdit?.nis || '')}"
      />
    </div>
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
      <label for="modal-siswa-kelas" class="form-label">Kelas</label>
      <select id="modal-siswa-kelas" class="form-input" required>
        ${opsiKelasHtml}
      </select>
    </div>
    <div class="form-group">
      <label for="modal-siswa-jk" class="form-label">Jenis Kelamin (JK)</label>
      <select id="modal-siswa-jk" class="form-input">
        <option value="L" ${siswaEdit?.jk !== 'P' ? 'selected' : ''}>L — Laki-laki</option>
        <option value="P" ${siswaEdit?.jk === 'P' ? 'selected' : ''}>P — Perempuan</option>
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
    const nis = form.querySelector('#modal-siswa-nis').value.trim();
    const nama = form.querySelector('#modal-siswa-nama').value.trim();
    const kelas = form.querySelector('#modal-siswa-kelas').value.trim();
    const jk = form.querySelector('#modal-siswa-jk').value;

    if (!/^[a-zA-Z0-9_-]+$/.test(nis)) {
      tampilkanError(
        'NIS hanya boleh berisi huruf, angka, tanda hubung (-), atau garis bawah (_) tanpa spasi.'
      );
      return;
    }
    if (!nama) {
      tampilkanError('Nama siswa belum diisi.');
      return;
    }
    if (!kelas) {
      tampilkanError('Kelas siswa belum dipilih.');
      return;
    }

    const submitBtn = form.querySelector('#btn-simpan-form-siswa');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    const { db } = getFirebaseServices();

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'siswa', siswaEdit.id), {
          nama,
          kelas,
          jk,
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(`Data siswa ${nama} berhasil diperbarui.`);
      } else {
        const ref = doc(db, 'siswa', nis);
        const existingSnap = await getDoc(ref);
        if (existingSnap.exists()) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Simpan Siswa';
          tampilkanError(
            `NIS ${nis} sudah terdaftar atas nama ${existingSnap.data().nama || 'siswa lain'}. Gunakan NIS yang berbeda.`
          );
          return;
        }
        await setDoc(ref, {
          nama,
          kelas,
          jk,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(`Siswa baru ${nama} (NIS ${nis}) berhasil ditambahkan.`);
      }
      tutupModal();
      await muatDataSiswa();
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan Siswa';
      try {
        handleFirestoreError(
          error,
          isEdit ? OperationType.UPDATE : OperationType.CREATE,
          `siswa/${nis}`
        );
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
    message: `Apakah Anda yakin ingin menghapus data siswa "${siswa.nama}" (NIS ${siswa.nis}, Kelas ${siswa.kelas})?`,
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

// ==========================================================================
// Pratinjau Unggah Excel Data Siswa + Simpan writeBatch (500 per batch)
// ==========================================================================

function tutupPratinjauImport() {
  previewImportState = null;
  const panel = document.getElementById('import-preview-panel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
}

function renderPratinjauImport() {
  const panel = document.getElementById('import-preview-panel');
  if (!panel) return;

  if (!previewImportState) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  const { fileName, allRows, validRows, invalidRows } = previewImportState;
  panel.hidden = false;

  const cardsHtml = allRows
    .map(
      (r) => `
      <article class="student-card ${r.valid ? '' : 'student-card--error'}">
        <div>
          <h3 class="student-name">
            Baris ${r.barisKe}: ${escapeHtml(r.nama || '(Nama kosong)')}
          </h3>
          <p class="student-meta num">
            NIS: ${escapeHtml(r.nis || '(Kosong)')} · Kelas: ${escapeHtml(
        r.kelas || '(Kosong)'
      )} · JK: ${escapeHtml(r.jk || '(Kosong)')}
          </p>
          <p class="${r.valid ? 'ok-reason-text' : 'error-reason-text'}" style="margin:6px 0 0">
            ${r.valid ? 'Siap disimpan' : escapeHtml(r.alasanError)}
          </p>
        </div>
      </article>
    `
    )
    .join('');

  const rowsHtml = allRows
    .map(
      (r) => `
      <tr class="${r.valid ? '' : 'row-error'}">
        <td class="td-center num">${r.barisKe}</td>
        <td class="num">${escapeHtml(r.nis || '-')}</td>
        <td><strong>${escapeHtml(r.nama || '-')}</strong></td>
        <td>${escapeHtml(r.kelas || '-')}</td>
        <td class="td-center">${escapeHtml(r.jk || '-')}</td>
        <td>
          ${
            r.valid
              ? '<span class="ok-reason-text">Siap disimpan</span>'
              : `<span class="error-reason-text">${escapeHtml(r.alasanError)}</span>`
          }
        </td>
      </tr>
    `
    )
    .join('');

  const infoMerah =
    invalidRows.length > 0
      ? `<p class="section-hint" style="margin:0 0 12px; color:#b91c1c;">
          Baris berwarna merah memiliki data yang perlu diperbaiki dan <strong>tidak akan disimpan</strong>. Perbaiki di Excel lalu unggah ulang, atau klik Simpan untuk menyimpan data yang sudah valid saja.
        </p>`
      : '';

  panel.innerHTML = `
    <div class="preview-header">
      <div>
        <h2 class="section-subtitle">Pratinjau Unggah Excel: ${escapeHtml(fileName)}</h2>
        <p class="section-hint">Periksa hasil pemeriksaan data berikut sebelum disimpan.</p>
      </div>
      <div class="button-pair">
        <button type="button" id="btn-batal-preview-import" class="btn btn-secondary">
          Batal
        </button>
        <button
          type="button"
          id="btn-simpan-preview-import"
          class="btn btn-primary"
          ${validRows.length === 0 ? 'disabled' : ''}
        >
          Simpan (${validRows.length} Data Valid)
        </button>
      </div>
    </div>

    <div class="preview-summary-chips">
      <span class="preview-stat">Total Baris: ${allRows.length}</span>
      <span class="preview-stat preview-stat--ok">Valid: ${validRows.length}</span>
      <span class="preview-stat preview-stat--err">Bermasalah (Merah): ${invalidRows.length}</span>
    </div>

    ${infoMerah}

    <div class="card-list">${cardsHtml}</div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="td-center">Baris</th>
            <th>NIS</th>
            <th>Nama</th>
            <th>Kelas</th>
            <th class="td-center">JK</th>
            <th>Keterangan Pemeriksaan</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  panel.querySelector('#btn-batal-preview-import')?.addEventListener('click', tutupPratinjauImport);
  panel.querySelector('#btn-simpan-preview-import')?.addEventListener('click', simpanHasilImportBatch);
}

async function simpanHasilImportBatch() {
  if (!isAdmin() || !previewImportState || previewImportState.validRows.length === 0) return;

  const btn = document.getElementById('btn-simpan-preview-import');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan Data...';
  }

  const { db } = getFirebaseServices();
  const validRows = previewImportState.validRows;
  const skippedCount = previewImportState.invalidRows.length;

  try {
    // Dipecah per 500 data sesuai batas maksimal writeBatch Firestore
    const chunkSize = 500;
    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((row) => {
        const ref = doc(db, 'siswa', row.nis);
        batch.set(ref, {
          nama: row.nama,
          kelas: row.kelas,
          jk: row.jk,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    const catatanLewat =
      skippedCount > 0 ? ` (${skippedCount} baris bermasalah dilewati.)` : '';
    tampilkanSukses(`${validRows.length} data siswa berhasil disimpan.${catatanLewat}`);
    tutupPratinjauImport();
    await muatDataSiswa();
  } catch (error) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `Simpan (${validRows.length} Data Valid)`;
    }
    try {
      handleFirestoreError(error, OperationType.WRITE, 'siswa');
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
              ? `Kelas perwalian Anda belum diatur. Silakan hubungi Admin ${escapeHtml(SEKOLAH)}.`
              : `Anda belum ditugaskan ke kelas mana pun. Silakan hubungi Admin ${escapeHtml(SEKOLAH)}.`
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
            Unduh Template Excel lalu unggah daftar siswa, tambahkan satu per satu, atau coba
            dengan 10 siswa contoh.
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
            Admin sekolah belum memasukkan data siswa untuk kelas ini.
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
        s.jk === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'
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
        <td class="td-center">${escapeHtml(s.jk)}</td>
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
            <th class="td-center">JK</th>
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
// Pengelolaan Master Kelas & Mata Pelajaran (Khusus Admin)
// ==========================================================================

function bukaFormKelas(kelasEdit = null) {
  if (!isAdmin()) return;
  const isEdit = Boolean(kelasEdit);

  const form = document.createElement('form');
  form.className = 'email-form';
  form.style.marginTop = '0';
  form.innerHTML = `
    <div class="form-group">
      <label for="modal-kelas-nama" class="form-label">Nama Kelas</label>
      <input
        type="text"
        id="modal-kelas-nama"
        class="form-input"
        placeholder="Contoh: 7A, 8B, atau 9C"
        maxlength="20"
        required
        ${isEdit ? 'readonly' : ''}
        value="${escapeHtml(kelasEdit?.nama || '')}"
      />
    </div>
    <div class="form-group">
      <label for="modal-kelas-wali" class="form-label">Nama Wali Kelas (Opsional)</label>
      <input
        type="text"
        id="modal-kelas-wali"
        class="form-input"
        placeholder="Contoh: Ibu Siti Rahmawati"
        maxlength="100"
        value="${escapeHtml(kelasEdit?.waliKelas || '')}"
      />
    </div>
    <div class="form-group">
      <label for="modal-kelas-ta" class="form-label">Tahun Ajaran</label>
      <input
        type="text"
        id="modal-kelas-ta"
        class="form-input"
        placeholder="Contoh: 2026/2027"
        maxlength="20"
        required
        value="${escapeHtml(kelasEdit?.tahunAjaran || '2026/2027')}"
      />
    </div>
    <div class="modal-footer">
      <button type="button" id="btn-batal-kelas" class="btn btn-secondary">Batal</button>
      <button type="submit" id="btn-simpan-kelas" class="btn btn-primary">
        ${isEdit ? 'Simpan Perubahan' : 'Simpan Kelas'}
      </button>
    </div>
  `;

  form.querySelector('#btn-batal-kelas').addEventListener('click', tutupModal);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = form.querySelector('#modal-kelas-nama').value.trim().toUpperCase();
    const waliKelas = form.querySelector('#modal-kelas-wali').value.trim();
    const tahunAjaran = form.querySelector('#modal-kelas-ta').value.trim();

    if (!/^[a-zA-Z0-9_-]+$/.test(nama)) {
      tampilkanError('Nama kelas hanya boleh huruf dan angka tanpa spasi (misal: 7A).');
      return;
    }

    const submitBtn = form.querySelector('#btn-simpan-kelas');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    const { db } = getFirebaseServices();
    try {
      if (isEdit) {
        await updateDoc(doc(db, 'kelas', kelasEdit.id), {
          waliKelas,
          tahunAjaran,
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(`Kelas ${nama} berhasil diperbarui.`);
      } else {
        await setDoc(doc(db, 'kelas', nama), {
          nama,
          waliKelas,
          tahunAjaran,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        tampilkanSukses(`Kelas ${nama} berhasil ditambahkan.`);
      }
      tutupModal();
      await muatDataKelasDanMapel();
      sinkronkanDropdownKelas();
      renderHalamanAkademik();
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan Kelas';
      try {
        handleFirestoreError(error, OperationType.WRITE, `kelas/${nama}`);
      } catch (wrapped) {
        tampilkanError(wrapped.friendlyMessage);
      }
    }
  });

  bukaModal({
    title: isEdit ? `Ubah Kelas ${kelasEdit.nama}` : 'Tambah Kelas Baru',
    bodyElement: form
  });
}

async function hapusKelas(kelas) {
  if (!isAdmin()) return;
  const adaSiswa = daftarSiswa.some((s) => s.kelas === kelas.nama);
  if (adaSiswa) {
    tampilkanError(
      `Kelas ${kelas.nama} masih memiliki siswa terdaftar. Pindahkan atau hapus siswa di kelas ini dahulu.`
    );
    return;
  }

  const yakin = await konfirmasiAksi({
    title: 'Hapus Kelas?',
    message: `Apakah Anda yakin ingin menghapus Kelas "${kelas.nama}"?`,
    confirmLabel: 'Ya, Hapus',
    danger: true
  });
  if (!yakin) return;

  const { db } = getFirebaseServices();
  try {
    await deleteDoc(doc(db, 'kelas', kelas.id));
    tampilkanSukses(`Kelas ${kelas.nama} berhasil dihapus.`);
    await muatDataKelasDanMapel();
    sinkronkanDropdownKelas();
    renderHalamanAkademik();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, `kelas/${kelas.id}`);
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }
}

async function bukaFormMapel(mapelEdit = null) {
  if (!isAdmin()) return;
  if (!akunSudahDimuat) {
    await muatDaftarAkun(false);
  }

  const isEdit = Boolean(mapelEdit);
  const guruOptions = daftarAkun
    .filter((a) => a.role === 'guru' || a.role === 'admin')
    .map(
      (a) =>
        `<option value="${escapeHtml(a.uid || a.id)}" ${
          mapelEdit?.guruId === (a.uid || a.id) ? 'selected' : ''
        }>${escapeHtml(a.nama)} (${escapeHtml(a.email)})</option>`
    )
    .join('');

  const form = document.createElement('form');
  form.className = 'email-form';
  form.style.marginTop = '0';
  form.innerHTML = `
    <div class="form-group">
      <label for="modal-mapel-nama" class="form-label">Nama Mata Pelajaran</label>
      <input
        type="text"
        id="modal-mapel-nama"
        class="form-input"
        placeholder="Contoh: Matematika"
        maxlength="60"
        required
        value="${escapeHtml(mapelEdit?.nama || '')}"
      />
    </div>
    <div class="form-group">
      <label for="modal-mapel-guru" class="form-label">Guru Pengampu (Opsional)</label>
      <select id="modal-mapel-guru" class="form-input">
        <option value="">-- Belum Ditentukan --</option>
        ${guruOptions}
      </select>
    </div>
    <div class="modal-footer">
      <button type="button" id="btn-batal-mapel" class="btn btn-secondary">Batal</button>
      <button type="submit" id="btn-simpan-mapel" class="btn btn-primary">
        ${isEdit ? 'Simpan Perubahan' : 'Simpan Mapel'}
      </button>
    </div>
  `;

  form.querySelector('#btn-batal-mapel').addEventListener('click', tutupModal);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = form.querySelector('#modal-mapel-nama').value.trim();
    const guruId = form.querySelector('#modal-mapel-guru').value;
    if (!nama) {
      tampilkanError('Nama mata pelajaran wajib diisi.');
      return;
    }

    const submitBtn = form.querySelector('#btn-simpan-mapel');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    const { db } = getFirebaseServices();
    const mapelId = isEdit ? mapelEdit.id : buatIdAman(nama.toLowerCase()) || `mapel_${Date.now()}`;

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'mapel', mapelId), {
          nama,
          guruId,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(doc(db, 'mapel', mapelId), {
          nama,
          guruId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // Sinkronkan mapelDiampu pada akun guru bila dipilih
      if (guruId) {
        const guruAkun = daftarAkun.find((a) => (a.uid || a.id) === guruId);
        if (guruAkun && guruAkun.role === 'guru') {
          const mapelBaru = Array.from(new Set([...(guruAkun.mapelDiampu || []), nama])).slice(0, 20);
          await updateDoc(doc(db, 'users', guruId), {
            mapelDiampu: mapelBaru,
            updatedAt: serverTimestamp()
          });
        }
      }

      tutupModal();
      tampilkanSukses(`Mata pelajaran "${nama}" berhasil disimpan.`);
      await muatDataKelasDanMapel();
      renderHalamanAkademik();
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan Mapel';
      try {
        handleFirestoreError(error, OperationType.WRITE, `mapel/${mapelId}`);
      } catch (wrapped) {
        tampilkanError(wrapped.friendlyMessage);
      }
    }
  });

  bukaModal({
    title: isEdit ? 'Ubah Mata Pelajaran' : 'Tambah Mata Pelajaran',
    bodyElement: form
  });
}

async function hapusMapel(mapel) {
  if (!isAdmin()) return;
  const yakin = await konfirmasiAksi({
    title: 'Hapus Mata Pelajaran?',
    message: `Apakah Anda yakin ingin menghapus mata pelajaran "${mapel.nama}"?`,
    confirmLabel: 'Ya, Hapus',
    danger: true
  });
  if (!yakin) return;

  const { db } = getFirebaseServices();
  try {
    await deleteDoc(doc(db, 'mapel', mapel.id));
    tampilkanSukses(`Mata pelajaran "${mapel.nama}" berhasil dihapus.`);
    await muatDataKelasDanMapel();
    renderHalamanAkademik();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, `mapel/${mapel.id}`);
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }
}

export async function renderHalamanAkademik() {
  const container = document.getElementById('akademik-container');
  if (!container || !isAdmin()) return;

  if (!akunSudahDimuat) {
    await muatDaftarAkun(false);
  }

  const guruById = new Map();
  daftarAkun.forEach((a) => guruById.set(a.uid || a.id, a.nama || a.email));

  const butuhIsiAwal = daftarKelas.length === 0 && daftarMapel.length === 0;

  const kelasRows = daftarKelas
    .map(
      (k) => `
      <tr>
        <td><strong>Kelas ${escapeHtml(k.nama)}</strong></td>
        <td>${escapeHtml(k.waliKelas || '-')}</td>
        <td class="num">${escapeHtml(k.tahunAjaran || '-')}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-kelas" data-id="${escapeHtml(k.id)}">Ubah</button>
            <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-kelas" data-id="${escapeHtml(k.id)}">Hapus</button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  const kelasCards = daftarKelas
    .map(
      (k) => `
      <article class="student-card">
        <div>
          <h3 class="student-name">Kelas ${escapeHtml(k.nama)}</h3>
          <p class="student-meta">Wali Kelas: ${escapeHtml(k.waliKelas || '-')} · Tahun Ajaran ${escapeHtml(k.tahunAjaran || '-')}</p>
        </div>
        <div class="button-pair">
          <button type="button" class="btn btn-secondary btn-sm btn-edit-kelas" data-id="${escapeHtml(k.id)}">Ubah</button>
          <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-kelas" data-id="${escapeHtml(k.id)}">Hapus</button>
        </div>
      </article>
    `
    )
    .join('');

  const mapelRows = daftarMapel
    .map(
      (m) => `
      <tr>
        <td><strong>${escapeHtml(m.nama)}</strong></td>
        <td>${escapeHtml(guruById.get(m.guruId) || '-')}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-mapel" data-id="${escapeHtml(m.id)}">Ubah</button>
            <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-mapel" data-id="${escapeHtml(m.id)}">Hapus</button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  const mapelCards = daftarMapel
    .map(
      (m) => `
      <article class="student-card">
        <div>
          <h3 class="student-name">${escapeHtml(m.nama)}</h3>
          <p class="student-meta">Guru: ${escapeHtml(guruById.get(m.guruId) || 'Belum diatur')}</p>
        </div>
        <div class="button-pair">
          <button type="button" class="btn btn-secondary btn-sm btn-edit-mapel" data-id="${escapeHtml(m.id)}">Ubah</button>
          <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-mapel" data-id="${escapeHtml(m.id)}">Hapus</button>
        </div>
      </article>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="akademik-grid">
      ${
        butuhIsiAwal
          ? `<div class="panel">
              <div class="panel-header-row">
                <div>
                  <h2 class="section-subtitle">Mulai Cepat: Buat Kelas &amp; Mapel Sekolah</h2>
                  <p class="section-hint">Klik tombol di samping untuk langsung membuat kelas 7A–9B dan 12 mata pelajaran standar.</p>
                </div>
                <button type="button" id="btn-seed-akademik" class="btn btn-primary">
                  Isi Kelas &amp; Mapel Standar
                </button>
              </div>
            </div>`
          : ''
      }

      <div class="panel">
        <div class="panel-header-row">
          <div>
            <h2 class="section-subtitle">Daftar Kelas (${daftarKelas.length})</h2>
            <p class="section-hint">Daftar kelas ini dipakai untuk memvalidasi unggahan Excel Data Siswa.</p>
          </div>
          <button type="button" id="btn-tambah-kelas" class="btn btn-primary btn-sm">
            + Tambah Kelas
          </button>
        </div>
        ${
          daftarKelas.length === 0
            ? '<p class="section-hint" style="margin:0">Belum ada kelas terdaftar.</p>'
            : `<div class="card-list">${kelasCards}</div>
               <div class="desktop-table-wrap">
                 <table class="data-table">
                   <thead>
                     <tr>
                       <th>Nama Kelas</th>
                       <th>Wali Kelas</th>
                       <th>Tahun Ajaran</th>
                       <th class="td-num">Tindakan</th>
                     </tr>
                   </thead>
                   <tbody>${kelasRows}</tbody>
                 </table>
               </div>`
        }
      </div>

      <div class="panel">
        <div class="panel-header-row">
          <div>
            <h2 class="section-subtitle">Daftar Mata Pelajaran (${daftarMapel.length})</h2>
            <p class="section-hint">Atur nama mata pelajaran dan guru pengampu untuk menu Nilai.</p>
          </div>
          <button type="button" id="btn-tambah-mapel" class="btn btn-primary btn-sm">
            + Tambah Mapel
          </button>
        </div>
        ${
          daftarMapel.length === 0
            ? '<p class="section-hint" style="margin:0">Belum ada mata pelajaran terdaftar.</p>'
            : `<div class="card-list">${mapelCards}</div>
               <div class="desktop-table-wrap">
                 <table class="data-table">
                   <thead>
                     <tr>
                       <th>Mata Pelajaran</th>
                       <th>Guru Pengampu</th>
                       <th class="td-num">Tindakan</th>
                     </tr>
                   </thead>
                   <tbody>${mapelRows}</tbody>
                 </table>
               </div>`
        }
      </div>
    </div>
  `;

  container.querySelector('#btn-seed-akademik')?.addEventListener('click', isiKelasDanMapelAwal);
  container.querySelector('#btn-tambah-kelas')?.addEventListener('click', () => bukaFormKelas(null));
  container.querySelector('#btn-tambah-mapel')?.addEventListener('click', () => bukaFormMapel(null));

  container.querySelectorAll('.btn-edit-kelas').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = daftarKelas.find((k) => k.id === btn.dataset.id);
      if (target) bukaFormKelas(target);
    });
  });

  container.querySelectorAll('.btn-hapus-kelas').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = daftarKelas.find((k) => k.id === btn.dataset.id);
      if (target) hapusKelas(target);
    });
  });

  container.querySelectorAll('.btn-edit-mapel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = daftarMapel.find((m) => m.id === btn.dataset.id);
      if (target) bukaFormMapel(target);
    });
  });

  container.querySelectorAll('.btn-hapus-mapel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = daftarMapel.find((m) => m.id === btn.dataset.id);
      if (target) hapusMapel(target);
    });
  });
}

// ==========================================================================
// Pengelolaan Akun Guru & Wali Kelas (Khusus Admin)
// ==========================================================================

function formatRingkasanTugas(akun) {
  if (akun.role === 'admin') return 'Semua kelas & semua data';
  if (akun.role === 'wali_kelas') {
    return akun.waliKelas ? `Wali Kelas ${akun.waliKelas}` : 'Kelas perwalian belum diisi';
  }
  const kelas =
    Array.isArray(akun.kelasDiampu) && akun.kelasDiampu.length
      ? akun.kelasDiampu.join(', ')
      : 'Belum ada kelas';
  const mapel =
    Array.isArray(akun.mapelDiampu) && akun.mapelDiampu.length
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
    new Set([...semuaKelas, ...(akunEdit?.kelasDiampu || []), ...KELAS_AWAL])
  ).sort((a, b) => a.localeCompare(b, 'id'));

  const pilihanMapel = Array.from(
    new Set([...daftarMapel.map((m) => m.nama).filter(Boolean), ...DAFTAR_MAPEL_STANDAR])
  );

  const kelasTerpilih = new Set(akunEdit?.kelasDiampu || []);
  const mapelTerpilih = new Set(akunEdit?.mapelDiampu || []);
  const mapelTambahan = (akunEdit?.mapelDiampu || []).filter((m) => !pilihanMapel.includes(m));

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

  const checkboxMapelHtml = pilihanMapel
    .map(
      (m) => `
      <label class="checkbox-option">
        <input type="checkbox" name="akun-mapel-cb" value="${escapeHtml(m)}" ${
        mapelTerpilih.has(m) ? 'checked' : ''
      } />
        <span>${escapeHtml(m)}</span>
      </label>
    `
    )
    .join('');

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
              placeholder="Contoh: LmsAlFurqan2026"
              minlength="6"
              required
            />
          </div>`
    }
    <div class="form-group">
      <label for="modal-akun-role" class="form-label">Peran Akun</label>
      <select id="modal-akun-role" class="form-input">
        <option value="guru" ${!akunEdit || akunEdit.role === 'guru' ? 'selected' : ''}>
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
          placeholder="Kelas lain jika perlu (pisah koma, misal: 7C, 8C)"
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

export async function muatDaftarAkun(render = true) {
  if (!isAdmin()) return;
  const { db } = getFirebaseServices();
  try {
    const snap = await getDocs(collection(db, 'users'));
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    daftarAkun = list;
    akunSudahDimuat = true;
    if (render) renderDaftarAkun();
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
  const tabAkademik = document.getElementById('tab-admin-akademik');
  const tabAkun = document.getElementById('tab-admin-akun');
  const panelSiswa = document.getElementById('panel-data-siswa');
  const panelAkademik = document.getElementById('panel-data-akademik');
  const panelAkun = document.getElementById('panel-data-akun');
  const btnTambahSiswa = document.getElementById('btn-tambah-siswa');
  const btnTambahAkun = document.getElementById('btn-tambah-akun');

  if (tabSiswa) {
    tabSiswa.classList.toggle('is-active', tab === 'siswa');
    tabSiswa.setAttribute('aria-selected', String(tab === 'siswa'));
  }
  if (tabAkademik) {
    tabAkademik.classList.toggle('is-active', tab === 'akademik');
    tabAkademik.setAttribute('aria-selected', String(tab === 'akademik'));
  }
  if (tabAkun) {
    tabAkun.classList.toggle('is-active', tab === 'akun');
    tabAkun.setAttribute('aria-selected', String(tab === 'akun'));
  }

  if (panelSiswa) panelSiswa.hidden = tab !== 'siswa';
  if (panelAkademik) panelAkademik.hidden = tab !== 'akademik';
  if (panelAkun) panelAkun.hidden = tab !== 'akun';

  if (btnTambahSiswa) btnTambahSiswa.hidden = !isAdmin() || tab !== 'siswa';
  if (btnTambahAkun) btnTambahAkun.hidden = !isAdmin() || tab !== 'akun';

  if (tab === 'akademik' && isAdmin()) {
    renderHalamanAkademik();
  } else if (tab === 'akun' && isAdmin()) {
    muatDaftarAkun();
  }
}

let sedangBackupExcel = false;

function renderProgresBackup(langkahList, selesaiCount, teksStatus, hasilAkhir = null) {
  const box = document.getElementById('backup-progress-box');
  if (!box) return;

  box.hidden = false;
  const total = langkahList.length;
  const persen = total > 0 ? Math.round((selesaiCount / total) * 100) : 0;

  const itemsHtml = langkahList
    .map((item) => {
      const cls =
        item.state === 'loading'
          ? 'backup-progress-item--loading'
          : item.state === 'ok'
          ? 'backup-progress-item--ok'
          : item.state === 'err'
          ? 'backup-progress-item--err'
          : '';
      return `
        <li class="backup-progress-item ${cls}">
          <span>${escapeHtml(item.label)}</span>
          <span class="num">${escapeHtml(item.statusText)}</span>
        </li>
      `;
    })
    .join('');

  const resultHtml = hasilAkhir
    ? `<p class="backup-progress-result ${
        hasilAkhir.warning ? 'backup-progress-result--warn' : 'backup-progress-result--ok'
      }">${escapeHtml(hasilAkhir.message)}</p>`
    : '';

  box.innerHTML = `
    <p class="backup-progress-warning">
      Proses ini bisa memakan waktu beberapa menit, jangan tutup halaman.
    </p>
    <div class="backup-progress-head">
      <span>${escapeHtml(teksStatus)}</span>
      <span class="num">${selesaiCount}/${total} (${persen}%)</span>
    </div>
    <div class="backup-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${persen}">
      <div class="backup-progress-fill" style="width:${persen}%"></div>
    </div>
    <ul class="backup-progress-list">${itemsHtml}</ul>
    ${resultHtml}
  `;
}

async function cadangkanSemuaDataExcel() {
  if (!isAdmin()) {
    tampilkanError('Hanya Admin sekolah yang dapat mencadangkan semua data.');
    return;
  }
  if (sedangBackupExcel) return;
  sedangBackupExcel = true;

  const btn = document.getElementById('btn-cadangkan-excel');
  const labelAwal = btn ? btn.textContent : 'Cadangkan Semua Data ke Excel';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sedang Mencadangkan...';
  }

  const { db } = getFirebaseServices();

  const langkahList = [
    { key: 'siswa', label: 'Data Siswa', state: 'wait', statusText: 'Menunggu' },
    { key: 'kelas', label: 'Daftar Kelas', state: 'wait', statusText: 'Menunggu' },
    { key: 'mapel', label: 'Mata Pelajaran', state: 'wait', statusText: 'Menunggu' },
    { key: 'absensi', label: 'Absensi Harian', state: 'wait', statusText: 'Menunggu' },
    { key: 'rekapAbsen', label: 'Rekap Absen Bulanan', state: 'wait', statusText: 'Menunggu' },
    { key: 'nilai', label: 'Nilai Siswa', state: 'wait', statusText: 'Menunggu' },
    { key: 'users', label: 'Akun Pengguna', state: 'wait', statusText: 'Menunggu' },
    { key: 'pengaturan', label: 'Pengaturan Sekolah', state: 'wait', statusText: 'Menunggu' }
  ];

  const koleksiGagal = [];
  let selesaiCount = 0;

  let siswaList = [];
  let kelasList = [];
  let mapelList = [];
  let absensiList = [];
  let rekapAbsenList = [];
  let nilaiList = [];
  let usersList = [];
  let bobot = { tugas: 30, uts: 30, uas: 40 };
  let kkm = 75;

  tampilkanInfo('Proses ini bisa memakan waktu beberapa menit, jangan tutup halaman.');
  renderProgresBackup(langkahList, selesaiCount, 'Memulai cadangan semua data...');

  async function bacaKoleksi(idx, readerFn) {
    const item = langkahList[idx];
    item.state = 'loading';
    item.statusText = 'Sedang dibaca...';
    renderProgresBackup(langkahList, selesaiCount, `Membaca ${item.label}...`);
    try {
      const jumlahText = await readerFn();
      item.state = 'ok';
      item.statusText = jumlahText;
    } catch {
      item.state = 'err';
      item.statusText = 'Gagal dibaca';
      koleksiGagal.push(item.label);
    } finally {
      selesaiCount += 1;
      renderProgresBackup(
        langkahList,
        selesaiCount,
        selesaiCount === langkahList.length
          ? 'Selesai membaca semua koleksi.'
          : `Selesai ${selesaiCount} dari ${langkahList.length} koleksi...`
      );
    }
  }

  try {
    await bacaKoleksi(0, async () => {
      const snap = await getDocs(collection(db, 'siswa'));
      snap.forEach((d) => {
        const data = d.data();
        siswaList.push({
          id: d.id,
          nis: d.id,
          nama: data.nama || '',
          kelas: data.kelas || '',
          jk: data.jk || data.jenisKelamin || 'L'
        });
      });
      siswaList.sort((a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id'));
      return `${siswaList.length} data`;
    });

    await bacaKoleksi(1, async () => {
      const snap = await getDocs(collection(db, 'kelas'));
      snap.forEach((d) => kelasList.push({ id: d.id, ...d.data() }));
      kelasList.sort((a, b) => String(a.nama || a.id).localeCompare(String(b.nama || b.id), 'id'));
      return `${kelasList.length} data`;
    });

    await bacaKoleksi(2, async () => {
      const snap = await getDocs(collection(db, 'mapel'));
      snap.forEach((d) => mapelList.push({ id: d.id, ...d.data() }));
      mapelList.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
      return `${mapelList.length} data`;
    });

    await bacaKoleksi(3, async () => {
      const snap = await getDocs(collection(db, 'absensi'));
      snap.forEach((d) => absensiList.push({ id: d.id, ...d.data() }));
      return `${absensiList.length} data`;
    });

    await bacaKoleksi(4, async () => {
      const snap = await getDocs(collection(db, 'rekapAbsen'));
      snap.forEach((d) => rekapAbsenList.push({ id: d.id, ...d.data() }));
      return `${rekapAbsenList.length} data`;
    });

    await bacaKoleksi(5, async () => {
      const snap = await getDocs(collection(db, 'nilai'));
      snap.forEach((d) => nilaiList.push({ id: d.id, ...d.data() }));
      return `${nilaiList.length} data`;
    });

    await bacaKoleksi(6, async () => {
      const snap = await getDocs(collection(db, 'users'));
      snap.forEach((d) => usersList.push({ id: d.id, ...d.data() }));
      usersList.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
      daftarAkun = usersList;
      akunSudahDimuat = true;
      return `${usersList.length} data`;
    });

    await bacaKoleksi(7, async () => {
      const [bobotSnap, kkmSnap] = await Promise.all([
        getDoc(doc(db, 'pengaturan', 'bobotNilai')),
        getDoc(doc(db, 'pengaturan', 'kkm'))
      ]);
      if (bobotSnap.exists()) bobot = bobotSnap.data();
      if (kkmSnap.exists()) kkm = kkmSnap.data().kkm ?? 75;
      return 'Berhasil';
    });

    if (koleksiGagal.length === langkahList.length) {
      const pesanGagalSemua = `Semua data gagal dibaca (${koleksiGagal.join(
        ', '
      )}). Periksa koneksi internet Anda lalu coba lagi.`;
      renderProgresBackup(langkahList, selesaiCount, 'Cadangan tidak dapat dibuat.', {
        warning: true,
        message: pesanGagalSemua
      });
      tampilkanError(pesanGagalSemua);
      return;
    }

    const fileName = exportBackupSemuaDataExcel({
      siswaList,
      kelasList,
      mapelList,
      absensiList,
      rekapAbsenList,
      nilaiList,
      usersList,
      bobot,
      kkm,
      tanggalHariIniStr: tanggalHariIni()
    });

    if (koleksiGagal.length > 0) {
      const pesanParsial = `File cadangan "${fileName}" berhasil diunduh, tetapi ada data yang gagal dibaca dan tidak ikut tersimpan: ${koleksiGagal.join(
        ', '
      )}.`;
      renderProgresBackup(langkahList, selesaiCount, 'Cadangan selesai dengan catatan.', {
        warning: true,
        message: pesanParsial
      });
      tampilkanError(pesanParsial);
    } else {
      const pesanSukses = `Semua data sekolah berhasil dicadangkan ke file "${fileName}".`;
      renderProgresBackup(langkahList, selesaiCount, 'Cadangan selesai.', {
        warning: false,
        message: pesanSukses
      });
      tampilkanSukses(pesanSukses);
    }
  } catch (error) {
    const pesan = pesanRamahError(error);
    renderProgresBackup(langkahList, selesaiCount, 'Proses cadangan terhenti.', {
      warning: true,
      message:
        koleksiGagal.length > 0
          ? `${pesan} Data yang gagal dibaca: ${koleksiGagal.join(', ')}.`
          : pesan
    });
    tampilkanError(pesan);
  } finally {
    sedangBackupExcel = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = labelAwal;
    }
  }
}

export function initHalamanSiswa() {
  document.getElementById('btn-tambah-siswa')?.addEventListener('click', () => bukaFormSiswa(null));
  document.getElementById('btn-tambah-akun')?.addEventListener('click', () => bukaFormAkun(null));
  document.getElementById('btn-cadangkan-excel')?.addEventListener('click', cadangkanSemuaDataExcel);
  document.getElementById('tab-admin-siswa')?.addEventListener('click', () => aturTabAdmin('siswa'));
  document
    .getElementById('tab-admin-akademik')
    ?.addEventListener('click', () => aturTabAdmin('akademik'));
  document.getElementById('tab-admin-akun')?.addEventListener('click', () => aturTabAdmin('akun'));
  document.getElementById('siswa-cari')?.addEventListener('input', renderHalamanSiswa);
  document.getElementById('siswa-filter-kelas')?.addEventListener('change', renderHalamanSiswa);

  document.getElementById('btn-template-excel')?.addEventListener('click', () => {
    try {
      downloadTemplateSiswaExcel(getDaftarKelas());
      tampilkanSukses('Template Excel siswa berhasil diunduh. Silakan buka dan isi di Excel.');
    } catch (err) {
      tampilkanError(pesanRamahError(err));
    }
  });

  const importInput = document.getElementById('input-import-excel');
  importInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isAdmin()) {
      tampilkanError('Hanya Admin sekolah yang dapat mengunggah data siswa.');
      return;
    }

    try {
      tampilkanInfo('Sedang membaca dan memeriksa file Excel siswa...');
      const kelasValidList = daftarKelas.map((k) => k.nama || k.id).filter(Boolean);
      const existingNisSet = new Set(daftarSiswa.map((s) => s.id));
      const { allRows, validRows, invalidRows } = await parseSiswaExcelFile(file, {
        kelasValidList,
        existingNisSet
      });

      previewImportState = {
        fileName: file.name,
        allRows,
        validRows,
        invalidRows
      };
      renderPratinjauImport();
    } catch (error) {
      tampilkanError(pesanRamahError(error));
    }
  });
}
