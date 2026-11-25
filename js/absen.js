import {
  collection,
  getDocs,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getFirebaseServices,
  OperationType,
  handleFirestoreError,
  buatIdAman
} from './firebase.js';
import {
  escapeHtml,
  tanggalHariIni,
  formatTanggalIndonesia,
  getDaftarSiswa,
  tampilkanSukses,
  tampilkanError,
  aturMenuAktif,
  isiDataContohSiswa
} from './ui.js';

const STATUS_LIST = ['Hadir', 'Sakit', 'Izin', 'Alpa'];

let absenDraft = new Map(); // siswaId -> { status, keterangan, existingDocId }

function getSiswaTersaring() {
  const kelas = document.getElementById('absen-kelas')?.value || '';
  const semua = getDaftarSiswa();
  return kelas ? semua.filter((s) => s.kelas === kelas) : semua;
}

function perbaruiRingkasan() {
  const siswaList = getSiswaTersaring();
  const hitung = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };

  siswaList.forEach((s) => {
    const item = absenDraft.get(s.id);
    const st = item?.status || 'Hadir';
    if (hitung[st] !== undefined) {
      hitung[st] += 1;
    }
  });

  const elHadir = document.getElementById('count-hadir');
  const elSakit = document.getElementById('count-sakit');
  const elIzin = document.getElementById('count-izin');
  const elAlpa = document.getElementById('count-alpa');

  if (elHadir) elHadir.textContent = String(hitung.Hadir);
  if (elSakit) elSakit.textContent = String(hitung.Sakit);
  if (elIzin) elIzin.textContent = String(hitung.Izin);
  if (elAlpa) elAlpa.textContent = String(hitung.Alpa);
}

function setStatusSiswa(siswaId, status) {
  const prev = absenDraft.get(siswaId) || { status: 'Hadir', keterangan: '', existingDocId: null };
  absenDraft.set(siswaId, { ...prev, status });

  document.querySelectorAll(`[data-absen-siswa="${CSS.escape(siswaId)}"]`).forEach((wrap) => {
    wrap.querySelectorAll('.status-btn').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.status === status);
    });
  });

  perbaruiRingkasan();
}

function setKeteranganSiswa(siswaId, keterangan) {
  const prev = absenDraft.get(siswaId) || { status: 'Hadir', keterangan: '', existingDocId: null };
  absenDraft.set(siswaId, { ...prev, keterangan });

  document
    .querySelectorAll(`input[data-absen-note="${CSS.escape(siswaId)}"]`)
    .forEach((input) => {
      if (input.value !== keterangan) {
        input.value = keterangan;
      }
    });
}

