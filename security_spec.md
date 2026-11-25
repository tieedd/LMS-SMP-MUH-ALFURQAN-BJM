# Security Specification — Rekap Nilai & Absen SMP Muhammadiyah Al Furqan

## 1. Data Invariants
1. Every `users/{userId}` document belongs strictly to `request.auth.uid == userId`; teachers cannot escalate `role` to `'admin'`.
2. Every `siswa/{siswaId}` document must have `ownerId == request.auth.uid`, valid `nis`, `nama`, `kelas`, `jenisKelamin` in `['L', 'P']`, and server-verified timestamps.
3. Every `absensi/{absensiId}` document must reference an existing `siswa` document owned by the same `ownerId`, with valid `YYYY-MM-DD` date and `status` in `['Hadir', 'Sakit', 'Izin', 'Alpa']`.
4. Every `nilai/{nilaiId}` document must reference an existing `siswa` document owned by the same `ownerId`, with `skor` strictly numeric between `0` and `100` inclusive, and `jenis` in `['Tugas', 'UH', 'PTS', 'PAS', 'Praktik']`.
5. No unauthenticated or unverified-email writes; no blanket `list` queries without `resource.data.ownerId == request.auth.uid` (or `isAdmin()`).

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. Unauthenticated read/list of `/siswa`.
2. Unverified email user attempting to create `/siswa`.
3. Self-escalation: teacher creating `/users/{uid}` with `role: 'admin'`.
4. Identity spoofing: teacher A creating `/siswa` with `ownerId: 'teacherB'`.
5. Shadow field injection: adding `extraAdminFlag: true` on `/siswa` create/update.
6. ID poisoning: creating `/siswa/invalid..id/..` or >128 char document ID.
7. Orphaned attendance: creating `/absensi` referencing a non-existent `siswaId` or another teacher's `siswaId`.
8. Invalid attendance status: setting `status: 'Bolos'` instead of allowlisted enum.
9. Grade out of range: setting `skor: 150` or `skor: -5` or string `'100'` on `/nilai`.
10. Timestamp forgery: setting `createdAt` or `updatedAt` to a past/future client timestamp instead of `request.time`.
11. Immutable field tampering: updating `ownerId`, `siswaId`, or `createdAt` on `/absensi` or `/nilai`.
12. Cross-tenant query scraping: teacher A querying `/nilai` belonging to teacher B.
