import {
  collection,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFirebaseServices, OperationType, handleFirestoreError } from './firebase.js';
import {
  escapeHtml,
  bulanIni,
  formatBulanIndonesia,
  getDaftarSiswa,
  getPeranPengguna,
  getKelasYangDiizinkan,
  getMapelYangDiizinkan,
  tampilkanSukses,
  tampilkanError
} from './ui.js';
import { exportRekapAbsenExcel, exportRekapNilaiExcel } from './excel.js';

let cacheAbsensi = [];
let cacheNilai = [];
let tabRekapAktif = 'absen';

function rataRata(arr) {
  if (!arr.length) return null;
  const sum = arr.reduce((acc, v) => acc + Number(v || 0), 0);
  return Math.round((sum / arr.length) * 10) / 10;
}

function predikatNilai(angka) {
  if (angka === null || angka === undefined) return 'Belum ada nilai';
  if (angka >= 90) return 'Sangat Baik';
  if (angka >= 80) return 'Baik';
  if (angka >= 70) return 'Cukup';
  return 'Perlu Bimbingan';
}

function hitungRekapAbsen() {
  const kelas = document.getElementById('rekap-absen-kelas')?.value || '';
  const bulan = document.getElementById('rekap-absen-bulan')?.value || '';

  const semuaSiswa = getDaftarSiswa();
  const siswaList = kelas ? semuaSiswa.filter((s) => s.kelas === kelas) : semuaSiswa;

  return siswaList.map((s) => {
    const records = cacheAbsensi.filter((a) => {
      const cocokSiswa = a.siswaId === s.id;
      const cocokBulan = !bulan || String(a.tanggal || '').startsWith(bulan);
      return cocokSiswa && cocokBulan;
    });

    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let alpa = 0;

    records.forEach((r) => {
      if (r.status === 'Hadir') hadir += 1;
      else if (r.status === 'Sakit') sakit += 1;
      else if (r.status === 'Izin') izin += 1;
      else if (r.status === 'Alpa') alpa += 1;
    });

    const total = hadir + sakit + izin + alpa;
    const persen = total > 0 ? Math.round((hadir / total) * 100) : 0;

    return {
      id: s.id,
      nis: s.nis,
      nama: s.nama,
      kelas: s.kelas,
      hadir,
      sakit,
      izin,
      alpa,
      total,
      persen
    };
  });
}

