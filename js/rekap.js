import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFirebaseServices, OperationType, handleFirestoreError } from './firebase.js';
import {
  escapeHtml,
  bulanIni,
  tanggalHariIni,
  formatTanggalIndonesia,
  formatBulanIndonesia,
  getDaftarSiswa,
  getDaftarMapelMaster,
  getPeranPengguna,
  getKelasYangDiizinkan,
  getMapelYangDiizinkan,
  isAdmin,
  tampilkanSukses,
  tampilkanError,
  ambilDanResetRefreshRekap
} from './ui.js';
import { exportRekapAbsenExcel, exportRekapNilaiExcel } from './excel.js';

const KKM_STORAGE_KEY = 'al_furqan_rekap_kkm';

const cacheRekapAbsenPerFilter = new Map();
let cacheRekapAbsen = [];
let cacheAbsensiFallback = [];
let menggunakanFallbackAbsensi = false;
let jumlahDokumenRekapDibaca = 0;

let cacheNilai = [];
let nilaiRekapSudahDimuat = false;
let tabRekapAktif = 'absen';
let kkmSudahDimuatDariServer = false;

function getNilaiKkmSaatIni() {
  const input = document.getElementById('rekap-nilai-kkm');
  const raw = Number(input?.value ?? 75);
  if (Number.isNaN(raw)) return 75;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function predikatNilai(angka) {
  if (angka === null || angka === undefined || angka === '') return 'Belum ada nilai';
  const n = Number(angka);
  if (Number.isNaN(n)) return 'Belum ada nilai';
  if (n >= 90) return 'Sangat Baik';
  if (n >= 80) return 'Baik';
  if (n >= 70) return 'Cukup';
  return 'Perlu Bimbingan';
}

// ==========================================================================
// Pengaturan KKM (Default Sekolah di Firestore pengaturan/kkm + Ubah Langsung)
// ==========================================================================

async function muatKkmAwal() {
  const input = document.getElementById('rekap-nilai-kkm');
  const btnSimpan = document.getElementById('btn-simpan-kkm');
  if (btnSimpan) {
    btnSimpan.hidden = !isAdmin();
  }

  if (kkmSudahDimuatDariServer) return;
  kkmSudahDimuatDariServer = true;

  let kkmTerpilih = 75;
  try {
    const { db } = getFirebaseServices();
    const snap = await getDoc(doc(db, 'pengaturan', 'kkm'));
    if (snap.exists()) {
      const val = Number(snap.data().kkm);
      if (!Number.isNaN(val) && val >= 0 && val <= 100) {
        kkmTerpilih = val;
      }
    } else {
      const savedLocal = window.localStorage.getItem(KKM_STORAGE_KEY);
      if (savedLocal !== null) {
        const valLocal = Number(savedLocal);
        if (!Number.isNaN(valLocal) && valLocal >= 0 && valLocal <= 100) {
          kkmTerpilih = valLocal;
        }
      }
    }
  } catch {
    const savedLocal = window.localStorage.getItem(KKM_STORAGE_KEY);
    if (savedLocal !== null) {
      const valLocal = Number(savedLocal);
      if (!Number.isNaN(valLocal) && valLocal >= 0 && valLocal <= 100) {
        kkmTerpilih = valLocal;
      }
    }
  }

  if (input) {
    input.value = String(kkmTerpilih);
  }
}

async function simpanKkmSekolah() {
  if (!isAdmin()) return;
  const input = document.getElementById('rekap-nilai-kkm');
  const raw = Number(input?.value);

  if (Number.isNaN(raw) || raw < 0 || raw > 100) {
    tampilkanError('Nilai KKM harus berupa angka antara 0 sampai 100.');
    return;
  }

  const kkm = Math.round(raw * 10) / 10;
  const btn = document.getElementById('btn-simpan-kkm');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
  }

  try {
    const { db } = getFirebaseServices();
    await setDoc(doc(db, 'pengaturan', 'kkm'), {
      kkm,
      updatedAt: serverTimestamp()
    });
    window.localStorage.setItem(KKM_STORAGE_KEY, String(kkm));
    tampilkanSukses(`KKM sekolah (${kkm}) berhasil disimpan.`);
    renderRekapNilai();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, 'pengaturan/kkm');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Simpan KKM Sekolah';
    }
  }
}

// ==========================================================================
// Rekap Absen (Hemat Pembacaan Firestore lewat koleksi rekapAbsen)
// ==========================================================================

function isiOpsiTahunAbsen() {
  const select = document.getElementById('rekap-absen-tahun');
  if (!select) return;
  const tahunIni = new Date().getFullYear();
  const prev = select.value;

  select.innerHTML = '';
  [tahunIni - 1, tahunIni, tahunIni + 1].forEach((th) => {
    const opt = document.createElement('option');
    opt.value = String(th);
    opt.textContent = `Tahun ${th}`;
    select.appendChild(opt);
  });

  select.value = prev && Array.from(select.options).some((o) => o.value === prev)
    ? prev
    : String(tahunIni);
}

