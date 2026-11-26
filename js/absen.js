import {
  collection,
  getDoc,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getFirebaseServices,
  OperationType,
  handleFirestoreError,
  pesanRamahError,
  buatIdAman
} from './firebase.js';
import { SEKOLAH } from './config.js';
import {
  escapeHtml,
  tanggalHariIni,
  formatTanggalIndonesia,
  getDaftarSiswa,
  getKelasYangDiizinkan,
  isAdmin,
  tampilkanSukses,
  tampilkanSuksesBesar,
  tampilkanError,
  aturMenuAktif,
  isiDataContohSiswa,
  bukaModal,
  tutupModal,
  tandaiRekapPerluRefresh
} from './ui.js';

const STATUS_OPTIONS = [
  { code: 'H', label: 'Hadir', desc: 'Siswa masuk kelas' },
  { code: 'S', label: 'Sakit', desc: 'Ada keterangan sakit' },
  { code: 'I', label: 'Izin', desc: 'Ada izin orang tua/wali' },
  { code: 'A', label: 'Alpa', desc: 'Tanpa keterangan' }
];
const VALID_CODES = new Set(['H', 'S', 'I', 'A']);

let absenDraft = new Map(); // nis -> 'H' | 'S' | 'I' | 'A'
let absenRecordsAwal = {}; // salinan status absen tersimpan saat halaman dimuat
let absensiSudahAda = false;

function getKelasTerpilih() {
  return document.getElementById('absen-kelas')?.value || '';
}

function getSiswaTersaring() {
  const kelas = getKelasTerpilih();
  if (!kelas) return [];
  return getDaftarSiswa().filter((s) => s.kelas === kelas);
}

function perbaruiBannerSudahAda(kelas, tanggal) {
  const banner = document.getElementById('absen-existing-banner');
  if (!banner) return;

  if (!absensiSudahAda || !kelas || !tanggal) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }

  banner.textContent = `Absen Kelas ${kelas} tanggal ${formatTanggalIndonesia(
    tanggal
  )} sudah tersimpan sebelumnya. Sentuh nama siswa untuk mengubah status jika perlu, lalu tekan Simpan Absen.`;
  banner.hidden = false;
}

function perbaruiRingkasan() {
  const siswaList = getSiswaTersaring();
  const hitung = { H: 0, S: 0, I: 0, A: 0 };

  siswaList.forEach((s) => {
    const st = absenDraft.get(s.nis) || 'H';
    if (hitung[st] !== undefined) {
      hitung[st] += 1;
    }
  });

  const elHadir = document.getElementById('count-hadir');
  const elSakit = document.getElementById('count-sakit');
  const elIzin = document.getElementById('count-izin');
  const elAlpa = document.getElementById('count-alpa');

  if (elHadir) elHadir.textContent = String(hitung.H);
  if (elSakit) elSakit.textContent = String(hitung.S);
  if (elIzin) elIzin.textContent = String(hitung.I);
  if (elAlpa) elAlpa.textContent = String(hitung.A);
}

function setStatusSiswa(nis, statusCode) {
  const aman = VALID_CODES.has(statusCode) ? statusCode : 'H';
  absenDraft.set(nis, aman);

  document.querySelectorAll(`[data-absen-siswa="${CSS.escape(nis)}"]`).forEach((wrap) => {
    wrap.querySelectorAll('.status-btn').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.status === aman);
    });
  });

  perbaruiRingkasan();
}

function bukaPilihStatusAbsen(siswa) {
  const statusSaatIni = absenDraft.get(siswa.nis) || 'H';
  const wrap = document.createElement('div');

  wrap.innerHTML = `
    <p style="margin:0 0 6px; color:var(--text-secondary);">
      NIS ${escapeHtml(siswa.nis)} · Kelas ${escapeHtml(siswa.kelas)}
    </p>
    <p style="margin:0 0 12px; font-weight:600;">
      Pilih status kehadiran untuk <strong>${escapeHtml(siswa.nama)}</strong>:
    </p>
    <div class="absen-big-grid">
      ${STATUS_OPTIONS.map(
        (opt) => `
        <button
          type="button"
          class="absen-big-btn absen-big-btn--${opt.code} ${
          statusSaatIni === opt.code ? 'is-selected' : ''
        }"
          data-pick-status="${opt.code}"
        >
          <span>${opt.label}</span>
          <span class="absen-big-sub">${opt.desc}</span>
        </button>
      `
      ).join('')}
    </div>
  `;

  wrap.querySelectorAll('[data-pick-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setStatusSiswa(siswa.nis, btn.dataset.pickStatus);
      tutupModal();
    });
  });

  bukaModal({
    title: `Ubah Status: ${siswa.nama}`,
    bodyElement: wrap
  });
}

