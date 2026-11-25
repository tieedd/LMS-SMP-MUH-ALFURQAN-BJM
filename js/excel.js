// ==========================================================================
// Modul Excel (SheetJS via CDN)
// Mengurus download rekap absen, rekap nilai, contoh file, dan impor siswa.
// ==========================================================================

function pastikanSheetJS() {
  if (typeof window.XLSX === 'undefined') {
    throw new Error(
      'Fitur Excel belum termuat sempurna. Periksa koneksi internet Anda lalu muat ulang halaman.'
    );
  }
  return window.XLSX;
}

function bersihkanNamaFile(teks) {
  return String(teks || 'data')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export function exportRekapAbsenExcel({ rows, kelasLabel, periodeLabel }) {
  const XLSX = pastikanSheetJS();

  const sheetData = [
    ['SMP MUHAMMADIYAH AL FURQAN'],
    ['REKAP KEHADIRAN SISWA'],
    [`Kelas: ${kelasLabel || 'Semua Kelas'}`, '', `Periode: ${periodeLabel || 'Semua Tanggal'}`],
    [],
    ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total Hari', 'Persentase Hadir']
  ];

  rows.forEach((row, index) => {
    sheetData.push([
      index + 1,
      row.nis,
      row.nama,
      row.kelas,
      row.hadir,
      row.sakit,
      row.izin,
      row.alpa,
      row.total,
      `${row.persen}%`
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 15 },
    { wch: 30 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 12 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absen');

  const fileName = `Rekap_Absen_${bersihkanNamaFile(kelasLabel || 'Semua')}_${bersihkanNamaFile(
    periodeLabel || 'Semua'
  )}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

export function exportRekapNilaiExcel({ rows, kelasLabel, mapelLabel }) {
  const XLSX = pastikanSheetJS();

  const sheetData = [
    ['SMP MUHAMMADIYAH AL FURQAN'],
    ['REKAP NILAI SISWA'],
    [`Kelas: ${kelasLabel || 'Semua Kelas'}`, '', `Mata Pelajaran: ${mapelLabel || 'Semua Mapel'}`],
    [],
    ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Rata Tugas', 'Rata UH', 'PTS', 'PAS', 'Praktik', 'Nilai Akhir', 'Predikat']
  ];

  rows.forEach((row, index) => {
    sheetData.push([
      index + 1,
      row.nis,
      row.nama,
      row.kelas,
      row.rataTugas ?? '-',
      row.rataUH ?? '-',
      row.rataPTS ?? '-',
      row.rataPAS ?? '-',
      row.rataPraktik ?? '-',
      row.nilaiAkhir ?? '-',
      row.predikat
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 15 },
    { wch: 30 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 13 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai');

  const fileName = `Rekap_Nilai_${bersihkanNamaFile(kelasLabel || 'Semua')}_${bersihkanNamaFile(
    mapelLabel || 'Semua'
  )}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

export function downloadTemplateSiswaExcel() {
  const XLSX = pastikanSheetJS();

  const sheetData = [
    ['NIS', 'Nama', 'Kelas', 'Jenis Kelamin'],
    ['2026001', 'Ahmad Fauzi', '7A', 'L'],
    ['2026002', 'Aisyah Putri', '7A', 'P'],
    ['2026003', 'Budi Santoso', '7B', 'L'],
    ['2026004', 'Fatimah Azzahra', '7B', 'P']
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [{ wch: 15 }, { wch: 28 }, { wch: 10 }, { wch: 15 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
  XLSX.writeFile(wb, 'Contoh_Data_Siswa_Al_Furqan.xlsx');
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

export async function parseSiswaExcelFile(file) {
  const XLSX = pastikanSheetJS();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('File Excel terlihat kosong. Pastikan ada lembar kerja berisi daftar siswa.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) {
    throw new Error('Tidak ada baris data siswa yang ditemukan di dalam file Excel.');
  }

  const validRows = [];
  const skippedRows = [];

  rawRows.forEach((raw, idx) => {
    const barisKe = idx + 2;
    const rawNis = cariKolom(raw, ['nis', 'nisn', 'nomorinduk', 'noinduk']);
    const rawNama = cariKolom(raw, ['nama', 'namasiswa', 'namalengkap']);
    const rawKelas = cariKolom(raw, ['kelas', 'rombel']);
    const rawJk = cariKolom(raw, ['jeniskelamin', 'jk', 'lp', 'kelamin', 'gender']);

    const nama = String(rawNama || '').trim().slice(0, 100);
    const kelas = String(rawKelas || '').trim().slice(0, 20);
    let nis = String(rawNis || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 30);

    if (!nis && nama) {
      nis = `S${Date.now().toString().slice(-4)}${idx + 1}`;
    }

    const jkText = String(rawJk || 'L').trim().toUpperCase();
    const jenisKelamin = jkText.startsWith('P') || jkText === 'PEREMPUAN' || jkText === 'W' ? 'P' : 'L';

    if (!nama || !kelas) {
      skippedRows.push(barisKe);
      return;
    }

    validRows.push({
      nis,
      nama,
      kelas,
      jenisKelamin
    });
  });

  return { validRows, skippedRows };
}