function getPeriodeAbsenTerpilih() {
  const mode = document.getElementById('rekap-absen-periode')?.value || 'bulan';
  const bulan = document.getElementById('rekap-absen-bulan')?.value || bulanIni();
  const tahun = document.getElementById('rekap-absen-tahun')?.value || String(new Date().getFullYear());

  if (mode === 'ganjil') {
    return {
      mode,
      months: ['07', '08', '09', '10', '11', '12'].map((m) => `${tahun}-${m}`),
      label: `Semester Ganjil ${tahun} (Juli–Desember)`
    };
  }
  if (mode === 'genap') {
    return {
      mode,
      months: ['01', '02', '03', '04', '05', '06'].map((m) => `${tahun}-${m}`),
      label: `Semester Genap ${tahun} (Januari–Juni)`
    };
  }
  return {
    mode: 'bulan',
    months: [bulan],
    label: formatBulanIndonesia(bulan)
  };
}

function sinkronVisibilitasFilterAbsen() {
  const mode = document.getElementById('rekap-absen-periode')?.value || 'bulan';
  const wrapBulan = document.getElementById('wrap-rekap-absen-bulan');
  const wrapTahun = document.getElementById('wrap-rekap-absen-tahun');
  if (wrapBulan) wrapBulan.hidden = mode !== 'bulan';
  if (wrapTahun) wrapTahun.hidden = mode === 'bulan';
}

