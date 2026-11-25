import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFirebaseServices, OperationType, handleFirestoreError } from './firebase.js';
import { downloadTemplateSiswaExcel, parseSiswaExcelFile } from './excel.js';

// ==========================================================================
// State Bersama Data Siswa & Menu Aktif
// ==========================================================================

let daftarSiswa = [];
let menuAktif = 'absen';
const menuChangeCallbacks = [];

const JUDUL_HALAMAN_HP = {
  absen: 'Absen Siswa',
  nilai: 'Input Nilai',
  rekap: 'Rekap & Excel',
  siswa: 'Data Siswa'
};

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
// Navigasi 4 Menu (HP & PC)
// ==========================================================================

export function onMenuChange(cb) {
  menuChangeCallbacks.push(cb);
}

export function aturMenuAktif(menu) {
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
// Pengelolaan Data Siswa (Firestore + Tampilan Kartu/Tabel)
// ==========================================================================

export function getDaftarSiswa() {
  return daftarSiswa;
}

export function getDaftarKelas() {
  const setKelas = new Set(daftarSiswa.map((s) => s.kelas).filter(Boolean));
  return Array.from(setKelas).sort((a, b) => a.localeCompare(b, 'id'));
}

export function sinkronkanDropdownKelas() {
  const kelasList = getDaftarKelas();
  const selectIds = [
    { id: 'absen-kelas', defaultLabel: 'Semua Kelas' },
    { id: 'nilai-kelas', defaultLabel: 'Pilih Kelas' },
    { id: 'rekap-absen-kelas', defaultLabel: 'Semua Kelas' },
    { id: 'rekap-nilai-kelas', defaultLabel: 'Semua Kelas' },
    { id: 'siswa-filter-kelas', defaultLabel: 'Semua Kelas' }
  ];

  selectIds.forEach(({ id, defaultLabel }) => {
    const select = document.getElementById(id);
    if (!select) return;
    const prevValue = select.value;

    select.innerHTML = '';
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
  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;
  if (!user) return [];

  try {
    const q = query(collection(db, 'siswa'), where('ownerId', '==', user.uid));
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
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Belum Ada Data Siswa</h2>
        <p class="empty-desc">
          Tambahkan siswa terlebih dahulu agar Anda bisa mencatat absen dan mengisi nilai. Anda
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

  // Tampilan Kartu (HP) + Tabel (PC)
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
        <div class="button-pair">
          <button type="button" class="btn btn-secondary btn-sm btn-edit-siswa" data-id="${escapeHtml(
            s.id
          )}">
            Ubah
          </button>
          <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-siswa" data-id="${escapeHtml(
            s.id
          )}">
            Hapus
          </button>
        </div>
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
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-siswa" data-id="${escapeHtml(
              s.id
            )}">
              Ubah
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-siswa" data-id="${escapeHtml(
              s.id
            )}">
              Hapus
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
            <th>NIS</th>
            <th>Nama Lengkap</th>
            <th>Kelas</th>
            <th>Jenis Kelamin</th>
            <th class="td-num">Tindakan</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

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

export function initHalamanSiswa() {
  document.getElementById('btn-tambah-siswa')?.addEventListener('click', () => bukaFormSiswa(null));
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
