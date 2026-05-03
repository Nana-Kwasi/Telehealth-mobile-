import React, { useState, useCallback, useLayoutEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, ScrollView, TextInput, Alert, RefreshControl, Linking,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, serverTimestamp, doc, updateDoc,
} from 'firebase/firestore';
import { DoctorColors as C } from '../../constants/colors';

const TYPE_ICONS = { lab: 'flask-outline', scan: 'scan-outline' };
const TYPE_COLORS = { lab: '#065f46', scan: '#4c1d95' };

const ORDER_STATUS_LABEL = {
  pending: 'Ordered — awaiting center',
  in_progress: 'In progress at center',
  completed: 'Completed',
};

function normStatus(s) {
  return String(s || 'pending').toLowerCase();
}

export default function DoctorDiagnosticResultsScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState([]);
  const [results, setResults] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [doctorNote, setDoctorNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [filter, setFilter] = useState('All');

  const doctorId = auth.currentUser?.uid;

  const goOrderLabScan = useCallback(() => {
    navigation.getParent()?.navigate('DoctorDiagnosticOrder');
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={goOrderLabScan} style={{ marginRight: 14 }} accessibilityRole="button" accessibilityLabel="Order lab or scan">
          <Ionicons name="add-circle-outline" size={28} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, goOrderLabScan]);

  const loadAll = async () => {
    if (!doctorId) return;
    try {
      const [ordSnap, resSnap, draftSnap] = await Promise.all([
        getDocs(query(collection(db, 'diagnosticOrders'), where('doctorId', '==', doctorId))),
        getDocs(query(collection(db, 'diagnosticResults'), where('doctorId', '==', doctorId))),
        getDocs(collection(db, 'doctors', doctorId, 'diagnosticDrafts')),
      ]);
      const ordList = ordSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      ordList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(ordList);

      const resList = resSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      resList.sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
      setResults(resList);

      const dlist = draftSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      dlist.sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
      setDrafts(dlist);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    loadAll();
  }, [doctorId]));

  const mergedRows = useMemo(() => {
    if (filter === 'Draft') return [];
    const resultOrderIds = new Set(results.map(r => r.orderId).filter(Boolean));
    const orderRows = orders
      .filter(o => !resultOrderIds.has(o.id))
      .map(o => ({
        kind: 'order',
        sortAt: o.createdAt?.seconds || 0,
        rowKey: `o-${o.id}`,
        ...o,
      }));
    const resultRows = results.map(r => ({
      kind: 'result',
      sortAt: r.uploadedAt?.seconds || 0,
      rowKey: `r-${r.id}`,
      ...r,
    }));
    let merged = [...orderRows, ...resultRows].sort((a, b) => b.sortAt - a.sortAt);
    if (filter === 'Lab') {
      merged = merged.filter(r => (r.type || r.centerType || '') === 'lab');
    } else if (filter === 'Scan') {
      merged = merged.filter(r => (r.type || r.centerType || '') === 'scan');
    }
    return merged;
  }, [orders, results, filter]);

  const listData =
    filter === 'Draft'
      ? drafts.map((d) => ({ kind: 'draft', rowKey: `d-${d.id}`, ...d }))
      : mergedRows;

  const handleSaveNote = async () => {
    if (!doctorNote.trim() || selected?.kind !== 'result') return;
    setSavingNote(true);
    try {
      await updateDoc(doc(db, 'diagnosticResults', selected.id), {
        doctorNote: doctorNote.trim(),
        doctorNoteAt: serverTimestamp(),
      });
      setSelected(prev => (prev ? { ...prev, doctorNote: doctorNote.trim() } : null));
      Alert.alert('Saved', 'Your note has been added to the result.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const openRow = (row) => {
    if (row.kind === 'draft') {
      navigation.getParent()?.navigate('DoctorDiagnosticDraftDetail', { draftId: row.id });
      return;
    }
    setSelected(row);
    setDoctorNote(row.kind === 'result' ? (row.doctorNote || '') : '');
  };

  const renderItem = ({ item }) => {
    if (item.kind === 'draft') {
      const color = TYPE_COLORS[item.orderType] || C.primary;
      const icon = TYPE_ICONS[item.orderType] || 'document-outline';
      return (
        <TouchableOpacity style={styles.card} onPress={() => openRow(item)}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeChip, { backgroundColor: '#f1f5f9' }]}>
              <Ionicons name={icon} size={14} color={color} />
              <Text style={[styles.typeText, { color }]}>{item.orderType?.toUpperCase()} · Draft</Text>
            </View>
          </View>
          <Text style={styles.testType}>{item.testType}</Text>
          <Text style={styles.ref}>{item.patientName}</Text>
          <Text style={styles.date}>Tap to review, submit, or delete</Text>
        </TouchableOpacity>
      );
    }

    if (item.kind === 'order') {
      const t = item.type || item.centerType || 'lab';
      const color = TYPE_COLORS[t] || C.primary;
      const icon = TYPE_ICONS[t] || 'document-outline';
      const st = normStatus(item.status);
      const statusLabel = ORDER_STATUS_LABEL[st] || item.status || 'Ordered';
      return (
        <TouchableOpacity style={styles.card} onPress={() => openRow(item)}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeChip, { backgroundColor: t === 'lab' ? '#d1fae5' : '#ede9fe' }]}>
              <Ionicons name={icon} size={14} color={color} />
              <Text style={[styles.typeText, { color }]}>{t.toUpperCase()} · Order</Text>
            </View>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.testType}>{item.testType}</Text>
          <Text style={styles.ref}>{item.patientName} · {item.branchName || item.centerName}</Text>
          <Text style={styles.date}>
            {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : ''}
          </Text>
        </TouchableOpacity>
      );
    }

    const color = TYPE_COLORS[item.type] || C.primary;
    const icon = TYPE_ICONS[item.type] || 'document-outline';
    return (
      <TouchableOpacity style={styles.card} onPress={() => openRow(item)}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeChip, { backgroundColor: item.type === 'lab' ? '#d1fae5' : '#ede9fe' }]}>
            <Ionicons name={icon} size={14} color={color} />
            <Text style={[styles.typeText, { color }]}>{item.type?.toUpperCase()}</Text>
          </View>
          <View style={styles.newBadge}>
            <Text style={styles.newText}>Result Ready</Text>
          </View>
        </View>
        <Text style={styles.testType}>{item.testType}</Text>
        <Text style={styles.ref}>{item.resultRef}</Text>
        {(item.fileUrl || item.resultFileUrl) ? (
          <TouchableOpacity
            style={styles.downloadRow}
            onPress={() => Linking.openURL(item.fileUrl || item.resultFileUrl)}
          >
            <Ionicons name="download-outline" size={16} color="#1d4ed8" />
            <Text style={styles.downloadText}>{item.fileName || 'Download attachment'}</Text>
          </TouchableOpacity>
        ) : item.fileName ? (
          <View style={styles.fileRow}>
            <Ionicons name="document-outline" size={14} color={C.textSecondary} />
            <Text style={styles.fileName}>{item.fileName}</Text>
          </View>
        ) : null}
        <Text style={styles.date}>
          {item.uploadedAt ? new Date(item.uploadedAt.seconds * 1000).toLocaleDateString() : 'Recently'}
        </Text>
      </TouchableOpacity>
    );
  };

  const emptyCopy =
    filter === 'Draft'
      ? { title: 'No drafts', sub: 'Save an order as draft from Order Lab / Scan when reviewing the summary.' }
      : { title: 'No orders or results yet', sub: 'Submitted orders appear here immediately. Result files appear after the center uploads findings.' };

  return (
    <View style={styles.container}>
      <View style={styles.orderBanner}>
        <Text style={styles.orderBannerText}>Need a new test or imaging order?</Text>
        <TouchableOpacity style={styles.orderBannerBtn} onPress={goOrderLabScan} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.orderBannerBtnText}>Order lab / scan</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.filterRow}>
        {['All', 'Lab', 'Scan', 'Draft'].map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={i => i.rowKey || i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color="#e2e8f0" />
              <Text style={styles.emptyText}>{emptyCopy.title}</Text>
              <Text style={styles.emptySub}>{emptyCopy.sub}</Text>
              {filter !== 'Draft' && (
                <TouchableOpacity style={styles.emptyCta} onPress={goOrderLabScan} activeOpacity={0.85}>
                  <Ionicons name="flask-outline" size={18} color="#065f46" />
                  <Text style={styles.emptyCtaText}>Order lab / scan</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        />
      )}

      <Modal visible={!!selected && selected.kind !== 'draft'} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selected?.kind === 'order' ? 'Order detail' : 'Result detail'}
              </Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selected?.kind === 'order' && (
                <>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Type</Text><Text style={styles.detailValue}>{(selected.type || selected.centerType || '').toUpperCase()}</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Test</Text><Text style={styles.detailValue}>{selected.testType}</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Patient</Text><Text style={styles.detailValue}>{selected.patientName}</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Branch</Text><Text style={styles.detailValue}>{selected.branchName || '—'}</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Order ID</Text><Text style={styles.detailValue}>{selected.orderId || selected.id?.slice(0, 8)}</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Status</Text><Text style={styles.detailValue}>{normStatus(selected.status)}</Text></View>
                  <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={[styles.detailValue, { flex: 1, lineHeight: 20, textAlign: 'left' }]}>{selected.notes || '—'}</Text>
                  </View>
                </>
              )}
              {selected?.kind === 'result' && (
                <>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Type</Text><Text style={styles.detailValue}>{selected?.type?.toUpperCase()}</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Test</Text><Text style={styles.detailValue}>{selected?.testType}</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Ref</Text><Text style={styles.detailValue}>{selected?.resultRef}</Text></View>
                  {selected?.fileName && (
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>File</Text><Text style={styles.detailValue}>{selected?.fileName}</Text></View>
                  )}
                  {(selected?.fileUrl || selected?.resultFileUrl) && (
                    <TouchableOpacity
                      style={styles.modalDownloadBtn}
                      onPress={() => Linking.openURL(selected.fileUrl || selected.resultFileUrl)}
                    >
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.modalDownloadBtnText}>Download attachment</Text>
                    </TouchableOpacity>
                  )}
                  <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                    <Text style={styles.detailLabel}>Findings</Text>
                    <Text style={[styles.detailValue, { flex: 1, lineHeight: 20, textAlign: 'left' }]}>
                      {selected?.findings || selected?.notes || '—'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Uploaded</Text>
                    <Text style={styles.detailValue}>
                      {selected?.uploadedAt ? new Date(selected.uploadedAt.seconds * 1000).toLocaleString() : 'Unknown'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Center</Text><Text style={styles.detailValue}>{selected?.uploaderName || 'Center'}</Text></View>

                  <View style={styles.doctorNoteSection}>
                    <Text style={styles.doctorNoteLabel}>Your Notes</Text>
                    {selected?.doctorNote && (
                      <View style={styles.existingNote}>
                        <Text style={styles.existingNoteText}>{selected.doctorNote}</Text>
                      </View>
                    )}
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Add your clinical notes, treatment decisions…"
                      value={doctorNote}
                      onChangeText={setDoctorNote}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={[styles.saveNoteBtn, savingNote && { opacity: 0.6 }]}
                      onPress={handleSaveNote}
                      disabled={savingNote}
                    >
                      <Text style={styles.saveNoteBtnText}>{savingNote ? 'Saving…' : 'Save Note'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  orderBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  orderBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#065f46', minWidth: 160 },
  orderBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  orderBannerBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  filterRow: { flexDirection: 'row', padding: 16, paddingBottom: 8, gap: 8, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeText: { fontSize: 12, fontWeight: '700' },
  newBadge: { backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadge: { backgroundColor: '#e0f2fe', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  newText: { fontSize: 11, color: '#92400e', fontWeight: '700' },
  pendingText: { fontSize: 11, color: '#0369a1', fontWeight: '700' },
  testType: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 },
  ref: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fileName: { fontSize: 13, color: C.textSecondary },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  downloadText: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  modalDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1d4ed8',
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  modalDownloadBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  date: { fontSize: 11, color: '#94a3b8' },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: C.textSecondary, marginTop: 6, textAlign: 'center', paddingHorizontal: 12 },
  emptyCta: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  emptyCtaText: { fontSize: 15, fontWeight: '800', color: '#065f46' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  detailLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600', width: 80 },
  detailValue: { fontSize: 14, color: C.text, fontWeight: '600', textAlign: 'right' },
  doctorNoteSection: { marginTop: 20 },
  doctorNoteLabel: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 10 },
  existingNote: { backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#bae6fd' },
  existingNoteText: { fontSize: 13, color: '#0369a1', lineHeight: 18 },
  noteInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 14, color: C.text, height: 80, marginBottom: 10 },
  saveNoteBtn: { backgroundColor: C.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  saveNoteBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
