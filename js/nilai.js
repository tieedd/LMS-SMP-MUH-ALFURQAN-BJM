import {
  collection,
  getDocs,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFirebaseServices, OperationType, handleFirestoreError } from './firebase.js';
import {
  DAFTAR_MAPEL_STANDAR,
  escapeHtml,
  tanggalHariIni,
  formatTanggalIndonesia,
  getDaftarSiswa,
  getKelasYangDiizinkan,
  getMapelYangDiizinkan,
  isAdmin,
  tampilkanSukses,
  tampilkanError,
  konfirmasiAksi,
  aturMenuAktif,
  isiDataContohSiswa
} from './ui.js';

let semuaNilaiCache = [];
let nilaiDraft = new Map(); // siswaId -> { skor, catatan, docId }

function sinkronkanDropdownMapelInput() {
  const select = document.getElementById('nilai-mapel');
  const groupCustom = document.getElementById('group-nilai-mapel-custom');
  if (!select) return;

  const prev = select.value;
  const mapelDiizinkan = getMapelYangDiizinkan();
  select.innerHTML = '';

  if (Array.isArray(mapelDiizinkan)) {
    if (mapelDiizinkan.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Belum ada mapel yang diampu';
      select.appendChild(opt);
    } else {
      mapelDiizinkan.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      });
    }
    if (groupCustom) groupCustom.hidden = true;
    if (prev && mapelDiizinkan.includes(prev)) {
      select.value = prev;
    }
    return;
  }

  // Untuk Admin: tampilkan semua mapel standar + opsi lainnya
  DAFTAR_MAPEL_STANDAR.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });

  const optCustom = document.createElement('option');
  optCustom.value = '__lainnya__';
  optCustom.textContent = 'Mata Pelajaran Lainnya...';
  select.appendChild(optCustom);

  if (prev && (DAFTAR_MAPEL_STANDAR.includes(prev) || prev === '__lainnya__')) {
    select.value = prev;
  }
  if (groupCustom) {
    groupCustom.hidden = select.value !== '__lainnya__';
  }
}

function getMapelAktif() {
  const select = document.getElementById('nilai-mapel');
  const custom = document.getElementById('nilai-mapel-custom');
  if (!select) return '';
  if (select.value === '__lainnya__') {
    return (custom?.value || '').trim();
  }
  return select.value;
}

function getSiswaKelasNilai() {
  const kelas = document.getElementById('nilai-kelas')?.value || '';
  const semua = getDaftarSiswa();
  return kelas ? semua.filter((s) => s.kelas === kelas) : [];
}

function hitungPredikatSingkat(skorStr) {
  if (skorStr === '' || skorStr === null || skorStr === undefined) return '-';
  const angka = Number(skorStr);
  if (Number.isNaN(angka)) return '-';
  if (angka >= 90) return 'A (Sangat Baik)';
  if (angka >= 80) return 'B (Baik)';
  if (angka >= 70) return 'C (Cukup)';
  return 'D (Perlu Bimbingan)';
}

function sinkronInputNilai(siswaId, field, value) {
  const prev = nilaiDraft.get(siswaId) || { skor: '', catatan: '', docId: null };
  nilaiDraft.set(siswaId, { ...prev, [field]: value });

  if (field === 'skor') {
    document
      .querySelectorAll(`input[data-nilai-skor="${CSS.escape(siswaId)}"]`)
      .forEach((input) => {
        if (input.value !== value) input.value = value;
      });
    document
      .querySelectorAll(`[data-nilai-predikat="${CSS.escape(siswaId)}"]`)
      .forEach((el) => {
        el.textContent = hitungPredikatSingkat(value);
      });
  } else {
    document
      .querySelectorAll(`input[data-nilai-catatan="${CSS.escape(siswaId)}"]`)
      .forEach((input) => {
        if (input.value !== value) input.value = value;
      });
  }
}

