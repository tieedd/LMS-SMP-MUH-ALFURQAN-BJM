// ==========================================================================
// Modul Excel (SheetJS lokal)
// Mengurus unduh template siswa, validasi + pratinjau unggah Excel,
// serta unduh rekap absen dan rekap nilai.
// ==========================================================================

import { APP_NAME, APP_SHORT_NAME, SEKOLAH } from './config.js';

const MAX_EXCEL_SIZE_BYTES = 5 * 1024 * 1024;
const FORMAT_EXCEL_RE = /\.(xlsx|xls|csv)$/i;

function buatErrorRamah(pesan) {
  const err = new Error(pesan);
  err.isFriendly = true;
  err.friendlyMessage = pesan;
  return err;
}

function validasiFileExcel(file) {
  if (!file) {
    throw buatErrorRamah('File belum dipilih. Silakan pilih file Excel terlebih dahulu.');
  }
  const namaFile = String(file.name || '').trim();
  if (!FORMAT_EXCEL_RE.test(namaFile)) {
    throw buatErrorRamah(
      'Format file tidak didukung. Gunakan file dengan akhiran .xlsx, .xls, atau .csv saja.'
    );
  }
  if (Number(file.size || 0) > MAX_EXCEL_SIZE_BYTES) {
    throw buatErrorRamah(
      'Ukuran file terlalu besar (lebih dari 5 MB). Kurangi isi atau ukuran file lalu unggah ulang.'
    );
  }
}

function bacaWorkbookAman(XLSX, buffer) {
  try {
    return XLSX.read(buffer, { type: 'array' });
  } catch {
    throw buatErrorRamah(
      'File tidak dapat dibaca sebagai tabel Excel. Pastikan file tidak rusak dan tidak dikunci kata sandi.'
    );
  }
}

function tulisWorkbookAman(XLSX, wb, fileName) {
  try {
    XLSX.writeFile(wb, fileName);
  } catch {
    throw buatErrorRamah('Gagal membuat atau mengunduh file Excel. Silakan coba lagi.');
  }
}

function pastikanSheetJS() {
  if (typeof window.XLSX === 'undefined') {
    throw buatErrorRamah(
      'Fitur Excel belum termuat sempurna. Silakan muat ulang halaman lalu coba lagi.'
    );
  }
  return window.XLSX;
}

const BULAN_SINGKAT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
];

