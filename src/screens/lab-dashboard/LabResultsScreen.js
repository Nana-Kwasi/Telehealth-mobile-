import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, ScrollView, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { LabColors as C } from '../../constants/colors';

export default function LabResultsScreen({ profile }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);

  useFocusEffect(useCallback(() => { loadResults(); }, []));

  const loadResults = async () => {
    try {
      const pid = profile?.id;
      if (!pid) return;
      const snap = await getDocs(
        query(collection(db, 'diagnosticResults'), where('uploadedBy', '==', pid), where('type', '==', 'lab'))
      );
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
      setResults(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
      <View style={styles.cardHeader}>
        <View style={styles.typeChip}>
          <Ionicons name="flask-outline" size={14} color={C.primary} />
          <Text style={styles.typeText}>{item.testType}</Text>
        </View>
        <View style={styles.completedBadge}>
          <Text style={styles.completedText}>Completed</Text>
        </View>
      </View>
      <Text style={styles.ref}>{item.resultRef}</Text>
      {item.fileName ? (
        <View style={styles.fileRow}>
          <Ionicons name="document-outline" size={14} color={C.textSecondary} />
          <Text style={styles.fileName}>{item.fileName}</Text>
        </View>
      ) : null}
      <Text style={styles.date}>
        {item.uploadedAt ? new Date(item.uploadedAt.seconds * 1000).toLocaleString() : 'Recently'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadResults(); }} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={C.border} />
              <Text style={styles.emptyText}>No results uploaded yet</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lab Result Detail</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Test Type</Text><Text style={styles.detailValue}>{selected?.testType}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Result Ref</Text><Text style={styles.detailValue}>{selected?.resultRef}</Text></View>
              {selected?.fileName && (
                <View style={styles.detailRow}><Text style={styles.detailLabel}>File</Text><Text style={styles.detailValue}>{selected?.fileName}</Text></View>
              )}
              <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                <Text style={styles.detailLabel}>Notes</Text>
                <Text style={[styles.detailValue, { flex: 1, lineHeight: 20 }]}>{selected?.notes || 'No notes'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Uploaded</Text>
                <Text style={styles.detailValue}>
                  {selected?.uploadedAt ? new Date(selected.uploadedAt.seconds * 1000).toLocaleString() : 'Unknown'}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeText: { fontSize: 12, color: C.primary, fontWeight: '700' },
  completedBadge: { backgroundColor: '#dcfce7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  completedText: { fontSize: 11, color: '#14532d', fontWeight: '700' },
  ref: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fileName: { fontSize: 13, color: C.textSecondary },
  date: { fontSize: 11, color: C.textLight },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyText: { color: C.textSecondary, fontSize: 15, marginTop: 12, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  detailLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600', width: 100 },
  detailValue: { fontSize: 14, color: C.text, fontWeight: '600', textAlign: 'right' },
});
