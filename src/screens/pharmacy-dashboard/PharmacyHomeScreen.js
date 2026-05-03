import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, updateDoc,
} from 'firebase/firestore';
import { updatePassword as updatePwd } from 'firebase/auth';
import { PharmacyColors as C } from '../../constants/colors';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';

export default function PharmacyHomeScreen({ profile, navigation }) {
  const [stats, setStats] = useState({ branches: 0, incoming: 0, active: 0, ready: 0, delivered: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Forced password reset
  const [mustChange, setMustChange] = useState(profile?.mustChangePassword === true);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const pid = profile?.id;
      if (!pid) return;
      const [branchSnap, rxSnap] = await Promise.all([
        getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', pid))),
        getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', pid))),
      ]);
      const rxList = rxSnap.docs.map(d => d.data());
      setStats({
        branches:  branchSnap.size,
        incoming:  rxList.filter(r => r.pharmacyStatus === 'sent').length,
        active:    rxList.filter(r => ['accepted', 'partially_fulfilled'].includes(r.pharmacyStatus)).length,
        ready:     rxList.filter(r => r.pharmacyStatus === 'ready').length,
        delivered: rxList.filter(r => r.pharmacyStatus === 'delivered').length,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    if (newPw === oldPw) { setPwError('New password must differ from current.'); return; }
    setPwSaving(true);
    try {
      const user = auth.currentUser;
      const credential = EAP.credential(user.email, oldPw);
      await reauth(user, credential);
      await updatePwd(user, newPw);
      await updateDoc(doc(db, 'pharmacies', profile.id), { mustChangePassword: false });
      setMustChange(false);
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        setPwError('Log out, sign in with your temporary password again, then try.');
      } else { setPwError('Failed to update password. Try again.'); }
    } finally { setPwSaving(false); }
  };

  const STATS = [
    { label: 'Branches',  value: stats.branches,  icon: 'storefront', color: '#0369a1' },
    { label: 'Incoming',  value: stats.incoming,   icon: 'arrow-down-circle', color: '#7c3aed' },
    { label: 'Active',    value: stats.active,     icon: 'time', color: '#d97706' },
    { label: 'Ready',     value: stats.ready,      icon: 'checkmark-circle', color: '#16a34a' },
    { label: 'Delivered', value: stats.delivered,  icon: 'bag-check', color: '#475569' },
  ];

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStats(); }} tintColor={C.primary} />}
      >
        <View style={styles.welcome}>
          <Text style={styles.welcomeTitle}>Welcome, {profile?.pharmacyName || 'Pharmacy'}</Text>
          <Text style={styles.welcomeSub}>Here's your pharmacy overview</Text>
        </View>
        <LocationSummaryCardMobile profile={profile} onEdit={() => navigation.navigate('PharmacySettings')} />

        {loading ? (
          <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
        ) : (
          <View style={styles.statsGrid}>
            {STATS.map(s => (
              <View key={s.label} style={styles.statCard}>
                <Ionicons name={s.icon} size={24} color={s.color} />
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Forced password reset overlay */}
      <Modal visible={mustChange} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.pwCard}>
            <Text style={styles.pwTitle}>🔐 Password Reset Required</Text>
            <Text style={styles.pwSub}>You must set a new password before accessing your dashboard.</Text>
            {pwError ? <Text style={styles.pwError}>{pwError}</Text> : null}
            {[
              { label: 'New Password', val: newPw, set: setNewPw },
              { label: 'Confirm New Password', val: confirmPw, set: setConfirmPw },
            ].map(f => (
              <View key={f.label} style={{ marginBottom: 12 }}>
                <Text style={styles.pwLabel}>{f.label}</Text>
                <TextInput
                  style={styles.pwInput}
                  secureTextEntry
                  value={f.val}
                  onChangeText={f.set}
                  placeholder="••••••••"
                />
              </View>
            ))}
            <TouchableOpacity style={[styles.pwBtn, pwSaving && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={pwSaving}>
              <Text style={styles.pwBtnText}>{pwSaving ? 'Saving…' : 'Set New Password & Continue'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={async () => { try { await auth.signOut(); } catch (_) {} }} style={styles.pwLogout}>
              <Text style={styles.pwLogoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  welcome: { padding: 20, paddingTop: 24 },
  welcomeTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  welcomeSub: { fontSize: 14, color: C.textSecondary, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  statCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, alignItems: 'center', width: '45%', flexGrow: 1, borderWidth: 1, borderColor: C.border, gap: 6 },
  statValue: { fontSize: 28, fontWeight: '900' },
  statLabel: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  // Password reset modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pwCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 },
  pwTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8, textAlign: 'center' },
  pwSub: { fontSize: 13, color: C.textSecondary, marginBottom: 16, textAlign: 'center' },
  pwError: { backgroundColor: '#fff1f2', borderRadius: 8, padding: 10, color: '#be123c', fontSize: 13, marginBottom: 12 },
  pwLabel: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 6 },
  pwInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 15, color: C.text },
  pwBtn: { backgroundColor: C.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  pwBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pwLogout: { alignItems: 'center', marginTop: 12 },
  pwLogoutText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
});