function renderDaftarAbsen() {
  const container = document.getElementById('absen-container');
  const saveBar = document.getElementById('absen-save-bar');
  if (!container) return;

  const kelasDiizinkan = getKelasYangDiizinkan();
  if (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) {
    if (saveBar) saveBar.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Belum Ada Kelas yang Diajar</h2>
        <p class="empty-desc">
          Admin sekolah belum mengatur daftar kelas yang Anda ajar. Silakan hubungi Admin ${escapeHtml(
            SEKOLAH
          )}.
        </p>
      </div>
    `;
    perbaruiRingkasan();
    return;
  }

  const semuaSiswa = getDaftarSiswa();
  if (semuaSiswa.length === 0) {
    if (saveBar) saveBar.hidden = true;
    if (isAdmin()) {
      container.innerHTML = `
        <div class="empty-state">
          <h2 class="empty-title">Belum Ada Data Siswa</h2>
          <p class="empty-desc">
            Untuk mulai mencatat absen harian, silakan isi daftar siswa terlebih dahulu di menu
            Data Siswa, atau gunakan 10 siswa contoh untuk mencoba.
          </p>
          <div class="empty-actions">
            <button type="button" id="btn-absen-ke-siswa" class="btn btn-primary">
              Buka Menu Data Siswa
            </button>
            <button type="button" id="btn-absen-contoh" class="btn btn-secondary">
              Isi 10 Siswa Contoh
            </button>
          </div>
        </div>
      `;
      container
        .querySelector('#btn-absen-ke-siswa')
        ?.addEventListener('click', () => aturMenuAktif('siswa'));
      container
        .querySelector('#btn-absen-contoh')
        ?.addEventListener('click', isiDataContohSiswa);
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <h2 class="empty-title">Belum Ada Siswa di Kelas Anda</h2>
          <p class="empty-desc">
            Admin sekolah belum memasukkan daftar siswa untuk kelas yang Anda ajar.
          </p>
        </div>
      `;
    }
    perbaruiRingkasan();
    return;
  }

  const kelas = getKelasTerpilih();
  if (!kelas) {
    if (saveBar) saveBar.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Langkah 1 · Pilih Kelas</h2>
        <p class="empty-desc">Silakan pilih kelas terlebih dahulu pada kotak di atas untuk menampilkan daftar siswa.</p>
      </div>
    `;
    perbaruiRingkasan();
    return;
  }

  const siswaList = getSiswaTersaring();
  if (siswaList.length === 0) {
    if (saveBar) saveBar.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Tidak Ada Siswa di Kelas ${escapeHtml(kelas)}</h2>
        <p class="empty-desc">Silakan pilih kelas lain atau tambahkan siswa ke kelas ini.</p>
      </div>
    `;
    perbaruiRingkasan();
    return;
  }

  if (saveBar) saveBar.hidden = false;

  const cardsHtml = siswaList
    .map((s) => {
      const status = absenDraft.get(s.nis) || 'H';
      const tombolStatus = STATUS_OPTIONS.map(
        (opt) => `
          <button
            type="button"
            class="status-btn ${status === opt.code ? 'is-selected' : ''}"
            data-status="${opt.code}"
          >
            ${opt.label}
          </button>
        `
      ).join('');

      return `
        <article class="student-card" data-absen-siswa="${escapeHtml(s.nis)}">
          <div class="student-card-top">
            <div>
              <button type="button" class="student-name-trigger" data-pick-nis="${escapeHtml(s.nis)}">
                ${escapeHtml(s.nama)}
              </button>
              <p class="student-meta num">NIS ${escapeHtml(s.nis)} · Kelas ${escapeHtml(s.kelas)}</p>
            </div>
          </div>
          <div class="status-grid">${tombolStatus}</div>
        </article>
      `;
    })
    .join('');

  const rowsHtml = siswaList
    .map((s, idx) => {
      const status = absenDraft.get(s.nis) || 'H';
      const tombolStatus = STATUS_OPTIONS.map(
        (opt) => `
          <button
            type="button"
            class="status-btn ${status === opt.code ? 'is-selected' : ''}"
            data-status="${opt.code}"
          >
            ${opt.label}
          </button>
        `
      ).join('');

      return `
        <tr data-absen-siswa="${escapeHtml(s.nis)}">
          <td class="td-center">${idx + 1}</td>
          <td class="num">${escapeHtml(s.nis)}</td>
          <td>
            <button type="button" class="student-name-trigger" data-pick-nis="${escapeHtml(s.nis)}">
              ${escapeHtml(s.nama)}
            </button>
          </td>
          <td>Kelas ${escapeHtml(s.kelas)}</td>
          <td>
            <div class="status-grid">${tombolStatus}</div>
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <p class="step-heading">Langkah 3 · Daftar Siswa Kelas ${escapeHtml(
      kelas
    )} (Sentuh nama siswa untuk ubah lewat tombol warna besar)</p>
    <div class="card-list">${cardsHtml}</div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="td-center">No</th>
            <th>NIS</th>
            <th>Nama Siswa (Klik untuk Ubah)</th>
            <th>Kelas</th>
            <th>Status Kehadiran</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-absen-siswa]').forEach((wrap) => {
    const nis = wrap.dataset.absenSiswa;
    wrap.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setStatusSiswa(nis, btn.dataset.status);
      });
    });
  });

  container.querySelectorAll('[data-pick-nis]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = siswaList.find((s) => s.nis === btn.dataset.pickNis);
      if (target) bukaPilihStatusAbsen(target);
    });
  });

  perbaruiRingkasan();
}

export async function muatHalamanAbsen() {
  const tanggalInput = document.getElementById('absen-tanggal');
  const tanggal = tanggalInput?.value || tanggalHariIni();
  if (tanggalInput && !tanggalInput.value) {
    tanggalInput.value = tanggal;
  }

  const siswaList = getSiswaTersaring();
  absenDraft = new Map();
  absenRecordsAwal = {};
  absensiSudahAda = false;
  siswaList.forEach((s) => {
    absenDraft.set(s.nis, 'H');
  });

  const kelas = getKelasTerpilih();
  const kelasDiizinkan = getKelasYangDiizinkan();
  if (
    !kelas ||
    siswaList.length === 0 ||
    (!isAdmin() && Array.isArray(kelasDiizinkan) && !kelasDiizinkan.includes(kelas))
  ) {
    perbaruiBannerSudahAda('', '');
    renderDaftarAbsen();
    return;
  }

  const { db } = getFirebaseServices();
  const absensiId = buatIdAman(`${kelas}_${tanggal}`);

  try {
    const snap = await getDocs(
      query(
        collection(db, 'absensi'),
        where('kelas', '==', kelas),
        where('tanggal', '==', tanggal)
      )
    );
    if (!snap.empty) {
      absensiSudahAda = true;
      const records = snap.docs[0].data().records || {};
      absenRecordsAwal = { ...records };
      siswaList.forEach((s) => {
        const val = records[s.nis];
        if (VALID_CODES.has(val)) {
          absenDraft.set(s.nis, val);
        }
      });
    }
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.GET, `absensi/${absensiId}`);
    } catch (wrapped) {
      tampilkanError(pesanRamahError(wrapped));
    }
  }

  perbaruiBannerSudahAda(kelas, tanggal);
  renderDaftarAbsen();
}

async function perbaruiRekapAbsenBulanan(kelas, bulan, prevRecords = {}, newRecords = {}) {
  const { db } = getFirebaseServices();
  const siswaKelas = getDaftarSiswa().filter((s) => s.kelas === kelas);
  const siswaMap = new Map(siswaKelas.map((s) => [s.nis, s]));
  const rekapId = buatIdAman(`${kelas}_${bulan}`);

  // Hemat pembacaan: cek rekapAbsen bulan tersebut lebih dulu; jika sudah ada cukup perbarui selisihnya
  const rekapSnap = await getDocs(query(collection(db, 'rekapAbsen'), where('kelas', '==', kelas)));
  const docBulanIni = rekapSnap.docs.find(
    (d) => d.id === rekapId || d.data().bulan === bulan
  );

  if (docBulanIni) {
    const existingData = docBulanIni.data()?.ringkasan || {};
    const ringkasan = {};

    Object.entries(existingData).forEach(([nis, item]) => {
      const H = Number(item?.H || 0);
      const S = Number(item?.S || 0);
      const I = Number(item?.I || 0);
      const A = Number(item?.A || 0);
      ringkasan[nis] = {
        nama: siswaMap.get(nis)?.nama || item?.nama || nis,
        H,
        S,
        I,
        A,
        total: H + S + I + A
      };
    });

    siswaKelas.forEach((s) => {
      if (!ringkasan[s.nis]) {
        ringkasan[s.nis] = { nama: s.nama, H: 0, S: 0, I: 0, A: 0, total: 0 };
      } else {
        ringkasan[s.nis].nama = s.nama;
      }
    });

    const semuaNis = new Set([...Object.keys(prevRecords), ...Object.keys(newRecords)]);
    semuaNis.forEach((nis) => {
      const oldSt = VALID_CODES.has(prevRecords[nis]) ? prevRecords[nis] : null;
      const newSt = VALID_CODES.has(newRecords[nis]) ? newRecords[nis] : null;
      if (oldSt === newSt) return;

      if (!ringkasan[nis]) {
        ringkasan[nis] = {
          nama: siswaMap.get(nis)?.nama || nis,
          H: 0,
          S: 0,
          I: 0,
          A: 0,
          total: 0
        };
      }
      if (oldSt && ringkasan[nis][oldSt] > 0) {
        ringkasan[nis][oldSt] -= 1;
      }
      if (newSt) {
        ringkasan[nis][newSt] += 1;
      }
      ringkasan[nis].total =
        ringkasan[nis].H + ringkasan[nis].S + ringkasan[nis].I + ringkasan[nis].A;
    });

    await updateDoc(doc(db, 'rekapAbsen', rekapId), {
      ringkasan,
      updatedAt: serverTimestamp()
    });
    return;
  }

  // Fallback jika ringkasan bulan ini belum pernah dibuat: hitung dari absensi harian bulan ini
  const snap = await getDocs(query(collection(db, 'absensi'), where('kelas', '==', kelas)));
  const ringkasan = {};

  siswaKelas.forEach((s) => {
    ringkasan[s.nis] = {
      nama: s.nama,
      H: 0,
      S: 0,
      I: 0,
      A: 0,
      total: 0
    };
  });

  snap.forEach((d) => {
    const data = d.data();
    if (!String(data.tanggal || '').startsWith(bulan)) return;
    const records = data.records || {};
    Object.entries(records).forEach(([nis, st]) => {
      if (!ringkasan[nis]) {
        ringkasan[nis] = { nama: siswaMap.get(nis)?.nama || nis, H: 0, S: 0, I: 0, A: 0, total: 0 };
      }
      if (VALID_CODES.has(st)) {
        ringkasan[nis][st] += 1;
        ringkasan[nis].total += 1;
      }
    });
  });

  await setDoc(doc(db, 'rekapAbsen', rekapId), {
    kelas,
    bulan,
    ringkasan,
    updatedAt: serverTimestamp()
  });
}

async function simpanAbsen() {
  const tanggal = document.getElementById('absen-tanggal')?.value;
  const kelas = getKelasTerpilih();

  if (!kelas) {
    tampilkanError('Silakan pilih kelas pada Langkah 1 terlebih dahulu.');
    return;
  }
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    tampilkanError('Silakan pilih tanggal absen yang valid pada Langkah 2.');
    return;
  }

  const siswaList = getSiswaTersaring();
  if (siswaList.length === 0) {
    tampilkanError('Belum ada siswa di kelas ini untuk disimpan absennya.');
    return;
  }

  const btn = document.getElementById('btn-simpan-absen');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan Absen...';
  }

  const { db } = getFirebaseServices();
  const absensiId = buatIdAman(`${kelas}_${tanggal}`);
  const records = {};
  siswaList.forEach((s) => {
    const st = absenDraft.get(s.nis);
    records[s.nis] = VALID_CODES.has(st) ? st : 'H';
  });

  const prevRecords = absensiSudahAda ? { ...absenRecordsAwal } : {};

  try {
    const ref = doc(db, 'absensi', absensiId);
    if (absensiSudahAda) {
      await updateDoc(ref, {
        records,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(ref, {
        tanggal,
        kelas,
        records,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      absensiSudahAda = true;
    }

    await perbaruiRekapAbsenBulanan(kelas, tanggal.slice(0, 7), prevRecords, records);
    absenRecordsAwal = { ...records };
    tandaiRekapPerluRefresh('absen');
    perbaruiBannerSudahAda(kelas, tanggal);

    tampilkanSuksesBesar('Berhasil disimpan ✓');
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, `absensi/${absensiId}`);
    } catch (wrapped) {
      tampilkanError(pesanRamahError(wrapped));
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Simpan Absen';
    }
  }
}

export function initHalamanAbsen() {
  const tanggalInput = document.getElementById('absen-tanggal');
  if (tanggalInput && !tanggalInput.value) {
    tanggalInput.value = tanggalHariIni();
  }

  tanggalInput?.addEventListener('change', muatHalamanAbsen);
  document.getElementById('absen-kelas')?.addEventListener('change', muatHalamanAbsen);

  document.getElementById('btn-semua-hadir')?.addEventListener('click', () => {
    const siswaList = getSiswaTersaring();
    if (siswaList.length === 0) {
      tampilkanError('Pilih kelas terlebih dahulu untuk menandai siswa Hadir.');
      return;
    }
    siswaList.forEach((s) => setStatusSiswa(s.nis, 'H'));
    tampilkanSukses(
      'Semua siswa pada kelas ini sudah ditandai Hadir. Jangan lupa tekan Simpan Absen.'
    );
  });

  document.getElementById('btn-simpan-absen')?.addEventListener('click', simpanAbsen);
}
