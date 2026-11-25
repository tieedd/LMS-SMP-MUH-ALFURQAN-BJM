// Security rules verification test suite (Phase 0 TDD specification)
// Designed for Firebase Emulator Suite (@firebase/rules-unit-testing)

export const DIRTY_DOZEN_CASES = [
  { name: '01_unauth_list_siswa', collection: 'siswa', op: 'list', expect: 'PERMISSION_DENIED' },
  { name: '02_unverified_email_create_siswa', collection: 'siswa', op: 'create', expect: 'PERMISSION_DENIED' },
  { name: '03_self_role_escalation_users', collection: 'users', op: 'create', payload: { role: 'admin' }, expect: 'PERMISSION_DENIED' },
  { name: '04_owner_spoofing_siswa', collection: 'siswa', op: 'create', payload: { ownerId: 'otherUid' }, expect: 'PERMISSION_DENIED' },
  { name: '05_shadow_field_siswa', collection: 'siswa', op: 'create', payload: { isVerified: true }, expect: 'PERMISSION_DENIED' },
  { name: '06_id_poisoning_siswa', collection: 'siswa', op: 'create', docId: 'bad$id', expect: 'PERMISSION_DENIED' },
  { name: '07_orphaned_absensi', collection: 'absensi', op: 'create', payload: { siswaId: 'nonexistent' }, expect: 'PERMISSION_DENIED' },
  { name: '08_invalid_status_absensi', collection: 'absensi', op: 'create', payload: { status: 'Bolos' }, expect: 'PERMISSION_DENIED' },
  { name: '09_out_of_range_skor_nilai', collection: 'nilai', op: 'create', payload: { skor: 105 }, expect: 'PERMISSION_DENIED' },
  { name: '10_timestamp_forgery', collection: 'siswa', op: 'create', payload: { createdAt: '2020-01-01T00:00:00Z' }, expect: 'PERMISSION_DENIED' },
  { name: '11_immutable_owner_update', collection: 'nilai', op: 'update', payload: { ownerId: 'otherUid' }, expect: 'PERMISSION_DENIED' },
  { name: '12_cross_tenant_read_nilai', collection: 'nilai', op: 'get', expect: 'PERMISSION_DENIED' }
];
