import {
  collection,
  getDoc,
  getDocs,
  doc,
  setDoc,
  query,
  where,
  writeBatch,
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
  DAFTAR_MAPEL_STANDAR,
  escapeHtml,
  getDaftarSiswa,
  getDaftarMapelMaster,
  getKelasYangDiizinkan,
  getMapelYangDiizinkan,
  isAdmin,
  isGuru,
  tampilkanSukses,
  tampilkanSuksesBesar,
  tampilkanError,
  tampilkanInfo,
  aturMenuAktif,
  isiDataContohSiswa,
  bukaModal,
  tutupModal,
  tandaiRekapPerluRefresh
} from './ui.js';
import { downloadTemplateNilaiExcel, parseNilaiExcelFile } from './excel.js';

let bobotNilai = { tugas: 30, uts: 30, uas: 40 };
let bobotSudahDimuat = false;
const cacheNilaiPerScope = new Map();
let semuaNilaiCache = [];
let nilaiDraft = new Map(); // nis -> { tugas, uts, uas, akhir, exists }
let previewNilaiState = null;

function getNilaiScopeKey(kelas, mapel) {
  return isAdmin() ? `admin:${kelas}` : `guru:${kelas}:${mapel}`;
}

function perbaruiCacheNilaiSetelahSimpan(kelas, mapel, semester, daftarTersimpan) {
  const scopeKey = getNilaiScopeKey(kelas, mapel);
  const baseList = [...(cacheNilaiPerScope.get(scopeKey) || semuaNilaiCache)];
  const mapById = new Map(baseList.map((n) => [n.id, n]));

  daftarTersimpan.forEach((item) => {
    const nilaiId = buatIdAman(`${item.nis}_${mapel}_${semester}`);
    mapById.set(nilaiId, {
      id: nilaiId,
      nis: item.nis,
      kelas,
      mapel,
      semester,
      tugas: item.tugas,
      uts: item.uts,
      uas: item.uas,
      akhir: item.akhir
    });
  });

  const updated = Array.from(mapById.values());
  cacheNilaiPerScope.set(scopeKey, updated);
  semuaNilaiCache = updated;
  tandaiRekapPerluRefresh('nilai');
}

function perbaruiTampilanBobot() {
  const labelEl = document.getElementById('nilai-bobot-label');
  const btnAtur = document.getElementById('btn-atur-bobot-nilai');
  if (labelEl) {
    labelEl.textContent = `Bobot Nilai Akhir: Tugas ${bobotNilai.tugas}% · UTS ${bobotNilai.uts}% · UAS ${bobotNilai.uas}%`;
  }
  if (btnAtur) {
    btnAtur.hidden = !isAdmin();
  }
}

async function muatBobotNilai() {
  if (bobotSudahDimuat) {
    perbaruiTampilanBobot();
    return;
  }
  const { db } = getFirebaseServices();
  try {
    const snap = await getDoc(doc(db, 'pengaturan', 'bobotNilai'));
    if (snap.exists()) {
      const d = snap.data();
      const t = Number(d.tugas ?? 30);
      const u = Number(d.uts ?? 30);
      const a = Number(d.uas ?? 40);
      if (t + u + a === 100) {
        bobotNilai = { tugas: t, uts: u, uas: a };
      }
    }
    bobotSudahDimuat = true;
  } catch {
    // Gunakan default 30/30/40 jika pengaturan belum ada
  }
  perbaruiTampilanBobot();
}

