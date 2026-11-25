# Security Specification — Rekap Nilai & Absen SMP Muhammadiyah Al Furqan

## 1. Data Invariants (RBAC: `admin`, `guru`, `wali_kelas`)
1. Every `users/{userId}` document stores `uid`, `nama`, `email`, `role` in `['admin', 'guru', 'wali_kelas']`, `kelasDiampu`, `mapelDiampu`, `waliKelas`, `aktif`, and server timestamps. Only verified `admin` users can create, update, or delete user role profiles. Users may only read their own profile.
2. Only verified `admin` users can create, update, delete, or bulk-import `siswa` records. `guru` can read/list `siswa` strictly where `kelas in myProfile().kelasDiampu`; `wali_kelas` can read/list `siswa` strictly where `kelas == myProfile().waliKelas`.
3. `absensi/{absensiId}` can be written by `admin` (all classes) or active `guru` strictly for `kelas in myProfile().kelasDiampu` and referencing a `siswaId` in that same `kelas`. `wali_kelas` has read-only access strictly to `kelas == myProfile().waliKelas`.
4. `nilai/{nilaiId}` can be written by `admin` (all classes/subjects) or active `guru` strictly for `kelas in myProfile().kelasDiampu` AND `mapel in myProfile().mapelDiampu`, with `skor` strictly numeric (`0..100`) and `jenis` in `['Tugas', 'UH', 'PTS', 'PAS', 'Praktik']`. `wali_kelas` has read-only access strictly to `kelas == myProfile().waliKelas`.
5. No unauthenticated or unverified-email writes; default-deny catch-all at root.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. Unauthenticated read/list of `/siswa` or `/users`.
2. Unverified email user attempting to create `/absensi` or `/nilai`.
3. Self-escalation: teacher or wali_kelas creating/updating `/users/{uid}` with `role: 'admin'`.
4. Inactive user (`aktif: false`) attempting to read or write `/absensi` or `/nilai`.
5. Shadow field injection: adding `extraAdminFlag: true` on `/siswa`, `/absensi`, `/nilai`, or `/users`.
6. ID poisoning: creating `/siswa/invalid..id/..` or >128 char document ID.
7. Cross-class teacher attendance write: `guru` assigned to `['7A']` attempting to write `/absensi` for `'8B'`.
8. Cross-subject teacher grade write: `guru` assigned to `['Matematika']` attempting to write `/nilai` for `'IPA'`.
9. Wali kelas write attempt: `wali_kelas` attempting to create/update/delete `/siswa`, `/absensi`, or `/nilai`.
10. Grade out of range: setting `skor: 150` or `skor: -5` or string `'100'` on `/nilai`.
11. Timestamp forgery: setting `createdAt` or `updatedAt` to a past/future client timestamp instead of `request.time`.
12. Cross-class `list` query scraping: `wali_kelas` or `guru` querying `/siswa`, `/absensi`, or `/nilai` without matching `kelas` / `mapel` constraints.
