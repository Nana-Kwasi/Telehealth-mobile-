import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { resolveRole } from '../services/authService';

// Onboarding / Auth screens
import IntentScreen from '../screens/IntentScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import QuestionnaireScreen from '../screens/QuestionnaireScreen';
import SignUpScreen from '../screens/SignUpScreen';
import MatchTherapistScreen from '../screens/MatchTherapistScreen';
import PaymentScreen from '../screens/PaymentScreen';
import ParentGuardianInfoScreen from '../screens/ParentGuardianInfoScreen';
import ChildInfoScreen from '../screens/ChildInfoScreen';
import ParentConsentScreen from '../screens/ParentConsentScreen';

// Therapy dashboard screens (existing)
import ClientHomeScreen from '../screens/dashboard/ClientHomeScreen';
import ClientMessagesScreen from '../screens/dashboard/ClientMessagesScreen';
import ClientVideoScreen from '../screens/dashboard/ClientVideoScreen';
import ClientScheduleScreen from '../screens/dashboard/ClientScheduleScreen';
import ClientResourcesScreen from '../screens/dashboard/ClientResourcesScreen';
import ClientBillingScreen from '../screens/dashboard/ClientBillingScreen';
import ClientSettingsScreen from '../screens/dashboard/ClientSettingsScreen';
import ClientSupportScreen from '../screens/dashboard/ClientSupportScreen';

// Doctor discovery screens (new)
import MedicalIntakeScreen from '../screens/doctor/MedicalIntakeScreen';
import DoctorSearchScreen from '../screens/doctor/DoctorSearchScreen';
import DoctorProfileScreen from '../screens/doctor/DoctorProfileScreen';
import BookAppointmentScreen from '../screens/doctor/BookAppointmentScreen';
import ReviewSubmitScreen from '../screens/doctor/ReviewSubmitScreen';

// Medical dashboard screens (new)
import MedicalHomeScreen from '../screens/medical-dashboard/MedicalHomeScreen';
import MedicalAppointmentsScreen from '../screens/medical-dashboard/MedicalAppointmentsScreen';
import MedicalMessagesScreen from '../screens/medical-dashboard/MedicalMessagesScreen';
import MedicalHistoryScreen from '../screens/medical-dashboard/MedicalHistoryScreen';
import MedicalVideoScreen from '../screens/medical-dashboard/MedicalVideoScreen';
import MedicalPrescriptionsScreen from '../screens/medical-dashboard/MedicalPrescriptionsScreen';
import MedicalBillingScreen from '../screens/medical-dashboard/MedicalBillingScreen';
import MedicalSettingsScreen from '../screens/medical-dashboard/MedicalSettingsScreen';
import InsuranceDetailsScreen from '../screens/medical-dashboard/InsuranceDetailsScreen';
import EmergencyContactScreen from '../screens/medical-dashboard/EmergencyContactScreen';
import HealthRecordsScreen from '../screens/medical-dashboard/HealthRecordsScreen';
import DoctorDetailScreen from '../screens/medical-dashboard/DoctorDetailScreen';
import SupportScreen from '../screens/medical-dashboard/SupportScreen';

// Therapist dashboard screens
import TherapistHomeScreen from '../screens/therapist-dashboard/TherapistHomeScreen';
import TherapistClientsScreen from '../screens/therapist-dashboard/TherapistClientsScreen';
import TherapistMessagesScreen from '../screens/therapist-dashboard/TherapistMessagesScreen';
import TherapistScheduleScreen from '../screens/therapist-dashboard/TherapistScheduleScreen';
import TherapistNotesScreen from '../screens/therapist-dashboard/TherapistNotesScreen';
import TherapistSettingsScreen from '../screens/therapist-dashboard/TherapistSettingsScreen';
import TherapistMoodScreen from '../screens/therapist-dashboard/TherapistMoodScreen';
import TherapistReportsScreen from '../screens/therapist-dashboard/TherapistReportsScreen';
import TherapistResourcesScreen from '../screens/therapist-dashboard/TherapistResourcesScreen';

