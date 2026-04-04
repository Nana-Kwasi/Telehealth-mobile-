import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, PieChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { fetchClientAppointments, fetchClientPrescriptions } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width - 32;

function getInitials(name) {
  if (!name) return 'D';
  const p = name.trim().split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// Build last-6-months appointment frequency data for LineChart
function buildMonthlyData(appointments) {
  const months = [];
  const labels = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleString('default', { month: 'short' }));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(appointments.filter(a => (a.date || '').startsWith(key)).length);
  }
  return { labels, data: months };
}

// Build appointment status breakdown for PieChart
function buildStatusData(appointments) {
  const counts = { confirmed: 0, pending: 0, completed: 0, cancelled: 0 };
  appointments.forEach(a => { if (a.status in counts) counts[a.status]++; });
  const colors = { confirmed: '#22c55e', pending: '#f59e0b', completed: '#3b82f6', cancelled: '#ef4444' };
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), population: v, color: colors[k], legendFontColor: MedicalColors.textSecondary, legendFontSize: 12 }));
}

const MedicalHomeScreen = ({ navigation }) => {
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newBookingDoctor, setNewBookingDoctor] = useState(null);
  const [primaryDoctor, setPrimaryDoctor] = useState(null);
  const [patientStatus, setPatientStatus] = useState('active'); // 'active' | 'discharged'

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const name = await AsyncStorage.getItem('userName');
      setUserName(name || 'Patient');

      const currentUser = auth.currentUser;
      if (currentUser) {
        const clientId = currentUser.uid;
        const [appts, rxs] = await Promise.all([
          fetchClientAppointments(clientId),
          fetchClientPrescriptions(clientId),
        ]);
        setAppointments(appts);
        setPrescriptions(rxs);

        // Fetch patient status
        try {
          const profSnap = await getDoc(doc(db, 'patientProfiles', clientId));
          if (profSnap.exists()) setPatientStatus(profSnap.data().status || 'active');
        } catch (_) {}

        // Derive primary doctor from most recent non-cancelled appointment
        const withDoc = appts
          .filter(a => a.doctorId && a.status !== 'cancelled')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (withDoc.length > 0) {
          const pd = {
            id: withDoc[0].doctorId,
            name: withDoc[0].doctorName || 'Doctor',
            spec: withDoc[0].doctorSpecialization || 'Medical Doctor',
            photoURL: null,
          };
          try {
            const drSnap = await getDoc(doc(db, 'doctors', pd.id));
            if (drSnap.exists()) pd.photoURL = drSnap.data().photoURL || null;
          } catch (_) {}
          setPrimaryDoctor(pd);
          await AsyncStorage.removeItem('th.newBookingDoctor');
          setNewBookingDoctor(null);
        } else {
          const cached = await AsyncStorage.getItem('th.newBookingDoctor');
          if (cached) setNewBookingDoctor(JSON.parse(cached));
        }
      }
    } catch (error) {
      console.error('Error loading medical home data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const upcomingAppointments = appointments.filter(
    (a) => a.status !== 'completed' && a.status !== 'cancelled'
  );
  const completedCount = appointments.filter((a) => a.status === 'completed').length;

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return MedicalColors.success;
      case 'pending': return MedicalColors.warning;
      case 'cancelled': return MedicalColors.error;
      case 'completed': return MedicalColors.textLight;
      default: return MedicalColors.textSecondary;
    }
  };

  // Recent activity: merge appointments + prescriptions, sort by most recent
  const recentActivity = [
    ...appointments.slice(0, 5).map(a => ({
      id: 'appt_' + a.id,
      type: 'appointment',
      title: `Appointment with Dr. ${a.doctorName || 'Doctor'}`,
      subtitle: a.date ? `${a.date}${a.time ? ' at ' + a.time : ''}` : 'Date TBD',
      status: a.status,
      date: a.date || '',
      icon: 'calendar-outline',
      iconColor: MedicalColors.primary,
      iconBg: '#eff6ff',
    })),
    ...prescriptions.slice(0, 5).map(rx => ({
      id: 'rx_' + rx.id,
      type: 'prescription',
      title: rx.medication || rx.medicationName || 'Prescription',
      subtitle: `Dr. ${rx.doctorName || 'Doctor'}${rx.dosage ? ' · ' + rx.dosage : ''}`,
      status: 'active',
      date: rx.date || '',
      icon: 'medkit-outline',
      iconColor: '#059669',
      iconBg: '#f0fdf4',
    })),
  ]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 6);

  const monthlyData = buildMonthlyData(appointments);
  const pieData = buildStatusData(appointments);

  const quickActions = [
    primaryDoctor
      ? { icon: 'calendar-outline', label: 'Book Appt', color: MedicalColors.primary, bg: '#eff6ff', onPress: () => navigation.navigate('MedicalAppointments') }
      : { icon: 'search-outline', label: 'Find Doctor', color: MedicalColors.primary, bg: '#eff6ff', onPress: () => navigation.getParent()?.navigate('DoctorSearch') },
    { icon: 'list-outline', label: 'Appointments', color: MedicalColors.success, bg: '#f0fdf4', onPress: () => navigation.navigate('MedicalAppointments') },
    { icon: 'chatbubbles-outline', label: 'Messages', color: MedicalColors.warning, bg: '#fef3c7', onPress: () => navigation.navigate('MedicalMessages') },
    { icon: 'medkit-outline', label: 'Prescriptions', color: '#059669', bg: '#f0fdf4', onPress: () => navigation.navigate('MedicalPrescriptions') },
    { icon: 'folder-outline', label: 'History', color: MedicalColors.accent, bg: '#f3e8ff', onPress: () => navigation.navigate('MedicalHistory') },
    { icon: 'videocam-outline', label: 'Video Calls', color: '#7c3aed', bg: '#ede9fe', onPress: () => navigation.navigate('MedicalVideo') },
    { icon: 'card-outline', label: 'Billing', color: '#be185d', bg: '#fdf2f8', onPress: () => navigation.navigate('MedicalBilling') },
    { icon: 'shield-checkmark-outline', label: 'Insurance', color: MedicalColors.primary, bg: '#eff6ff', onPress: () => navigation.getParent()?.navigate('InsuranceDetails') },
    { icon: 'call-outline', label: 'Emergency', color: '#ea580c', bg: '#fff7ed', onPress: () => navigation.getParent()?.navigate('EmergencyContact') },
    { icon: 'documents-outline', label: 'Records', color: MedicalColors.success, bg: '#f0fdf4', onPress: () => navigation.getParent()?.navigate('HealthRecords') },
    { icon: 'alert-circle-outline', label: 'Support', color: '#dc2626', bg: '#fef2f2', onPress: () => navigation.getParent()?.navigate('Support') },
    { icon: 'settings-outline', label: 'Settings', color: '#64748b', bg: '#f1f5f9', onPress: () => navigation.navigate('MedicalSettings') },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MedicalColors.primary} />
      }
    >
      {/* Welcome Banner */}
      <View style={styles.welcomeCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeGreeting}>Hello, {userName.split(' ')[0]}</Text>
          <Text style={styles.welcomeSubtitle}>How are you feeling today?</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          {/* Patient status badge */}
          <View style={[
            styles.statusBadgeWelcome,
            patientStatus === 'discharged' && styles.statusBadgeDischarged,
          ]}>
            <Ionicons
              name={patientStatus === 'discharged' ? 'close-circle-outline' : 'checkmark-circle-outline'}
              size={13}
              color={patientStatus === 'discharged' ? '#dc2626' : '#16a34a'}
            />
            <Text style={[
              styles.statusBadgeText,
              patientStatus === 'discharged' && { color: '#dc2626' },
            ]}>
              {patientStatus === 'discharged' ? 'Discharged' : 'Active'}
            </Text>
          </View>
          {!primaryDoctor && (
            <TouchableOpacity
              style={styles.findDoctorButton}
              onPress={() => navigation.getParent()?.navigate('DoctorSearch')}
            >
              <Ionicons name="search" size={18} color="#FFFFFF" />
              <Text style={styles.findDoctorText}>Find Doctor</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Find Doctor CTA Banner */}
      {!primaryDoctor && !newBookingDoctor && (
        <TouchableOpacity
          style={styles.findDoctorBanner}
          onPress={() => navigation.getParent()?.navigate('DoctorSearch')}
          activeOpacity={0.85}
        >
          <View style={styles.fdbIconWrap}>
            <Ionicons name="person-circle-outline" size={30} color={MedicalColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fdbTitle}>You haven't found a doctor yet</Text>
            <Text style={styles.fdbSub}>Tap to search our network of licensed physicians →</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* New booking banner */}
      {newBookingDoctor && (
        <View style={styles.bookingBanner}>
          <View style={styles.bookingBannerAvatar}>
            <Text style={styles.bookingBannerAvatarText}>
              {(newBookingDoctor.doctorName || 'D')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bookingBannerTitle}>
              Appointment booked with Dr. {newBookingDoctor.doctorName}
            </Text>
            {newBookingDoctor.date ? (
              <Text style={styles.bookingBannerSub}>
                {newBookingDoctor.date}{newBookingDoctor.time ? ' at ' + newBookingDoctor.time : ''} · Awaiting confirmation
              </Text>
            ) : null}
          </View>
          <View style={styles.bookingBannerBadge}>
            <Text style={styles.bookingBannerBadgeText}>Pending</Text>
          </View>
        </View>
      )}

      {/* Your Doctor Card */}
      {primaryDoctor && (
        <View style={styles.yourDoctorCard}>
          <View style={styles.ydLabelRow}>
            <Ionicons name="heart" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.ydLabel}>Your Doctor</Text>
          </View>
          <TouchableOpacity
            style={styles.ydBody}
            activeOpacity={0.8}
            onPress={() => navigation.getParent()?.navigate('DoctorDetail', { doctorId: primaryDoctor.id })}
          >
            <View style={styles.ydAvatar}>
              {primaryDoctor.photoURL ? (
                <Image source={{ uri: primaryDoctor.photoURL }} style={{ width: '100%', height: '100%', borderRadius: 24 }} />
              ) : (
                <Text style={styles.ydAvatarText}>{getInitials(primaryDoctor.name)}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ydName}>Dr. {primaryDoctor.name}</Text>
              <Text style={styles.ydSpec}>{primaryDoctor.spec}</Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Tap to view profile →</Text>
            </View>
            <View style={styles.ydActions}>
              <TouchableOpacity
                style={styles.ydBtnPrimary}
                onPress={() => navigation.navigate('MedicalAppointments')}
              >
                <Ionicons name="calendar-outline" size={14} color="#fff" />
                <Text style={styles.ydBtnPrimaryText}>Schedule</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ydBtnOutline}
                onPress={() => navigation.navigate('MedicalMessages')}
              >
                <Ionicons name="chatbubbles-outline" size={14} color="rgba(255,255,255,0.85)" />
                <Text style={styles.ydBtnOutlineText}>Message</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="calendar-outline" size={24} color={MedicalColors.primary} />
          <Text style={styles.statNumber}>{upcomingAppointments.length}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle-outline" size={24} color={MedicalColors.success} />
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="document-text-outline" size={24} color={MedicalColors.accent} />
          <Text style={styles.statNumber}>{prescriptions.length}</Text>
          <Text style={styles.statLabel}>Prescriptions</Text>
        </View>
      </View>

      {/* Quick Actions — horizontal scrollable row */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.actionsScroll}
        contentContainerStyle={styles.actionsScrollContent}
      >
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={styles.actionCard}
            onPress={action.onPress}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.bg }]}>
              <Ionicons name={action.icon} size={22} color={action.color} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Charts Section */}
    

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Recent Activity</Text>
          <View style={styles.activityCard}>
            {recentActivity.map((item, idx) => (
              <View
                key={item.id}
                style={[styles.activityRow, idx < recentActivity.length - 1 && styles.activityRowBorder]}
              >
                <View style={[styles.activityIcon, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={18} color={item.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.activitySub} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                {item.type === 'appointment' && (
                  <View style={[styles.activityBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                    <Text style={[styles.activityBadgeText, { color: getStatusColor(item.status) }]}>
                      {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Pending'}
                    </Text>
                  </View>
                )}
                {item.type === 'prescription' && (
                  <View style={[styles.activityBadge, { backgroundColor: '#f0fdf4' }]}>
                    <Text style={[styles.activityBadgeText, { color: '#059669' }]}>Active</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Upcoming Appointments */}
      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Upcoming Appointments</Text>
      {upcomingAppointments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={40} color={MedicalColors.textLight} />
          <Text style={styles.emptyText}>No upcoming appointments</Text>
          {primaryDoctor ? (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('MedicalAppointments')}
            >
              <Text style={styles.emptyButtonText}>Book Appointment</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.getParent()?.navigate('DoctorSearch')}
            >
              <Text style={styles.emptyButtonText}>Find a Doctor</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        upcomingAppointments.slice(0, 3).map((appt) => (
          <View key={appt.id} style={styles.appointmentCard}>
            <View style={styles.apptLeft}>
              <View style={styles.apptAvatar}>
                <Text style={styles.apptAvatarText}>
                  {(appt.doctorName || 'D')[0].toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.apptDoctorName}>Dr. {appt.doctorName}</Text>
                <Text style={styles.apptSpecialty}>{appt.doctorSpecialization || 'Doctor'}</Text>
                <View style={styles.apptDateTime}>
                  <Ionicons name="calendar-outline" size={13} color={MedicalColors.textSecondary} />
                  <Text style={styles.apptDateText}>{appt.date}</Text>
                  <Ionicons name="time-outline" size={13} color={MedicalColors.textSecondary} />
                  <Text style={styles.apptDateText}>{appt.time}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.apptStatusBadge, { backgroundColor: getStatusColor(appt.status) + '20' }]}>
              <Text style={[styles.apptStatusText, { color: getStatusColor(appt.status) }]}>
                {(appt.status || 'pending').charAt(0).toUpperCase() + (appt.status || 'pending').slice(1)}
              </Text>
            </View>
          </View>
        ))
      )}
  {appointments.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Health Overview</Text>

          {/* Line Chart — monthly appointment frequency */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Appointments (Last 6 Months)</Text>
            <LineChart
              data={{
                labels: monthlyData.labels,
                datasets: [{ data: monthlyData.data.length > 0 ? monthlyData.data : [0] }],
              }}
              width={SCREEN_WIDTH - 32}
              height={180}
              chartConfig={{
                backgroundColor: MedicalColors.surface,
                backgroundGradientFrom: MedicalColors.surface,
                backgroundGradientTo: MedicalColors.surface,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(30, 107, 184, ${opacity})`,
                labelColor: () => MedicalColors.textSecondary,
                style: { borderRadius: 12 },
                propsForDots: { r: '4', strokeWidth: '2', stroke: MedicalColors.primary },
              }}
              bezier
              style={styles.chart}
            />
          </View>

          {/* Pie Chart — appointment status breakdown */}
          {pieData.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Appointment Status Breakdown</Text>
              <PieChart
                data={pieData}
                width={SCREEN_WIDTH - 32}
                height={180}
                chartConfig={{
                  color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="16"
                absolute
              />
            </View>
          )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.background,
  },

  /* Welcome */
  welcomeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: MedicalColors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
  },
  welcomeGreeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  statusBadgeWelcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusBadgeDischarged: {
    backgroundColor: 'rgba(254,226,226,0.95)',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },
  findDoctorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  findDoctorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Find Doctor Banner */
  findDoctorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  fdbIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  fdbTitle: {
    fontWeight: '700',
    color: '#1e3a5f',
    fontSize: 14,
    marginBottom: 3,
  },
  fdbSub: {
    fontSize: 12,
    color: '#3b82f6',
    lineHeight: 17,
  },

  /* Booking Banner */
  bookingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  bookingBannerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: MedicalColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bookingBannerAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  bookingBannerTitle: {
    fontWeight: '700',
    color: '#1e3a5f',
    fontSize: 14,
    marginBottom: 2,
  },
  bookingBannerSub: {
    fontSize: 12,
    color: '#2563eb',
  },
  bookingBannerBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bookingBannerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },

  /* Your Doctor Card */
  yourDoctorCard: {
    backgroundColor: MedicalColors.primary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  ydLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  ydLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
  },
  ydBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ydAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  ydAvatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
  },
  ydName: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    marginBottom: 2,
  },
  ydSpec: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  ydActions: {
    gap: 6,
    alignItems: 'flex-end',
  },
  ydBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  ydBtnPrimaryText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  ydBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  ydBtnOutlineText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },

  /* Stats */
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: MedicalColors.text,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: MedicalColors.textSecondary,
    marginTop: 2,
  },

  /* Section title */
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 12,
  },

  /* Quick Actions — horizontal scroll */
  actionsScroll: {
    marginBottom: 24,
    marginHorizontal: -16,
  },
  actionsScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  actionCard: {
    width: 76,
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 7,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: MedicalColors.text,
    textAlign: 'center',
  },

  /* Charts */
  chartCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MedicalColors.textSecondary,
    marginBottom: 12,
  },
  chart: {
    borderRadius: 10,
  },

  /* Recent Activity */
  activityCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.text,
    marginBottom: 2,
  },
  activitySub: {
    fontSize: 11,
    color: MedicalColors.textSecondary,
  },
  activityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  /* Empty */
  emptyCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  emptyText: {
    fontSize: 14,
    color: MedicalColors.textSecondary,
    marginTop: 12,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: MedicalColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Appointment Cards */
  appointmentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  apptLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  apptAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apptAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  apptDoctorName: {
    fontSize: 15,
    fontWeight: '600',
    color: MedicalColors.text,
  },
  apptSpecialty: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    marginBottom: 4,
  },
  apptDateTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  apptDateText: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    marginRight: 6,
  },
  apptStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  apptStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default MedicalHomeScreen;