function renderRekapAbsen() {
  const container = document.getElementById('rekap-absen-container');
  if (!container) return;

  const rows = hitungRekapAbsen();
  if (rows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Belum Ada Data Rekap Absen</h2>
        <p class="empty-desc">
          Belum ada data siswa atau catatan absen pada kelas yang dipilih.
        </p>
      </div>
    `;
    return;
  }

  const cardsHtml = rows
    .map(
      (r) => `
      <article class="student-card">
        <div>
          <h3 class="student-name">${escapeHtml(r.nama)}</h3>
          <p class="student-meta num">NIS ${escapeHtml(r.nis)} · Kelas ${escapeHtml(r.kelas)}</p>
        </div>
        <div class="rekap-metrics-grid">
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Hadir</span>
            <span class="rekap-metric-value">${r.hadir}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Sakit</span>
            <span class="rekap-metric-value">${r.sakit}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Izin</span>
            <span class="rekap-metric-value">${r.izin}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Alpa</span>
            <span class="rekap-metric-value">${r.alpa}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Total Hari</span>
            <span class="rekap-metric-value">${r.total}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Kehadiran</span>
            <span class="rekap-metric-value">${r.persen}%</span>
          </div>
        </div>
      </article>
    `
    )
    .join('');

  const tableRowsHtml = rows
    .map(
      (r, idx) => `
      <tr>
        <td class="td-center">${idx + 1}</td>
        <td class="num">${escapeHtml(r.nis)}</td>
        <td><strong>${escapeHtml(r.nama)}</strong></td>
        <td>Kelas ${escapeHtml(r.kelas)}</td>
        <td class="td-num">${r.hadir}</td>
        <td class="td-num">${r.sakit}</td>
        <td class="td-num">${r.izin}</td>
        <td class="td-num">${r.alpa}</td>
        <td class="td-num">${r.total}</td>
        <td class="td-num"><strong>${r.persen}%</strong></td>
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
            <th>Nama Siswa</th>
            <th>Kelas</th>
            <th class="td-num">Hadir</th>
            <th class="td-num">Sakit</th>
            <th class="td-num">Izin</th>
            <th class="td-num">Alpa</th>
            <th class="td-num">Total</th>
            <th class="td-num">Kehadiran</th>
          </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>
    </div>
  `;
}

function sinkronDropdownMapelRekap() {
  const select = document.getElementById('rekap-nilai-mapel');
  if (!select) return;

  const prev = select.value;
  const mapelDiizinkan = getMapelYangDiizinkan();
  const mapelSet = new Set(cacheNilai.map((n) => n.mapel).filter(Boolean));
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

function hitungRekapNilai() {
  const kelas = document.getElementById('rekap-nilai-kelas')?.value || '';
  const mapel = document.getElementById('rekap-nilai-mapel')?.value || '';

  const semuaSiswa = getDaftarSiswa();
  const siswaList = kelas ? semuaSiswa.filter((s) => s.kelas === kelas) : semuaSiswa;

  return siswaList.map((s) => {
    const records = cacheNilai.filter((n) => {
      const cocokSiswa = n.siswaId === s.id;
      const cocokMapel = !mapel || n.mapel === mapel;
      return cocokSiswa && cocokMapel;
    });

    const tugas = records.filter((r) => r.jenis === 'Tugas').map((r) => r.skor);
    const uh = records.filter((r) => r.jenis === 'UH').map((r) => r.skor);
    const pts = records.filter((r) => r.jenis === 'PTS').map((r) => r.skor);
    const pas = records.filter((r) => r.jenis === 'PAS').map((r) => r.skor);
    const praktik = records.filter((r) => r.jenis === 'Praktik').map((r) => r.skor);
    const semuaSkor = records.map((r) => r.skor);

    const rataTugas = rataRata(tugas);
    const rataUH = rataRata(uh);
    const rataPTS = rataRata(pts);
    const rataPAS = rataRata(pas);
    const rataPraktik = rataRata(praktik);
    const nilaiAkhir = rataRata(semuaSkor);

    return {
      id: s.id,
      nis: s.nis,
      nama: s.nama,
      kelas: s.kelas,
      rataTugas,
      rataUH,
      rataPTS,
      rataPAS,
      rataPraktik,
      nilaiAkhir,
      predikat: predikatNilai(nilaiAkhir)
    };
  });
}

function renderRekapNilai() {
  const container = document.getElementById('rekap-nilai-container');
  if (!container) return;

  const rows = hitungRekapNilai();
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
    .map(
      (r) => `
      <article class="student-card">
        <div>
          <h3 class="student-name">${escapeHtml(r.nama)}</h3>
          <p class="student-meta num">
            NIS ${escapeHtml(r.nis)} · Kelas ${escapeHtml(r.kelas)} · ${escapeHtml(r.predikat)}
          </p>
        </div>
        <div class="rekap-metrics-grid">
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Tugas</span>
            <span class="rekap-metric-value">${tampilAngka(r.rataTugas)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">UH</span>
            <span class="rekap-metric-value">${tampilAngka(r.rataUH)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">PTS</span>
            <span class="rekap-metric-value">${tampilAngka(r.rataPTS)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">PAS</span>
            <span class="rekap-metric-value">${tampilAngka(r.rataPAS)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Praktik</span>
            <span class="rekap-metric-value">${tampilAngka(r.rataPraktik)}</span>
          </div>
          <div class="rekap-metric-item">
            <span class="rekap-metric-label">Nilai Akhir</span>
            <span class="rekap-metric-value">${tampilAngka(r.nilaiAkhir)}</span>
          </div>
        </div>
      </article>
    `
    )
    .join('');

  const tableRowsHtml = rows
    .map(
      (r, idx) => `
      <tr>
        <td class="td-center">${idx + 1}</td>
        <td class="num">${escapeHtml(r.nis)}</td>
        <td><strong>${escapeHtml(r.nama)}</strong></td>
        <td>Kelas ${escapeHtml(r.kelas)}</td>
        <td class="td-num">${tampilAngka(r.rataTugas)}</td>
        <td class="td-num">${tampilAngka(r.rataUH)}</td>
        <td class="td-num">${tampilAngka(r.rataPTS)}</td>
        <td class="td-num">${tampilAngka(r.rataPAS)}</td>
        <td class="td-num">${tampilAngka(r.rataPraktik)}</td>
        <td class="td-num"><strong>${tampilAngka(r.nilaiAkhir)}</strong></td>
        <td>${escapeHtml(r.predikat)}</td>
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
            <th>Nama Siswa</th>
            <th>Kelas</th>
            <th class="td-num">Tugas</th>
            <th class="td-num">UH</th>
            <th class="td-num">PTS</th>
            <th class="td-num">PAS</th>
            <th class="td-num">Praktik</th>
            <th class="td-num">Akhir</th>
            <th>Predikat</th>
          </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>
    </div>
  `;
}

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
  const { db } = getFirebaseServices();
  const role = getPeranPengguna();
  const kelasDiizinkan = getKelasYangDiizinkan();
  const mapelDiizinkan = getMapelYangDiizinkan();

  if (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) {
    cacheAbsensi = [];
    cacheNilai = [];
    sinkronDropdownMapelRekap();
    renderRekapAbsen();
    renderRekapNilai();
    return;
  }

  try {
    cacheAbsensi = [];
    cacheNilai = [];

    if (role === 'admin') {
      const [absSnap, nilSnap] = await Promise.all([
        getDocs(collection(db, 'absensi')),
        getDocs(collection(db, 'nilai'))
      ]);
      absSnap.forEach((d) => cacheAbsensi.push({ id: d.id, ...d.data() }));
      nilSnap.forEach((d) => cacheNilai.push({ id: d.id, ...d.data() }));
    } else if (role === 'wali_kelas') {
      const waliKelas = kelasDiizinkan[0];
      const [absSnap, nilSnap] = await Promise.all([
        getDocs(query(collection(db, 'absensi'), where('kelas', '==', waliKelas))),
        getDocs(query(collection(db, 'nilai'), where('kelas', '==', waliKelas)))
      ]);
      absSnap.forEach((d) => cacheAbsensi.push({ id: d.id, ...d.data() }));
      nilSnap.forEach((d) => cacheNilai.push({ id: d.id, ...d.data() }));
    } else {
      // Guru: baca absensi & nilai hanya untuk kelas & mapel yang diajar
      const absPromise = getDocs(
        query(collection(db, 'absensi'), where('kelas', 'in', kelasDiizinkan.slice(0, 30)))
      );
      const nilPromises = Array.isArray(mapelDiizinkan) && mapelDiizinkan.length > 0
        ? mapelDiizinkan.map((mapel) =>
            getDocs(
              query(
                collection(db, 'nilai'),
                where('kelas', 'in', kelasDiizinkan.slice(0, 30)),
                where('mapel', '==', mapel)
              )
            )
          )
        : [];

      const [absSnap, ...nilSnaps] = await Promise.all([absPromise, ...nilPromises]);
      absSnap.forEach((d) => cacheAbsensi.push({ id: d.id, ...d.data() }));
      nilSnaps.forEach((snap) => {
        snap.forEach((d) => cacheNilai.push({ id: d.id, ...d.data() }));
      });
    }

    sinkronDropdownMapelRekap();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'rekap');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }

  renderRekapAbsen();
  renderRekapNilai();
}

export function initHalamanRekap() {
  const bulanInput = document.getElementById('rekap-absen-bulan');
  if (bulanInput && !bulanInput.value) {
    bulanInput.value = bulanIni();
  }

  document.getElementById('tab-rekap-absen')?.addEventListener('click', () => aturTabRekap('absen'));
  document.getElementById('tab-rekap-nilai')?.addEventListener('click', () => aturTabRekap('nilai'));

  document.getElementById('rekap-absen-kelas')?.addEventListener('change', renderRekapAbsen);
  document.getElementById('rekap-absen-bulan')?.addEventListener('change', renderRekapAbsen);
  document.getElementById('rekap-nilai-kelas')?.addEventListener('change', renderRekapNilai);
  document.getElementById('rekap-nilai-mapel')?.addEventListener('change', renderRekapNilai);

  document.getElementById('btn-export-rekap-absen')?.addEventListener('click', () => {
    try {
      const rows = hitungRekapAbsen();
      if (!rows.length) {
        tampilkanError('Belum ada data siswa untuk diunduh ke Excel.');
        return;
      }
      const kelas = document.getElementById('rekap-absen-kelas')?.value || '';
      const bulan = document.getElementById('rekap-absen-bulan')?.value || '';
      const fileName = exportRekapAbsenExcel({
        rows,
        kelasLabel: kelas ? `Kelas ${kelas}` : 'Semua Kelas',
        periodeLabel: formatBulanIndonesia(bulan)
      });
      tampilkanSukses(`File Excel "${fileName}" berhasil diunduh.`);
    } catch (err) {
      tampilkanError(err.message);
    }
  });

  document.getElementById('btn-export-rekap-nilai')?.addEventListener('click', () => {
    try {
      const rows = hitungRekapNilai();
      if (!rows.length) {
        tampilkanError('Belum ada data siswa untuk diunduh ke Excel.');
        return;
      }
      const kelas = document.getElementById('rekap-nilai-kelas')?.value || '';
      const mapel = document.getElementById('rekap-nilai-mapel')?.value || '';
      const fileName = exportRekapNilaiExcel({
        rows,
        kelasLabel: kelas ? `Kelas ${kelas}` : 'Semua Kelas',
        mapelLabel: mapel || 'Semua Mata Pelajaran'
      });
      tampilkanSukses(`File Excel "${fileName}" berhasil diunduh.`);
    } catch (err) {
      tampilkanError(err.message);
    }
  });

  aturTabRekap(tabRekapAktif);
}
