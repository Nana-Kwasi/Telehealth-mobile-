import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/apiClient';
import { DoctorColors } from '../../constants/colors';

const STAR_FILTERS = ['All', '5', '4', '3', '2', '1'];

function Stars({ rating, size = 14 }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : 'star-outline'}
          size={size}
          color={i <= rating ? '#f59e0b' : '#d1d5db'}
        />
      ))}
    </View>
  );
}

function RatingBar({ star, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label}>{star} ★</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={barStyles.count}>{count}</Text>
    </View>
  );
}
const barStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  label: { width: 28, fontSize: 12, color: '#64748b', textAlign: 'right' },
  track: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#f59e0b', borderRadius: 4 },
  count: { width: 22, fontSize: 12, color: '#64748b' },
});

export default function DoctorReviewsScreen() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [starFilter, setStarFilter] = useState('All');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => { loadReviews(); }, []);

  const loadReviews = async () => {
    try {
      const doctorId = await AsyncStorage.getItem('th.userId');
      if (!doctorId) return;
      const data = await api(`/api/v1/doctors/${doctorId}/reviews`);
      const list = Array.isArray(data?.reviews) ? data.reviews : (Array.isArray(data) ? data : []);
      setReviews(list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    } catch (err) {
      console.error('DoctorReviews load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      await api(`/api/v1/doctors/reviews/${replyingTo.id}`, {
        method: 'PATCH',
        body: { doctorReply: replyText.trim() },
      }).catch(() => {});
      setReviews(prev => prev.map(r =>
        r.id === replyingTo.id ? { ...r, doctorReply: replyText.trim() } : r
      ));
      setReplyingTo(null);
      setReplyText('');
    } catch {
      Alert.alert('Error', 'Could not send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  // Stats
  const total = reviews.length;
  const avg = total > 0 ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / total).toFixed(1) : '0.0';
  const dist = [5, 4, 3, 2, 1].map(s => ({ star: s, count: reviews.filter(r => r.rating === s).length }));

  const filtered = reviews.filter(r => {
    const passFilter = starFilter === 'All' || r.rating === Number(starFilter);
    if (!passFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.clientName || '').toLowerCase().includes(q) ||
           (r.comment || '').toLowerCase().includes(q);
  });

  const cardBorder = (rating) => {
    if (rating >= 4) return '#86efac';
    if (rating === 3) return '#fcd34d';
    return '#fca5a5';
  };

  const renderReview = ({ item }) => (
    <View style={[styles.reviewCard, { borderLeftColor: cardBorder(item.rating) }]}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(item.clientName || 'P')[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.reviewerName}>{item.clientName || 'Patient'}</Text>
            <Text style={styles.reviewDate}>{item.date || ''}</Text>
          </View>
        </View>
        <Stars rating={item.rating || 0} />
      </View>

      {item.comment ? <Text style={styles.reviewComment}>{item.comment}</Text> : null}

      {item.doctorReply ? (
        <View style={styles.replyBox}>
          <Text style={styles.replyLabel}>Your Reply</Text>
          <Text style={styles.replyText}>{item.doctorReply}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.replyBtn}
          onPress={() => { setReplyingTo(item); setReplyText(''); }}
        >
          <Ionicons name="return-down-forward-outline" size={14} color={DoctorColors.primary} />
          <Text style={styles.replyBtnText}>Reply</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Rating Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryLeft}>
          <Text style={styles.avgRating}>{avg}</Text>
          <Stars rating={Math.round(Number(avg))} size={16} />
          <Text style={styles.totalCount}>{total} review{total !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.summaryRight}>
          {dist.map(d => <RatingBar key={d.star} star={d.star} count={d.count} total={total} />)}
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {STAR_FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, starFilter === f && styles.filterTabActive]}
            onPress={() => setStarFilter(f)}
          >
            <Text style={[styles.filterText, starFilter === f && styles.filterTextActive]}>
              {f === 'All' ? 'All' : `${f} ★`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search reviews..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderReview}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReviews(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No reviews yet</Text>
            </View>
          }
        />
      )}

      {/* Reply Modal */}
      <Modal visible={!!replyingTo} transparent animationType="slide" onRequestClose={() => setReplyingTo(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reply to {replyingTo?.clientName || 'Patient'}</Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {replyingTo && (
              <View style={styles.originalReview}>
                <Stars rating={replyingTo.rating || 0} size={13} />
                <Text style={styles.originalText} numberOfLines={3}>{replyingTo.comment}</Text>
              </View>
            )}
            <TextInput
              style={styles.replyInput}
              placeholder="Write your reply..."
              placeholderTextColor="#94a3b8"
              value={replyText}
              onChangeText={setReplyText}
              multiline numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtnModal} onPress={() => setReplyingTo(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, (!replyText.trim() || sendingReply) && { opacity: 0.5 }]}
                onPress={sendReply}
                disabled={!replyText.trim() || sendingReply}
              >
                {sendingReply ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnText}>Send Reply</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryCard: {
    backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16,
    flexDirection: 'row', gap: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  summaryLeft: { alignItems: 'center', justifyContent: 'center', width: 90 },
  avgRating: { fontSize: 42, fontWeight: '800', color: DoctorColors.text },
  totalCount: { fontSize: 12, color: DoctorColors.textSecondary, marginTop: 4 },
  summaryRight: { flex: 1, justifyContent: 'center' },
  filterRow: { paddingHorizontal: 16, marginBottom: 8 },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginRight: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: DoctorColors.border,
  },
  filterTabActive: { backgroundColor: DoctorColors.primary, borderColor: DoctorColors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: DoctorColors.textSecondary },
  filterTextActive: { color: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: DoctorColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: DoctorColors.text },
  reviewCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reviewer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: DoctorColors.primary },
  reviewerName: { fontSize: 14, fontWeight: '600', color: DoctorColors.text },
  reviewDate: { fontSize: 11, color: DoctorColors.textSecondary },
  reviewComment: { fontSize: 13, color: DoctorColors.textSecondary, lineHeight: 19, marginBottom: 10 },
  replyBox: {
    backgroundColor: '#eff6ff', borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  replyLabel: { fontSize: 11, fontWeight: '700', color: '#1e6bb8', marginBottom: 3 },
  replyText: { fontSize: 13, color: '#1e293b' },
  replyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20,
    backgroundColor: DoctorColors.primaryLight,
  },
  replyBtnText: { fontSize: 12, color: DoctorColors.primary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: '#94a3b8' },
  // Reply Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: DoctorColors.text },
  originalReview: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 14, gap: 6,
  },
  originalText: { fontSize: 13, color: DoctorColors.textSecondary },
  replyInput: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 13,
    fontSize: 15, color: DoctorColors.text,
    borderWidth: 1, borderColor: '#e2e8f0',
    height: 110, textAlignVertical: 'top', marginBottom: 14,
  },
  modalFooter: { flexDirection: 'row', gap: 10 },
  cancelBtnModal: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  sendBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: DoctorColors.primary,
  },
  sendBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