function renderInputNilai() {
  const container = document.getElementById('nilai-container');
  const saveBar = document.getElementById('nilai-save-bar');
  if (!container) return;

  const kelasDiizinkan = getKelasYangDiizinkan();
  const mapelDiizinkan = getMapelYangDiizinkan();

  if (
    (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) ||
    (Array.isArray(mapelDiizinkan) && mapelDiizinkan.length === 0)
  ) {
    if (saveBar) saveBar.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Kelas atau Mata Pelajaran Belum Diatur</h2>
        <p class="empty-desc">
          Admin sekolah belum mengatur kelas yang diajar atau mata pelajaran yang Anda ampu. Silakan
          hubungi Admin SMP Muhammadiyah Al Furqan.
        </p>
      </div>
    `;
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
            Tambahkan siswa terlebih dahulu di menu Data Siswa agar Anda dapat menginput nilai mereka.
          </p>
          <div class="empty-actions">
            <button type="button" id="btn-nilai-ke-siswa" class="btn btn-primary">
              Buka Menu Data Siswa
            </button>
            <button type="button" id="btn-nilai-contoh" class="btn btn-secondary">
              Isi 10 Siswa Contoh
            </button>
          </div>
        </div>
      `;
      container
        .querySelector('#btn-nilai-ke-siswa')
        ?.addEventListener('click', () => aturMenuAktif('siswa'));
      container
        .querySelector('#btn-nilai-contoh')
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
    return;
  }

  const siswaList = getSiswaKelasNilai();
  if (siswaList.length === 0) {
    if (saveBar) saveBar.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Pilih Kelas Terlebih Dahulu</h2>
        <p class="empty-desc">
          Pilih salah satu kelas pada kotak di atas untuk menampilkan daftar siswa dan mengisi nilai.
        </p>
      </div>
    `;
    return;
  }

  if (saveBar) saveBar.hidden = false;

  const cardsHtml = siswaList
    .map((s) => {
      const draft = nilaiDraft.get(s.id) || { skor: '', catatan: '' };
      return `
        <article class="student-card">
          <div class="student-card-top">
            <div>
              <h3 class="student-name">${escapeHtml(s.nama)}</h3>
              <p class="student-meta num">
                NIS ${escapeHtml(s.nis)} · Kelas ${escapeHtml(s.kelas)} ·
                <span data-nilai-predikat="${escapeHtml(s.id)}">${escapeHtml(
        hitungPredikatSingkat(draft.skor)
      )}</span>
              </p>
            </div>
          </div>
          <div class="nilai-card-row">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              class="form-input score-input"
              data-nilai-skor="${escapeHtml(s.id)}"
              placeholder="0 - 100"
              value="${escapeHtml(draft.skor)}"
            />
            <input
              type="text"
              class="form-input note-input-sm"
              data-nilai-catatan="${escapeHtml(s.id)}"
              placeholder="Catatan nilai (opsional)"
              maxlength="200"
              value="${escapeHtml(draft.catatan)}"
            />
          </div>
        </article>
      `;
    })
    .join('');

  const rowsHtml = siswaList
    .map((s, idx) => {
      const draft = nilaiDraft.get(s.id) || { skor: '', catatan: '' };
      return `
        <tr>
          <td class="td-center">${idx + 1}</td>
          <td class="num">${escapeHtml(s.nis)}</td>
          <td><strong>${escapeHtml(s.nama)}</strong></td>
          <td>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              class="form-input score-input"
              style="width: 110px"
              data-nilai-skor="${escapeHtml(s.id)}"
              placeholder="0 - 100"
              value="${escapeHtml(draft.skor)}"
            />
          </td>
          <td data-nilai-predikat="${escapeHtml(s.id)}">${escapeHtml(
        hitungPredikatSingkat(draft.skor)
      )}</td>
          <td>
            <input
              type="text"
              class="form-input note-input-sm"
              data-nilai-catatan="${escapeHtml(s.id)}"
              placeholder="Catatan..."
              maxlength="200"
              value="${escapeHtml(draft.catatan)}"
            />
          </td>
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
            <th>Nilai (0–100)</th>
            <th>Keterangan</th>
            <th>Catatan Guru</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('input[data-nilai-skor]').forEach((input) => {
    input.addEventListener('input', () => {
      sinkronInputNilai(input.dataset.nilaiSkor, 'skor', input.value);
    });
  });

  container.querySelectorAll('input[data-nilai-catatan]').forEach((input) => {
    input.addEventListener('input', () => {
      sinkronInputNilai(input.dataset.nilaiCatatan, 'catatan', input.value);
    });
  });
}

function isiDraftDariFilterSaatIni() {
  const kelas = document.getElementById('nilai-kelas')?.value || '';
  const mapel = getMapelAktif();
  const jenis = document.getElementById('nilai-jenis')?.value || 'Tugas';
  const judul = (document.getElementById('nilai-judul')?.value || '').trim();
  const tanggal = document.getElementById('nilai-tanggal')?.value || '';

  const siswaList = getSiswaKelasNilai();
  nilaiDraft = new Map();

  siswaList.forEach((s) => {
    const cocok = semuaNilaiCache.find(
      (n) =>
        n.siswaId === s.id &&
        n.kelas === kelas &&
        n.mapel === mapel &&
        n.jenis === jenis &&
        n.judul === judul &&
        n.tanggal === tanggal
    );
    if (cocok) {
      nilaiDraft.set(s.id, {
        skor: String(cocok.skor),
        catatan: cocok.catatan || '',
        docId: cocok.id
      });
    } else {
      nilaiDraft.set(s.id, { skor: '', catatan: '', docId: null });
    }
  });

  renderInputNilai();
}

function renderRiwayatNilai() {
  const container = document.getElementById('riwayat-nilai-container');
  if (!container) return;

  if (semuaNilaiCache.length === 0) {
    container.innerHTML = `
      <p style="margin:0; color: var(--text-secondary);">
        Belum ada nilai yang disimpan. Isi nilai siswa di atas lalu tekan "Simpan Semua Nilai".
      </p>
    `;
    return;
  }

  const grupMap = new Map();
  semuaNilaiCache.forEach((n) => {
    const key = `${n.kelas}||${n.mapel}||${n.jenis}||${n.judul}||${n.tanggal}`;
    if (!grupMap.has(key)) {
      grupMap.set(key, {
        key,
        kelas: n.kelas,
        mapel: n.mapel,
        jenis: n.jenis,
        judul: n.judul,
        tanggal: n.tanggal,
        items: []
      });
    }
    grupMap.get(key).items.push(n);
  });

  const grupList = Array.from(grupMap.values()).sort((a, b) =>
    String(b.tanggal).localeCompare(String(a.tanggal))
  );

  const cardsHtml = grupList
    .map(
      (g) => `
      <article class="student-card">
        <div>
          <h3 class="student-name">${escapeHtml(g.judul)} (${escapeHtml(g.jenis)})</h3>
          <p class="student-meta num">
            Kelas ${escapeHtml(g.kelas)} · ${escapeHtml(g.mapel)} · ${escapeHtml(
        formatTanggalIndonesia(g.tanggal)
      )} · ${g.items.length} siswa
          </p>
        </div>
        <div class="button-pair">
          <button type="button" class="btn btn-secondary btn-sm btn-buka-grup" data-key="${escapeHtml(
            g.key
          )}">
            Buka / Ubah
          </button>
          <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-grup" data-key="${escapeHtml(
            g.key
          )}">
            Hapus
          </button>
        </div>
      </article>
    `
    )
    .join('');

  const rowsHtml = grupList
    .map(
      (g) => `
      <tr>
        <td class="num">${escapeHtml(formatTanggalIndonesia(g.tanggal))}</td>
        <td>Kelas ${escapeHtml(g.kelas)}</td>
        <td>${escapeHtml(g.mapel)}</td>
        <td>${escapeHtml(g.jenis)}</td>
        <td><strong>${escapeHtml(g.judul)}</strong></td>
        <td class="td-center">${g.items.length} siswa</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-buka-grup" data-key="${escapeHtml(
              g.key
            )}">
              Buka / Ubah
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm btn-hapus-grup" data-key="${escapeHtml(
              g.key
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
            <th>Tanggal</th>
            <th>Kelas</th>
            <th>Mata Pelajaran</th>
            <th>Jenis</th>
            <th>Nama Penilaian</th>
            <th class="td-center">Jumlah</th>
            <th class="td-num">Tindakan</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.btn-buka-grup').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = grupList.find((item) => item.key === btn.dataset.key);
      if (!g) return;

      const selectKelas = document.getElementById('nilai-kelas');
      const selectMapel = document.getElementById('nilai-mapel');
      const groupCustom = document.getElementById('group-nilai-mapel-custom');
      const inputCustom = document.getElementById('nilai-mapel-custom');
      const selectJenis = document.getElementById('nilai-jenis');
      const inputJudul = document.getElementById('nilai-judul');
      const inputTanggal = document.getElementById('nilai-tanggal');

      if (selectKelas) selectKelas.value = g.kelas;

      if (selectMapel) {
        const adaDiPilihan = Array.from(selectMapel.options).some((opt) => opt.value === g.mapel);
        if (adaDiPilihan) {
          selectMapel.value = g.mapel;
          if (groupCustom) groupCustom.hidden = true;
        } else if (isAdmin()) {
          selectMapel.value = '__lainnya__';
          if (groupCustom) groupCustom.hidden = false;
          if (inputCustom) inputCustom.value = g.mapel;
        }
      }

      if (selectJenis) selectJenis.value = g.jenis;
      if (inputJudul) inputJudul.value = g.judul;
      if (inputTanggal) inputTanggal.value = g.tanggal;

      isiDraftDariFilterSaatIni();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      tampilkanSukses(`Nilai "${g.judul}" kelas ${g.kelas} sudah dimuat. Silakan ubah lalu simpan.`);
    });
  });

  container.querySelectorAll('.btn-hapus-grup').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const g = grupList.find((item) => item.key === btn.dataset.key);
      if (!g) return;

      const yakin = await konfirmasiAksi({
        title: 'Hapus Penilaian Ini?',
        message: `Apakah Anda yakin ingin menghapus semua nilai "${g.judul}" (${g.mapel}, Kelas ${g.kelas})?`,
        confirmLabel: 'Ya, Hapus Semua',
        danger: true
      });
      if (!yakin) return;

      const { db } = getFirebaseServices();
      try {
        const chunkSize = 400;
        for (let i = 0; i < g.items.length; i += chunkSize) {
          const chunk = g.items.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach((n) => batch.delete(doc(db, 'nilai', n.id)));
          await batch.commit();
        }
        tampilkanSukses(`Penilaian "${g.judul}" kelas ${g.kelas} berhasil dihapus.`);
        await muatHalamanNilai();
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.DELETE, 'nilai');
        } catch (wrapped) {
          tampilkanError(wrapped.friendlyMessage);
        }
      }
    });
  });
}

export async function muatHalamanNilai() {
  const tanggalInput = document.getElementById('nilai-tanggal');
  if (tanggalInput && !tanggalInput.value) {
    tanggalInput.value = tanggalHariIni();
  }

  sinkronkanDropdownMapelInput();

  const kelasDiizinkan = getKelasYangDiizinkan();
  const mapelDiizinkan = getMapelYangDiizinkan();

  if (
    (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) ||
    (Array.isArray(mapelDiizinkan) && mapelDiizinkan.length === 0)
  ) {
    semuaNilaiCache = [];
    isiDraftDariFilterSaatIni();
    renderRiwayatNilai();
    return;
  }

  const { db } = getFirebaseServices();

  try {
    const items = [];
    if (isAdmin()) {
      const snap = await getDocs(collection(db, 'nilai'));
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    } else {
      // Query per mapel yang diampu agar sesuai aturan keamanan Firestore dan batas 1 klausa "in"
      const queries = mapelDiizinkan.map((mapel) =>
        getDocs(
          query(
            collection(db, 'nilai'),
            where('kelas', 'in', kelasDiizinkan.slice(0, 30)),
            where('mapel', '==', mapel)
          )
        )
      );
      const snapshots = await Promise.all(queries);
      snapshots.forEach((snap) => {
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      });
    }
    semuaNilaiCache = items;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'nilai');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }

  isiDraftDariFilterSaatIni();
  renderRiwayatNilai();
}

async function simpanSemuaNilai() {
  const kelas = document.getElementById('nilai-kelas')?.value || '';
  const mapel = getMapelAktif();
  const jenis = document.getElementById('nilai-jenis')?.value || 'Tugas';
  const judul = (document.getElementById('nilai-judul')?.value || '').trim();
  const tanggal = document.getElementById('nilai-tanggal')?.value || '';

  if (!kelas) {
    tampilkanError('Silakan pilih kelas terlebih dahulu.');
    return;
  }
  if (!mapel) {
    tampilkanError('Nama mata pelajaran belum diisi atau belum tersedia.');
    return;
  }
  if (!judul) {
    tampilkanError('Nama tugas atau ulangan belum diisi.');
    return;
  }
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    tampilkanError('Tanggal penilaian belum valid.');
    return;
  }

  const siswaList = getSiswaKelasNilai();
  const dataUntukSimpan = [];

  for (const s of siswaList) {
    const draft = nilaiDraft.get(s.id);
    if (!draft) continue;
    const rawSkor = String(draft.skor ?? '').trim();
    if (rawSkor === '') continue;

    const angka = Number(rawSkor);
    if (Number.isNaN(angka) || angka < 0 || angka > 100) {
      tampilkanError(`Nilai untuk ${s.nama} harus berupa angka antara 0 sampai 100.`);
      return;
    }

    dataUntukSimpan.push({
      siswa: s,
      skor: Math.round(angka * 100) / 100,
      catatan: String(draft.catatan || '').trim().slice(0, 200),
      docId: draft.docId
    });
  }

  if (dataUntukSimpan.length === 0) {
    tampilkanError('Silakan isi nilai minimal untuk satu siswa sebelum menyimpan.');
    return;
  }

  const btn = document.getElementById('btn-simpan-nilai');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan Nilai...';
  }

  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;

  try {
    const chunkSize = 400;
    for (let i = 0; i < dataUntukSimpan.length; i += chunkSize) {
      const chunk = dataUntukSimpan.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach((item) => {
        if (item.docId) {
          batch.update(doc(db, 'nilai', item.docId), {
            namaSiswa: item.siswa.nama,
            kelas: item.siswa.kelas,
            mapel,
            jenis,
            judul,
            tanggal,
            skor: item.skor,
            catatan: item.catatan,
            updatedAt: serverTimestamp()
          });
        } else {
          const ref = doc(collection(db, 'nilai'));
          batch.set(ref, {
            ownerId: user.uid,
            siswaId: item.siswa.id,
            namaSiswa: item.siswa.nama,
            kelas: item.siswa.kelas,
            mapel,
            jenis,
            judul,
            tanggal,
            skor: item.skor,
            catatan: item.catatan,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      });

      await batch.commit();
    }

    tampilkanSukses(
      `Nilai ${judul} (${mapel}) untuk ${dataUntukSimpan.length} siswa kelas ${kelas} berhasil disimpan.`
    );
    await muatHalamanNilai();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, 'nilai');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Simpan Semua Nilai';
    }
  }
}

export function initHalamanNilai() {
  const tanggalInput = document.getElementById('nilai-tanggal');
  if (tanggalInput && !tanggalInput.value) {
    tanggalInput.value = tanggalHariIni();
  }

  const selectMapel = document.getElementById('nilai-mapel');
  const groupCustom = document.getElementById('group-nilai-mapel-custom');
  selectMapel?.addEventListener('change', () => {
    if (groupCustom) {
      groupCustom.hidden = selectMapel.value !== '__lainnya__';
    }
    isiDraftDariFilterSaatIni();
  });

  document.getElementById('nilai-kelas')?.addEventListener('change', isiDraftDariFilterSaatIni);
  document.getElementById('nilai-jenis')?.addEventListener('change', isiDraftDariFilterSaatIni);
  document.getElementById('nilai-judul')?.addEventListener('change', isiDraftDariFilterSaatIni);
  document.getElementById('nilai-tanggal')?.addEventListener('change', isiDraftDariFilterSaatIni);
  document.getElementById('nilai-mapel-custom')?.addEventListener('change', isiDraftDariFilterSaatIni);

  document.getElementById('btn-simpan-nilai')?.addEventListener('click', simpanSemuaNilai);
  document.getElementById('btn-muat-riwayat-nilai')?.addEventListener('click', muatHalamanNilai);
}
