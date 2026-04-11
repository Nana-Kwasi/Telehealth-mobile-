import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal,
  Alert, Dimensions, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, getDocs, doc, getDoc, query, where,
  orderBy, addDoc, serverTimestamp, updateDoc, deleteDoc, limit,
} from 'firebase/firestore';
import { TherapistColors } from '../../constants/colors';

const { width } = Dimensions.get('window');

const TherapistClientsScreen = ({ navigation }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('my'); // 'my' | 'all' (admin only)
  const [myClients, setMyClients] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteClient, setNoteClient] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignClient, setReassignClient] = useState(null);
  const [reassigning, setReassigning] = useState(false);

  const currentUser = auth.currentUser;

  useEffect(() => {
    AsyncStorage.getItem('userRole').then(r => {
      const admin = r === 'admin';
      setIsAdmin(admin);
      if (currentUser) loadAll(admin);
    });
  }, []);

  useEffect(() => {
    const list = activeTab === 'my' ? myClients : allClients;
    const q = searchQuery.toLowerCase();
    setFiltered(list.filter(c => {
      const matchQ = !q || (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
      const matchS = filterStatus === 'all' || c.status === filterStatus;
      return matchQ && matchS;
    }));
  }, [myClients, allClients, searchQuery, filterStatus, activeTab]);

  const loadAll = async (admin) => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadMyClients(),
        admin ? loadAllClients() : Promise.resolve(),
        admin ? loadTherapists() : Promise.resolve(),
      ]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const loadMyClients = async () => {
    try {
      const clientsRef = collection(db, 'therapists', currentUser.uid, 'clients');
      const clientsSnap = await getDocs(clientsRef);
      const clientIds = clientsSnap.docs.map(d => d.data().clientId).filter(Boolean);
      const list = [];
      for (const id of clientIds) {
        try {
          const cSnap = await getDoc(doc(db, 'clients', id));
          if (!cSnap.exists()) continue;
          const cd = cSnap.data();
          let sessionCount = 0, lastSession = null;
          try {
            const sQ = query(
              collection(db, 'scheduledCalls'),
              where('therapistId', '==', currentUser.uid),
              where('clientId', '==', id),
              orderBy('scheduledTime', 'desc'),
              limit(1)
            );
            const sSnap = await getDocs(sQ);
            sessionCount = sSnap.size;
            if (!sSnap.empty) lastSession = sSnap.docs[0].data().scheduledTime;
          } catch (_) {}
          list.push({
            id, ...cd,
            name: cd.name || cd.displayName || cd.email || 'Client',
            sessionCount, lastSession,
            status: cd.status || 'active',
          });
        } catch (_) {}
      }
      setMyClients(list);
    } catch (e) { console.error('Load my clients error:', e); }
  };

  const loadAllClients = async () => {
    try {
      const snap = await getDocs(collection(db, 'clients'));
      const list = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        name: d.data().name || d.data().displayName || d.data().email || 'Client',
        status: d.data().status || 'active',
      }));
      setAllClients(list);
    } catch (e) { console.error('Load all clients error:', e); }
  };

  const loadTherapists = async () => {
    try {
      const snap = await getDocs(collection(db, 'therapists'));
      setTherapists(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        name: d.data().name || d.data().displayName || 'Therapist',
      })));
    } catch (e) { console.error('Load therapists error:', e); }
  };

  const handleReassign = async (newTherapistId) => {
    if (!reassignClient || !newTherapistId) return;
    setReassigning(true);
    try {
      const client = reassignClient;
      const oldTherapistId = client.therapistId;

      // Remove from old therapist's subcollection
      if (oldTherapistId) {
        try {
          const oldRef = collection(db, 'therapists', oldTherapistId, 'clients');
          const oldSnap = await getDocs(query(oldRef, where('clientId', '==', client.id)));
          for (const d of oldSnap.docs) await deleteDoc(d.ref);
        } catch (_) {}
      }

      // Add to new therapist's subcollection
      await addDoc(collection(db, 'therapists', newTherapistId, 'clients'), {
        clientId: client.id,
        assignedAt: serverTimestamp(),
      });

      // Update client's therapistId
      await updateDoc(doc(db, 'clients', client.id), { therapistId: newTherapistId });

      // Update local state
      setAllClients(prev => prev.map(c => c.id === client.id ? { ...c, therapistId: newTherapistId } : c));
      if (newTherapistId === currentUser.uid) {
        await loadMyClients();
      }

      setShowReassignModal(false);
      setReassignClient(null);
      Alert.alert('Success', 'Client reassigned successfully.');
    } catch (e) {
      console.error('Reassign error:', e);
      Alert.alert('Error', 'Failed to reassign client. Please try again.');
    } finally {
      setReassigning(false);
    }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() || !noteClient) return;
    setSavingNote(true);
    try {
      const noteData = {
        sessionFocus: noteText,
        sessionDate: new Date().toISOString().split('T')[0],
        therapistId: currentUser.uid,
        clientId: noteClient.id,
        clientName: noteClient.name,
        isDraft: false,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'clients', noteClient.id, 'therapyNotes'), noteData);
      await addDoc(collection(db, 'clinicalNotes'), noteData);
      setNoteText('');
      setShowNoteModal(false);
      setNoteClient(null);
      Alert.alert('Success', 'Session note saved successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleUpdateStatus = async (clientId, newStatus) => {
    try {
      await updateDoc(doc(db, 'clients', clientId), { status: newStatus });
      setMyClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));
      setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));
    } catch (e) {
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  const fmtDate = (ts) => {
    if (!ts) return 'No sessions yet';
    const dt = ts.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getTherapistName = (therapistId) => {
    if (!therapistId) return 'Unassigned';
    if (therapistId === currentUser.uid) return 'Me';
    const t = therapists.find(t => t.id === therapistId);
    return t ? t.name : 'Unknown';
  };

  const statusStyle = (s) => ({
    active:   { bg: '#dcfce7', color: '#16a34a' },
    inactive: { bg: '#f1f5f9', color: '#64748b' },
    on_hold:  { bg: '#fef3c7', color: '#d97706' },
  }[s] || { bg: '#f1f5f9', color: '#64748b' });

  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={TherapistColors.primary} />
      <Text style={styles.loadingText}>Loading clients…</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Admin Tabs */}
      {isAdmin && (
        <View style={styles.tabRow}>
          {[
            { key: 'my',  label: `My Clients (${myClients.length})` },
            { key: 'all', label: `All Clients (${allClients.length})` },
          ].map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search + Filter */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={TherapistColors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients…"
          placeholderTextColor={TherapistColors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={TherapistColors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {['all', 'active', 'inactive', 'on_hold'].map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterTab, filterStatus === s && styles.filterTabActive]}
            onPress={() => setFilterStatus(s)}
          >
            <Text style={[styles.filterTabText, filterStatus === s && styles.filterTabTextActive]}>
              {s === 'all' ? 'All' : s === 'on_hold' ? 'On Hold' : s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>{filtered.length} client{filtered.length !== 1 ? 's' : ''}</Text>
        {activeTab === 'my' && (
          <Text style={styles.summaryActive}>{myClients.filter(c => c.status === 'active').length} active</Text>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(isAdmin); }}
            colors={[TherapistColors.primary]}
          />
        }
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={TherapistColors.textLight} />
            <Text style={styles.emptyTitle}>{searchQuery ? 'No results found' : 'No clients yet'}</Text>
            <Text style={styles.emptySubtitle}>{searchQuery ? 'Try a different search term' : 'Clients assigned to you will appear here'}</Text>
          </View>
        ) : filtered.map(client => {
          const sc = statusStyle(client.status);
          return (
            <View key={client.id} style={styles.clientCard}>
              {/* Card Header */}
              <View style={styles.clientCardHeader}>
                <View style={styles.clientAvatarWrap}>
                  <Text style={styles.clientAvatarText}>{(client.name || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
                  <Text style={styles.clientEmail} numberOfLines={1}>{client.email || ''}</Text>
                  {activeTab === 'all' && (
                    <Text style={styles.assignedTo}>
                      Assigned to: <Text style={{ color: TherapistColors.primary }}>{getTherapistName(client.therapistId)}</Text>
                    </Text>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.statusText, { color: sc.color }]}>
                    {client.status === 'on_hold' ? 'On Hold' : client.status}
                  </Text>
                </View>
              </View>

              {/* Stats (my clients only) */}
              {activeTab === 'my' && (
                <View style={styles.clientStats}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{client.sessionCount || 0}</Text>
                    <Text style={styles.statLabel}>Sessions</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{fmtDate(client.lastSession).split(',')[0]}</Text>
                    <Text style={styles.statLabel}>Last Session</Text>
                  </View>
                </View>
              )}

              {/* Actions */}
              <View style={styles.clientActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => { setSelectedClient(client); setShowProfile(true); }}
                >
                  <Ionicons name="person-outline" size={15} color={TherapistColors.textSecondary} />
                  <Text style={styles.actionBtnText}>Profile</Text>
                </TouchableOpacity>

                {activeTab === 'my' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={() => { setNoteClient(client); setShowNoteModal(true); }}
                  >
                    <Ionicons name="document-text-outline" size={15} color="#fff" />
                    <Text style={[styles.actionBtnText, { color: '#fff' }]}>Add Note</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => navigation.navigate('TherapistMessages', { clientId: client.id, clientName: client.name })}
                >
                  <Ionicons name="chatbubble-outline" size={15} color={TherapistColors.textSecondary} />
                  <Text style={styles.actionBtnText}>Chat</Text>
                </TouchableOpacity>

                {isAdmin && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: '#f59e0b' }]}
                    onPress={() => { setReassignClient(client); setShowReassignModal(true); }}
                  >
                    <Ionicons name="swap-horizontal-outline" size={15} color="#f59e0b" />
                    <Text style={[styles.actionBtnText, { color: '#f59e0b' }]}>Reassign</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* ── Profile Modal ── */}
      <Modal visible={showProfile} transparent animationType="slide" onRequestClose={() => setShowProfile(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Client Profile</Text>
              <TouchableOpacity onPress={() => setShowProfile(false)}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            {selectedClient && (
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <View style={styles.profileTop}>
                  <View style={styles.profileAvatar}>
                    <Text style={styles.profileAvatarText}>{(selectedClient.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.profileName}>{selectedClient.name}</Text>
                  <Text style={styles.profileEmail}>{selectedClient.email}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle(selectedClient.status).bg, marginTop: 6 }]}>
                    <Text style={[styles.statusText, { color: statusStyle(selectedClient.status).color }]}>
                      {selectedClient.status || 'active'}
                    </Text>
                  </View>
                </View>
                {[
                  ['Phone', selectedClient.phone || 'Not provided'],
                  ['Age', selectedClient.age || 'Not provided'],
                  ['Gender', selectedClient.gender || 'Not provided'],
                  ['Therapy Type', selectedClient.therapyType || 'Individual'],
                  ['Language', selectedClient.preferredLanguage || 'English'],
                  ['Assigned To', getTherapistName(selectedClient.therapistId)],
                ].map(([label, value]) => (
                  <View key={label} style={styles.profileRow}>
                    <Text style={styles.profileRowLabel}>{label}</Text>
                    <Text style={styles.profileRowValue}>{value}</Text>
                  </View>
                ))}
                {selectedClient.mentalHealthHistory && (
                  <View style={styles.historyBox}>
                    <Text style={styles.historyLabel}>Mental Health History</Text>
                    <Text style={styles.historyText}>{selectedClient.mentalHealthHistory}</Text>
                  </View>
                )}
                {/* Status actions */}
                <Text style={[styles.profileRowLabel, { marginTop: 16, marginBottom: 8 }]}>Update Status</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['active', 'inactive', 'on_hold'].map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.filterTab, selectedClient.status === s && styles.filterTabActive, { flex: 1 }]}
                      onPress={() => { handleUpdateStatus(selectedClient.id, s); setSelectedClient(prev => ({ ...prev, status: s })); }}
                    >
                      <Text style={[styles.filterTabText, selectedClient.status === s && styles.filterTabTextActive, { textAlign: 'center' }]}>
                        {s === 'on_hold' ? 'On Hold' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Add Note Modal ── */}
      <Modal visible={showNoteModal} transparent animationType="slide" onRequestClose={() => setShowNoteModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { maxHeight: '75%' }]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Session Note — {noteClient?.name}</Text>
                <TouchableOpacity onPress={() => { setShowNoteModal(false); setNoteClient(null); setNoteText(''); }}>
                  <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 16 }}>
                <Text style={styles.noteLabel}>Session notes / observations</Text>
                <TextInput
                  style={styles.noteInput}
                  multiline
                  numberOfLines={6}
                  placeholder="Describe the session focus, observations, interventions used…"
                  placeholderTextColor={TherapistColors.textLight}
                  value={noteText}
                  onChangeText={setNoteText}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[styles.saveNoteBtn, { opacity: savingNote || !noteText.trim() ? 0.6 : 1 }]}
                  onPress={handleSaveNote}
                  disabled={savingNote || !noteText.trim()}
                >
                  {savingNote
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveNoteBtnText}>Save Note</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Reassign Modal ── */}
      <Modal visible={showReassignModal} transparent animationType="slide" onRequestClose={() => setShowReassignModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '70%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Reassign Client</Text>
                {reassignClient && (
                  <Text style={{ fontSize: 12, color: TherapistColors.textSecondary, marginTop: 2 }}>
                    {reassignClient.name} → select new therapist
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setShowReassignModal(false); setReassignClient(null); }}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {therapists.length === 0 ? (
                <Text style={{ textAlign: 'center', color: TherapistColors.textLight, padding: 24 }}>No therapists found</Text>
              ) : therapists.map(t => {
                const isCurrent = reassignClient?.therapistId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.therapistRow, isCurrent && styles.therapistRowCurrent]}
                    onPress={() => !isCurrent && handleReassign(t.id)}
                    disabled={reassigning || isCurrent}
                  >
                    <View style={styles.therapistAvatar}>
                      <Text style={styles.therapistAvatarText}>{(t.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.therapistName}>{t.name}</Text>
                      <Text style={styles.therapistSpec}>{t.specialization || t.specialty || 'Therapist'}</Text>
                    </View>
                    {isCurrent ? (
                      <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Current</Text></View>
                    ) : reassigning ? (
                      <ActivityIndicator size="small" color={TherapistColors.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={TherapistColors.textLight} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: TherapistColors.textSecondary, fontSize: 15 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: TherapistColors.border,
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: TherapistColors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  tabTextActive: { color: TherapistColors.primary },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, marginBottom: 8, backgroundColor: '#fff',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: TherapistColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: TherapistColors.text },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9' },
  filterTabActive: { backgroundColor: TherapistColors.primary },
  filterTabText: { fontSize: 12, fontWeight: '600', color: TherapistColors.textSecondary },
  filterTabTextActive: { color: '#fff' },

  summary: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 },
  summaryText: { fontSize: 13, color: TherapistColors.textSecondary, fontWeight: '500' },
  summaryActive: { fontSize: 13, color: TherapistColors.success, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  emptySubtitle: { fontSize: 13, color: TherapistColors.textLight, textAlign: 'center' },

  clientCard: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  clientCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  clientAvatarWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  clientAvatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  clientName: { fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  clientEmail: { fontSize: 12, color: TherapistColors.textLight, marginTop: 2 },
  assignedTo: { fontSize: 11, color: TherapistColors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  clientStats: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statBox: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 10,
    padding: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  statValue: { fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  statLabel: { fontSize: 11, color: TherapistColors.textLight, marginTop: 2 },

  clientActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: TherapistColors.border, backgroundColor: '#fff',
    minWidth: 72,
  },
  actionBtnPrimary: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: TherapistColors.textSecondary },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: TherapistColors.text },

  profileTop: { alignItems: 'center', paddingVertical: 16, gap: 4 },
  profileAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  profileAvatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: '700', color: TherapistColors.text },
  profileEmail: { fontSize: 14, color: TherapistColors.textLight },
  profileRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  profileRowLabel: { fontSize: 13, color: TherapistColors.textSecondary, fontWeight: '500' },
  profileRowValue: { fontSize: 13, color: TherapistColors.text, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  historyBox: { backgroundColor: '#fff7ed', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#fed7aa' },
  historyLabel: { fontSize: 12, fontWeight: '700', color: '#c2410c', marginBottom: 6 },
  historyText: { fontSize: 13, color: '#78350f', lineHeight: 20 },

  noteLabel: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 8 },
  noteInput: {
    backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1.5,
    borderColor: TherapistColors.border, padding: 12,
    fontSize: 14, color: TherapistColors.text, minHeight: 120, marginBottom: 16,
  },
  saveNoteBtn: { backgroundColor: TherapistColors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveNoteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  therapistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1.5, borderColor: TherapistColors.border,
  },
  therapistRowCurrent: { borderColor: TherapistColors.primary, backgroundColor: '#f0f7ff' },
  therapistAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  therapistAvatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  therapistName: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  therapistSpec: { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 2 },
  currentBadge: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  currentBadgeText: { fontSize: 11, color: TherapistColors.primary, fontWeight: '700' },
});

export default TherapistClientsScreen;