function bukaModalBobotNilai() {
  if (!isAdmin()) return;

  const form = document.createElement('form');
  form.className = 'email-form';
  form.style.marginTop = '0';

  form.innerHTML = `
    <p style="margin:0; color:var(--text-secondary);">
      Atur persentase bobot untuk menghitung Nilai Akhir otomatis. Jumlah ketiga bobot harus tepat
      <strong>100%</strong>.
    </p>
    <div class="filter-grid filter-grid--3">
      <div class="form-group">
        <label for="modal-bobot-tugas" class="form-label">Tugas (%)</label>
        <input
          type="number"
          id="modal-bobot-tugas"
          class="form-input"
          min="0"
          max="100"
          step="1"
          required
          value="${bobotNilai.tugas}"
        />
      </div>
      <div class="form-group">
        <label for="modal-bobot-uts" class="form-label">UTS (%)</label>
        <input
          type="number"
          id="modal-bobot-uts"
          class="form-input"
          min="0"
          max="100"
          step="1"
          required
          value="${bobotNilai.uts}"
        />
      </div>
      <div class="form-group">
        <label for="modal-bobot-uas" class="form-label">UAS (%)</label>
        <input
          type="number"
          id="modal-bobot-uas"
          class="form-input"
          min="0"
          max="100"
          step="1"
          required
          value="${bobotNilai.uas}"
        />
      </div>
    </div>
    <p id="modal-bobot-total" style="margin:4px 0 0; font-weight:700;">
      Total Bobot: 100%
    </p>
    <div class="modal-footer">
      <button type="button" id="btn-batal-bobot" class="btn btn-secondary">Batal</button>
      <button type="submit" id="btn-simpan-bobot" class="btn btn-primary">Simpan Bobot</button>
    </div>
  `;

  const inputT = form.querySelector('#modal-bobot-tugas');
  const inputU = form.querySelector('#modal-bobot-uts');
  const inputA = form.querySelector('#modal-bobot-uas');
  const totalEl = form.querySelector('#modal-bobot-total');

  function perbaruiTotal() {
    const sum = Number(inputT.value || 0) + Number(inputU.value || 0) + Number(inputA.value || 0);
    totalEl.textContent = `Total Bobot: ${sum}%`;
    totalEl.style.color = sum === 100 ? '#15803d' : '#b91c1c';
  }

  [inputT, inputU, inputA].forEach((inp) => inp.addEventListener('input', perbaruiTotal));
  perbaruiTotal();

  form.querySelector('#btn-batal-bobot').addEventListener('click', tutupModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tugas = Number(inputT.value);
    const uts = Number(inputU.value);
    const uas = Number(inputA.value);

    if (
      Number.isNaN(tugas) ||
      Number.isNaN(uts) ||
      Number.isNaN(uas) ||
      tugas < 0 ||
      uts < 0 ||
      uas < 0 ||
      tugas + uts + uas !== 100
    ) {
      tampilkanError('Jumlah bobot Tugas + UTS + UAS harus tepat 100%.');
      return;
    }

    const submitBtn = form.querySelector('#btn-simpan-bobot');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    const { db } = getFirebaseServices();
    try {
      await setDoc(doc(db, 'pengaturan', 'bobotNilai'), {
        tugas,
        uts,
        uas,
        updatedAt: serverTimestamp()
      });
      bobotNilai = { tugas, uts, uas };
      perbaruiTampilanBobot();
      isiDraftDariFilterSaatIni();
      tutupModal();
      tampilkanSukses(`Bobot nilai berhasil diatur: Tugas ${tugas}%, UTS ${uts}%, UAS ${uas}%.`);
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Simpan Bobot';
      try {
        handleFirestoreError(error, OperationType.WRITE, 'pengaturan/bobotNilai');
      } catch (wrapped) {
        tampilkanError(pesanRamahError(wrapped));
      }
    }
  });

  bukaModal({
    title: 'Atur Bobot Nilai Akhir',
    bodyElement: form
  });
}

function sinkronkanDropdownMapelInput() {
  const select = document.getElementById('nilai-mapel');
  if (!select) return;

  const prev = select.value;
  const mapelDiizinkan = getMapelYangDiizinkan();
  const masterMapel = getDaftarMapelMaster().map((m) => m.nama).filter(Boolean);

  select.innerHTML = '';

  let opsi = [];
  if (Array.isArray(mapelDiizinkan)) {
    opsi = mapelDiizinkan;
  } else {
    opsi = masterMapel.length > 0 ? masterMapel : DAFTAR_MAPEL_STANDAR;
  }

  if (opsi.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Belum ada mapel tersedia';
    select.appendChild(opt);
    return;
  }

  opsi.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });

  if (prev && opsi.includes(prev)) {
    select.value = prev;
  } else if (opsi.length > 0) {
    select.value = opsi[0];
  }
}

function getSiswaKelasNilai() {
  const kelas = document.getElementById('nilai-kelas')?.value || '';
  if (!kelas) return [];
  return getDaftarSiswa().filter((s) => s.kelas === kelas);
}