function bersihkanNamaFile(teks) {
  return String(teks || 'data')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function formatTanggalCetakDefault() {
  const now = new Date();
  const bulanPanjang = [
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
  return `${now.getDate()} ${bulanPanjang[now.getMonth()] || ''} ${now.getFullYear()}`;
}

function formatKelasNamaFile(kelasRaw, kelasLabel) {
  const raw = String(kelasRaw || '').trim();
  if (raw) {
    return `Kelas${bersihkanNamaFile(raw)}`;
  }
  const label = String(kelasLabel || '').trim();
  if (label && !/semua/i.test(label)) {
    const cleaned = label.replace(/^kelas\s*/i, '');
    return `Kelas${bersihkanNamaFile(cleaned)}`;
  }
  return 'SemuaKelas';
}

function formatPeriodeAbsenNamaFile({ periodeMode, bulanRaw, tahunRaw, periodeLabel }) {
  if (periodeMode === 'ganjil') {
    return tahunRaw ? `Smt1_${bersihkanNamaFile(tahunRaw)}` : 'Smt1';
  }
  if (periodeMode === 'genap') {
    return tahunRaw ? `Smt2_${bersihkanNamaFile(tahunRaw)}` : 'Smt2';
  }
  if (/^\d{4}-\d{2}$/.test(String(bulanRaw || ''))) {
    const [yyyy, mm] = String(bulanRaw).split('-');
    const singkatan = BULAN_SINGKAT[Number(mm) - 1] || mm;
    return `${singkatan}${yyyy}`;
  }
  return bersihkanNamaFile(periodeLabel || 'Periode');
}

function formatSemesterNamaFile(semesterRaw, semesterLabel) {
  const val = String(semesterRaw || semesterLabel || '').trim();
  if (/ganjil/i.test(val)) return 'Smt1';
  if (/genap/i.test(val)) return 'Smt2';
  if (!val || /semua/i.test(val)) return 'SemuaSmt';
  return bersihkanNamaFile(val);
}

function hitungLebarKolomOtomatis(sheetData, { headerRowIndex = 4, minWidth = 8, maxWidth = 42 } = {}) {
  const numCols = Math.max(
    ...sheetData.map((row) => (Array.isArray(row) ? row.length : 0)),
    1
  );
  const widths = new Array(numCols).fill(minWidth);

  for (let r = headerRowIndex; r < sheetData.length; r += 1) {
    const row = sheetData[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < numCols; c += 1) {
      const cellText = String(row[c] ?? '');
      const needed = cellText.length + 3;
      if (needed > widths[c]) {
        widths[c] = needed;
      }
    }
  }

  return widths.map((w) => ({ wch: Math.min(maxWidth, Math.max(minWidth, w)) }));
}

export function exportRekapAbsenExcel({
  rows,
  kelasRaw = '',
  kelasLabel,
  periodeLabel,
  periodeMode = 'bulan',
  bulanRaw = '',
  tahunRaw = '',
  tanggalCetakLabel = '',
  stats
}) {
  const XLSX = pastikanSheetJS();
  const tglCetak = tanggalCetakLabel || formatTanggalCetakDefault();

  const headerRow = [
    'No',
    'NIS',
    'Nama Siswa',
    'Kelas',
    'Hadir (H)',
    'Sakit (S)',
    'Izin (I)',
    'Alpa (A)',
    'Total Hari',
    'Kehadiran (%)',
    'Keterangan'
  ];

  const sheetData = [
    [APP_NAME],
    ['REKAP KEHADIRAN SISWA'],
    [`Kelas: ${kelasLabel || 'Semua Kelas'} | Periode: ${periodeLabel || '-'} | Tanggal Cetak: ${tglCetak}`],
    [],
    headerRow
  ];

  rows.forEach((row, index) => {
    const keterangan =
      row.total === 0
        ? 'Belum ada data'
        : row.kurangDari80
        ? 'Di bawah 80% (Perlu Perhatian)'
        : 'Baik';
    sheetData.push([
      index + 1,
      row.nis,
      row.nama,
      row.kelas,
      row.H,
      row.S,
      row.I,
      row.A,
      row.total,
      row.total > 0 ? `${row.persen}%` : '-',
      keterangan
    ]);
  });

  if (stats) {
    sheetData.push([]);
    sheetData.push(['Ringkasan', '', `Total Siswa: ${stats.totalSiswa}`, '', `Rata-rata Kehadiran: ${stats.rataPersen !== null ? `${stats.rataPersen}%` : '-'}`]);
    sheetData.push(['', '', `Siswa Kehadiran < 80%: ${stats.jumlahKurang80} siswa`]);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const lastCol = headerRow.length - 1;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } }
  ];
  ws['!cols'] = hitungLebarKolomOtomatis(sheetData, { headerRowIndex: 4 });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absen');

  const kelasPart = formatKelasNamaFile(kelasRaw, kelasLabel);
  const periodePart = formatPeriodeAbsenNamaFile({
    periodeMode,
    bulanRaw,
    tahunRaw,
    periodeLabel
  });
  const fileName = `Rekap-Absen_${kelasPart}_${periodePart}.xlsx`;
  tulisWorkbookAman(XLSX, wb, fileName);
  return fileName;
}