// Doctor dashboard screens
import DoctorHomeScreen from '../screens/doctor-dashboard/DoctorHomeScreen';
import DoctorPatientsScreen from '../screens/doctor-dashboard/DoctorPatientsScreen';
import DoctorAppointmentsScreen from '../screens/doctor-dashboard/DoctorAppointmentsScreen';
import DoctorVideoScreen from '../screens/doctor-dashboard/DoctorVideoScreen';
import DoctorMessagesScreen from '../screens/doctor-dashboard/DoctorMessagesScreen';
import DoctorNotesScreen from '../screens/doctor-dashboard/DoctorNotesScreen';
import DoctorPrescriptionsScreen from '../screens/doctor-dashboard/DoctorPrescriptionsScreen';
import DoctorReviewsScreen from '../screens/doctor-dashboard/DoctorReviewsScreen';
import DoctorAnalyticsScreen from '../screens/doctor-dashboard/DoctorAnalyticsScreen';
import DoctorSettingsScreen from '../screens/doctor-dashboard/DoctorSettingsScreen';

// Drawer content components
import CustomDrawerContent from '../components/CustomDrawerContent';
import MedicalDrawerContent from '../components/MedicalDrawerContent';
import TherapistDrawerContent from '../components/TherapistDrawerContent';
import DoctorDrawerContent from '../components/DoctorDrawerContent';

import { Colors, MedicalColors, TherapistColors, DoctorColors } from '../constants/colors';

const Stack = createStackNavigator();
const TherapyDrawer = createDrawerNavigator();
const MedicalDrawer = createDrawerNavigator();
const TherapistDrawer = createDrawerNavigator();
const DoctorDrawer = createDrawerNavigator();

const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
    <ActivityIndicator size="large" color={Colors.primary} />
  </View>
);

// ── Doctor Drawer ──
const DoctorDrawerNavigator = ({ profile }) => {
  return (
    <DoctorDrawer.Navigator
      drawerContent={(props) => <DoctorDrawerContent {...props} profile={profile} />}
      screenOptions={{
        headerStyle: { backgroundColor: DoctorColors.primaryDark },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        drawerStyle: { backgroundColor: DoctorColors.surface, width: 280 },
        drawerActiveTintColor: DoctorColors.primary,
        drawerInactiveTintColor: DoctorColors.textSecondary,
      }}
    >
      <DoctorDrawer.Screen name="DoctorHome"          component={DoctorHomeScreen}          options={{ title: 'Dashboard' }} />
      <DoctorDrawer.Screen name="DoctorPatients"      component={DoctorPatientsScreen}      options={{ title: 'My Patients' }} />
      <DoctorDrawer.Screen name="DoctorAppointments"  component={DoctorAppointmentsScreen}  options={{ title: 'Appointments' }} />
      <DoctorDrawer.Screen name="DoctorVideo"         component={DoctorVideoScreen}         options={{ title: 'Video Calls' }} />
      <DoctorDrawer.Screen name="DoctorMessages"      component={DoctorMessagesScreen}      options={{ title: 'Messages' }} />
      <DoctorDrawer.Screen name="DoctorNotes"         component={DoctorNotesScreen}         options={{ title: 'Notes' }} />
      <DoctorDrawer.Screen name="DoctorPrescriptions" component={DoctorPrescriptionsScreen} options={{ title: 'Prescriptions' }} />
      <DoctorDrawer.Screen name="DoctorReviews"       component={DoctorReviewsScreen}       options={{ title: 'Reviews' }} />
      <DoctorDrawer.Screen name="DoctorAnalytics"     component={DoctorAnalyticsScreen}     options={{ title: 'Analytics' }} />
      <DoctorDrawer.Screen name="DoctorSettings"      component={DoctorSettingsScreen}      options={{ title: 'Profile & Settings' }} />
    </DoctorDrawer.Navigator>
  );
};

// ── Therapist Drawer ──
const TherapistDrawerNavigator = ({ profile }) => {
  return (
    <TherapistDrawer.Navigator
      drawerContent={(props) => <TherapistDrawerContent {...props} profile={profile} />}
      screenOptions={{
        headerStyle: { backgroundColor: TherapistColors.primaryDark },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        drawerStyle: { backgroundColor: TherapistColors.surface, width: 280 },
        drawerActiveTintColor: TherapistColors.primary,
        drawerInactiveTintColor: TherapistColors.textSecondary,
      }}
    >
      <TherapistDrawer.Screen name="TherapistHome"      component={TherapistHomeScreen}      options={{ title: 'Dashboard' }} />
      <TherapistDrawer.Screen name="TherapistClients"   component={TherapistClientsScreen}   options={{ title: 'My Clients' }} />
      <TherapistDrawer.Screen name="TherapistMessages"  component={TherapistMessagesScreen}  options={{ title: 'Messages' }} />
      <TherapistDrawer.Screen name="TherapistSchedule"  component={TherapistScheduleScreen}  options={{ title: 'Schedule' }} />
      <TherapistDrawer.Screen name="TherapistNotes"     component={TherapistNotesScreen}     options={{ title: 'Session Notes' }} />
      <TherapistDrawer.Screen name="TherapistMood"      component={TherapistMoodScreen}      options={{ title: 'Client Moods' }} />
      <TherapistDrawer.Screen name="TherapistReports"   component={TherapistReportsScreen}   options={{ title: 'Reports' }} />
      <TherapistDrawer.Screen name="TherapistResources" component={TherapistResourcesScreen} options={{ title: 'Resources' }} />
      <TherapistDrawer.Screen name="TherapistSettings"  component={TherapistSettingsScreen}  options={{ title: 'Settings' }} />
    </TherapistDrawer.Navigator>
  );
};