function isSkorValidString(raw) {
  const teks = String(raw ?? '').trim();
  if (teks === '') return true;
  const n = Number(teks);
  return !Number.isNaN(n) && n >= 0 && n <= 100;
}

function hitungAkhir(tugasStr, utsStr, uasStr) {
  const pasangan = [
    { raw: tugasStr, w: bobotNilai.tugas },
    { raw: utsStr, w: bobotNilai.uts },
    { raw: uasStr, w: bobotNilai.uas }
  ]
    .map((p) => ({ teks: String(p.raw ?? '').trim(), w: p.w }))
    .filter((p) => p.teks !== '')
    .map((p) => ({ num: Number(p.teks), w: p.w }))
    .filter((p) => !Number.isNaN(p.num) && p.num >= 0 && p.num <= 100);

  if (pasangan.length === 0) return '';
  const totalBobot = pasangan.reduce((acc, p) => acc + p.w, 0);
  if (totalBobot <= 0) {
    const sum = pasangan.reduce((acc, p) => acc + p.num, 0);
    return Math.round((sum / pasangan.length) * 10) / 10;
  }
  const weighted = pasangan.reduce((acc, p) => acc + p.num * p.w, 0);
  return Math.round((weighted / totalBobot) * 10) / 10;
}

function hitungPredikatSingkat(akhirVal) {
  if (akhirVal === '' || akhirVal === null || akhirVal === undefined) return '-';
  const angka = Number(akhirVal);
  if (Number.isNaN(angka)) return '-';
  if (angka >= 90) return 'A (Sangat Baik)';
  if (angka >= 80) return 'B (Baik)';
  if (angka >= 70) return 'C (Cukup)';
  return 'D (Perlu Bimbingan)';
}

function sinkronInputNilai(nis, field, value) {
  const prev = nilaiDraft.get(nis) || { tugas: '', uts: '', uas: '', akhir: '', exists: false };
  const next = { ...prev, [field]: value };
  next.akhir = hitungAkhir(next.tugas, next.uts, next.uas);
  nilaiDraft.set(nis, next);

  const valid = isSkorValidString(value);

  document
    .querySelectorAll(`input[data-nilai-field="${field}"][data-nilai-nis="${CSS.escape(nis)}"]`)
    .forEach((input) => {
      if (input.value !== value) input.value = value;
      input.classList.toggle('input-invalid', !valid);
    });

  document
    .querySelectorAll(`[data-nilai-error="${CSS.escape(nis)}"]`)
    .forEach((el) => {
      const errList = [];
      if (!isSkorValidString(next.tugas)) errList.push('Tugas harus 0–100');
      if (!isSkorValidString(next.uts)) errList.push('UTS harus 0–100');
      if (!isSkorValidString(next.uas)) errList.push('UAS harus 0–100');
      el.textContent = errList.join(' · ');
      el.hidden = errList.length === 0;
    });

  document
    .querySelectorAll(`[data-nilai-akhir="${CSS.escape(nis)}"]`)
    .forEach((el) => {
      el.textContent = next.akhir === '' ? '-' : String(next.akhir);
    });

  document
    .querySelectorAll(`[data-nilai-predikat="${CSS.escape(nis)}"]`)
    .forEach((el) => {
      el.textContent = hitungPredikatSingkat(next.akhir);
    });
}

