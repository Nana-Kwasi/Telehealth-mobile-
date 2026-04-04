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
import { fetchClientPrescriptions } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const MedicalPrescriptionsScreen = () => {
  const [prescriptions, setPrescriptions] = useState([]);
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
        const rxs = await fetchClientPrescriptions(currentUser.uid);
        setPrescriptions(rxs);
      }
    } catch (err) {
      console.error('Error loading prescriptions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

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
      {/* Header */}
      <View style={styles.infoCard}>
        <Ionicons name="medkit" size={30} color={MedicalColors.primary} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.infoTitle}>My Prescriptions</Text>
          <Text style={styles.infoSub}>Medications prescribed by your doctors</Text>
        </View>
      </View>

      {prescriptions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="medkit-outline" size={64} color={MedicalColors.textLight} />
          <Text style={styles.emptyTitle}>No prescriptions yet</Text>
          <Text style={styles.emptySub}>
            Prescriptions from your doctor will appear here after your consultation.
          </Text>
        </View>
      ) : (
        <>
          {prescriptions.map((rx) => {
            // Support both medications array and flat fields
            const meds = Array.isArray(rx.medications) && rx.medications.length > 0
              ? rx.medications
              : rx.medication || rx.medicationName
                ? [{ name: rx.medication || rx.medicationName, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }]
                : [{ name: 'Prescription' }];
            return (
              <View key={rx.id} style={styles.rxCard}>
                <View style={styles.rxCardHeader}>
                  <View style={styles.rxIconWrap}>
                    <Ionicons name="medkit" size={20} color={MedicalColors.success} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.rxName}>{meds[0]?.name || 'Prescription'}</Text>
                    {rx.diagnosis ? <Text style={{ fontSize: 11, color: MedicalColors.textSecondary, marginBottom: 2 }}>Diagnosis: {rx.diagnosis}</Text> : null}
                    <Text style={styles.rxDoctor}>Prescribed by Dr. {rx.doctorName || 'Doctor'}</Text>
                  </View>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                </View>
                {meds.map((m, i) => (
                  <View key={i} style={[styles.rxDetails, i > 0 && { marginTop: 8 }]}>
                    {i > 0 ? <Text style={[styles.rxDetailLabel, { marginBottom: 6 }]}>{m.name}</Text> : null}
                    {m.dosage ? (
                      <View style={styles.rxDetailRow}>
                        <Text style={styles.rxDetailLabel}>Dosage</Text>
                        <Text style={styles.rxDetailValue}>{m.dosage}</Text>
                      </View>
                    ) : null}
                    {m.frequency ? (
                      <View style={styles.rxDetailRow}>
                        <Text style={styles.rxDetailLabel}>Frequency</Text>
                        <Text style={styles.rxDetailValue}>{m.frequency}</Text>
                      </View>
                    ) : null}
                    {m.duration ? (
                      <View style={styles.rxDetailRow}>
                        <Text style={styles.rxDetailLabel}>Duration</Text>
                        <Text style={styles.rxDetailValue}>{m.duration}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
                {rx.instructions ? (
                  <View style={styles.rxInstructions}>
                    <Text style={styles.rxDetailLabel}>Instructions</Text>
                    <Text style={styles.rxInstructionsText}>{rx.instructions}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}

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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MedicalColors.primaryLight,
    padding: 18,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: MedicalColors.primary + '30',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 3,
  },
  infoSub: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: MedicalColors.text,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 24,
    lineHeight: 19,
  },
  rxCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  rxCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rxIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rxName: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 2,
  },
  rxDoctor: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
  },
  activeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  rxDetails: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: MedicalColors.border,
    marginBottom: 4,
  },
  rxDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rxDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
  },
  rxDetailValue: {
    fontSize: 13,
    color: MedicalColors.text,
    fontWeight: '500',
  },
  rxInstructions: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: MedicalColors.border,
    gap: 4,
  },
  rxInstructionsText: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },
});

export default MedicalPrescriptionsScreen;