// ── Therapy Drawer (existing, unchanged) ──
const TherapyDrawerNavigator = ({ profile }) => {
  return (
    <TherapyDrawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} profile={profile} />}
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.surface,
        headerTitleStyle: { fontWeight: 'bold' },
        drawerStyle: { backgroundColor: Colors.surface },
        drawerActiveTintColor: Colors.primary,
        drawerInactiveTintColor: Colors.textSecondary,
      }}
    >
      <TherapyDrawer.Screen name="Home" component={ClientHomeScreen} />
      <TherapyDrawer.Screen name="Messages" component={ClientMessagesScreen} />
      <TherapyDrawer.Screen name="Video" component={ClientVideoScreen} />
      <TherapyDrawer.Screen name="Schedule" component={ClientScheduleScreen} />
      <TherapyDrawer.Screen name="Resources" component={ClientResourcesScreen} />
      <TherapyDrawer.Screen name="Billing" component={ClientBillingScreen} />
      <TherapyDrawer.Screen name="Settings" component={ClientSettingsScreen} />
      <TherapyDrawer.Screen name="Support" component={ClientSupportScreen} />
    </TherapyDrawer.Navigator>
  );
};

// ── Medical Drawer (new) ──
const MedicalDrawerNavigator = ({ profile }) => {
  return (
    <MedicalDrawer.Navigator
      drawerContent={(props) => <MedicalDrawerContent {...props} profile={profile} />}
      screenOptions={{
        headerStyle: { backgroundColor: MedicalColors.primary },
        headerTintColor: MedicalColors.surface,
        headerTitleStyle: { fontWeight: 'bold' },
        drawerStyle: { backgroundColor: MedicalColors.surface },
        drawerActiveTintColor: MedicalColors.primary,
        drawerInactiveTintColor: MedicalColors.textSecondary,
      }}
    >
      <MedicalDrawer.Screen name="MedicalHome" component={MedicalHomeScreen} options={{ title: 'Dashboard' }} />
      <MedicalDrawer.Screen name="MedicalAppointments" component={MedicalAppointmentsScreen} options={{ title: 'Appointments' }} />
      <MedicalDrawer.Screen name="MedicalMessages" component={MedicalMessagesScreen} options={{ title: 'Messages' }} />
      <MedicalDrawer.Screen name="MedicalVideo" component={MedicalVideoScreen} options={{ title: 'Video Calls' }} />
      <MedicalDrawer.Screen name="MedicalHistory" component={MedicalHistoryScreen} options={{ title: 'Medical History' }} />
      <MedicalDrawer.Screen name="MedicalPrescriptions" component={MedicalPrescriptionsScreen} options={{ title: 'Prescriptions' }} />
      <MedicalDrawer.Screen name="MedicalBilling" component={MedicalBillingScreen} options={{ title: 'Billing' }} />
      <MedicalDrawer.Screen name="MedicalSettings" component={MedicalSettingsScreen} options={{ title: 'My Profile' }} />
    </MedicalDrawer.Navigator>
  );
};

