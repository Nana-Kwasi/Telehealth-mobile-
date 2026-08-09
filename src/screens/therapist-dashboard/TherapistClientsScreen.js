import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { TherapistColors } from '../../constants/colors';
import { enrichClientRecord, getClientDisplayName } from '../../utils/clientTherapyMetrics';
import TherapyNoteModal from '../../components/therapist/TherapyNoteModal';

const TherapistClientsScreen = ({ navigation, profile }) => {
  const [isAdmin, setIsAdmin] = useState(profile?.role === 'admin' || profile?.isAdminTherapist === true);
  const [activeTab, setActiveTab] = useState('my');
  const [clients, setClients] = useState([]);
  const [allSystemClients, setAllSystemClients] = useState([]);
  const [allTherapists, setAllTherapists] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteClient, setNoteClient] = useState(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignClient, setReassignClient] = useState(null);
  const [reassigning, setReassigning] = useState(false);
  const [actionMenuClient, setActionMenuClient] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    getStoredUserId().then((uid) => {
      setCurrentUserId(uid);
      if (!uid) return;
      api(`/api/v1/therapists/${uid}`).then((snap) => {
        if (snap && snap.role === 'admin') setIsAdmin(true);
      }).catch(() => {});
      loadClients(uid);
    });
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadAllSystemClients();
      loadAllTherapists();
    }
  }, [isAdmin]);

  const loadClients = async (uid) => {
    const therapistId = uid || currentUserId;
    if (!therapistId) return;
    setIsLoading(true);
    try {
      const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`);
      // Spread the assignment FIRST. It used to come last, which overwrote `id`
      // with the ASSIGNMENT row's id — so every screen opened from this list
      // (chat, detail, notes) was handed an id that is not a client. The chat
      // then found no thread and its send failed with "Could not send message".
      const clientsData = (assignments || []).map((a) => ({
        ...a,
        id: a.clientId,
        clientId: a.clientId,
        assignmentId: a.id,
        therapistId: a.therapistId,
        name: a.clientName || a.clientDisplayName || getClientDisplayName(a),
        email: a.clientEmail || '',
        status: a.clientStatus || 'active',
        sessionCount: a.sessionCount || 0,
        noteCount: a.noteCount || 0,
        lastSession: a.lastSession || null,
      }));
      setClients(clientsData);
    } catch (e) {
      console.error('Error loading clients:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const loadAllSystemClients = async () => {
    try {
      const allAssignments = await api('/api/v1/therapy-management/assignments');
      const map = {};
      (allAssignments || []).forEach((a) => { map[a.clientId] = a.therapistId; });
      const snap = await api('/api/v1/therapy-management/clients');
      const base = (snap || []).map((c) => ({
        ...c,
        therapistId: c.therapistId || map[c.id] || null,
        status: c.status || 'active',
        name: c.name || getClientDisplayName(c),
      }));
      setAllSystemClients(base);
    } catch (e) {
      console.error('Load all clients error:', e);
    }
  };

  const loadAllTherapists = async () => {
    try {
      const snap = await api('/api/v1/therapists');
      setAllTherapists(
        (snap || []).map((t) => ({ ...t, name: t.name || t.displayName || 'Therapist' })),
      );
    } catch (e) {
      console.error('Load therapists error:', e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClients();
    if (isAdmin) {
      await Promise.all([loadAllSystemClients(), loadAllTherapists()]);
    }
  };

  const handleReassign = async (client, newTherapistId) => {
    if (!client || !newTherapistId) return;
    setReassigning(true);
    try {
      // Send the canonical field names. `newTherapistId` alone left toTherapistId
      // null on the server, which failed a NOT NULL constraint and came back as
      // "Request conflicts with existing data." (The endpoint now accepts both,
      // but be explicit here.)
      await api('/api/v1/therapy-management/assignments/reassign', {
        method: 'POST',
        body: {
          clientId: client.id,
          toTherapistId: newTherapistId,
          newTherapistId,
          fromTherapistId: client.therapistId || null,
        },
      });
      setAllSystemClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, therapistId: newTherapistId } : c)),
      );
      if (newTherapistId === currentUserId) await loadClients(currentUserId);
      setShowReassignModal(false);
      setReassignClient(null);
    } catch (e) {
      console.error('Reassign error:', e);
      Alert.alert('Error', 'Failed to reassign client.');
    } finally {
      setReassigning(false);
    }
  };

  const handleSaveNote = async (noteData) => {
    if (!noteClient) return;
    try {
      await api('/api/v1/clinical-notes', {
        method: 'POST',
        body: {
          ...noteData,
          therapistId: currentUserId,
          clientId: noteClient.id,
          clientName: noteClient.name,
          isDraft: false,
        },
      });
      setShowNoteModal(false);
      setNoteClient(null);
      setClients((prev) =>
        prev.map((c) => (c.id === noteClient.id ? { ...c, noteCount: (c.noteCount || 0) + 1 } : c)),
      );
      Alert.alert('Success', 'Session note saved.');
    } catch (e) {
      console.error('Error saving note:', e);
      Alert.alert('Error', 'Failed to save note. Please try again.');
    }
  };

  const handleUpdateStatus = async (clientId, newStatus) => {
    try {
      // PATCH /clients/{id} is CLIENT/ADMIN only and guards requireSelfOrAdmin on
      // the client id, so a therapist always got 403 → "Failed to update status".
      // /clients/{id}/status is the therapist-side counterpart.
      await api(`/api/v1/clients/${clientId}/status`, { method: 'PATCH', body: { status: newStatus } });
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, status: newStatus } : c)));
      setAllSystemClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, status: newStatus } : c)));
    } catch (e) {
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  const handleDischarge = (client) => {
    Alert.alert('Discharge client', `Discharge ${client.name}? This will mark them as discharged.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discharge',
        style: 'destructive',
        onPress: async () => {
          try {
            // Therapist-side status route — PATCH /clients/{id} is CLIENT/ADMIN
            // only and 403s for a therapist (same bug as handleUpdateStatus).
            await api(`/api/v1/clients/${client.id}/status`, { method: 'PATCH', body: { status: 'discharged' } });
            setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, status: 'discharged' } : c)));
            setAllSystemClients((prev) =>
              prev.map((c) => (c.id === client.id ? { ...c, status: 'discharged' } : c)),
            );
            setActionMenuClient(null);
          } catch (e) {
            Alert.alert('Error', 'Failed to discharge client.');
          }
        },
      },
    ]);
  };

  const parseSessionDate = (ts) => {
    if (!ts) return null;
    const dt = ts.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const formatLastSession = (ts) => {
    const dt = parseSessionDate(ts);
    if (!dt) return null;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getClientMetrics = (client) => {
    const sessionCount = Number(client.sessionCount) || 0;
    const noteCount = Number(client.noteCount) || 0;
    const lastSessionLabel = formatLastSession(client.lastSession);
    const metrics = [];
    if (sessionCount > 0) {
      metrics.push({ key: 'sessions', icon: 'calendar-outline', label: 'Sessions', value: String(sessionCount) });
    }
    if (noteCount > 0) {
      metrics.push({ key: 'notes', icon: 'document-text-outline', label: 'Notes', value: String(noteCount) });
    }
    if (lastSessionLabel) {
      metrics.push({ key: 'last', icon: 'time-outline', label: 'Last seen', value: lastSessionLabel });
    }
    return metrics;
  };

  const sourceList = activeTab === 'all' ? allSystemClients : clients;
  const filtered = sourceList.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q || (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getTherapistName = (therapistId) => {
    if (!therapistId) return 'Unassigned';
    if (therapistId === currentUserId) return 'Me';
    const t = allTherapists.find((t) => t.id === therapistId);
    return t ? t.name : 'Unknown';
  };

  const statusColor = (s) =>
    ({
      active: { bg: '#dcfce7', color: '#16a34a' },
      inactive: { bg: '#f1f5f9', color: '#64748b' },
      on_hold: { bg: '#fef3c7', color: '#d97706' },
      discharged: { bg: '#fee2e2', color: '#dc2626' },
    }[s] || { bg: '#f1f5f9', color: '#64748b' });

  const openView = (client) => {
    navigation.navigate('TherapistClientDetail', { clientId: client.id });
  };

  const openChat = (client) => {
    navigation.navigate('TherapistClientChat', {
      clientId: client.id,
      clientName: client.name || client.email || 'Client',
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
        <Text style={styles.loadingText}>Loading clients…</Text>
      </SafeAreaView>
    );
  }

  const activeCount = filtered.filter((c) => c.status === 'active').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        {isAdmin && (
          <View style={styles.segmentWrap}>
            {[
              { key: 'my', label: 'My clients', count: clients.length },
              { key: 'all', label: 'All clients', count: allSystemClients.length },
            ].map((t) => {
              const active = activeTab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setActiveTab(t.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t.label}</Text>
                  <View style={[styles.segmentBadge, active && styles.segmentBadgeActive]}>
                    <Text style={[styles.segmentBadgeText, active && styles.segmentBadgeTextActive]}>{t.count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={[styles.pageHeader, !isAdmin && styles.pageHeaderNoTabs]}>
          <Text style={styles.pageTitle}>{activeTab === 'all' ? 'All clients' : 'My clients'}</Text>
          <Text style={styles.pageSubtitle}>
            {filtered.length} shown · {activeCount} active
          </Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={TherapistColors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email…"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={TherapistColors.textLight} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {['all', 'active', 'inactive', 'on_hold'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
              onPress={() => setFilterStatus(s)}
            >
              <Text style={[styles.filterChipText, filterStatus === s && styles.filterChipTextActive]}>
                {s === 'all' ? 'All' : s === 'on_hold' ? 'On hold' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.listScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TherapistColors.primary]} />
        }
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={TherapistColors.textLight} />
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No clients match your search' : 'No clients assigned yet'}
            </Text>
          </View>
        ) : (
          filtered.map((client) => {
            const sc = statusColor(client.status);
            const metrics = getClientMetrics(client);
            const statusLabel =
              client.status === 'on_hold' ? 'On hold' : client.status === 'pending' ? 'Pending' : client.status || 'active';

            return (
              <View key={client.id} style={styles.clientCard}>
                <View style={styles.clientCardTop}>
                  <TouchableOpacity style={styles.clientIdentity} onPress={() => openView(client)} activeOpacity={0.8}>
                    <View style={styles.clientAvatarWrap}>
                      <Text style={styles.clientAvatarText}>{(client.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={styles.clientTextBlock}>
                      <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
                      {client.email ? (
                        <Text style={styles.clientEmail} numberOfLines={1}>{client.email}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.clientCardTopRight}>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.color }]}>{statusLabel}</Text>
                    </View>
                    <TouchableOpacity style={styles.moreBtn} onPress={() => setActionMenuClient(client)} hitSlop={8}>
                      <Ionicons name="ellipsis-horizontal" size={20} color={TherapistColors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                {activeTab === 'all' && client.therapistId ? (
                  <View style={styles.assignedPill}>
                    <Ionicons name="person-outline" size={12} color={TherapistColors.primary} />
                    <Text style={styles.assignedPillText}>
                      {getTherapistName(client.therapistId)}
                    </Text>
                  </View>
                ) : null}

                {metrics.length > 0 ? (
                  <View style={styles.metricsRow}>
                    {metrics.map((m) => (
                      <View key={m.key} style={styles.metricChip}>
                        <Ionicons name={m.icon} size={13} color={TherapistColors.primary} />
                        <Text style={styles.metricValue}>{m.value}</Text>
                        <Text style={styles.metricLabel}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.clientActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openView(client)}>
                    <Ionicons name="eye-outline" size={16} color="#475569" />
                    <Text style={styles.actionBtnText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnChat]} onPress={() => openChat(client)}>
                    <Ionicons name="chatbubble-outline" size={16} color="#059669" />
                    <Text style={[styles.actionBtnText, styles.actionBtnTextChat]}>Chat</Text>
                  </TouchableOpacity>
                  {activeTab === 'my' ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnNote]}
                      onPress={() => {
                        setNoteClient(client);
                        setShowNoteModal(true);
                      }}
                    >
                      <Ionicons name="document-text-outline" size={16} color={TherapistColors.primary} />
                      <Text style={[styles.actionBtnText, styles.actionBtnTextNote]}>Note</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isAdmin && activeTab === 'all' ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnReassign]}
                      onPress={() => {
                        setReassignClient(client);
                        setShowReassignModal(true);
                      }}
                    >
                      <Ionicons name="swap-horizontal-outline" size={16} color="#d97706" />
                      <Text style={[styles.actionBtnText, styles.actionBtnTextReassign]}>Reassign</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <TherapyNoteModal
        visible={showNoteModal && !!noteClient}
        client={noteClient}
        onClose={() => {
          setShowNoteModal(false);
          setNoteClient(null);
        }}
        onSave={handleSaveNote}
      />

      {/* Actions menu (web dropdown parity) */}
      <Modal visible={!!actionMenuClient} transparent animationType="fade" onRequestClose={() => setActionMenuClient(null)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setActionMenuClient(null)}>
          <View style={styles.menuSheet}>
            {actionMenuClient && (
              <>
                <Text style={styles.menuTitle}>{actionMenuClient.name}</Text>
                {[
                  { label: 'View Details', icon: 'eye-outline', onPress: () => { openView(actionMenuClient); setActionMenuClient(null); } },
                  { label: 'Message Client', icon: 'chatbubble-outline', onPress: () => { openChat(actionMenuClient); setActionMenuClient(null); } },
                  {
                    label: actionMenuClient.status === 'active' ? 'Set Inactive' : 'Set Active',
                    icon: actionMenuClient.status === 'active' ? 'person-remove-outline' : 'person-add-outline',
                    onPress: () => {
                      handleUpdateStatus(
                        actionMenuClient.id,
                        actionMenuClient.status === 'active' ? 'inactive' : 'active',
                      );
                      setActionMenuClient(null);
                    },
                  },
                  {
                    label: 'Put On Hold',
                    icon: 'pause-circle-outline',
                    onPress: () => {
                      handleUpdateStatus(actionMenuClient.id, 'on_hold');
                      setActionMenuClient(null);
                    },
                  },
                  {
                    label: 'Discharge Client',
                    icon: 'log-out-outline',
                    danger: true,
                    onPress: () => {
                      handleDischarge(actionMenuClient);
                    },
                  },
                ].map((item) => (
                  <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress}>
                    <Ionicons name={item.icon} size={18} color={item.danger ? '#dc2626' : '#334155'} />
                    <Text style={[styles.menuItemText, item.danger && { color: '#dc2626' }]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Reassign modal */}
      <Modal visible={showReassignModal} transparent animationType="slide" onRequestClose={() => setShowReassignModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Reassign Client</Text>
                {reassignClient && (
                  <Text style={styles.reassignSub}>{reassignClient.name} → select new therapist</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowReassignModal(false);
                  setReassignClient(null);
                }}
              >
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {allTherapists.length === 0 ? (
                <Text style={styles.emptySubtitle}>No therapists found</Text>
              ) : (
                allTherapists.map((t) => {
                  const isCurrent = reassignClient?.therapistId === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.therapistRow, isCurrent && styles.therapistRowCurrent]}
                      onPress={() => !isCurrent && handleReassign(reassignClient, t.id)}
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
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>Current</Text>
                        </View>
                      ) : reassigning ? (
                        <ActivityIndicator size="small" color={TherapistColors.primary} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={TherapistColors.textLight} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f1f5f9' },
  loadingText: { color: TherapistColors.textSecondary, fontSize: 15 },
  topSection: {
    backgroundColor: '#fff',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    ...Platform.select({
      ios: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    padding: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  segmentTextActive: { color: TherapistColors.primary, fontWeight: '700' },
  segmentBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
  },
  segmentBadgeActive: { backgroundColor: '#eef2ff' },
  segmentBadgeText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  segmentBadgeTextActive: { color: TherapistColors.primary },
  pageHeader: { paddingHorizontal: 16, paddingTop: 4 },
  pageHeaderNoTabs: { paddingTop: 16 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 15, color: TherapistColors.text, paddingVertical: 0 },
  filterRow: { paddingHorizontal: 16, paddingTop: 12, gap: 8, flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#fff' },
  listScroll: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 28 },
  emptyState: { alignItems: 'center', paddingVertical: 56, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#64748b', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: TherapistColors.textLight, textAlign: 'center', padding: 24 },
  clientCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  clientCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  clientIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  clientTextBlock: { flex: 1, marginLeft: 12 },
  clientCardTopRight: { alignItems: 'flex-end', gap: 8 },
  clientAvatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientAvatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  clientName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  clientEmail: { fontSize: 13, color: '#64748b', marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
  },
  assignedPillText: { fontSize: 12, fontWeight: '600', color: TherapistColors.primary },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricValue: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  metricLabel: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  clientActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionBtnChat: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  actionBtnNote: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  actionBtnReassign: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  actionBtnTextChat: { color: '#059669' },
  actionBtnTextNote: { color: TherapistColors.primary },
  actionBtnTextReassign: { color: '#d97706' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: TherapistColors.text },
  reassignSub: { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 2 },
  profileTop: { alignItems: 'center', paddingVertical: 16, gap: 4 },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileAvatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 18, fontWeight: '800', color: TherapistColors.text },
  profileEmail: { fontSize: 14, color: TherapistColors.textLight },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  profileRowLabel: { fontSize: 13, color: TherapistColors.textSecondary, fontWeight: '500' },
  profileRowValue: { fontSize: 13, color: TherapistColors.text, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  historyBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  historyLabel: { fontSize: 12, fontWeight: '700', color: '#c2410c', marginBottom: 6 },
  historyText: { fontSize: 13, color: '#78350f', lineHeight: 20 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TherapistColors.text,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  menuItemText: { fontSize: 15, color: '#334155', fontWeight: '500' },
  therapistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
  },
  therapistRowCurrent: { borderColor: TherapistColors.primary, backgroundColor: '#f0f7ff' },
  therapistAvatar: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  therapistAvatarText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  therapistName: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  therapistSpec: { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 2 },
  currentBadge: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  currentBadgeText: { fontSize: 11, color: TherapistColors.primary, fontWeight: '700' },
});

export default TherapistClientsScreen;
