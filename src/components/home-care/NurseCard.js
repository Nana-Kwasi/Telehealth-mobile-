import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeCareColors as C } from '../../constants/homeCareColors';
import { formatGhs, nursePresenceLabel } from '../../utils/homeCareUtils';
import { formatDistanceKm, parseCoords } from '../../utils/homeCareGeo';
import { FEE_DISCLAIMER } from '../../constants/homeCareConstants';
import NurseAvatar from './NurseAvatar';

export default function NurseCard({ nurse, onPressProfile, onPressBook }) {
  const fees = nurse?.fees || {};
  const presence = nurse?.presenceStatus || 'offline';

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onPressProfile} activeOpacity={0.85}>
        <View style={styles.row}>
          <NurseAvatar nurse={nurse} size={52} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{nurse.fullName || 'Nurse'}</Text>
              {nurse.verified !== false && (
                <View style={styles.verified}>
                  <Ionicons name="checkmark-circle" size={14} color={C.success} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
            <Text style={styles.meta}>{nurse.specialty || 'General Nursing'}</Text>
            <Text style={styles.meta}>
              {nurse.yearsExperience || 0} yrs · ★ {(nurse.ratingAvg || 0).toFixed(1)} ({nurse.ratingCount || 0})
              {nurse.distanceKm != null && parseCoords(nurse) ? ` · ${formatDistanceKm(nurse.distanceKm)}` : ''}
            </Text>
            <Text style={styles.fee}>
              From {formatGhs(fees.daily)}/day · {formatGhs(fees.weekly)}/wk · {formatGhs(fees.monthly)}/mo
            </Text>
            <Text style={styles.feeNote}>Fee may vary</Text>
          </View>
        </View>
      </TouchableOpacity>
      <View style={styles.footer}>
        <View style={[styles.status, (presence === 'online' || presence === 'busy') && styles.statusOn]}>
          <Text style={styles.statusText}>{nursePresenceLabel(presence)}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnGhost} onPress={onPressProfile}>
            <Text style={styles.btnGhostText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={onPressBook}>
            <Text style={styles.btnPrimaryText}>Book</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  row: { flexDirection: 'row', gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: C.primaryDark },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  name: { fontSize: 16, fontWeight: '800', color: C.text },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  verifiedText: { fontSize: 10, fontWeight: '700', color: C.success },
  meta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  fee: { fontSize: 11, color: C.primaryDark, marginTop: 6, fontWeight: '600' },
  feeNote: { fontSize: 10, color: C.textLight, fontStyle: 'italic' },
  footer: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  statusOn: { backgroundColor: '#dcfce7' },
  statusText: { fontSize: 11, fontWeight: '700', color: C.textSecondary },
  actions: { flexDirection: 'row', gap: 8 },
  btnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  btnGhostText: { fontSize: 12, fontWeight: '700', color: C.text },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: C.primary,
  },
  btnPrimaryText: { fontSize: 12, fontWeight: '800', color: '#fff' },
});
