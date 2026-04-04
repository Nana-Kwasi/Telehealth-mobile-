import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { fetchClientAppointments, fetchClientPrescriptions } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const MedicalHistoryScreen = () => {
  const [activeTab, setActiveTab] = useState('consultations');
  const [pastAppointments, setPastAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [doctorNotes, setDoctorNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const clientId = currentUser.uid;
      const [appts, rxs, notesSnap] = await Promise.all([
        fetchClientAppointments(clientId),
        fetchClientPrescriptions(clientId),
        getDocs(query(collection(db, 'doctorNotes'), where('patientId', '==', clientId))),
      ]);

      setPastAppointments(appts.filter((a) => a.status === 'completed'));
      setPrescriptions(rxs);
      const notes = notesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setDoctorNotes(notes);
    } catch (error) {
      console.error('Error loading history:', error);
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'consultations' && styles.tabActive]}
          onPress={() => setActiveTab('consultations')}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={activeTab === 'consultations' ? '#FFFFFF' : MedicalColors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'consultations' && styles.tabTextActive]}>
            Consultations
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'prescriptions' && styles.tabActive]}
          onPress={() => setActiveTab('prescriptions')}
        >
          <Ionicons
            name="medical-outline"
            size={18}
            color={activeTab === 'prescriptions' ? '#FFFFFF' : MedicalColors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'prescriptions' && styles.tabTextActive]}>
            Prescriptions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'notes' && styles.tabActive]}
          onPress={() => setActiveTab('notes')}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={activeTab === 'notes' ? '#FFFFFF' : MedicalColors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'notes' && styles.tabTextActive]}>
            Doctor Notes
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MedicalColors.primary} />
        }
      >
        {activeTab === 'consultations' && (
          pastAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={56} color={MedicalColors.textLight} />
              <Text style={styles.emptyTitle}>No past consultations</Text>
              <Text style={styles.emptySubtitle}>
                Your completed appointments will appear here.
              </Text>
            </View>
          ) : (
            pastAppointments.map((appt) => (
              <View key={appt.id} style={styles.historyCard}>
                <View style={styles.cardRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(appt.doctorName || 'D')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>Dr. {appt.doctorName}</Text>
                    <Text style={styles.specialty}>{appt.doctorSpecialization || 'Doctor'}</Text>
                  </View>
                </View>
                <View style={styles.cardMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={MedicalColors.textSecondary} />
                    <Text style={styles.metaText}>{appt.date}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={MedicalColors.textSecondary} />
                    <Text style={styles.metaText}>{appt.time}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons
                      name={appt.consultationType === 'video' ? 'videocam-outline' : 'chatbubble-outline'}
                      size={14}
                      color={MedicalColors.textSecondary}
                    />
                    <Text style={styles.metaText}>
                      {(appt.consultationType || 'video').charAt(0).toUpperCase() +
                        (appt.consultationType || 'video').slice(1)}
                    </Text>
                  </View>
                </View>
                {appt.notes ? (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesLabel}>Notes</Text>
                    <Text style={styles.notesText}>{appt.notes}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )
        )}

        {activeTab === 'prescriptions' && (
          prescriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="medical-outline" size={56} color={MedicalColors.textLight} />
              <Text style={styles.emptyTitle}>No prescriptions</Text>
              <Text style={styles.emptySubtitle}>
                Prescriptions from your doctors will appear here.
              </Text>
            </View>
          ) : (
            prescriptions.map((rx) => (
              <View key={rx.id} style={styles.rxCard}>
                <View style={styles.rxHeader}>
                  <Ionicons name="document-text" size={20} color={MedicalColors.primary} />
                  <Text style={styles.rxTitle}>{rx.medication || 'Prescription'}</Text>
                  <Text style={styles.rxDate}>{rx.date || ''}</Text>
                </View>
                {rx.dosage && (
                  <View style={styles.rxRow}>
                    <Text style={styles.rxLabel}>Dosage:</Text>
                    <Text style={styles.rxValue}>{rx.dosage}</Text>
                  </View>
                )}
                {rx.frequency && (
                  <View style={styles.rxRow}>
                    <Text style={styles.rxLabel}>Frequency:</Text>
                    <Text style={styles.rxValue}>{rx.frequency}</Text>
                  </View>
                )}
                {rx.duration && (
                  <View style={styles.rxRow}>
                    <Text style={styles.rxLabel}>Duration:</Text>
                    <Text style={styles.rxValue}>{rx.duration}</Text>
                  </View>
                )}
                {rx.doctorName && (
                  <View style={styles.rxRow}>
                    <Text style={styles.rxLabel}>Prescribed by:</Text>
                    <Text style={styles.rxValue}>Dr. {rx.doctorName}</Text>
                  </View>
                )}
                {rx.notes && (
                  <View style={styles.rxNotes}>
                    <Text style={styles.rxNotesText}>{rx.notes}</Text>
                  </View>
                )}
              </View>
            ))
          )
        )}

        {activeTab === 'notes' && (
          doctorNotes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={56} color={MedicalColors.textLight} />
              <Text style={styles.emptyTitle}>No clinical notes yet</Text>
              <Text style={styles.emptySubtitle}>
                Notes written by your doctor will appear here after your consultation.
              </Text>
            </View>
          ) : (
            doctorNotes.map((note) => {
              const typeColors = { consultation: '#1e6bb8', followup: '#7c3aed', prescription: '#059669', referral: '#d97706', general: '#64748b' };
              const noteColor = typeColors[note.type] || '#64748b';
              return (
                <View key={note.id} style={[styles.noteCard, { borderLeftColor: noteColor }]}>
                  <View style={styles.noteHeader}>
                    <Text style={styles.noteTitle}>{note.title}</Text>
                    <View style={[styles.noteTypeBadge, { backgroundColor: noteColor + '20' }]}>
                      <Text style={[styles.noteTypeText, { color: noteColor }]}>
                        {note.type ? note.type.charAt(0).toUpperCase() + note.type.slice(1) : 'Note'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.noteMeta}>Dr. {note.doctorName || 'Doctor'}{note.createdAt?.seconds ? '  ·  ' + new Date(note.createdAt.seconds * 1000).toLocaleDateString() : ''}</Text>
                  <Text style={styles.noteContent}>{note.content?.length > 300 ? note.content.slice(0, 300) + '…' : note.content}</Text>
                </View>
              );
            })
          )
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.background,
  },
  tabs: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  tabActive: {
    backgroundColor: MedicalColors.primary,
    borderColor: MedicalColors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    padding: 16,
    paddingTop: 8,
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
  emptySubtitle: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  specialty: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
  },
  notesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: MedicalColors.border,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: MedicalColors.text,
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
  rxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  rxTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  rxDate: {
    fontSize: 12,
    color: MedicalColors.textLight,
  },
  rxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  rxLabel: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
  },
  rxValue: {
    fontSize: 13,
    color: MedicalColors.text,
    fontWeight: '500',
  },
  rxNotes: {
    marginTop: 10,
    padding: 10,
    backgroundColor: MedicalColors.cardBg,
    borderRadius: 8,
  },
  rxNotesText: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    lineHeight: 18,
  },
  noteCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  noteTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  noteTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  noteTypeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  noteMeta: {
    fontSize: 11,
    color: MedicalColors.textSecondary,
    marginBottom: 8,
  },
  noteContent: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    lineHeight: 20,
  },
});

export default MedicalHistoryScreen;