export function exportRekapNilaiExcel({
  rows,
  kelasRaw = '',
  kelasLabel,
  mapelRaw = '',
  mapelLabel,
  semesterRaw = '',
  semesterLabel,
  tanggalCetakLabel = '',
  kkm = 75,
  stats
}) {
  const XLSX = pastikanSheetJS();
  const tglCetak = tanggalCetakLabel || formatTanggalCetakDefault();
  const periodeTeks = semesterRaw ? `Semester ${semesterRaw}` : semesterLabel || 'Semua Semester';

  const headerRow = [
    'Peringkat',
    'NIS',
    'Nama Siswa',
    'Kelas',
    'Mata Pelajaran',
    'Semester',
    'Tugas',
    'UTS',
    'UAS',
    'Nilai Akhir',
    'Predikat',
    `Status KKM (${kkm})`
  ];

  const sheetData = [
    [APP_NAME],
    ['REKAP NILAI SISWA'],
    [
      `Kelas: ${kelasLabel || 'Semua Kelas'} | Mapel: ${
        mapelLabel || 'Semua Mapel'
      } | Periode: ${periodeTeks} | KKM: ${kkm} | Tanggal Cetak: ${tglCetak}`
    ],
    [],
    headerRow
  ];

  rows.forEach((row) => {
    const statusKkm =
      row.akhir === null || row.akhir === undefined
        ? 'Belum Dinilai'
        : row.diBawahKkm
        ? `Di Bawah KKM (< ${kkm})`
        : 'Tuntas';
    sheetData.push([
      row.peringkat !== null && row.peringkat !== undefined ? row.peringkat : '-',
      row.nis,
      row.nama,
      row.kelas,
      row.mapel || '-',
      row.semester || '-',
      row.tugas ?? '-',
      row.uts ?? '-',
      row.uas ?? '-',
      row.akhir ?? '-',
      row.predikat,
      statusKkm
    ]);
  });

  if (stats) {
    sheetData.push([]);
    sheetData.push([
      'Statistik Kelas',
      '',
      `Rata-rata: ${stats.rataRata !== null ? stats.rataRata : '-'}`,
      '',
      `Tertinggi: ${stats.tertinggi !== null ? `${stats.tertinggi} (${stats.namaTertinggi})` : '-'}`,
      '',
      `Terendah: ${stats.terendah !== null ? `${stats.terendah} (${stats.namaTerendah})` : '-'}`
    ]);
    sheetData.push(['', '', `Siswa di Bawah KKM (< ${kkm}): ${stats.jumlahDiBawahKkm} siswa`]);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const lastCol = headerRow.length - 1;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } }
  ];
  ws['!cols'] = hitungLebarKolomOtomatis(sheetData, { headerRowIndex: 4 });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai');

  const kelasPart = formatKelasNamaFile(kelasRaw, kelasLabel);
  const mapelPart = bersihkanNamaFile(mapelRaw || (/semua/i.test(mapelLabel || '') ? 'SemuaMapel' : mapelLabel) || 'SemuaMapel');
  const smtPart = formatSemesterNamaFile(semesterRaw, semesterLabel);
  const fileName = `Rekap-Nilai_${kelasPart}_${mapelPart}_${smtPart}.xlsx`;
  tulisWorkbookAman(XLSX, wb, fileName);
  return fileName;
}