async function muatDataRekapAbsen(paksaMuatUlang = false) {
  if (ambilDanResetRefreshRekap('absen')) {
    cacheRekapAbsenPerFilter.clear();
  }

  const { db } = getFirebaseServices();
  const role = getPeranPengguna();
  const kelasDiizinkan = getKelasYangDiizinkan();
  const kelasDipilih = document.getElementById('rekap-absen-kelas')?.value || '';
  const { months } = getPeriodeAbsenTerpilih();

  if (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) {
    cacheRekapAbsen = [];
    cacheAbsensiFallback = [];
    menggunakanFallbackAbsensi = false;
    jumlahDokumenRekapDibaca = 0;
    renderRekapAbsen();
    return;
  }

  const targetKelas = kelasDipilih
    ? [kelasDipilih]
    : Array.isArray(kelasDiizinkan)
    ? kelasDiizinkan.slice(0, 30)
    : null;

  const filterKey = `${targetKelas ? targetKelas.join(',') : 'ALL'}|${months.join(',')}`;
  if (!paksaMuatUlang && cacheRekapAbsenPerFilter.has(filterKey)) {
    const tersimpan = cacheRekapAbsenPerFilter.get(filterKey);
    cacheRekapAbsen = tersimpan.rekapDocs;
    cacheAbsensiFallback = tersimpan.fallbackDocs;
    menggunakanFallbackAbsensi = tersimpan.menggunakanFallback;
    jumlahDokumenRekapDibaca = tersimpan.jumlahDibaca;
    renderRekapAbsen();
    return;
  }

  cacheRekapAbsen = [];
  cacheAbsensiFallback = [];
  menggunakanFallbackAbsensi = false;
  jumlahDokumenRekapDibaca = 0;

  try {
    // 1. Baca dari koleksi ringkasan rekapAbsen memakai filter indeks tunggal agar cepat & hemat kuota
    let qRekap;
    if (targetKelas && targetKelas.length === 1) {
      qRekap = query(collection(db, 'rekapAbsen'), where('kelas', '==', targetKelas[0]));
    } else if (targetKelas) {
      qRekap = query(collection(db, 'rekapAbsen'), where('kelas', 'in', targetKelas));
    } else if (role === 'admin' && months.length === 1) {
      qRekap = query(collection(db, 'rekapAbsen'), where('bulan', '==', months[0]));
    } else {
      qRekap = query(collection(db, 'rekapAbsen'), where('bulan', 'in', months));
    }

    const rekapSnap = await getDocs(qRekap);
    const monthsSet = new Set(months);

    rekapSnap.forEach((d) => {
      const data = d.data();
      if (monthsSet.has(data.bulan)) {
        cacheRekapAbsen.push({ id: d.id, ...data });
      }
    });
    jumlahDokumenRekapDibaca = cacheRekapAbsen.length;

    // 2. Fallback ringan: hanya baca absensi jika ringkasan rekapAbsen periode ini belum ada
    if (cacheRekapAbsen.length === 0) {
      const awalBulan = `${months[0]}-01`;
      const akhirBulan = `${months[months.length - 1]}-31`;
      let qAbs;

      if (targetKelas && targetKelas.length === 1) {
        qAbs = query(collection(db, 'absensi'), where('kelas', '==', targetKelas[0]));
      } else if (targetKelas) {
        qAbs = query(collection(db, 'absensi'), where('kelas', 'in', targetKelas));
      } else {
        qAbs = query(
          collection(db, 'absensi'),
          where('tanggal', '>=', awalBulan),
          where('tanggal', '<=', akhirBulan)
        );
      }

      const absSnap = await getDocs(qAbs);
      absSnap.forEach((d) => {
        const data = d.data();
        const ym = String(data.tanggal || '').slice(0, 7);
        if (monthsSet.has(ym)) {
          cacheAbsensiFallback.push({ id: d.id, ...data });
        }
      });
      if (cacheAbsensiFallback.length > 0) {
        menggunakanFallbackAbsensi = true;
      }
    }

    cacheRekapAbsenPerFilter.set(filterKey, {
      rekapDocs: cacheRekapAbsen,
      fallbackDocs: cacheAbsensiFallback,
      menggunakanFallback: menggunakanFallbackAbsensi,
      jumlahDibaca: jumlahDokumenRekapDibaca
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'rekapAbsen');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }

  renderRekapAbsen();
}

function hitungRekapAbsen() {
  const kelas = document.getElementById('rekap-absen-kelas')?.value || '';
  const { months } = getPeriodeAbsenTerpilih();
  const monthsSet = new Set(months);

  const semuaSiswa = getDaftarSiswa();
  const siswaList = kelas ? semuaSiswa.filter((s) => s.kelas === kelas) : semuaSiswa;

  // Indeks dokumen rekapAbsen per kelas
  const rekapPerKelas = new Map();
  cacheRekapAbsen.forEach((docItem) => {
    if (!monthsSet.has(docItem.bulan)) return;
    if (!rekapPerKelas.has(docItem.kelas)) {
      rekapPerKelas.set(docItem.kelas, []);
    }
    rekapPerKelas.get(docItem.kelas).push(docItem.ringkasan || {});
  });

  const rows = siswaList.map((s) => {
    let H = 0;
    let S = 0;
    let I = 0;
    let A = 0;

    const ringkasanList = rekapPerKelas.get(s.kelas) || [];
    if (ringkasanList.length > 0) {
      ringkasanList.forEach((ringkasan) => {
        const entry = ringkasan[s.nis];
        if (entry) {
          H += Number(entry.H || 0);
          S += Number(entry.S || 0);
          I += Number(entry.I || 0);
          A += Number(entry.A || 0);
        }
      });
    } else if (cacheAbsensiFallback.length > 0) {
      cacheAbsensiFallback.forEach((a) => {
        if (a.kelas !== s.kelas) return;
        const ym = String(a.tanggal || '').slice(0, 7);
        if (!monthsSet.has(ym)) return;
        const st = a.records?.[s.nis];
        if (st === 'H') H += 1;
        else if (st === 'S') S += 1;
        else if (st === 'I') I += 1;
        else if (st === 'A') A += 1;
      });
    }

    const total = H + S + I + A;
    const persen = total > 0 ? Math.round((H / total) * 100) : null;
    const kurangDari80 = total > 0 && persen < 80;

    return {
      nis: s.nis,
      nama: s.nama,
      kelas: s.kelas,
      H,
      S,
      I,
      A,
      total,
      persen: persen ?? 0,
      kurangDari80
    };
  });

  const siswaAdaAbsen = rows.filter((r) => r.total > 0);
  const rataPersen =
    siswaAdaAbsen.length > 0
      ? Math.round(siswaAdaAbsen.reduce((acc, r) => acc + r.persen, 0) / siswaAdaAbsen.length)
      : null;
  const siswaKurang80 = rows.filter((r) => r.kurangDari80);

  return {
    rows,
    stats: {
      totalSiswa: rows.length,
      siswaTercatat: siswaAdaAbsen.length,
      rataPersen,
      jumlahKurang80: siswaKurang80.length,
      daftarKurang80: siswaKurang80
    }
  };
}

function renderRekapAbsen() {
  const container = document.getElementById('rekap-absen-container');
  const statsEl = document.getElementById('rekap-absen-stats');
  const warnBanner = document.getElementById('rekap-absen-warn-banner');
  const sourceNoteEl = document.getElementById('rekap-absen-source-note');
  const printHeaderEl = document.getElementById('rekap-absen-print-header');
  if (!container) return;

  const kelas = document.getElementById('rekap-absen-kelas')?.value || '';
  const { label: periodeLabel } = getPeriodeAbsenTerpilih();
  const { rows, stats } = hitungRekapAbsen();

  if (sourceNoteEl) {
    if (menggunakanFallbackAbsensi) {
      sourceNoteEl.textContent =
        'Data dihitung dari catatan absen harian karena ringkasan bulanan belum tersimpan untuk periode ini.';
    } else if (jumlahDokumenRekapDibaca > 0) {
      sourceNoteEl.textContent = `Menampilkan ringkasan absen bulanan (${jumlahDokumenRekapDibaca} berkas ringkasan).`;
    } else {
      sourceNoteEl.textContent =
        'Ringkasan bulanan belum tersedia untuk pilihan kelas dan periode ini.';
    }
  }

  if (statsEl) {
    statsEl.innerHTML =
      rows.length === 0
        ? ''
        : `
      <div class="rekap-stat-card">
        <span class="rekap-stat-label">Jumlah Siswa</span>
        <span class="rekap-stat-value num">${stats.totalSiswa}</span>
        <span class="rekap-stat-sub">${stats.siswaTercatat} siswa punya catatan absen</span>
      </div>
      <div class="rekap-stat-card">
        <span class="rekap-stat-label">Rata-rata Kehadiran</span>
        <span class="rekap-stat-value num">${
          stats.rataPersen !== null ? `${stats.rataPersen}%` : '-'
        }</span>
        <span class="rekap-stat-sub">${escapeHtml(periodeLabel)}</span>
      </div>
      <div class="rekap-stat-card ${stats.jumlahKurang80 > 0 ? 'rekap-stat-card--warn' : ''}">
        <span class="rekap-stat-label">Kehadiran &lt; 80%</span>
        <span class="rekap-stat-value num">${stats.jumlahKurang80} siswa</span>
        <span class="rekap-stat-sub">${
          stats.jumlahKurang80 > 0 ? 'Perlu perhatian wali kelas' : 'Semua baik'
        }</span>
      </div>
      <div class="rekap-stat-card">
        <span class="rekap-stat-label">Kelas Ditampilkan</span>
        <span class="rekap-stat-value">${kelas ? `Kelas ${escapeHtml(kelas)}` : 'Semua'}</span>
        <span class="rekap-stat-sub">Target kehadiran minimal 80%</span>
      </div>
    `;
  }

  if (warnBanner) {
    if (stats.jumlahKurang80 > 0) {
      const contohNama = stats.daftarKurang80
        .slice(0, 5)
        .map((r) => `${r.nama} (${r.persen}%)`)
        .join(', ');
      const sisa =
        stats.jumlahKurang80 > 5 ? ` dan ${stats.jumlahKurang80 - 5} siswa lainnya` : '';
      warnBanner.innerHTML = `<p><strong>Perhatian:</strong> Ada ${stats.jumlahKurang80} siswa dengan kehadiran di bawah 80%: ${escapeHtml(
        contohNama + sisa
      )}.</p>`;
      warnBanner.hidden = false;
    } else {
      warnBanner.hidden = true;
      warnBanner.innerHTML = '';
    }
  }

  if (printHeaderEl) {
    printHeaderEl.innerHTML = `
      <p class="print-school">SMP Muhammadiyah Al Furqan</p>
      <p class="print-title">LAPORAN REKAP KEHADIRAN SISWA</p>
      <p class="print-meta">
        Kelas: ${kelas ? `Kelas ${escapeHtml(kelas)}` : 'Semua Kelas'} &nbsp;|&nbsp;
        Periode: ${escapeHtml(periodeLabel)} &nbsp;|&nbsp;
        Dicetak: ${escapeHtml(formatTanggalIndonesia(tanggalHariIni()))}
      </p>
      <p class="print-meta">
        Rata-rata Kehadiran: ${
          stats.rataPersen !== null ? `${stats.rataPersen}%` : '-'
        } &nbsp;|&nbsp; Kehadiran di bawah 80%: ${stats.jumlahKurang80} siswa
      </p>
    `;
  }

  if (rows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Belum Ada Data Rekap Absen</h2>
        <p class="empty-desc">
          Belum ada data siswa atau catatan absen pada kelas dan periode yang dipilih.
        </p>
      </div>
    `;
    return;
  }

  const cardsHtml = rows
    .map((r) => {
      const badge =
        r.total === 0
          ? '<span class="status-badge status-badge--muted">Belum ada absen</span>'
          : r.kurangDari80
          ? '<span class="status-badge status-badge--warn">Di bawah 80%</span>'
          : '<span class="status-badge status-badge--ok">Baik</span>';

      return `
      <article class="student-card ${r.kurangDari80 ? 'student-card--warn' : ''}">
        <div class="student-card-top">
          <div>
            <h3 class="student-name">${escapeHtml(r.nama)}</h3>
            <p class="student-meta num">NIS ${escapeHtml(r.nis)} · Kelas ${escapeHtml(r.kelas)}</p>
          </div>
          ${badge}
        </div>
        <div class="rekap-metrics-grid">
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Hadir (H)</span>
            <span class="rekap-metric-value">${r.H}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Sakit (S)</span>
            <span class="rekap-metric-value">${r.S}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Izin (I)</span>
            <span class="rekap-metric-value">${r.I}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Alpa (A)</span>
            <span class="rekap-metric-value">${r.A}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Total Hari</span>
            <span class="rekap-metric-value">${r.total}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Kehadiran</span>
            <span class="rekap-metric-value">${r.total > 0 ? `${r.persen}%` : '-'}</span>
          </div>
        </div>
      </article>
    `;
    })
    .join('');

  const tableRowsHtml = rows
    .map((r, idx) => {
      const badge =
        r.total === 0
          ? '<span class="status-badge status-badge--muted">Belum ada data</span>'
          : r.kurangDari80
          ? '<span class="status-badge status-badge--warn">Di bawah 80%</span>'
          : '<span class="status-badge status-badge--ok">Baik</span>';

      return `
      <tr class="${r.kurangDari80 ? 'row-warn' : ''}">
        <td class="td-center">${idx + 1}</td>
        <td class="num">${escapeHtml(r.nis)}</td>
        <td><strong>${escapeHtml(r.nama)}</strong></td>
        <td>Kelas ${escapeHtml(r.kelas)}</td>
        <td class="td-num">${r.H}</td>
        <td class="td-num">${r.S}</td>
        <td class="td-num">${r.I}</td>
        <td class="td-num">${r.A}</td>
        <td class="td-num">${r.total}</td>
        <td class="td-num"><strong>${r.total > 0 ? `${r.persen}%` : '-'}</strong></td>
        <td>${badge}</td>
      </tr>
    `;
    })
    .join('');

  container.innerHTML = `
    <div class="card-list">${cardsHtml}</div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="td-center">No</th>
            <th>NIS</th>
            <th>Nama Siswa</th>
            <th>Kelas</th>
            <th class="td-num">H</th>
            <th class="td-num">S</th>
            <th class="td-num">I</th>
            <th class="td-num">A</th>
            <th class="td-num">Total</th>
            <th class="td-num">Kehadiran</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>
    </div>
    <div class="print-only-header print-sign-row" style="border-bottom:none; margin-top:24px;">
      <div class="print-sign-box">
        <p>Mengetahui,<br />Wali Kelas / Guru</p>
        <div class="print-sign-space"></div>
        <p>( ________________________ )</p>
      </div>
    </div>
  `;
}

// ==========================================================================
// Rekap Nilai (Peringkat, Rata-rata, Tertinggi, Terendah, KKM)
// ==========================================================================

function sinkronDropdownMapelRekap() {
  const select = document.getElementById('rekap-nilai-mapel');
  if (!select) return;

  const prev = select.value;
  const mapelDiizinkan = getMapelYangDiizinkan();
  const mapelSet = new Set([
    ...cacheNilai.map((n) => n.mapel).filter(Boolean),
    ...getDaftarMapelMaster().map((m) => m.nama).filter(Boolean)
  ]);
  if (Array.isArray(mapelDiizinkan)) {
    mapelDiizinkan.forEach((m) => mapelSet.add(m));
  }
  const mapelList = Array.from(mapelSet).sort((a, b) => a.localeCompare(b, 'id'));

  select.innerHTML = '<option value="">Semua Mata Pelajaran</option>';
  mapelList.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });

  if (prev && mapelList.includes(prev)) {
    select.value = prev;
  }
}

function rataRata(arr) {
  const nums = arr
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));
  if (!nums.length) return null;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

async function muatDataRekapNilai(paksaMuatUlang = false) {
  const perluRefresh = ambilDanResetRefreshRekap('nilai');
  if (!paksaMuatUlang && !perluRefresh && nilaiRekapSudahDimuat) {
    sinkronDropdownMapelRekap();
    renderRekapNilai();
    return;
  }

  const { db } = getFirebaseServices();
  const role = getPeranPengguna();
  const kelasDiizinkan = getKelasYangDiizinkan();
  const mapelDiizinkan = getMapelYangDiizinkan();

  if (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) {
    cacheNilai = [];
    nilaiRekapSudahDimuat = true;
    sinkronDropdownMapelRekap();
    renderRekapNilai();
    return;
  }

  try {
    cacheNilai = [];
    if (role === 'admin') {
      const snap = await getDocs(collection(db, 'nilai'));
      snap.forEach((d) => cacheNilai.push({ id: d.id, ...d.data() }));
    } else if (role === 'wali_kelas') {
      const snap = await getDocs(
        query(collection(db, 'nilai'), where('kelas', '==', kelasDiizinkan[0]))
      );
      snap.forEach((d) => cacheNilai.push({ id: d.id, ...d.data() }));
    } else if (Array.isArray(mapelDiizinkan) && mapelDiizinkan.length > 0) {
      const snaps = await Promise.all(
        mapelDiizinkan.map((mapel) =>
          getDocs(
            query(
              collection(db, 'nilai'),
              where('kelas', 'in', kelasDiizinkan.slice(0, 30)),
              where('mapel', '==', mapel)
            )
          )
        )
      );
      snaps.forEach((snap) => {
        snap.forEach((d) => cacheNilai.push({ id: d.id, ...d.data() }));
      });
    }
    nilaiRekapSudahDimuat = true;
    sinkronDropdownMapelRekap();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'nilai');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }

  renderRekapNilai();
}

function hitungRekapNilai() {
  const kelas = document.getElementById('rekap-nilai-kelas')?.value || '';
  const mapel = document.getElementById('rekap-nilai-mapel')?.value || '';
  const semester = document.getElementById('rekap-nilai-semester')?.value || '';
  const urut = document.getElementById('rekap-nilai-urut')?.value || 'rank';
  const kkm = getNilaiKkmSaatIni();

  const semuaSiswa = getDaftarSiswa();
  const siswaList = kelas ? semuaSiswa.filter((s) => s.kelas === kelas) : semuaSiswa;

  const rawRows = siswaList.map((s) => {
    const records = cacheNilai.filter((n) => {
      const cocokSiswa = n.nis === s.nis;
      const cocokMapel = !mapel || n.mapel === mapel;
      const cocokSem = !semester || n.semester === semester;
      return cocokSiswa && cocokMapel && cocokSem;
    });

    if (records.length === 1 && mapel && semester) {
      const rec = records[0];
      const akhirVal =
        rec.akhir !== null && rec.akhir !== undefined && rec.akhir !== '' ? Number(rec.akhir) : null;
      return {
        nis: s.nis,
        nama: s.nama,
        kelas: s.kelas,
        mapel: rec.mapel,
        semester: rec.semester,
        tugas: rec.tugas ?? null,
        uts: rec.uts ?? null,
        uas: rec.uas ?? null,
        akhir: akhirVal,
        predikat: predikatNilai(akhirVal),
        diBawahKkm: akhirVal !== null && akhirVal < kkm,
        peringkat: null
      };
    }

    const tugas = rataRata(records.map((r) => r.tugas));
    const uts = rataRata(records.map((r) => r.uts));
    const uas = rataRata(records.map((r) => r.uas));
    const akhir = rataRata(records.map((r) => r.akhir));

    return {
      nis: s.nis,
      nama: s.nama,
      kelas: s.kelas,
      mapel: mapel || 'Semua Mapel',
      semester: semester || 'Semua',
      tugas,
      uts,
      uas,
      akhir,
      predikat: predikatNilai(akhir),
      diBawahKkm: akhir !== null && akhir < kkm,
      peringkat: null
    };
  });

  // Hitung peringkat (competition ranking: 1, 2, 2, 4) untuk siswa yang sudah punya nilai akhir
  const dinilai = rawRows
    .filter((r) => r.akhir !== null && !Number.isNaN(r.akhir))
    .sort((a, b) => b.akhir - a.akhir || a.nama.localeCompare(b.nama, 'id'));

  let prevNilai = null;
  let prevRank = 0;
  dinilai.forEach((item, idx) => {
    if (prevNilai !== null && item.akhir === prevNilai) {
      item.peringkat = prevRank;
    } else {
      item.peringkat = idx + 1;
      prevRank = item.peringkat;
      prevNilai = item.akhir;
    }
  });

  // Hitung statistik kelas
  let rataRataKelas = null;
  let tertinggi = null;
  let terendah = null;
  let namaTertinggi = '-';
  let namaTerendah = '-';

  if (dinilai.length > 0) {
    const sum = dinilai.reduce((acc, r) => acc + r.akhir, 0);
    rataRataKelas = Math.round((sum / dinilai.length) * 10) / 10;
    tertinggi = dinilai[0].akhir;
    terendah = dinilai[dinilai.length - 1].akhir;
    namaTertinggi = dinilai
      .filter((r) => r.akhir === tertinggi)
      .slice(0, 2)
      .map((r) => r.nama)
      .join(', ');
    namaTerendah = dinilai
      .filter((r) => r.akhir === terendah)
      .slice(0, 2)
      .map((r) => r.nama)
      .join(', ');
  }

  const diBawahKkmList = rawRows.filter((r) => r.diBawahKkm);

  // Urutkan sesuai pilihan guru
  const rows = [...rawRows];
  if (urut === 'rank') {
    rows.sort((a, b) => {
      if (a.peringkat !== null && b.peringkat !== null) {
        if (a.peringkat !== b.peringkat) return a.peringkat - b.peringkat;
        return a.nama.localeCompare(b.nama, 'id');
      }
      if (a.peringkat !== null) return -1;
      if (b.peringkat !== null) return 1;
      return a.nama.localeCompare(b.nama, 'id');
    });
  } else {
    rows.sort((a, b) => {
      const cmpK = String(a.kelas).localeCompare(String(b.kelas), 'id');
      if (cmpK !== 0) return cmpK;
      return a.nama.localeCompare(b.nama, 'id');
    });
  }

  return {
    rows,
    kkm,
    stats: {
      totalSiswa: rows.length,
      jumlahDinilai: dinilai.length,
      rataRata: rataRataKelas,
      tertinggi,
      terendah,
      namaTertinggi,
      namaTerendah,
      jumlahDiBawahKkm: diBawahKkmList.length,
      daftarDiBawahKkm: diBawahKkmList
    }
  };
}

function renderRekapNilai() {
  const container = document.getElementById('rekap-nilai-container');
  const statsEl = document.getElementById('rekap-nilai-stats');
  const kkmBanner = document.getElementById('rekap-nilai-kkm-banner');
  const printHeaderEl = document.getElementById('rekap-nilai-print-header');
  if (!container) return;

  const kelas = document.getElementById('rekap-nilai-kelas')?.value || '';
  const mapel = document.getElementById('rekap-nilai-mapel')?.value || '';
  const semester = document.getElementById('rekap-nilai-semester')?.value || '';

  const { rows, kkm, stats } = hitungRekapNilai();

  if (statsEl) {
    statsEl.innerHTML =
      rows.length === 0
        ? ''
        : `
      <div class="rekap-stat-card">
        <span class="rekap-stat-label">Rata-rata Kelas</span>
        <span class="rekap-stat-value num">${stats.rataRata !== null ? stats.rataRata : '-'}</span>
        <span class="rekap-stat-sub">Dari ${stats.jumlahDinilai} siswa dinilai</span>
      </div>
      <div class="rekap-stat-card">
        <span class="rekap-stat-label">Nilai Tertinggi</span>
        <span class="rekap-stat-value num">${stats.tertinggi !== null ? stats.tertinggi : '-'}</span>
        <span class="rekap-stat-sub">${escapeHtml(stats.namaTertinggi)}</span>
      </div>
      <div class="rekap-stat-card">
        <span class="rekap-stat-label">Nilai Terendah</span>
        <span class="rekap-stat-value num">${stats.terendah !== null ? stats.terendah : '-'}</span>
        <span class="rekap-stat-sub">${escapeHtml(stats.namaTerendah)}</span>
      </div>
      <div class="rekap-stat-card ${stats.jumlahDiBawahKkm > 0 ? 'rekap-stat-card--danger' : ''}">
        <span class="rekap-stat-label">Di Bawah KKM (${kkm})</span>
        <span class="rekap-stat-value num">${stats.jumlahDiBawahKkm} siswa</span>
        <span class="rekap-stat-sub">${
          stats.jumlahDiBawahKkm > 0 ? 'Perlu remedial / bimbingan' : 'Semua nilai tuntas'
        }</span>
      </div>
    `;
  }

  if (kkmBanner) {
    if (stats.jumlahDiBawahKkm > 0) {
      const contoh = stats.daftarDiBawahKkm
        .slice(0, 6)
        .map((r) => `${r.nama} (${r.akhir})`)
        .join(', ');
      const sisa =
        stats.jumlahDiBawahKkm > 6 ? ` dan ${stats.jumlahDiBawahKkm - 6} siswa lainnya` : '';
      kkmBanner.innerHTML = `<p><strong>Siswa di bawah KKM (${kkm}):</strong> ${escapeHtml(
        contoh + sisa
      )}.</p>`;
      kkmBanner.hidden = false;
    } else {
      kkmBanner.hidden = true;
      kkmBanner.innerHTML = '';
    }
  }

  if (printHeaderEl) {
    printHeaderEl.innerHTML = `
      <p class="print-school">SMP Muhammadiyah Al Furqan</p>
      <p class="print-title">LAPORAN REKAP NILAI SISWA</p>
      <p class="print-meta">
        Kelas: ${kelas ? `Kelas ${escapeHtml(kelas)}` : 'Semua Kelas'} &nbsp;|&nbsp;
        Mapel: ${escapeHtml(mapel || 'Semua Mata Pelajaran')} &nbsp;|&nbsp;
        Semester: ${escapeHtml(semester || 'Semua Semester')} &nbsp;|&nbsp;
        KKM: ${kkm}
      </p>
      <p class="print-meta">
        Rata-rata: ${stats.rataRata !== null ? stats.rataRata : '-'} &nbsp;|&nbsp;
        Tertinggi: ${stats.tertinggi !== null ? stats.tertinggi : '-'} &nbsp;|&nbsp;
        Terendah: ${stats.terendah !== null ? stats.terendah : '-'} &nbsp;|&nbsp;
        Di Bawah KKM: ${stats.jumlahDiBawahKkm} siswa &nbsp;|&nbsp;
        Dicetak: ${escapeHtml(formatTanggalIndonesia(tanggalHariIni()))}
      </p>
    `;
  }

  if (rows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Belum Ada Data Rekap Nilai</h2>
        <p class="empty-desc">
          Belum ada data siswa atau nilai pada kelas yang dipilih.
        </p>
      </div>
    `;
    return;
  }

  const tampilAngka = (val) => (val === null || val === undefined ? '-' : String(val));

  const cardsHtml = rows
    .map((r) => {
      const kkmBadge =
        r.akhir === null
          ? '<span class="status-badge status-badge--muted">Belum dinilai</span>'
          : r.diBawahKkm
          ? `<span class="status-badge status-badge--danger">Di Bawah KKM (&lt; ${kkm})</span>`
          : '<span class="status-badge status-badge--ok">Tuntas</span>';
      const rankChip =
        r.peringkat !== null ? `<span class="rank-badge">#${r.peringkat}</span>` : '';

      return `
      <article class="student-card ${r.diBawahKkm ? 'student-card--error' : ''}">
        <div class="student-card-top">
          <div>
            <h3 class="student-name">${rankChip} ${escapeHtml(r.nama)}</h3>
            <p class="student-meta num">
              NIS ${escapeHtml(r.nis)} · Kelas ${escapeHtml(r.kelas)} · ${escapeHtml(r.predikat)}
            </p>
          </div>
          ${kkmBadge}
        </div>
        <div class="rekap-metrics-grid">
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Tugas</span>
            <span class="rekap-metric-value">${tampilAngka(r.tugas)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">UTS</span>
            <span class="rekap-metric-value">${tampilAngka(r.uts)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">UAS</span>
            <span class="rekap-metric-value">${tampilAngka(r.uas)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Nilai Akhir</span>
            <span class="rekap-metric-value">${tampilAngka(r.akhir)}</span>
          </div>
        </div>
      </article>
    `;
    })
    .join('');

  const tableRowsHtml = rows
    .map((r) => {
      const kkmBadge =
        r.akhir === null
          ? '<span class="status-badge status-badge--muted">Belum dinilai</span>'
          : r.diBawahKkm
          ? `<span class="status-badge status-badge--danger">Di Bawah KKM</span>`
          : '<span class="status-badge status-badge--ok">Tuntas</span>';

      return `
      <tr class="${r.diBawahKkm ? 'row-error' : ''}">
        <td class="td-center num">
          ${r.peringkat !== null ? `<span class="rank-badge">${r.peringkat}</span>` : '-'}
        </td>
        <td class="num">${escapeHtml(r.nis)}</td>
        <td><strong>${escapeHtml(r.nama)}</strong></td>
        <td>Kelas ${escapeHtml(r.kelas)}</td>
        <td class="td-num">${tampilAngka(r.tugas)}</td>
        <td class="td-num">${tampilAngka(r.uts)}</td>
        <td class="td-num">${tampilAngka(r.uas)}</td>
        <td class="td-num"><strong>${tampilAngka(r.akhir)}</strong></td>
        <td>${escapeHtml(r.predikat)}</td>
        <td>${kkmBadge}</td>
      </tr>
    `;
    })
    .join('');

  container.innerHTML = `
    <div class="card-list">${cardsHtml}</div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="td-center">Peringkat</th>
            <th>NIS</th>
            <th>Nama Siswa</th>
            <th>Kelas</th>
            <th class="td-num">Tugas</th>
            <th class="td-num">UTS</th>
            <th class="td-num">UAS</th>
            <th class="td-num">Akhir</th>
            <th>Predikat</th>
            <th>Status KKM (${kkm})</th>
          </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>
    </div>
    <div class="print-only-header print-sign-row" style="border-bottom:none; margin-top:24px;">
      <div class="print-sign-box">
        <p>Mengetahui,<br />Guru Mata Pelajaran / Wali Kelas</p>
        <div class="print-sign-space"></div>
        <p>( ________________________ )</p>
      </div>
    </div>
  `;
}

// ==========================================================================
// Tab Switching, Muat Halaman, Ekspor Excel, & Cetak
// ==========================================================================

function aturTabRekap(tab) {
  tabRekapAktif = tab;
  const tabAbsen = document.getElementById('tab-rekap-absen');
  const tabNilai = document.getElementById('tab-rekap-nilai');
  const panelAbsen = document.getElementById('panel-rekap-absen');
  const panelNilai = document.getElementById('panel-rekap-nilai');

  if (tabAbsen) {
    tabAbsen.classList.toggle('is-active', tab === 'absen');
    tabAbsen.setAttribute('aria-selected', String(tab === 'absen'));
  }
  if (tabNilai) {
    tabNilai.classList.toggle('is-active', tab === 'nilai');
    tabNilai.setAttribute('aria-selected', String(tab === 'nilai'));
  }
  if (panelAbsen) panelAbsen.hidden = tab !== 'absen';
  if (panelNilai) panelNilai.hidden = tab !== 'nilai';
}

export async function muatHalamanRekap() {
  await muatKkmAwal();
  if (tabRekapAktif === 'absen') {
    await muatDataRekapAbsen();
  } else {
    await muatDataRekapNilai();
  }
}

export function initHalamanRekap() {
  const bulanInput = document.getElementById('rekap-absen-bulan');
  if (bulanInput && !bulanInput.value) {
    bulanInput.value = bulanIni();
  }
  isiOpsiTahunAbsen();
  sinkronVisibilitasFilterAbsen();

  document.getElementById('tab-rekap-absen')?.addEventListener('click', () => {
    aturTabRekap('absen');
    muatDataRekapAbsen();
  });

  document.getElementById('tab-rekap-nilai')?.addEventListener('click', () => {
    aturTabRekap('nilai');
    muatDataRekapNilai();
  });

  // Filter Rekap Absen: memuat ulang dari cache atau ringkasan bulanan
  document.getElementById('btn-refresh-rekap-absen')?.addEventListener('click', () => {
    muatDataRekapAbsen(true);
  });
  document.getElementById('rekap-absen-kelas')?.addEventListener('change', () => muatDataRekapAbsen());
  document.getElementById('rekap-absen-periode')?.addEventListener('change', () => {
    sinkronVisibilitasFilterAbsen();
    muatDataRekapAbsen();
  });
  document.getElementById('rekap-absen-bulan')?.addEventListener('change', () => muatDataRekapAbsen());
  document.getElementById('rekap-absen-tahun')?.addEventListener('change', () => muatDataRekapAbsen());

  // Filter Rekap Nilai
  document.getElementById('rekap-nilai-kelas')?.addEventListener('change', renderRekapNilai);
  document.getElementById('rekap-nilai-mapel')?.addEventListener('change', renderRekapNilai);
  document.getElementById('rekap-nilai-semester')?.addEventListener('change', renderRekapNilai);
  document.getElementById('rekap-nilai-urut')?.addEventListener('change', renderRekapNilai);
  document.getElementById('rekap-nilai-kkm')?.addEventListener('input', () => {
    const val = getNilaiKkmSaatIni();
    window.localStorage.setItem(KKM_STORAGE_KEY, String(val));
    renderRekapNilai();
  });
  document.getElementById('btn-simpan-kkm')?.addEventListener('click', simpanKkmSekolah);

  // Unduh Excel Rekap Absen
  document.getElementById('btn-export-rekap-absen')?.addEventListener('click', () => {
    try {
      const { rows, stats } = hitungRekapAbsen();
      if (!rows.length) {
        tampilkanError('Belum ada data siswa untuk diunduh ke Excel.');
        return;
      }
      const kelas = document.getElementById('rekap-absen-kelas')?.value || '';
      const { label: periodeLabel } = getPeriodeAbsenTerpilih();
      const fileName = exportRekapAbsenExcel({
        rows,
        kelasLabel: kelas ? `Kelas ${kelas}` : 'Semua Kelas',
        periodeLabel,
        stats
      });
      tampilkanSukses(`File Excel "${fileName}" berhasil diunduh.`);
    } catch (err) {
      tampilkanError(err.message);
    }
  });

  // Cetak Rekap Absen
  document.getElementById('btn-cetak-rekap-absen')?.addEventListener('click', () => {
    const { rows } = hitungRekapAbsen();
    if (!rows.length) {
      tampilkanError('Belum ada data Rekap Absen untuk dicetak.');
      return;
    }
    window.print();
  });

  // Unduh Excel Rekap Nilai
  document.getElementById('btn-export-rekap-nilai')?.addEventListener('click', () => {
    try {
      const { rows, kkm, stats } = hitungRekapNilai();
      if (!rows.length) {
        tampilkanError('Belum ada data siswa untuk diunduh ke Excel.');
        return;
      }
      const kelas = document.getElementById('rekap-nilai-kelas')?.value || '';
      const mapel = document.getElementById('rekap-nilai-mapel')?.value || '';
      const semester = document.getElementById('rekap-nilai-semester')?.value || '';
      const fileName = exportRekapNilaiExcel({
        rows,
        kelasLabel: kelas ? `Kelas ${kelas}` : 'Semua Kelas',
        mapelLabel: mapel || 'Semua Mata Pelajaran',
        semesterLabel: semester || 'Semua Semester',
        kkm,
        stats
      });
      tampilkanSukses(`File Excel "${fileName}" berhasil diunduh.`);
    } catch (err) {
      tampilkanError(err.message);
    }
  });

  // Cetak Rekap Nilai
  document.getElementById('btn-cetak-rekap-nilai')?.addEventListener('click', () => {
    const { rows } = hitungRekapNilai();
    if (!rows.length) {
      tampilkanError('Belum ada data Rekap Nilai untuk dicetak.');
      return;
    }
    window.print();
  });

  aturTabRekap(tabRekapAktif);
}
