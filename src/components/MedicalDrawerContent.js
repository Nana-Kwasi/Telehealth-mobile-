import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { MedicalColors } from '../constants/colors';
import { signOut } from '../services/authService';

const MedicalDrawerContent = ({ navigation, profile }) => {
  const [hasPrimaryDoctor, setHasPrimaryDoctor] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', uid), where('status', 'in', ['pending', 'confirmed', 'completed'])))
      .then(snap => setHasPrimaryDoctor(snap.size > 0))
      .catch(() => {});
  }, []);
  const handleLogout = async () => {
    try {
      await AsyncStorage.clear();
      navigation.getParent()?.replace('Intent');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const drawerItems = [
    { name: 'MedicalHome', icon: 'home-outline', label: 'Home' },
    { name: 'MedicalTimeline', icon: 'time-outline', label: 'Health Timeline' },
    { name: 'MedicalAppointments', icon: 'calendar-outline', label: 'Appointments' },
    { name: 'MedicalVideo', icon: 'videocam-outline', label: 'Video Calls' },
    { name: 'MedicalMessages', icon: 'chatbubbles-outline', label: 'Messages' },
    { name: 'MedicalPrescriptions', icon: 'medkit-outline', label: 'Prescriptions' },
    { name: 'MedicalDiagnostic', icon: 'flask-outline', label: 'Lab & Scan Orders' },
    { name: 'MedicalHistory', icon: 'folder-outline', label: 'Medical History' },
    { name: 'MedicalBilling', icon: 'card-outline', label: 'Billing' },
    { name: 'MedicalSettings', icon: 'person-outline', label: 'My Profile' },
  ];

  const profileItems = [
    { name: 'InsuranceDetails', icon: 'shield-checkmark-outline', label: 'Insurance Details' },
    { name: 'EmergencyContact', icon: 'call-outline', label: 'Emergency Contacts' },
    { name: 'HealthRecords', icon: 'documents-outline', label: 'Health Records' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>NessaHub</Text>
          <Text style={styles.logoSubtext}>Medical</Text>
        </View>
        <View style={styles.userInfo}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {(profile?.name || 'P')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.userName}>{profile?.name || 'Patient'}</Text>
          <Text style={styles.userRole}>Medical Patient</Text>
        </View>
      </View>

      <ScrollView style={styles.menuContainer}>
        {drawerItems.map((item) => (
          <TouchableOpacity
            key={item.name}
            style={styles.menuItem}
            onPress={() => {
              navigation.navigate(item.name);
              navigation.closeDrawer();
            }}
          >
            <Ionicons name={item.icon} size={22} color={MedicalColors.text} />
            <Text style={styles.menuText}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Divider */}
        <View style={styles.divider} />

        {/* My Records section */}
        <Text style={styles.sectionLabel}>MY RECORDS</Text>
        {profileItems.map((item) => (
          <TouchableOpacity
            key={item.name}
            style={styles.menuItem}
            onPress={() => {
              navigation.getParent()?.navigate(item.name);
              navigation.closeDrawer();
            }}
          >
            <Ionicons name={item.icon} size={22} color={MedicalColors.textSecondary} />
            <Text style={styles.menuText}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Find Doctor shortcut — hidden when patient already has a doctor */}
        {!hasPrimaryDoctor && (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              navigation.getParent()?.navigate('DoctorSearch');
              navigation.closeDrawer();
            }}
          >
            <Ionicons name="search-outline" size={22} color={MedicalColors.primary} />
            <Text style={[styles.menuText, { color: MedicalColors.primary }]}>Find a Doctor</Text>
          </TouchableOpacity>
        )}

        {/* Support shortcut */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            navigation.getParent()?.navigate('Support');
            navigation.closeDrawer();
          }}
        >
          <Ionicons name="alert-circle-outline" size={22} color={MedicalColors.error} />
          <Text style={[styles.menuText, { color: MedicalColors.error }]}>Support & Report</Text>
        </TouchableOpacity>

        {/* HIPAA badge */}
        <View style={styles.hipaaBadge}>
          <Ionicons name="shield-checkmark-outline" size={14} color={MedicalColors.success} />
          <Text style={styles.hipaaText}>HIPAA Compliant</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.surface,
  },
  header: {
    backgroundColor: MedicalColors.primary,
    padding: 20,
    paddingTop: 50,
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 18,
  },
  logoText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  logoSubtext: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },
  userInfo: {
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: MedicalColors.primary,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  userRole: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  menuContainer: {
    flex: 1,
    paddingTop: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  menuText: {
    fontSize: 15,
    color: MedicalColors.text,
    marginLeft: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: MedicalColors.border,
    marginVertical: 8,
    marginHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: MedicalColors.textSecondary,
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  hipaaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  hipaaText: {
    fontSize: 12,
    fontWeight: '600',
    color: MedicalColors.success,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: MedicalColors.border,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MedicalColors.error,
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MedicalDrawerContent;
