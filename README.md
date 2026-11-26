# LMS SMP MUHAMMADIYAH AL FURQAN

Aplikasi web statis murni (**HTML**, **CSS**, dan **JavaScript ES Modules** tanpa build tool) untuk mencatat absensi harian, menginput nilai siswa, memantau rekap kehadiran dan peringkat nilai, serta ekspor/impor Excel di **SMP MUHAMMADIYAH AL FURQAN**. Dirancang agar dapat langsung dijalankan di **GitHub Pages** menggunakan Firebase SDK modular via CDN dan SheetJS via CDN.

---

## (a) Tentang Aplikasi & Fitur Utama

**LMS SMP MUHAMMADIYAH AL FURQAN** membantu guru, wali kelas, dan admin sekolah mengelola administrasi kelas secara cepat dari HP maupun komputer dengan tampilan yang sederhana, huruf besar (minimal 16px), tombol jelas, dan bahasa Indonesia sehari-hari.

Fitur utama:
- **Login Aman & Mudah**: Jalur utama menggunakan **Masuk dengan Akun Google**, disertai opsi **Email & Kata Sandi** (dengan pemeriksaan verifikasi email dan fitur **Lupa kata sandi?**).
- **3 Peran Pengguna (`users/{uid}`)**:
  - **Admin (`admin`)**: Mengelola semua data siswa, kelas, mata pelajaran, impor/ekspor Excel, pengaturan bobot nilai & KKM, cadangan semua data ke Excel, serta mengelola akun guru/wali kelas.
  - **Guru (`guru`)**: Mencatat absen kelas yang diajar dan menginput atau mengimpor nilai mata pelajaran yang diampu.
  - **Wali Kelas (`wali_kelas`)**: Memantau rekap absen dan rekap nilai untuk kelas perwaliannya.
- **4 Menu Utama + Panduan Guru**: Hanya **Absen**, **Nilai**, **Rekap**, dan **Data Siswa** (ditambah halaman **Panduan Guru** 5 langkah bergambar).
- **Responsif HP & PC**: Menu bawah dan tampilan kartu di layar HP; menu samping dan tampilan tabel di layar PC.
- **Impor & Ekspor Excel (SheetJS)**: Unduh template siswa & nilai, pratinjau unggahan Excel dengan penanda merah untuk baris bermasalah (batas ukuran file 5 MB, format `.xlsx`, `.xls`, `.csv`), serta ekspor rekap Excel rapi dan siap cetak.
- **Siap Pasang (PWA)**: Mendukung *Tambahkan ke Layar Utama* dengan path relatif untuk subfolder GitHub Pages (`/LMS-SMP-MUH-ALFURQAN-BJM/`).

---

## (b) Cara Mengisi `firebase-config.js`