export function downloadTemplateSiswaExcel(daftarKelas = []) {
  const XLSX = pastikanSheetJS();

  const k1 = daftarKelas[0] || '7A';
  const k2 = daftarKelas[1] || k1;

  const sheetData = [
    ['NIS', 'Nama', 'Kelas', 'JK'],
    ['2026001', 'Ahmad Fauzi', k1, 'L'],
    ['2026002', 'Aisyah Putri Ramadhani', k1, 'P'],
    ['2026003', 'Muhammad Rizky', k2, 'L'],
    ['2026004', 'Fatimah Azzahra', k2, 'P']
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 8 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
  tulisWorkbookAman(XLSX, wb, `Template_Data_Siswa_${bersihkanNamaFile(APP_SHORT_NAME)}.xlsx`);
}

function cariKolom(row, kandidat) {
  const keys = Object.keys(row);
  for (const key of keys) {
    const normalized = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (kandidat.includes(normalized)) {
      return row[key];
    }
  }
  return undefined;
}

function normalisasiJk(raw) {
  const teks = String(raw || '').trim().toUpperCase();
  if (!teks) return '';
  if (teks === 'L' || teks === 'LAKI-LAKI' || teks === 'LAKILAKI' || teks === 'PRIA') return 'L';
  if (teks === 'P' || teks === 'PEREMPUAN' || teks === 'WANITA' || teks === 'W') return 'P';
  return '__INVALID__';
}

export async function parseSiswaExcelFile(file, { kelasValidList = [], existingNisSet = new Set() } = {}) {
  const XLSX = pastikanSheetJS();
  validasiFileExcel(file);
  const buffer = await file.arrayBuffer();
  const workbook = bacaWorkbookAman(XLSX, buffer);

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw buatErrorRamah(
      'File Excel terlihat kosong. Pastikan ada lembar kerja berisi daftar siswa.'
    );
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) {
    throw buatErrorRamah('Tidak ada baris data siswa yang ditemukan di dalam file Excel.');
  }

  const kelasMap = new Map();
  kelasValidList.forEach((k) => {
    const clean = String(k || '').trim();
    if (clean) kelasMap.set(clean.toUpperCase(), clean);
  });

  // Tahap 1: Baca setiap baris dan hitung kemunculan NIS untuk mendeteksi NIS ganda
  const kemunculanNis = new Map(); // nis -> array of barisKe
  const parsed = rawRows.map((raw, idx) => {
    const barisKe = idx + 2;
    const rawNis = cariKolom(raw, ['nis', 'nisn', 'nomorinduk', 'noinduk']);
    const rawNama = cariKolom(raw, ['nama', 'namasiswa', 'namalengkap']);
    const rawKelas = cariKolom(raw, ['kelas', 'rombel']);
    const rawJk = cariKolom(raw, ['jk', 'jeniskelamin', 'lp', 'kelamin', 'gender']);

    const nis = String(rawNis ?? '').trim();
    const nama = String(rawNama ?? '').trim().slice(0, 100);
    const kelasAsli = String(rawKelas ?? '').trim();
    const kelasUpper = kelasAsli.toUpperCase();
    const kelasCocok = kelasMap.get(kelasUpper) || '';
    const jk = normalisasiJk(rawJk);

    if (nis) {
      if (!kemunculanNis.has(nis)) kemunculanNis.set(nis, []);
      kemunculanNis.get(nis).push(barisKe);
    }

    return {
      barisKe,
      nis,
      nama,
      kelas: kelasCocok || kelasAsli,
      kelasUpper,
      jk,
      rawJk: String(rawJk ?? '').trim()
    };
  });

  // Tahap 2: Validasi lengkap per baris
  const allRows = parsed.map((row) => {
    const masalah = [];

    // 1. Kolom kosong
    if (!row.nis) {
      masalah.push('Kolom NIS kosong');
    } else {
      if (!/^[a-zA-Z0-9_-]+$/.test(row.nis)) {
        masalah.push('NIS hanya boleh huruf, angka, - atau _ (tanpa spasi/titik)');
      }
      if (row.nis.length > 30) {
        masalah.push('NIS terlalu panjang (maks. 30 karakter)');
      }
    }

    if (!row.nama) {
      masalah.push('Kolom Nama kosong');
    }

    if (!row.kelas) {
      masalah.push('Kolom Kelas kosong');
    } else if (kelasMap.size === 0) {
      masalah.push('Daftar kelas di sekolah belum dibuat (buka tab Kelas & Mapel dahulu)');
    } else if (!kelasMap.has(row.kelasUpper)) {
      masalah.push(`Kelas "${row.kelas}" tidak dikenal (belum terdaftar di data Kelas)`);
    }

    if (!row.jk) {
      masalah.push('Kolom JK kosong (isi L atau P)');
    } else if (row.jk === '__INVALID__') {
      masalah.push(`JK "${row.rawJk}" tidak valid (isi L atau P)`);
    }

    // 2. NIS ganda (di dalam file maupun sudah ada di database)
    if (row.nis) {
      const barisSama = kemunculanNis.get(row.nis) || [];
      if (barisSama.length > 1) {
        const barisLain = barisSama.filter((b) => b !== row.barisKe);
        masalah.push(`NIS ganda di file Excel (sama dengan baris ${barisLain.join(', ')})`);
      }
      if (existingNisSet.has(row.nis)) {
        masalah.push('NIS sudah terdaftar di Data Siswa sekolah');
      }
    }

    return {
      barisKe: row.barisKe,
      nis: row.nis,
      nama: row.nama,
      kelas: kelasMap.get(row.kelasUpper) || row.kelas,
      jk: row.jk === '__INVALID__' ? row.rawJk : row.jk,
      valid: masalah.length === 0,
      alasanError: masalah.join('; ')
    };
  });

  const validRows = allRows.filter((r) => r.valid);
  const invalidRows = allRows.filter((r) => !r.valid);

  return { allRows, validRows, invalidRows };
}