function renderInputNilai() {
  const container = document.getElementById('nilai-container');
  const saveBar = document.getElementById('nilai-save-bar');
  const excelActions = document.getElementById('nilai-excel-actions');
  if (!container) return;

  const kelasDiizinkan = getKelasYangDiizinkan();
  const mapelDiizinkan = getMapelYangDiizinkan();

  if (
    (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) ||
    (Array.isArray(mapelDiizinkan) && mapelDiizinkan.length === 0)
  ) {
    if (saveBar) saveBar.hidden = true;
    if (excelActions) excelActions.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Kelas atau Mata Pelajaran Belum Diatur</h2>
        <p class="empty-desc">
          Admin sekolah belum mengatur kelas yang diajar atau mata pelajaran yang Anda ampu. Silakan
          hubungi Admin ${escapeHtml(SEKOLAH)}.
        </p>
      </div>
    `;
    return;
  }

  const semuaSiswa = getDaftarSiswa();
  if (semuaSiswa.length === 0) {
    if (saveBar) saveBar.hidden = true;
    if (excelActions) excelActions.hidden = true;
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
  const mapel = document.getElementById('nilai-mapel')?.value || '';
  if (siswaList.length === 0 || !mapel) {
    if (saveBar) saveBar.hidden = true;
    if (excelActions) excelActions.hidden = true;
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-title">Pilih Kelas &amp; Mata Pelajaran</h2>
        <p class="empty-desc">
          Pilih kelas dan mata pelajaran pada kotak di atas untuk mengisi nilai Tugas, UTS, dan UAS.
        </p>
      </div>
    `;
    return;
  }

  if (saveBar) saveBar.hidden = false;
  if (excelActions) excelActions.hidden = false;

  const cardsHtml = siswaList
    .map((s) => {
      const d = nilaiDraft.get(s.nis) || { tugas: '', uts: '', uas: '', akhir: '' };
      return `
        <article class="student-card">
          <div class="student-card-top">
            <div>
              <h3 class="student-name">${escapeHtml(s.nama)}</h3>
              <p class="student-meta num">
                NIS ${escapeHtml(s.nis)} · Kelas ${escapeHtml(s.kelas)} · Akhir:
                <strong data-nilai-akhir="${escapeHtml(s.nis)}">${
        d.akhir === '' ? '-' : escapeHtml(d.akhir)
      }</strong>
                (<span data-nilai-predikat="${escapeHtml(s.nis)}">${escapeHtml(
        hitungPredikatSingkat(d.akhir)
      )}</span>)
              </p>
            </div>
          </div>
          <div class="nilai-inputs-grid">
            <div class="form-group">
              <label class="form-label">Tugas</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputmode="decimal"
                class="form-input score-input ${isSkorValidString(d.tugas) ? '' : 'input-invalid'}"
                data-nilai-field="tugas"
                data-nilai-nis="${escapeHtml(s.nis)}"
                placeholder="0-100"
                value="${escapeHtml(d.tugas)}"
              />
            </div>
            <div class="form-group">
              <label class="form-label">UTS</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputmode="decimal"
                class="form-input score-input ${isSkorValidString(d.uts) ? '' : 'input-invalid'}"
                data-nilai-field="uts"
                data-nilai-nis="${escapeHtml(s.nis)}"
                placeholder="0-100"
                value="${escapeHtml(d.uts)}"
              />
            </div>
            <div class="form-group">
              <label class="form-label">UAS</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputmode="decimal"
                class="form-input score-input ${isSkorValidString(d.uas) ? '' : 'input-invalid'}"
                data-nilai-field="uas"
                data-nilai-nis="${escapeHtml(s.nis)}"
                placeholder="0-100"
                value="${escapeHtml(d.uas)}"
              />
            </div>
          </div>
          <p class="field-error-hint" data-nilai-error="${escapeHtml(s.nis)}" hidden></p>
        </article>
      `;
    })
    .join('');

  const rowsHtml = siswaList
    .map((s, idx) => {
      const d = nilaiDraft.get(s.nis) || { tugas: '', uts: '', uas: '', akhir: '' };
      return `
        <tr>
          <td class="td-center">${idx + 1}</td>
          <td class="num">${escapeHtml(s.nis)}</td>
          <td>
            <strong>${escapeHtml(s.nama)}</strong>
            <p class="field-error-hint" data-nilai-error="${escapeHtml(s.nis)}" hidden></p>
          </td>
          <td>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              class="form-input score-input ${isSkorValidString(d.tugas) ? '' : 'input-invalid'}"
              style="width: 96px"
              data-nilai-field="tugas"
              data-nilai-nis="${escapeHtml(s.nis)}"
              placeholder="0-100"
              value="${escapeHtml(d.tugas)}"
            />
          </td>
          <td>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              class="form-input score-input ${isSkorValidString(d.uts) ? '' : 'input-invalid'}"
              style="width: 96px"
              data-nilai-field="uts"
              data-nilai-nis="${escapeHtml(s.nis)}"
              placeholder="0-100"
              value="${escapeHtml(d.uts)}"
            />
          </td>
          <td>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              class="form-input score-input ${isSkorValidString(d.uas) ? '' : 'input-invalid'}"
              style="width: 96px"
              data-nilai-field="uas"
              data-nilai-nis="${escapeHtml(s.nis)}"
              placeholder="0-100"
              value="${escapeHtml(d.uas)}"
            />
          </td>
          <td class="td-num">
            <strong data-nilai-akhir="${escapeHtml(s.nis)}">${
        d.akhir === '' ? '-' : escapeHtml(d.akhir)
      }</strong>
          </td>
          <td data-nilai-predikat="${escapeHtml(s.nis)}">${escapeHtml(
        hitungPredikatSingkat(d.akhir)
      )}</td>
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
            <th>Tugas (${bobotNilai.tugas}%)</th>
            <th>UTS (${bobotNilai.uts}%)</th>
            <th>UAS (${bobotNilai.uas}%)</th>
            <th class="td-num">Akhir</th>
            <th>Predikat</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('input[data-nilai-field]').forEach((input) => {
    input.addEventListener('input', () => {
      sinkronInputNilai(input.dataset.nilaiNis, input.dataset.nilaiField, input.value);
    });
  });
}

function isiDraftDariFilterSaatIni() {
  const kelas = document.getElementById('nilai-kelas')?.value || '';
  const mapel = document.getElementById('nilai-mapel')?.value || '';
  const semester = document.getElementById('nilai-semester')?.value || 'Ganjil';

  const siswaList = getSiswaKelasNilai();
  nilaiDraft = new Map();

  siswaList.forEach((s) => {
    const cocok = semuaNilaiCache.find(
      (n) => n.nis === s.nis && n.kelas === kelas && n.mapel === mapel && n.semester === semester
    );
    if (cocok) {
      const tugas = cocok.tugas !== null && cocok.tugas !== undefined ? String(cocok.tugas) : '';
      const uts = cocok.uts !== null && cocok.uts !== undefined ? String(cocok.uts) : '';
      const uas = cocok.uas !== null && cocok.uas !== undefined ? String(cocok.uas) : '';
      const akhir = hitungAkhir(tugas, uts, uas);
      nilaiDraft.set(s.nis, { tugas, uts, uas, akhir, exists: true });
    } else {
      nilaiDraft.set(s.nis, { tugas: '', uts: '', uas: '', akhir: '', exists: false });
    }
  });

  tutupPratinjauImportNilai();
  renderInputNilai();
}

// ==========================================================================
// Pratinjau Impor Nilai Excel + Simpan Batch
// ==========================================================================

function tutupPratinjauImportNilai() {
  previewNilaiState = null;
  const panel = document.getElementById('nilai-import-preview-panel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
}

function renderPratinjauImportNilai() {
  const panel = document.getElementById('nilai-import-preview-panel');
  if (!panel) return;

  if (!previewNilaiState) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  const { fileName, kelas, mapel, semester, allRows, validRows, invalidRows } = previewNilaiState;
  panel.hidden = false;

  const tampilAngka = (val) => (val === null || val === undefined || val === '' ? '-' : String(val));

  const cardsHtml = allRows
    .map(
      (r) => `
      <article class="student-card ${r.valid ? '' : 'student-card--error'}">
        <div>
          <h3 class="student-name">
            Baris ${r.barisKe}: ${escapeHtml(r.nama)} (NIS ${escapeHtml(r.nis || '-')})
          </h3>
          <p class="student-meta num">
            Tugas: ${escapeHtml(tampilAngka(r.tugas))} · UTS: ${escapeHtml(
        tampilAngka(r.uts)
      )} · UAS: ${escapeHtml(tampilAngka(r.uas))} · Akhir: ${escapeHtml(tampilAngka(r.akhir))}
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
        <td><strong>${escapeHtml(r.nama)}</strong></td>
        <td class="td-num">${escapeHtml(tampilAngka(r.tugas))}</td>
        <td class="td-num">${escapeHtml(tampilAngka(r.uts))}</td>
        <td class="td-num">${escapeHtml(tampilAngka(r.uas))}</td>
        <td class="td-num"><strong>${escapeHtml(tampilAngka(r.akhir))}</strong></td>
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

  panel.innerHTML = `
    <div class="preview-header">
      <div>
        <h2 class="section-subtitle">Pratinjau Impor Nilai: ${escapeHtml(fileName)}</h2>
        <p class="section-hint">
          Kelas ${escapeHtml(kelas)} · ${escapeHtml(mapel)} · Semester ${escapeHtml(semester)}
        </p>
      </div>
      <div class="button-pair">
        <button type="button" id="btn-batal-preview-nilai" class="btn btn-secondary">
          Batal
        </button>
        <button
          type="button"
          id="btn-simpan-preview-nilai"
          class="btn btn-primary"
          ${validRows.length === 0 ? 'disabled' : ''}
        >
          Simpan (${validRows.length} Nilai Valid)
        </button>
      </div>
    </div>

    <div class="preview-summary-chips">
      <span class="preview-stat">Total Baris: ${allRows.length}</span>
      <span class="preview-stat preview-stat--ok">Valid: ${validRows.length}</span>
      <span class="preview-stat preview-stat--err">Bermasalah (Merah): ${invalidRows.length}</span>
    </div>

    ${
      invalidRows.length > 0
        ? `<p class="section-hint" style="margin:0 0 12px; color:#b91c1c;">
            Baris bertanda merah tidak akan disimpan. Perbaiki di Excel lalu unggah ulang, atau klik Simpan untuk menyimpan nilai yang valid saja.
          </p>`
        : ''
    }

    <div class="card-list">${cardsHtml}</div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="td-center">Baris</th>
            <th>NIS</th>
            <th>Nama</th>
            <th class="td-num">Tugas</th>
            <th class="td-num">UTS</th>
            <th class="td-num">UAS</th>
            <th class="td-num">Akhir</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  panel.querySelector('#btn-batal-preview-nilai')?.addEventListener('click', tutupPratinjauImportNilai);
  panel
    .querySelector('#btn-simpan-preview-nilai')
    ?.addEventListener('click', simpanHasilImportNilaiBatch);
}

async function simpanHasilImportNilaiBatch() {
  if (!previewNilaiState || previewNilaiState.validRows.length === 0) return;

  const { kelas, mapel, semester, validRows, invalidRows } = previewNilaiState;
  const btn = document.getElementById('btn-simpan-preview-nilai');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan Nilai...';
  }

  const { db } = getFirebaseServices();

  try {
    const chunkSize = 500;
    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach((row) => {
        const nilaiId = buatIdAman(`${row.nis}_${mapel}_${semester}`);
        const ref = doc(db, 'nilai', nilaiId);
        const sudahAda = semuaNilaiCache.some(
          (n) => n.nis === row.nis && n.kelas === kelas && n.mapel === mapel && n.semester === semester
        );

        if (sudahAda) {
          batch.update(ref, {
            tugas: row.tugas,
            uts: row.uts,
            uas: row.uas,
            akhir: row.akhir,
            updatedAt: serverTimestamp()
          });
        } else {
          batch.set(ref, {
            nis: row.nis,
            kelas,
            mapel,
            semester,
            tugas: row.tugas,
            uts: row.uts,
            uas: row.uas,
            akhir: row.akhir,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      });

      await batch.commit();
    }

    perbaruiCacheNilaiSetelahSimpan(kelas, mapel, semester, validRows);
    tampilkanSuksesBesar('Berhasil disimpan ✓');
    tutupPratinjauImportNilai();
    isiDraftDariFilterSaatIni();
  } catch (error) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `Simpan (${validRows.length} Nilai Valid)`;
    }
    try {
      handleFirestoreError(error, OperationType.WRITE, 'nilai');
    } catch (wrapped) {
      tampilkanError(pesanRamahError(wrapped));
    }
  }
}

async function muatNilaiUntukFilterSaatIni(paksaMuatUlang = false) {
  const adminMode = isAdmin();
  const guruMode = isGuru();
  if (!adminMode && !guruMode) {
    semuaNilaiCache = [];
    isiDraftDariFilterSaatIni();
    return;
  }

  const kelasDiizinkan = getKelasYangDiizinkan();
  const mapelDiizinkan = getMapelYangDiizinkan();
  const kelas = document.getElementById('nilai-kelas')?.value || '';
  const mapel = document.getElementById('nilai-mapel')?.value || '';

  if (
    (Array.isArray(kelasDiizinkan) && kelasDiizinkan.length === 0) ||
    (Array.isArray(mapelDiizinkan) && mapelDiizinkan.length === 0) ||
    !kelas ||
    (!adminMode && !mapel) ||
    (guruMode &&
      ((Array.isArray(kelasDiizinkan) && !kelasDiizinkan.includes(kelas)) ||
        (Array.isArray(mapelDiizinkan) && !mapelDiizinkan.includes(mapel))))
  ) {
    semuaNilaiCache = [];
    isiDraftDariFilterSaatIni();
    return;
  }

  const scopeKey = getNilaiScopeKey(kelas, mapel);
  if (!paksaMuatUlang && cacheNilaiPerScope.has(scopeKey)) {
    semuaNilaiCache = cacheNilaiPerScope.get(scopeKey) || [];
    isiDraftDariFilterSaatIni();
    return;
  }

  const { db } = getFirebaseServices();

  try {
    const items = [];
    const q = adminMode
      ? query(collection(db, 'nilai'), where('kelas', '==', kelas))
      : query(
          collection(db, 'nilai'),
          where('kelas', '==', kelas),
          where('mapel', '==', mapel)
        );
    const snap = await getDocs(q);
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    cacheNilaiPerScope.set(scopeKey, items);
    semuaNilaiCache = items;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, 'nilai');
    } catch (wrapped) {
      tampilkanError(pesanRamahError(wrapped));
    }
  }

  isiDraftDariFilterSaatIni();
}

export async function muatHalamanNilai() {
  await muatBobotNilai();
  sinkronkanDropdownMapelInput();
  await muatNilaiUntukFilterSaatIni();
}

function parseSkorOpsional(raw, namaSiswa, labelKomponen) {
  const teks = String(raw ?? '').trim();
  if (teks === '') return { ok: true, value: null };
  const angka = Number(teks);
  if (Number.isNaN(angka) || angka < 0 || angka > 100) {
    return {
      ok: false,
      error: `Nilai ${labelKomponen} untuk ${namaSiswa} harus angka antara 0 sampai 100 (saat ini: "${teks}").`
    };
  }
  return { ok: true, value: Math.round(angka * 10) / 10 };
}

async function simpanSemuaNilai() {
  const kelas = document.getElementById('nilai-kelas')?.value || '';
  const mapel = document.getElementById('nilai-mapel')?.value || '';
  const semester = document.getElementById('nilai-semester')?.value || 'Ganjil';

  if (!kelas) {
    tampilkanError('Silakan pilih kelas terlebih dahulu.');
    return;
  }
  if (!mapel) {
    tampilkanError('Silakan pilih mata pelajaran terlebih dahulu.');
    return;
  }

  const siswaList = getSiswaKelasNilai();
  const dataUntukSimpan = [];

  for (const s of siswaList) {
    const draft = nilaiDraft.get(s.nis);
    if (!draft) continue;

    const cekTugas = parseSkorOpsional(draft.tugas, s.nama, 'Tugas');
    if (!cekTugas.ok) {
      tampilkanError(cekTugas.error);
      return;
    }
    const cekUts = parseSkorOpsional(draft.uts, s.nama, 'UTS');
    if (!cekUts.ok) {
      tampilkanError(cekUts.error);
      return;
    }
    const cekUas = parseSkorOpsional(draft.uas, s.nama, 'UAS');
    if (!cekUas.ok) {
      tampilkanError(cekUas.error);
      return;
    }

    if (cekTugas.value === null && cekUts.value === null && cekUas.value === null) {
      continue;
    }

    const akhir = hitungAkhir(draft.tugas, draft.uts, draft.uas);
    dataUntukSimpan.push({
      siswa: s,
      tugas: cekTugas.value,
      uts: cekUts.value,
      uas: cekUas.value,
      akhir: Number(akhir),
      exists: draft.exists
    });
  }

  if (dataUntukSimpan.length === 0) {
    tampilkanError('Isi minimal satu nilai (Tugas, UTS, atau UAS) sebelum menyimpan.');
    return;
  }

  const btn = document.getElementById('btn-simpan-nilai');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan Nilai...';
  }

  const { db } = getFirebaseServices();

  try {
    const chunkSize = 500;
    for (let i = 0; i < dataUntukSimpan.length; i += chunkSize) {
      const chunk = dataUntukSimpan.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach((item) => {
        const nilaiId = buatIdAman(`${item.siswa.nis}_${mapel}_${semester}`);
        const ref = doc(db, 'nilai', nilaiId);

        if (item.exists) {
          batch.update(ref, {
            tugas: item.tugas,
            uts: item.uts,
            uas: item.uas,
            akhir: item.akhir,
            updatedAt: serverTimestamp()
          });
        } else {
          batch.set(ref, {
            nis: item.siswa.nis,
            kelas: item.siswa.kelas,
            mapel,
            semester,
            tugas: item.tugas,
            uts: item.uts,
            uas: item.uas,
            akhir: item.akhir,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      });

      await batch.commit();
    }

    perbaruiCacheNilaiSetelahSimpan(
      kelas,
      mapel,
      semester,
      dataUntukSimpan.map((item) => ({
        nis: item.siswa.nis,
        tugas: item.tugas,
        uts: item.uts,
        uas: item.uas,
        akhir: item.akhir
      }))
    );

    tampilkanSuksesBesar('Berhasil disimpan ✓');
    isiDraftDariFilterSaatIni();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, 'nilai');
    } catch (wrapped) {
      tampilkanError(pesanRamahError(wrapped));
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Simpan Semua Nilai';
    }
  }
}

export function initHalamanNilai() {
  document.getElementById('nilai-kelas')?.addEventListener('change', () => muatNilaiUntukFilterSaatIni());
  document.getElementById('nilai-mapel')?.addEventListener('change', () => muatNilaiUntukFilterSaatIni());
  document.getElementById('nilai-semester')?.addEventListener('change', isiDraftDariFilterSaatIni);
  document.getElementById('btn-simpan-nilai')?.addEventListener('click', simpanSemuaNilai);
  document.getElementById('btn-atur-bobot-nilai')?.addEventListener('click', bukaModalBobotNilai);

  document.getElementById('btn-template-nilai-excel')?.addEventListener('click', () => {
    const kelas = document.getElementById('nilai-kelas')?.value || '';
    const mapel = document.getElementById('nilai-mapel')?.value || '';
    const semester = document.getElementById('nilai-semester')?.value || 'Ganjil';
    const siswaList = getSiswaKelasNilai();
    if (!kelas || !mapel || siswaList.length === 0) {
      tampilkanError('Pilih kelas yang memiliki siswa dan mata pelajaran terlebih dahulu.');
      return;
    }
    try {
      const fileName = downloadTemplateNilaiExcel({
        siswaList,
        kelasLabel: kelas,
        mapelLabel: mapel,
        semesterLabel: semester
      });
      tampilkanSukses(`Template nilai "${fileName}" berhasil diunduh.`);
    } catch (err) {
      tampilkanError(pesanRamahError(err));
    }
  });

  document.getElementById('input-import-nilai-excel')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const kelas = document.getElementById('nilai-kelas')?.value || '';
    const mapel = document.getElementById('nilai-mapel')?.value || '';
    const semester = document.getElementById('nilai-semester')?.value || 'Ganjil';
    const siswaList = getSiswaKelasNilai();

    if (!kelas || !mapel || siswaList.length === 0) {
      tampilkanError('Pilih kelas yang memiliki siswa dan mata pelajaran sebelum mengimpor Excel.');
      return;
    }

    try {
      tampilkanInfo('Sedang membaca dan memeriksa file Excel nilai...');
      const siswaKelasMap = new Map(siswaList.map((s) => [s.nis, s]));
      const { allRows, validRows, invalidRows } = await parseNilaiExcelFile(file, {
        siswaKelasMap,
        bobot: bobotNilai
      });

      previewNilaiState = {
        fileName: file.name,
        kelas,
        mapel,
        semester,
        allRows,
        validRows,
        invalidRows
      };
      renderPratinjauImportNilai();
    } catch (error) {
      tampilkanError(pesanRamahError(error));
    }
  });
}