1. Pastikan di folder utama repository (sejajar dengan `index.html`) terdapat file `firebase-config.js` (jika membuat project baru, salin `firebase-config.example.js` lalu ubah namanya menjadi `firebase-config.js`).
2. Buka [Firebase Console](https://console.firebase.google.com/) dan pilih project Firebase sekolah Anda.
3. Klik ikon roda gigi di kiri atas lalu pilih **Project settings**.
4. Gulir ke bagian **Your apps**, pilih aplikasi Web (`</>`), lalu salin nilai berikut ke objek `firebaseConfig` di dalam `firebase-config.js`:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. Pada bagian `firestoreDatabaseId`:
   - Biarkan kosong (`""`) jika memakai database standar `(default)`.
   - Isi dengan nama ID database khusus jika Anda menggunakan database bernama khusus (misalnya `ai-studio-4f526c77-d9e6-40e6-a915-3d5e4fc267d1`).

> **Catatan Keamanan:** Nilai `apiKey`, `projectId`, dan konfigurasi Web App Firebase di dalam `firebase-config.js` memang dirancang **boleh bersifat publik** pada aplikasi web statis. Keamanan seluruh data sekolah ditentukan sepenuhnya oleh **Firestore Security Rules** dan verifikasi akun **Firebase Authentication**.

---

## (c) Cara Memasang `firestore.rules` di Firebase Console

1. Buka [Firebase Console](https://console.firebase.google.com/) > pilih project sekolah Anda.
2. Pada menu kiri, masuk ke **Build > Firestore Database**.
3. **PENTING (Memilih Database yang Benar):** Jika project Anda menggunakan **database bernama khusus** (seperti `ai-studio-4f526c77-d9e6-40e6-a915-3d5e4fc267d1`), klik dropdown pemilih database di bagian atas halaman Firestore Database dan pastikan Anda memilih database yang **sama persis** dengan nilai `firestoreDatabaseId` di `firebase-config.js` (jangan sampai tertukar dengan `(default)`).
4. Klik tab **Rules** pada database yang sudah dipilih tersebut.
5. Hapus aturan bawaan (pastikan tidak memakai mode test), salin seluruh isi file `firestore.rules` dari repository ini, lalu tempelkan ke editor Rules.
6. Klik tombol **Publish** untuk mengaktifkan aturan keamanan.

---

## (d) Cara Membuat Admin Pertama (`admins/{UID}`)

Tidak ada alamat email admin yang ditanam di dalam kode aplikasi. Admin pertama ditentukan langsung melalui koleksi `admins` di Cloud Firestore:

1. Di Firebase Console, buka **Build > Authentication > Sign-in method** lalu aktifkan **Google** dan **Email/Password**.
2. Dapatkan **UID akun Admin pertama**:
   - Buka aplikasi sekali lalu login memakai **Masuk dengan Akun Google** menggunakan akun Google Admin sekolah, **atau** tambahkan akun baru secara manual di **Authentication > Users** (pastikan emailnya terverifikasi).
   - Buka tab **Authentication > Users** dan salin nilai **User UID** milik akun Admin tersebut.
3. Buka **Build > Firestore Database** dan pastikan **database yang dipilih sudah benar** (sesuai `firestoreDatabaseId`).
4. Klik **Start collection**, isi Collection ID: `admins`.
5. Pada **Document ID**, tempelkan **UID akun Admin** yang sudah disalin tadi.
6. Tambahkan minimal satu field (misalnya Field: `aktif`, Type: `boolean`, Value: `true`), lalu klik **Save**.
7. Buka kembali aplikasi dan login memakai akun Admin tersebut. Profil `users/{uid}` dengan `role: "admin"` dan `aktif: true` akan otomatis dibuat sehingga Admin dapat mulai menambah data kelas, siswa, dan akun guru lewat menu **Data Siswa > Akun Guru**.

---

## (e) Cara Menambah Domain `github.io` di Authorized Domains

Agar tombol **Masuk dengan Akun Google** berfungsi saat aplikasi dibuka melalui GitHub Pages, domain GitHub Pages wajib didaftarkan terlebih dahulu:

1. Buka Firebase Console > **Build > Authentication**.
2. Pilih tab **Settings**, lalu klik menu **Authorized domains**.
3. Klik tombol **Add domain**.
4. Masukkan domain utama GitHub Pages Anda, misalnya `username.github.io` (hanya nama domainnya, tanpa `https://` dan tanpa `/nama-repository/`), lalu klik **Add**.

---

## (f) Cara Mengaktifkan GitHub Pages (`Deploy from a branch`)

1. Unggah isi aplikasi statis (`index.html`, `manifest.json`, `firebase-config.js`, `firebase-config.example.js`, `css/`, `js/`, `icons/`, `README.md`, `firestore.rules`) ke repository GitHub Anda (misalnya `LMS-SMP-MUH-ALFURQAN-BJM`).
2. Di halaman repository GitHub, buka tab **Settings**.
3. Di bilah sisi kiri, klik **Pages**.
4. Pada bagian **Build and deployment**:
   - **Source**: pilih **Deploy from a branch**
   - **Branch**: pilih `main` dan folder `/ (root)`
5. Klik **Save**.
6. Tunggu 1–2 menit hingga alamat situs Anda muncul di bagian atas halaman **Pages** (misalnya `https://username.github.io/LMS-SMP-MUH-ALFURQAN-BJM/`).

> **Catatan Preview AI Studio:** Folder ini juga menyertakan `package.json` minimal (tanpa dependensi/build tool) dan `firebase-applet-config.json` semata-mata agar pratinjau langsung di AI Studio tetap berjalan. Saat di-deploy ke **GitHub Pages** melalui *Deploy from a branch*, GitHub Pages langsung menyajikan `index.html`, `css/`, dan `js/` secara statis tanpa menjalankan build.

---

## (g) Panduan Singkat untuk Guru

1. **Login**:
   - Buka alamat aplikasi di HP atau komputer, lalu tekan tombol utama **Masuk dengan Akun Google** memakai akun Gmail yang sudah didaftarkan Admin.
   - Jika memakai Email & Kata Sandi dari Admin dan muncul peringatan belum terverifikasi, buka kotak masuk email Anda, klik tautan verifikasi, lalu tekan **Saya Sudah Verifikasi** (atau **Kirim ulang email verifikasi** jika email belum masuk).
2. **Isi Absen**:
   - Buka menu **Absen**.
   - Pilih **Kelas** lalu pilih **Tanggal** (otomatis terisi hari ini).
   - Semua siswa otomatis bertanda **Hadir**. Sentuh nama siswa (atau tombol status) untuk mengubah menjadi **Sakit**, **Izin**, atau **Alpa**, lalu tekan **Simpan Absen** hingga muncul notifikasi **Berhasil disimpan ✓**.
3. **Isi Nilai**:
   - Buka menu **Nilai**, lalu pilih **Kelas**, **Mata Pelajaran**, dan **Semester**.
   - Ketik nilai **Tugas**, **UTS**, dan **UAS** (angka `0` sampai `100`) — Nilai Akhir terhitung otomatis sesuai bobot — lalu tekan **Simpan Semua Nilai**.
   - Untuk pengisian cepat lewat Excel, tekan **Unduh Template Nilai**, isi nilai di Excel (format `.xlsx`/`.xls`/`.csv`, maksimal 5 MB), unggah lewat **Impor Nilai dari Excel**, periksa pratinjau, lalu tekan **Simpan**.
4. **Unduh Rekap**:
   - Buka menu **Rekap**, lalu pilih tab **Rekap Absen** atau **Rekap Nilai**.
   - Atur saringan Kelas/Periode/Mapel/KKM, kemudian tekan **Unduh Excel** untuk mengunduh file `.xlsx` rapi (misalnya `Rekap-Absen_Kelas7A_Nov2026.xlsx` atau `Rekap-Nilai_Kelas7A_Matematika_Smt1.xlsx`) atau tekan **Cetak** untuk mencetak laporan.

---

## (h) Cara Cadangan Data ke Excel

Admin sekolah disarankan melakukan pencadangan data secara berkala:

1. Masuk sebagai **Admin** dan buka menu **Data Siswa**.
2. Pada panel **Cadangkan Data Sekolah** di bagian atas halaman, tekan tombol **Cadangkan Semua Data ke Excel**.
3. Aplikasi akan mengunduh satu file Excel (`Cadangan_Data_LMS_Al_Furqan_YYYY-MM-DD.xlsx`) berisi 8 lembar kerja (*sheet*) lengkap: **Data Siswa**, **Daftar Kelas**, **Mata Pelajaran**, **Absensi Harian**, **Rekap Absen Bulanan**, **Nilai Siswa**, **Akun Pengguna**, dan **Pengaturan** (Bobot Nilai & KKM).
4. Simpan file cadangan tersebut di Google Drive sekolah atau komputer tata usaha.