// ── Main App Navigator ──
const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userIntent, setUserIntent] = useState(null); // 'therapy' | 'medical' | null
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // User signed out — clear storage and reset state
        await AsyncStorage.multiRemove(['isAuthenticated', 'userProfile', 'userRole', 'userId', 'userName']);
        setIsAuthenticated(false);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      try {
        const { role, profile: resolvedProfile } = await resolveRole(user.uid);

        // Block unknown roles only
        if (role !== 'client' && role !== 'therapist' && role !== 'admin' && role !== 'doctor') {
          await auth.signOut();
          setIsAuthenticated(false);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        // Sync resolved profile to AsyncStorage
        await AsyncStorage.setItem('isAuthenticated', 'true');
        await AsyncStorage.setItem('userProfile', JSON.stringify(resolvedProfile));
        await AsyncStorage.setItem('userRole', role);
        await AsyncStorage.setItem('userId', resolvedProfile?.id || user.uid);

        // Determine intent based on role
        let intent;
        if (role === 'therapist' || role === 'admin') {
          intent = 'therapist';
        } else if (role === 'doctor') {
          intent = 'doctor';
        } else {
          intent = resolvedProfile?.userIntent || await AsyncStorage.getItem('userIntent') || 'therapy';
        }
        await AsyncStorage.setItem('userIntent', intent);

        setProfile(resolvedProfile);
        setIsAuthenticated(true);
        setUserIntent(intent);
      } catch (err) {
        // Suspended / deactivated account
        await auth.signOut().catch(() => {});
        setIsAuthenticated(false);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    });

    return unsub;
  }, []);

  // Determine initial route
  const getInitialRoute = () => {
    if (isAuthenticated) {
      if (userIntent === 'therapist') return 'TherapistMain';
      if (userIntent === 'doctor') return 'DoctorMain';
      if (userIntent === 'medical') return 'MedicalMain';
      return 'Main';
    }
    return 'Intent';
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: Colors.primary },
          headerTintColor: Colors.surface,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
        initialRouteName={getInitialRoute()}
      >
        {/* ── Intent Selection (new entry point) ── */}
        <Stack.Screen
          name="Intent"
          component={IntentScreen}
          options={{ headerShown: false }}
        />

        {/* ── Therapy Onboarding Flow (existing) ── */}
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
        <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} options={{ title: 'Getting to know you' }} />
        <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account' }} />
        <Stack.Screen name="MatchTherapist" component={MatchTherapistScreen} options={{ title: 'Choose your therapist' }} />
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Choose your plan' }} />
        <Stack.Screen name="ParentGuardianInfo" component={ParentGuardianInfoScreen} options={{ title: 'Parent/Guardian Information' }} />
        <Stack.Screen name="ChildInfo" component={ChildInfoScreen} options={{ title: 'Child Information' }} />
        <Stack.Screen name="ParentConsent" component={ParentConsentScreen} options={{ title: 'Parent Consent' }} />

        {/* ── Doctor Discovery Flow ── */}
        <Stack.Screen
          name="MedicalIntake"
          component={MedicalIntakeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DoctorSearch"
          component={DoctorSearchScreen}
          options={{
            title: 'Find a Doctor',
            headerStyle: { backgroundColor: MedicalColors.primary },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="DoctorProfile"
          component={DoctorProfileScreen}
          options={{
            title: 'Doctor Profile',
            headerStyle: { backgroundColor: MedicalColors.primary },
          }}
        />
        <Stack.Screen
          name="BookAppointment"
          component={BookAppointmentScreen}
          options={{
            title: 'Book Appointment',
            headerStyle: { backgroundColor: MedicalColors.primary },
          }}
        />
        <Stack.Screen
          name="ReviewSubmit"
          component={ReviewSubmitScreen}
          options={{
            title: 'Leave a Review',
            headerTintColor: '#FFFFFF',
            headerStyle: { backgroundColor: MedicalColors.primary },
          }}
        />

        {/* ── Doctor Professional Dashboard ── */}
        <Stack.Screen name="DoctorMain" options={{ headerShown: false }}>
          {() => <DoctorDrawerNavigator profile={profile} />}
        </Stack.Screen>

        {/* ── Therapist Dashboard ── */}
        <Stack.Screen name="TherapistMain" options={{ headerShown: false }}>
          {() => <TherapistDrawerNavigator profile={profile} />}
        </Stack.Screen>

        {/* ── Therapy Client Dashboard (existing) ── */}
        <Stack.Screen name="Main" options={{ headerShown: false }}>
          {() => <TherapyDrawerNavigator profile={profile} />}
        </Stack.Screen>

        {/* ── Medical Dashboard (new) ── */}
        <Stack.Screen name="MedicalMain" options={{ headerShown: false }}>
          {() => <MedicalDrawerNavigator profile={profile} />}
        </Stack.Screen>

        {/* ── Medical Patient Detail Screens ── */}
        <Stack.Screen
          name="InsuranceDetails"
          component={InsuranceDetailsScreen}
          options={{ title: 'Insurance Details', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="EmergencyContact"
          component={EmergencyContactScreen}
          options={{ title: 'Emergency Contacts', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="HealthRecords"
          component={HealthRecordsScreen}
          options={{ title: 'Health Records', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="DoctorDetail"
          component={DoctorDetailScreen}
          options={{ title: 'Doctor Profile', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Support"
          component={SupportScreen}
          options={{ title: 'Support & Report', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