function renderDaftarAbsen() {
  const container = document.getElementById('absen-container');
  const saveBar = document.getElementById('absen-save-bar');
  if (!container) return;

  const semuaSiswa = getDaftarSiswa();
  if (semuaSiswa.length === 0) {
    if (saveBar) saveBar.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Belum Ada Data Siswa</h2>
        <p class="empty-desc">
          Untuk mulai mencatat absen harian, silakan isi daftar siswa terlebih dahulu di menu Data
          Siswa, atau gunakan 10 siswa contoh untuk mencoba.
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
    perbaruiRingkasan();
    return;
  }

  const siswaList = getSiswaTersaring();
  if (siswaList.length === 0) {
    if (saveBar) saveBar.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Tidak Ada Siswa di Kelas Ini</h2>
        <p class="empty-desc">Silakan pilih kelas lain atau tambah siswa di menu Data Siswa.</p>
      </div>
    `;
    perbaruiRingkasan();
    return;
  }

  if (saveBar) saveBar.hidden = false;

  const cardsHtml = siswaList
    .map((s) => {
      const data = absenDraft.get(s.id) || { status: 'Hadir', keterangan: '' };
      const tombolStatus = STATUS_LIST.map(
        (st) => `
          <button
            type="button"
            class="status-btn ${data.status === st ? 'is-selected' : ''}"
            data-status="${st}"
          >
            ${st}
          </button>
        `
      ).join('');

      return `
        <article class="student-card" data-absen-siswa="${escapeHtml(s.id)}">
          <div class="student-card-top">
            <div>
              <h3 class="student-name">${escapeHtml(s.nama)}</h3>
              <p class="student-meta num">NIS ${escapeHtml(s.nis)} · Kelas ${escapeHtml(s.kelas)}</p>
            </div>
          </div>
          <div class="status-grid">${tombolStatus}</div>
          <input
            type="text"
            class="form-input note-input-sm"
            data-absen-note="${escapeHtml(s.id)}"
            placeholder="Catatan (opsional, misal: demam / acara keluarga)"
            maxlength="200"
            value="${escapeHtml(data.keterangan)}"
          />
        </article>
      `;
    })
    .join('');

  const rowsHtml = siswaList
    .map((s, idx) => {
      const data = absenDraft.get(s.id) || { status: 'Hadir', keterangan: '' };
      const tombolStatus = STATUS_LIST.map(
        (st) => `
          <button
            type="button"
            class="status-btn ${data.status === st ? 'is-selected' : ''}"
            data-status="${st}"
          >
            ${st}
          </button>
        `
      ).join('');

      return `
        <tr data-absen-siswa="${escapeHtml(s.id)}">
          <td class="td-center">${idx + 1}</td>
          <td class="num">${escapeHtml(s.nis)}</td>
          <td><strong>${escapeHtml(s.nama)}</strong></td>
          <td>Kelas ${escapeHtml(s.kelas)}</td>
          <td>
            <div class="status-grid">${tombolStatus}</div>
          </td>
          <td>
            <input
              type="text"
              class="form-input note-input-sm"
              data-absen-note="${escapeHtml(s.id)}"
              placeholder="Catatan..."
              maxlength="200"
              value="${escapeHtml(data.keterangan)}"
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
            <th>Kelas</th>
            <th>Status Kehadiran</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-absen-siswa]').forEach((wrap) => {
    const siswaId = wrap.dataset.absenSiswa;
    wrap.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setStatusSiswa(siswaId, btn.dataset.status);
      });
    });
  });

  container.querySelectorAll('input[data-absen-note]').forEach((input) => {
    input.addEventListener('input', () => {
      setKeteranganSiswa(input.dataset.absenNote, input.value);
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

  const siswaList = getDaftarSiswa();
  absenDraft = new Map();
  siswaList.forEach((s) => {
    absenDraft.set(s.id, { status: 'Hadir', keterangan: '', existingDocId: null });
  });

  if (siswaList.length === 0) {
    renderDaftarAbsen();
    return;
  }

  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;
  if (!user) return;

  try {
    const q = query(
      collection(db, 'absensi'),
      where('ownerId', '==', user.uid),
      where('tanggal', '==', tanggal)
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const val = d.data();
      if (val.siswaId) {
        absenDraft.set(val.siswaId, {
          status: val.status || 'Hadir',
          keterangan: val.keterangan || '',
          existingDocId: d.id
        });
      }
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'absensi');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
    }
  }

  renderDaftarAbsen();
}

async function simpanAbsen() {
  const tanggal = document.getElementById('absen-tanggal')?.value;
  const kelas = document.getElementById('absen-kelas')?.value || '';
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    tampilkanError('Silakan pilih tanggal absen yang valid terlebih dahulu.');
    return;
  }

  const siswaList = getSiswaTersaring();
  if (siswaList.length === 0) {
    tampilkanError('Belum ada siswa untuk disimpan absennya.');
    return;
  }

  const btn = document.getElementById('btn-simpan-absen');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan Absen...';
  }

  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;

  try {
    const chunkSize = 400;
    for (let i = 0; i < siswaList.length; i += chunkSize) {
      const chunk = siswaList.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach((siswa) => {
        const draft = absenDraft.get(siswa.id) || {
          status: 'Hadir',
          keterangan: '',
          existingDocId: null
        };
        const keteranganAman = String(draft.keterangan || '').trim().slice(0, 200);
        const statusAman = STATUS_LIST.includes(draft.status) ? draft.status : 'Hadir';

        if (draft.existingDocId) {
          const ref = doc(db, 'absensi', draft.existingDocId);
          batch.update(ref, {
            namaSiswa: siswa.nama,
            kelas: siswa.kelas,
            status: statusAman,
            keterangan: keteranganAman,
            updatedAt: serverTimestamp()
          });
        } else {
          const newDocId = buatIdAman(`${user.uid.slice(0, 20)}_${tanggal}_${siswa.id}`);
          const ref = doc(db, 'absensi', newDocId);
          batch.set(ref, {
            ownerId: user.uid,
            siswaId: siswa.id,
            namaSiswa: siswa.nama,
            kelas: siswa.kelas,
            tanggal,
            status: statusAman,
            keterangan: keteranganAman,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          draft.existingDocId = newDocId;
          absenDraft.set(siswa.id, draft);
        }
      });

      await batch.commit();
    }

    const labelKelas = kelas ? `Kelas ${kelas}` : 'semua kelas';
    tampilkanSukses(
      `Absen ${labelKelas} tanggal ${formatTanggalIndonesia(tanggal)} berhasil disimpan.`
    );
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, 'absensi');
    } catch (wrapped) {
      tampilkanError(wrapped.friendlyMessage);
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
  document.getElementById('absen-kelas')?.addEventListener('change', renderDaftarAbsen);

  document.getElementById('btn-semua-hadir')?.addEventListener('click', () => {
    const siswaList = getSiswaTersaring();
    siswaList.forEach((s) => setStatusSiswa(s.id, 'Hadir'));
    tampilkanSukses('Semua siswa pada daftar ini sudah ditandai Hadir. Jangan lupa tekan Simpan Absen.');
  });

  document.getElementById('btn-simpan-absen')?.addEventListener('click', simpanAbsen);
}
