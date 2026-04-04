import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../services/firebaseConfig';
import { fetchClientAppointments } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const MedicalVideoScreen = ({ navigation }) => {
  const [videoAppointments, setVideoAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVideoAppointments();
  }, []);

  const loadVideoAppointments = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const clientId = currentUser.uid;
      const appts = await fetchClientAppointments(clientId);
      setVideoAppointments(
        appts.filter(
          (a) => a.consultationType === 'video' && a.status !== 'cancelled'
        )
      );
    } catch (error) {
      console.error('Error loading video appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  const upcoming = videoAppointments.filter((a) => a.status === 'confirmed');
  const pending = videoAppointments.filter((a) => a.status === 'pending');

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="videocam" size={32} color={MedicalColors.primary} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.infoTitle}>Video Consultations</Text>
          <Text style={styles.infoSubtitle}>
            Join your confirmed video appointments from here. Ensure you have a stable connection.
          </Text>
        </View>
      </View>

      {/* Confirmed / Ready to Join */}
      {upcoming.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Ready to Join</Text>
          {upcoming.map((appt) => (
            <View key={appt.id} style={styles.videoCard}>
              <View style={styles.videoCardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(appt.doctorName || 'D')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.doctorName}>Dr. {appt.doctorName}</Text>
                  <Text style={styles.dateTime}>
                    {appt.date} at {appt.time}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.joinButton}>
                <Ionicons name="videocam" size={20} color="#FFFFFF" />
                <Text style={styles.joinButtonText}>Join Video Call</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending Confirmation</Text>
          {pending.map((appt) => (
            <View key={appt.id} style={styles.pendingCard}>
              <View style={styles.pendingHeader}>
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>
                    {(appt.doctorName || 'D')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingDoctor}>Dr. {appt.doctorName}</Text>
                  <Text style={styles.pendingDateTime}>
                    {appt.date} at {appt.time}
                  </Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pending</Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Empty State */}
      {videoAppointments.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="videocam-outline" size={64} color={MedicalColors.textLight} />
          <Text style={styles.emptyTitle}>No video appointments</Text>
          <Text style={styles.emptySubtitle}>
            Book a video consultation with a doctor to get started.
          </Text>
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() => navigation.getParent()?.navigate('DoctorSearch')}
          >
            <Text style={styles.bookBtnText}>Find a Doctor</Text>
          </TouchableOpacity>
        </View>
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
  loadingContainer: {
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
    marginBottom: 22,
    borderWidth: 1,
    borderColor: MedicalColors.primary + '30',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 4,
  },
  infoSubtitle: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 12,
  },
  videoCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  videoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  dateTime: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    marginTop: 2,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MedicalColors.success,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pendingCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  pendingDoctor: {
    fontSize: 14,
    fontWeight: '600',
    color: MedicalColors.text,
  },
  pendingDateTime: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
  },
  pendingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: MedicalColors.warning + '20',
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: MedicalColors.warning,
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
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  bookBtn: {
    backgroundColor: MedicalColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MedicalVideoScreen;