export function downloadTemplateNilaiExcel({
  siswaList = [],
  kelasLabel = '7A',
  mapelLabel = 'Mapel',
  semesterLabel = 'Ganjil'
} = {}) {
  const XLSX = pastikanSheetJS();

  const sheetData = [['NIS', 'Nama', 'Tugas', 'UTS', 'UAS']];

  if (siswaList.length > 0) {
    siswaList.forEach((s) => {
      sheetData.push([s.nis, s.nama, '', '', '']);
    });
  } else {
    sheetData.push(['2026001', 'Ahmad Fauzi', 85, 80, 88]);
    sheetData.push(['2026002', 'Aisyah Putri Ramadhani', 90, 85, 92]);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Nilai Siswa');
  const fileName = `Template_Nilai_${bersihkanNamaFile(kelasLabel)}_${bersihkanNamaFile(
    mapelLabel
  )}_${bersihkanNamaFile(semesterLabel)}.xlsx`;
  tulisWorkbookAman(XLSX, wb, fileName);
  return fileName;
}

function hitungAkhirExcel(tugas, uts, uas, bobot) {
  const pasangan = [
    { val: tugas, w: Number(bobot?.tugas ?? 30) },
    { val: uts, w: Number(bobot?.uts ?? 30) },
    { val: uas, w: Number(bobot?.uas ?? 40) }
  ].filter((p) => p.val !== null);

  if (pasangan.length === 0) return null;
  const totalBobot = pasangan.reduce((acc, p) => acc + p.w, 0);
  if (totalBobot <= 0) {
    const sum = pasangan.reduce((acc, p) => acc + p.val, 0);
    return Math.round((sum / pasangan.length) * 10) / 10;
  }
  const weighted = pasangan.reduce((acc, p) => acc + p.val * p.w, 0);
  return Math.round((weighted / totalBobot) * 10) / 10;
}

function parseNilaiSel(raw, label) {
  const teks = String(raw ?? '').trim();
  if (teks === '') return { ok: true, value: null };
  const normalized = teks.replace(',', '.');
  const num = Number(normalized);
  if (Number.isNaN(num) || num < 0 || num > 100) {
    return {
      ok: false,
      error: `Nilai ${label} "${teks}" harus angka antara 0 sampai 100`
    };
  }
  return { ok: true, value: Math.round(num * 10) / 10 };
}

export async function parseNilaiExcelFile(
  file,
  { siswaKelasMap = new Map(), bobot = { tugas: 30, uts: 30, uas: 40 } } = {}
) {
  const XLSX = pastikanSheetJS();
  validasiFileExcel(file);
  const buffer = await file.arrayBuffer();
  const workbook = bacaWorkbookAman(XLSX, buffer);

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw buatErrorRamah(
      'File Excel terlihat kosong. Pastikan ada lembar kerja berisi nilai siswa.'
    );
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) {
    throw buatErrorRamah('Tidak ada baris data nilai yang ditemukan di dalam file Excel.');
  }

  const kemunculanNis = new Map();
  const parsed = rawRows.map((raw, idx) => {
    const barisKe = idx + 2;
    const rawNis = cariKolom(raw, ['nis', 'nisn', 'nomorinduk', 'noinduk']);
    const rawNama = cariKolom(raw, ['nama', 'namasiswa', 'namalengkap']);
    const rawTugas = cariKolom(raw, ['tugas', 'nilaitugas']);
    const rawUts = cariKolom(raw, ['uts', 'pts', 'nilaiuts', 'nilaipts']);
    const rawUas = cariKolom(raw, ['uas', 'pas', 'nilaiuas', 'nilaipas']);

    const nis = String(rawNis ?? '').trim();
    const namaFile = String(rawNama ?? '').trim();

    if (nis) {
      if (!kemunculanNis.has(nis)) kemunculanNis.set(nis, []);
      kemunculanNis.get(nis).push(barisKe);
    }

    return { barisKe, nis, namaFile, rawTugas, rawUts, rawUas };
  });

  const allRows = parsed.map((row) => {
    const masalah = [];
    const siswa = row.nis ? siswaKelasMap.get(row.nis) : null;

    if (!row.nis) {
      masalah.push('Kolom NIS kosong');
    } else if (!siswa) {
      masalah.push(`NIS "${row.nis}" tidak terdaftar di kelas ini`);
    }

    if (row.nis) {
      const dups = kemunculanNis.get(row.nis) || [];
      if (dups.length > 1) {
        const lain = dups.filter((b) => b !== row.barisKe);
        masalah.push(`NIS ganda di file Excel (sama dengan baris ${lain.join(', ')})`);
      }
    }

    const cekTugas = parseNilaiSel(row.rawTugas, 'Tugas');
    const cekUts = parseNilaiSel(row.rawUts, 'UTS');
    const cekUas = parseNilaiSel(row.rawUas, 'UAS');

    if (!cekTugas.ok) masalah.push(cekTugas.error);
    if (!cekUts.ok) masalah.push(cekUts.error);
    if (!cekUas.ok) masalah.push(cekUas.error);

    if (
      cekTugas.ok &&
      cekUts.ok &&
      cekUas.ok &&
      cekTugas.value === null &&
      cekUts.value === null &&
      cekUas.value === null
    ) {
      masalah.push('Isi minimal satu nilai (Tugas, UTS, atau UAS)');
    }

    const valid = masalah.length === 0;
    const akhir = valid ? hitungAkhirExcel(cekTugas.value, cekUts.value, cekUas.value, bobot) : null;

    return {
      barisKe: row.barisKe,
      nis: row.nis,
      nama: siswa?.nama || row.namaFile || '-',
      tugas: cekTugas.ok ? cekTugas.value : String(row.rawTugas ?? '').trim(),
      uts: cekUts.ok ? cekUts.value : String(row.rawUts ?? '').trim(),
      uas: cekUas.ok ? cekUas.value : String(row.rawUas ?? '').trim(),
      akhir,
      valid,
      alasanError: masalah.join('; ')
    };
  });

  const validRows = allRows.filter((r) => r.valid);
  const invalidRows = allRows.filter((r) => !r.valid);
  return { allRows, validRows, invalidRows };
}

