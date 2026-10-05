import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callState, callTimeLabel, CALL_STATE_COLORS } from '../../utils/callState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredUserId } from '../../services/apiClient';
import { fetchClientAppointments } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';


/** Open the shared call screen as this user (signed in, current HTTPS address). */
async function openCallAs(navigation, roomName, otherName, otherId) {
  let me = 'Patient';
  try {
    const p = JSON.parse((await AsyncStorage.getItem('userProfile')) || '{}');
    me = p.fullName || p.name || p.email || me;
  } catch { /* default name */ }
  navigation.navigate('VideoCallSession', {
    roomName, participantName: me,
    callInfo: { roomName, targetPerson: otherName, displayNames: otherId ? { [otherId]: otherName } : {} },
  });
}

const MedicalVideoScreen = ({ navigation }) => {
  const [videoAppointments, setVideoAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVideoAppointments();
  }, []);

  const loadVideoAppointments = async () => {
    try {
      const clientId = await getStoredUserId();
      if (!clientId) return;
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

  // The patient can join once the doctor has started the call (shared call room).
  const joinCall = (appt) => {
    if (appt.callStatus === 'in_progress' && appt.callRoomName) {
      // Was an alert only: patients could not join their doctor's call from the app.
      openCallAs(navigation, appt.callRoomName, appt.doctorName, appt.doctorId);
    } else {
      Alert.alert('Call not started', 'Your doctor has not started the video call yet. You can join as soon as they begin.');
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
            (() => {
              // A call that has come and gone used to look exactly like
              // tomorrow's, with a live Join button. Tapping it opened an
              // empty room and said nothing about why.
              const st = callState(appt.scheduledTime || appt.scheduledAt, appt.status);
              const tone = CALL_STATE_COLORS[st.tone];
              return (
                <View key={appt.id} style={[styles.videoCard, st.past && styles.videoCardPast]}>
                  <View style={styles.videoCardHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{(appt.doctorName || 'D')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.doctorName}>Dr. {appt.doctorName}</Text>
                      <Text style={styles.dateTime}>
                        {appt.date} at {appt.time}
                      </Text>
                      <Text style={styles.dateTime}>
                        {callTimeLabel(appt.scheduledTime || appt.scheduledAt)}
                      </Text>
                    </View>
                    <View style={[styles.callBadge, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.callBadgeText, { color: tone.fg }]}>{st.label}</Text>
                    </View>
                  </View>

                  {st.past ? (
                    <View style={styles.pastNote}>
                      <Ionicons name="information-circle-outline" size={15} color="#8a4b09" />
                      <Text style={styles.pastNoteText}>
                        {st.key === 'completed'
                          ? 'This consultation has ended.'
                          : st.key === 'cancelled'
                            ? 'This consultation was cancelled.'
                            : 'This time has passed. Book another to see your doctor.'}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.joinButton, !st.joinable && styles.joinButtonOff]}
                      onPress={() => joinCall(appt)}
                      disabled={!st.joinable}
                    >
                      <Ionicons name="videocam" size={20} color="#FFFFFF" />
                      <Text style={styles.joinButtonText}>
                        {st.joinable
                          ? (appt.callStatus === 'in_progress' && appt.callRoomName
                              ? 'Join Video Call' : 'Waiting for doctor')
                          : `Opens ${callTimeLabel(appt.scheduledTime || appt.scheduledAt)}`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()
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
  videoCardPast: { opacity: 0.72 },
  callBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, flexShrink: 0 },
  callBadgeText: { fontSize: 10.5, fontWeight: '800' },
  pastNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: '#fdeee0', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
  },
  // flex:1 on the text only, so it wraps instead of stretching the row.
  pastNoteText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#8a4b09' },
  joinButtonOff: { opacity: 0.5 },
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
