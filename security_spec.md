# Security Specification — LMS SMP MUHAMMADIYAH AL FURQAN

## 1. Data Invariants
1. `admins/{uid}` & `users/{userId}`: Admin status is determined strictly by an existing `admins/{uid}` document or an active `users/{uid}` profile with `role == 'admin'` (never by hardcoded emails). Only verified `admin` users can create, update, or delete role profiles (`admin`, `guru`, `wali_kelas`); non-admins can only read their own profile.
2. `kelas/{kelasId}` & `mapel/{mapelId}`: Managed strictly by `admin`. Teachers and homeroom teachers may only read classes/subjects scoped to their role.
3. `siswa/{nis}`: Document ID equals valid `nis` (`^[a-zA-Z0-9_-]+$`), stores `nama`, `kelas` (must reference an existing `kelas/{kelas}`), and `jk` (`'L' | 'P'`). Managed strictly by `admin`; read-only for assigned `guru` and `wali_kelas`.
4. `absensi/{kelasId_tanggal}`: Document ID must equal `incoming().kelas + '_' + incoming().tanggal`; stores `tanggal`, `kelas`, and `records` map (`<= 100` entries). Writable by `admin` or active `guru` for `kelas in myProfile().kelasDiampu`; read-only for `wali_kelas`.
5. `nilai/{nis_mapel_semester}`: Stores `nis` (must match `siswa/{nis}` in `kelas`), `kelas`, `mapel`, `semester` (`Ganjil` | `Genap`), numeric `tugas`, `uts`, `uas`, `akhir` (`0..100` or null for component scores). Writable by `admin` or active `guru` for matching `kelasDiampu` and `mapelDiampu`.
6. `rekapAbsen/{kelasId_bulan}`: Document ID must equal `incoming().kelas + '_' + incoming().bulan`; stores monthly `ringkasan` H/S/I/A summary writable by `admin` or `guru` for `kelasDiampu`, readable by `wali_kelas` for `waliKelas`.
7. `pengaturan/{bobotNilai|kkm}`: Readable by active verified staff; writable strictly by `admin` with bounded numeric values (`bobotNilai` sums to 100, `kkm` between 0 and 100).

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. Unauthenticated read/list on `/siswa`, `/kelas`, `/absensi`, `/nilai`, or `/rekapAbsen`.
2. Unverified email account attempting writes to any collection.
3. Role self-escalation on `/users/{uid}` (`role: 'admin'`).
4. Creating `siswa/{nis}` referencing a non-existent `kelas` document.
5. Creating `siswa/{nis}` with invalid `jk` (e.g., `'X'`) or invalid ID characters (`..` or spaces).
6. Guru writing `absensi/{kelasId_tanggal}` for a class outside `kelasDiampu`.
7. Mismatched `absensi` document ID (e.g., `absensi/7B_2026-11-24` with `kelas: '7A'`).
8. Guru writing `nilai` for a subject outside `mapelDiampu` or student not in `kelas`.
9. Out-of-range grade (`tugas: 120` or `akhir: -1` or string `'90'`).
10. Wali kelas attempting to write or delete `/siswa`, `/absensi`, `/nilai`, or `/rekapAbsen`.
11. Timestamp forgery (`createdAt` / `updatedAt` != `request.time`) or immutable key tampering on update.
12. Shadow fields injected into any document (`extraFlag: true`).
