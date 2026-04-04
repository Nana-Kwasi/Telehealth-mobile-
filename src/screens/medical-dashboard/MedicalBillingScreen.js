import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../services/firebaseConfig';
import { fetchClientAppointments } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const MedicalBillingScreen = () => {
  const [completedAppts, setCompletedAppts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const appts = await fetchClientAppointments(currentUser.uid);
        setCompletedAppts(appts.filter((a) => a.status === 'completed'));
      }
    } catch (err) {
      console.error('Error loading billing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const totalBilled = completedAppts.reduce((sum, a) => sum + (Number(a.consultationFee) || 0), 0);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MedicalColors.primary} />}
    >
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderTopColor: MedicalColors.primary }]}>
          <Ionicons name="card-outline" size={22} color={MedicalColors.primary} />
          <Text style={styles.statAmount}>${totalBilled.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Total Billed</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: MedicalColors.success }]}>
          <Ionicons name="checkmark-circle-outline" size={22} color={MedicalColors.success} />
          <Text style={styles.statAmount}>{completedAppts.length}</Text>
          <Text style={styles.statLabel}>Completed Visits</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: MedicalColors.warning }]}>
          <Ionicons name="alert-circle-outline" size={22} color={MedicalColors.warning} />
          <Text style={styles.statAmount}>$0.00</Text>
          <Text style={styles.statLabel}>Outstanding</Text>
        </View>
      </View>

      {/* Invoice List */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invoice History</Text>
        {completedAppts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={50} color={MedicalColors.textLight} />
            <Text style={styles.emptyTitle}>No invoices yet</Text>
            <Text style={styles.emptySub}>Billing records appear after completed consultations.</Text>
          </View>
        ) : (
          completedAppts.map((a, i) => (
            <View
              key={a.id}
              style={[styles.invoiceRow, i < completedAppts.length - 1 && styles.invoiceRowBorder]}
            >
              <View style={styles.invoiceIcon}>
                <Ionicons name="checkmark-circle" size={18} color={MedicalColors.success} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.invoiceDoctor}>Dr. {a.doctorName || 'Doctor'}</Text>
                <Text style={styles.invoiceMeta}>
                  {a.date || '—'} • {a.consultationType || 'Video'}
                </Text>
              </View>
              <View style={styles.invoiceRight}>
                <Text style={styles.invoiceAmount}>${a.consultationFee || '0.00'}</Text>
                <View style={styles.paidBadge}>
                  <Text style={styles.paidBadgeText}>Paid</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
    padding: 16,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.background,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: MedicalColors.border,
    borderTopWidth: 3,
  },
  statAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.text,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 10,
    color: MedicalColors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  card: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: MedicalColors.text,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  invoiceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  invoiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceDoctor: {
    fontSize: 14,
    fontWeight: '600',
    color: MedicalColors.text,
    marginBottom: 2,
  },
  invoiceMeta: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
  },
  invoiceRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  invoiceAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  paidBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16a34a',
  },
});

export default MedicalBillingScreen;