export function exportBackupSemuaDataExcel({
  siswaList = [],
  kelasList = [],
  mapelList = [],
  absensiList = [],
  rekapAbsenList = [],
  nilaiList = [],
  usersList = [],
  bobot = { tugas: 30, uts: 30, uas: 40 },
  kkm = 75,
  tanggalHariIniStr = ''
}) {
  const XLSX = pastikanSheetJS();
  const wb = XLSX.utils.book_new();
  const siswaMap = new Map(siswaList.map((s) => [s.nis || s.id, s]));

  function tambahSheet(namaSheet, header, rows) {
    const aoa = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = hitungLebarKolomOtomatis(aoa, { headerRowIndex: 0 });
    XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  }

  // 1. Data Siswa
  tambahSheet(
    'Data Siswa',
    ['NIS', 'Nama Siswa', 'Kelas', 'JK'],
    siswaList.map((s) => [s.nis || s.id, s.nama || '', s.kelas || '', s.jk || ''])
  );

  // 2. Daftar Kelas
  tambahSheet(
    'Daftar Kelas',
    ['Nama Kelas', 'Wali Kelas', 'Tahun Ajaran'],
    kelasList.map((k) => [k.nama || k.id, k.waliKelas || '', k.tahunAjaran || ''])
  );

  // 3. Mata Pelajaran
  const guruMap = new Map(usersList.map((u) => [u.uid || u.id, u.nama || u.email || '']));
  tambahSheet(
    'Mata Pelajaran',
    ['ID Mapel', 'Nama Mata Pelajaran', 'Guru Pengampu'],
    mapelList.map((m) => [m.id, m.nama || '', guruMap.get(m.guruId) || m.guruId || ''])
  );

  // 4. Absensi Harian
  const absenRows = [];
  absensiList
    .slice()
    .sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || '')))
    .forEach((docAbs) => {
      const recs = docAbs.records || {};
      Object.entries(recs).forEach(([nis, status]) => {
        const s = siswaMap.get(nis);
        absenRows.push([docAbs.tanggal || '', docAbs.kelas || '', nis, s?.nama || '-', status]);
      });
    });
  tambahSheet('Absensi Harian', ['Tanggal', 'Kelas', 'NIS', 'Nama Siswa', 'Status'], absenRows);

  // 5. Rekap Absen Bulanan
  const rekapRows = [];
  rekapAbsenList.forEach((docRekap) => {
    const ringkasan = docRekap.ringkasan || {};
    Object.entries(ringkasan).forEach(([nis, item]) => {
      const H = Number(item?.H || 0);
      const S = Number(item?.S || 0);
      const I = Number(item?.I || 0);
      const A = Number(item?.A || 0);
      const total = H + S + I + A;
      const persen = total > 0 ? `${Math.round((H / total) * 100)}%` : '-';
      rekapRows.push([
        docRekap.kelas || '',
        docRekap.bulan || '',
        nis,
        item?.nama || siswaMap.get(nis)?.nama || '-',
        H,
        S,
        I,
        A,
        total,
        persen
      ]);
    });
  });
  tambahSheet(
    'Rekap Absen Bulanan',
    ['Kelas', 'Bulan', 'NIS', 'Nama Siswa', 'H', 'S', 'I', 'A', 'Total', 'Kehadiran'],
    rekapRows
  );

  // 6. Nilai Siswa
  tambahSheet(
    'Nilai Siswa',
    ['NIS', 'Nama Siswa', 'Kelas', 'Mata Pelajaran', 'Semester', 'Tugas', 'UTS', 'UAS', 'Nilai Akhir'],
    nilaiList.map((n) => [
      n.nis || '',
      siswaMap.get(n.nis)?.nama || '-',
      n.kelas || '',
      n.mapel || '',
      n.semester || '',
      n.tugas ?? '-',
      n.uts ?? '-',
      n.uas ?? '-',
      n.akhir ?? '-'
    ])
  );

  // 7. Akun Pengguna
  tambahSheet(
    'Akun Pengguna',
    ['Nama', 'Email', 'Peran', 'Kelas Diajar', 'Mapel Diampu', 'Wali Kelas', 'Status'],
    usersList.map((u) => [
      u.nama || '',
      u.email || '',
      u.role || '',
      Array.isArray(u.kelasDiampu) ? u.kelasDiampu.join(', ') : '',
      Array.isArray(u.mapelDiampu) ? u.mapelDiampu.join(', ') : '',
      u.waliKelas || '',
      u.aktif === false ? 'Nonaktif' : 'Aktif'
    ])
  );

  // 8. Pengaturan
  tambahSheet('Pengaturan', ['Pengaturan', 'Nilai'], [
    ['Nama Aplikasi', APP_NAME],
    ['Nama Sekolah', SEKOLAH],
    ['Bobot Tugas (%)', bobot?.tugas ?? 30],
    ['Bobot UTS (%)', bobot?.uts ?? 30],
    ['Bobot UAS (%)', bobot?.uas ?? 40],
    ['KKM Sekolah', kkm ?? 75]
  ]);

  const stempel = bersihkanNamaFile(tanggalHariIniStr || new Date().toISOString().slice(0, 10));
  const fileName = `Cadangan_Data_${bersihkanNamaFile(APP_SHORT_NAME)}_${stempel}.xlsx`;
  tulisWorkbookAman(XLSX, wb, fileName);
  return fileName;
}
