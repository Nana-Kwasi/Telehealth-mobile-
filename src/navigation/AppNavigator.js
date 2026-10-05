import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationContainer, useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { View, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveRole } from '../services/authService';
import { api, clearSession } from '../services/apiClient';
import { applyCoupleLandingIfNeeded } from '../services/coupleTherapyService';
import { PRIVACY_STORAGE_KEY, syncPrivacyConsentToUser } from '../services/privacyConsentService';
import { ensurePushRegistered, markNotificationRead } from '../services/notificationService';
import { screenForNotification, stackForIntent } from '../services/pushRouting';

// Onboarding / Auth screens
import IntroHomeScreen from '../screens/IntroHomeScreen';
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
import CoupleInitiationScreen from '../screens/couple/CoupleInitiationScreen';
import CoupleIntakeScreen from '../screens/couple/CoupleIntakeScreen';
import CoupleWaitingPartnerScreen from '../screens/couple/CoupleWaitingPartnerScreen';
import CoupleInviteEntryScreen from '../screens/couple/CoupleInviteEntryScreen';
import CouplePartnerBWelcomeScreen from '../screens/couple/CouplePartnerBWelcomeScreen';
import CoupleDashboardScreen from '../screens/couple/CoupleDashboardScreen';
import TherapistCoupleCaseScreen from '../screens/therapist-dashboard/TherapistCoupleCaseScreen';

// Therapy dashboard screens (existing)
import ClientHomeScreen from '../screens/dashboard/ClientHomeScreen';
import ClientMessagesScreen from '../screens/dashboard/ClientMessagesScreen';
import ClientVideoScreen from '../screens/dashboard/ClientVideoScreen';
import ClientScheduleScreen from '../screens/dashboard/ClientScheduleScreen';
import ClientResourcesScreen from '../screens/dashboard/ClientResourcesScreen';
import ClientBillingScreen from '../screens/dashboard/ClientBillingScreen';
import ClientSettingsScreen from '../screens/dashboard/ClientSettingsScreen';
import ClientSupportScreen from '../screens/dashboard/ClientSupportScreen';

// Doctor discovery screens
import MedicalIntakeScreen from '../screens/doctor/MedicalIntakeScreen';
import DoctorSearchScreen from '../screens/doctor/DoctorSearchScreen';
import DoctorProfileScreen from '../screens/doctor/DoctorProfileScreen';
import BookAppointmentScreen from '../screens/doctor/BookAppointmentScreen';
import ReviewSubmitScreen from '../screens/doctor/ReviewSubmitScreen';

// Medical dashboard screens
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
import EPharmacyScreen from '../screens/medical-dashboard/EPharmacyScreen';
import DoctorDetailScreen from '../screens/medical-dashboard/DoctorDetailScreen';
import SupportScreen from '../screens/medical-dashboard/SupportScreen';
import MedicalDiagnosticScreen from '../screens/medical-dashboard/MedicalDiagnosticScreen';
import MedicalTimelineScreen from '../screens/medical-dashboard/MedicalTimelineScreen';

// Therapist dashboard screens
import TherapistHomeScreen from '../screens/therapist-dashboard/TherapistHomeScreen';
import TherapistClientsScreen from '../screens/therapist-dashboard/TherapistClientsScreen';
import TherapistClientDetailScreen from '../screens/therapist-dashboard/TherapistClientDetailScreen';
import TherapistClientChatScreen from '../screens/therapist-dashboard/TherapistClientChatScreen';
import TherapistMessagesScreen from '../screens/therapist-dashboard/TherapistMessagesScreen';
import TherapistVideoScreen from '../screens/therapist-dashboard/TherapistVideoScreen';
import TherapistVideoCallSessionScreen from '../screens/therapist-dashboard/TherapistVideoCallSessionScreen';
import VideoCallSessionScreen from '../screens/shared/VideoCallSessionScreen';
import IncomingCallMobile from '../components/IncomingCallMobile';
import TherapistScheduleScreen from '../screens/therapist-dashboard/TherapistScheduleScreen';
import TherapistAppointmentsScreen from '../screens/therapist-dashboard/TherapistAppointmentsScreen';
import TherapistNotesScreen from '../screens/therapist-dashboard/TherapistNotesScreen';
import TherapistSettingsScreen from '../screens/therapist-dashboard/TherapistSettingsScreen';
import TherapistMoodScreen from '../screens/therapist-dashboard/TherapistMoodScreen';
import TherapistReportIssueScreen from '../screens/therapist-dashboard/TherapistReportIssueScreen';
import TherapistResourcesScreen from '../screens/therapist-dashboard/TherapistResourcesScreen';
import ProviderWellnessScreen from '../screens/shared/ProviderWellnessScreen';
import MyWellnessScreen from '../screens/shared/MyWellnessScreen';
import MyCarePlanScreen from '../screens/shared/MyCarePlanScreen';
import RecordExplorerScreen from '../screens/shared/RecordExplorerScreen';
import CarePlanComposerScreen from '../screens/shared/CarePlanComposerScreen';
import AdminDocComposerScreen from '../screens/shared/AdminDocComposerScreen';
import ReferralComposerScreen from '../screens/shared/ReferralComposerScreen';
import ProviderPricePromotionsScreen from '../screens/shared/ProviderPricePromotionsScreen';
import NotificationPreferencesScreen from '../screens/shared/NotificationPreferencesScreen';
// One assistant, not two.
//
// The drawer used to open AiAssistantScreen — an older task-picker with no
// streaming, no voice, no document reading and no booking — while the floating
// button opened AiChatScreen, which has all of it. Same label, same icon,
// different features depending on which you tapped. Both now open the chat.
import AiChatScreen from '../screens/shared/AiChatScreen';
// Web clinicians had a "Patient briefing" tab; mobile had no equivalent at all,
// which is the situation the feature is most for — a clinician on a phone
// between appointments.
import AiClinicianBriefingScreen from '../screens/shared/AiClinicianBriefingScreen';
// Check-ins existed on web only. A clinician between appointments is exactly
// who needs to see whether anyone answered.
import ClinicianFollowUpsScreen from '../screens/shared/ClinicianFollowUpsScreen';
import FeedbackResultsScreen from '../screens/shared/FeedbackResultsScreen';
import ProviderPromotionsScreen from '../screens/shared/ProviderPromotionsScreen';
import CareCentreScreen from '../screens/shared/CareCentreScreen';

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
import DoctorPatientDetailScreen from '../screens/doctor-dashboard/DoctorPatientDetailScreen';
import DoctorPatientPanelScreen from '../screens/doctor-dashboard/DoctorPatientPanelScreen';
import DoctorDiagnosticScreen from '../screens/doctor-dashboard/DoctorDiagnosticScreen';
import DoctorDiagnosticResultsScreen from '../screens/doctor-dashboard/DoctorDiagnosticResultsScreen';
import DoctorDiagnosticDraftDetailScreen from '../screens/doctor-dashboard/DoctorDiagnosticDraftDetailScreen';
import DoctorPatientTimelineScreen from '../screens/doctor-dashboard/DoctorPatientTimelineScreen';
import DoctorPatientOverviewScreen from '../screens/doctor-dashboard/DoctorPatientOverviewScreen';

// Pharmacy dashboard screens
import PharmacyHomeScreen from '../screens/pharmacy-dashboard/PharmacyHomeScreen';
import PharmacyPrescriptionsScreen from '../screens/pharmacy-dashboard/PharmacyPrescriptionsScreen';
import PharmacyBranchesScreen from '../screens/pharmacy-dashboard/PharmacyBranchesScreen';
import PharmacyWalkInScreen from '../screens/pharmacy-dashboard/PharmacyWalkInScreen';
import PharmacyRxOpsScreen from '../screens/pharmacy-dashboard/PharmacyRxOpsScreen';
import PharmacyActivityScreen from '../screens/pharmacy-dashboard/PharmacyActivityScreen';
import PharmacyBranchDetailScreen from '../screens/pharmacy-dashboard/PharmacyBranchDetailScreen';
import PharmacyReportsScreen from '../screens/pharmacy-dashboard/PharmacyReportsScreen';
import PharmacySettingsScreen from '../screens/pharmacy-dashboard/PharmacySettingsScreen';
import BranchTransfersScreen from '../screens/branch-dashboard/BranchTransfersScreen';
import ReportIssueScreen from '../screens/common/ReportIssueScreen';
import DiagnosticBranchesScreen from '../screens/common/DiagnosticBranchesScreen';
import DiagnosticBranchDetailScreen from '../screens/common/DiagnosticBranchDetailScreen';
import DiagnosticOrderDetailScreen from '../screens/common/DiagnosticOrderDetailScreen';
import DiagnosticSettingsScreen from '../screens/common/DiagnosticSettingsScreen';

// Branch dashboard screens
import BranchHomeScreen from '../screens/branch-dashboard/BranchHomeScreen';
import BranchPrescriptionsScreen from '../screens/branch-dashboard/BranchPrescriptionsScreen';
import BranchWalkInScreen from '../screens/branch-dashboard/BranchWalkInScreen';

// Lab dashboard screens
import LabHomeScreen from '../screens/lab-dashboard/LabHomeScreen';
import LabOrdersScreen from '../screens/lab-dashboard/LabOrdersScreen';
import LabVerifyScreen from '../screens/lab-dashboard/LabVerifyScreen';
import LabResultsScreen from '../screens/lab-dashboard/LabResultsScreen';

// Scan dashboard screens
import ScanHomeScreen from '../screens/scan-dashboard/ScanHomeScreen';
import ScanOrdersScreen from '../screens/scan-dashboard/ScanOrdersScreen';
import ScanVerifyScreen from '../screens/scan-dashboard/ScanVerifyScreen';
import ScanResultsScreen from '../screens/scan-dashboard/ScanResultsScreen';
import EntityLocationSettingsScreen from '../screens/common/EntityLocationSettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import CoupleAcceptInviteScreen from '../screens/couple/CoupleAcceptInviteScreen';
import SecondOpinionIntakeScreen from '../screens/second-opinion/SecondOpinionIntakeScreen';
import SecondOpinionHomeScreen from '../screens/second-opinion/SecondOpinionHomeScreen';
import BecomeMemberScreen from '../screens/second-opinion/BecomeMemberScreen';
import NotificationBellButton from '../components/NotificationBellButton';
import { ZC } from '../constants/zencare';
import MedPsychSignUpScreen from '../screens/medpsych/MedPsychSignUpScreen';
import MedPsychPsychiatristsScreen from '../screens/medpsych/MedPsychPsychiatristsScreen';
import MedPsychBookingScreen from '../screens/medpsych/MedPsychBookingScreen';

// Drawer content components
import CustomDrawerContent from '../components/CustomDrawerContent';
import MedicalDrawerContent from '../components/MedicalDrawerContent';
import TherapistDrawerContent from '../components/TherapistDrawerContent';
import DoctorDrawerContent from '../components/DoctorDrawerContent';
import PharmacyDrawerContent from '../components/PharmacyDrawerContent';
import LabDrawerContent from '../components/LabDrawerContent';
import ScanDrawerContent from '../components/ScanDrawerContent';
import DashboardLocationGateMobile from '../components/DashboardLocationGateMobile';
import ForcedPasswordChangeGateMobile from '../components/ForcedPasswordChangeGateMobile';
import HomeCarePatientNavigator from './HomeCarePatientNavigator';
import HomeCareNurseNavigator from './HomeCareNurseNavigator';

import { Colors, MedicalColors, TherapistColors, DoctorColors, PharmacyColors, LabColors, ScanColors } from '../constants/colors';

const Stack = createStackNavigator();
const TherapyDrawer = createDrawerNavigator();
const MedicalDrawer = createDrawerNavigator();
const TherapistDrawer = createDrawerNavigator();
const TherapistClientsStackNav = createStackNavigator();
const TherapistVideoStackNav = createStackNavigator();

function TherapistVideoNavigator({ profile }) {
  return (
    <TherapistVideoStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: TherapistColors.primaryDark },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <TherapistVideoStackNav.Screen name="TherapistVideoList" options={{ title: 'Video Call', headerShown: false }}>
        {(props) => <TherapistVideoScreen {...props} profile={profile} />}
      </TherapistVideoStackNav.Screen>
      <TherapistVideoStackNav.Screen
        name="TherapistVideoCallSession"
        component={TherapistVideoCallSessionScreen}
        options={{ title: 'Video Session', headerShown: false }}
      />
    </TherapistVideoStackNav.Navigator>
  );
}

function TherapistClientsNavigator({ profile }) {
  return (
    <TherapistClientsStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: TherapistColors.primaryDark },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <TherapistClientsStackNav.Screen name="TherapistClientsList" options={{ headerShown: false }}>
        {(props) => <TherapistClientsScreen {...props} profile={profile} />}
      </TherapistClientsStackNav.Screen>
      <TherapistClientsStackNav.Screen
        name="TherapistClientDetail"
        component={TherapistClientDetailScreen}
        options={{ title: 'Client' }}
      />
      <TherapistClientsStackNav.Screen
        name="TherapistClientChat"
        component={TherapistClientChatScreen}
        options={{ headerShown: false }}
      />
    </TherapistClientsStackNav.Navigator>
  );
}
const DoctorDrawer = createDrawerNavigator();
const PharmacyDrawer = createDrawerNavigator();
const BranchDrawer = createDrawerNavigator();
const LabDrawer = createDrawerNavigator();
const LabBranchDrawer = createDrawerNavigator();
const ScanDrawer = createDrawerNavigator();
const ScanBranchDrawer = createDrawerNavigator();

const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
    <ActivityIndicator size="large" color={Colors.primary} />
  </View>
);

// ── Pharmacy Drawer ──
const PharmacyDrawerNavigator = ({ profile }) => (
  <PharmacyDrawer.Navigator
    drawerContent={(props) => <PharmacyDrawerContent {...props} profile={profile} isBranch={false} />}
    screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="PharmacyNotifications" />,
      headerStyle: { backgroundColor: PharmacyColors.primary },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      drawerStyle: { backgroundColor: PharmacyColors.primary, width: 280 },
    }}
  >
    <PharmacyDrawer.Screen name="PharmacyHome"          options={{ title: 'Dashboard' }}>
      {() => <PharmacyHomeScreen profile={profile} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyPrescriptions" options={{ title: 'Prescriptions' }}>
      {() => <PharmacyPrescriptionsScreen profile={profile} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyBranches"      options={{ title: 'Branches' }}>
      {() => <PharmacyBranchesScreen profile={profile} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyWalkIn"        options={{ title: 'Walk-in Verify' }}>
      {() => <PharmacyWalkInScreen profile={profile} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyActivity" options={{ title: 'Activity' }}>
      {() => <PharmacyActivityScreen profile={profile} isBranch={false} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyReports" options={{ title: 'Reports' }}>
      {() => <PharmacyReportsScreen profile={profile} isBranch={false} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyReportIssue" options={{ title: 'Report Issue' }}>
      {() => <ReportIssueScreen profile={profile} reporterType="pharmacy_parent" accent={PharmacyColors.primary} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyPreferences" options={{ title: 'Settings' }}>
      {() => <PharmacySettingsScreen profile={profile} isBranch={false} locationRoute="PharmacySettings" />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyBranchDetail" options={{ title: 'Branch', drawerItemStyle: { display: 'none' } }}>
      {() => <PharmacyBranchDetailScreen profile={profile} />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacyRxOps" options={{ title: 'Prescription Operations', drawerItemStyle: { display: 'none' } }}>
      {() => <PharmacyRxOpsScreen profile={profile} mode="parent" />}
    </PharmacyDrawer.Screen>
    <PharmacyDrawer.Screen name="PharmacySettings" options={{ title: 'Location Settings', drawerItemStyle: { display: 'none' } }}>
      {() => <EntityLocationSettingsScreen profile={profile} collectionName="pharmacies" title="Pharmacy Location Settings" />}
    </PharmacyDrawer.Screen>
        <PharmacyDrawer.Screen name="PharmacyNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
</PharmacyDrawer.Navigator>
);

// ── Branch Drawer ──
const BranchDrawerNavigator = ({ profile }) => (
  <BranchDrawer.Navigator
    drawerContent={(props) => <PharmacyDrawerContent {...props} profile={profile} isBranch={true} />}
    screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="BranchNotifications" />,
      headerStyle: { backgroundColor: PharmacyColors.primary },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      drawerStyle: { backgroundColor: PharmacyColors.primary, width: 280 },
    }}
  >
    <BranchDrawer.Screen name="BranchHome"          options={{ title: 'Branch Dashboard' }}>
      {() => <BranchHomeScreen profile={profile} />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchPrescriptions" options={{ title: 'Prescriptions' }}>
      {() => <BranchPrescriptionsScreen profile={profile} />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchWalkIn"        options={{ title: 'Walk-in Verify' }}>
      {() => <BranchWalkInScreen profile={profile} />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchTransfers" options={{ title: 'Transfers' }}>
      {() => <BranchTransfersScreen profile={profile} />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchActivity" options={{ title: 'Activity' }}>
      {() => <PharmacyActivityScreen profile={profile} isBranch={true} />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchReports" options={{ title: 'Reports' }}>
      {() => <PharmacyReportsScreen profile={profile} isBranch={true} />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchReportIssue" options={{ title: 'Report Issue' }}>
      {() => <ReportIssueScreen profile={profile} reporterType="pharmacy_branch" accent={PharmacyColors.primary} />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchPreferences" options={{ title: 'Settings' }}>
      {() => <PharmacySettingsScreen profile={profile} isBranch={true} locationRoute="BranchSettings" />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchRxOps" options={{ title: 'Prescription Operations', drawerItemStyle: { display: 'none' } }}>
      {() => <PharmacyRxOpsScreen profile={profile} mode="branch" />}
    </BranchDrawer.Screen>
    <BranchDrawer.Screen name="BranchSettings" options={{ title: 'Location Settings', drawerItemStyle: { display: 'none' } }}>
      {() => <EntityLocationSettingsScreen profile={profile} collectionName="pharmacyBranches" title="Branch Location Settings" />}
    </BranchDrawer.Screen>
        <BranchDrawer.Screen name="BranchNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
</BranchDrawer.Navigator>
);

// ── Lab Drawer ──
const LabDrawerNavigator = ({ profile }) => (
  <LabDrawer.Navigator
    drawerContent={(props) => <LabDrawerContent {...props} profile={profile} isBranch={false} />}
    screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="LabNotifications" />,
      headerStyle: { backgroundColor: LabColors.primary },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      drawerStyle: { backgroundColor: LabColors.primary, width: 280 },
    }}
  >
    <LabDrawer.Screen name="LabHome"    options={{ title: 'Dashboard' }}>
      {() => <LabHomeScreen profile={profile} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabOrders"  options={{ title: 'Orders' }}>
      {() => <LabOrdersScreen profile={profile} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabVerify"  options={{ title: 'Verify Patient' }}>
      {() => <LabVerifyScreen profile={profile} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabResults" options={{ title: 'Results' }}>
      {() => <LabResultsScreen profile={profile} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabBranches" options={{ title: 'Branches' }}>
      {() => <DiagnosticBranchesScreen profile={profile} type={'lab'} detailRoute="LabBranchDetail" accent={LabColors.primary} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabBranchDetail" options={{ title: 'Branch', drawerItemStyle: { display: 'none' } }}>
      {() => <DiagnosticBranchDetailScreen profile={profile} type={'lab'} accent={LabColors.primary} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabOrderDetail" options={{ title: 'Order detail', drawerItemStyle: { display: 'none' } }}>
      {() => <DiagnosticOrderDetailScreen profile={profile} type={'lab'} uploadRoute="LabResults" accent={LabColors.primary} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabReportIssue" options={{ title: 'Report Issue' }}>
      {() => <ReportIssueScreen profile={profile} reporterType="lab" accent={LabColors.primary} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabPreferences" options={{ title: 'Settings' }}>
      {() => <DiagnosticSettingsScreen profile={profile} type={'lab'} isBranch={false} locationRoute="LabSettings" accent={LabColors.primary} />}
    </LabDrawer.Screen>
    <LabDrawer.Screen name="LabSettings" options={{ title: 'Location Settings', drawerItemStyle: { display: 'none' } }}>
      {() => <EntityLocationSettingsScreen profile={profile} collectionName="labs" title="Lab Location Settings" />}
    </LabDrawer.Screen>
        <LabDrawer.Screen name="LabNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
</LabDrawer.Navigator>
);

// ── Lab Branch Drawer ──
const LabBranchDrawerNavigator = ({ profile }) => (
  <LabBranchDrawer.Navigator
    drawerContent={(props) => <LabDrawerContent {...props} profile={profile} isBranch={true} />}
    screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="LabBranchNotifications" />,
      headerStyle: { backgroundColor: LabColors.primary },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      drawerStyle: { backgroundColor: LabColors.primary, width: 280 },
    }}
  >
    <LabBranchDrawer.Screen name="LabBranchHome"    options={{ title: 'Branch Dashboard' }}>
      {() => <LabHomeScreen profile={profile} />}
    </LabBranchDrawer.Screen>
    <LabBranchDrawer.Screen name="LabBranchOrders"  options={{ title: 'Orders' }}>
      {() => <LabOrdersScreen profile={profile} />}
    </LabBranchDrawer.Screen>
    <LabBranchDrawer.Screen name="LabBranchVerify"  options={{ title: 'Verify Patient' }}>
      {() => <LabVerifyScreen profile={profile} />}
    </LabBranchDrawer.Screen>
    <LabBranchDrawer.Screen name="LabBranchResults" options={{ title: 'Results' }}>
      {() => <LabResultsScreen profile={profile} />}
    </LabBranchDrawer.Screen>
    <LabBranchDrawer.Screen name="LabBranchOrderDetail" options={{ title: 'Order detail', drawerItemStyle: { display: 'none' } }}>
      {() => <DiagnosticOrderDetailScreen profile={profile} type={'lab'} uploadRoute="LabBranchResults" accent={LabColors.primary} />}
    </LabBranchDrawer.Screen>
    <LabBranchDrawer.Screen name="LabBranchReportIssue" options={{ title: 'Report Issue' }}>
      {() => <ReportIssueScreen profile={profile} reporterType="lab_branch" accent={LabColors.primary} />}
    </LabBranchDrawer.Screen>
    <LabBranchDrawer.Screen name="LabBranchPreferences" options={{ title: 'Settings' }}>
      {() => <DiagnosticSettingsScreen profile={profile} type={'lab'} isBranch={true} locationRoute="LabBranchSettings" accent={LabColors.primary} />}
    </LabBranchDrawer.Screen>
    <LabBranchDrawer.Screen name="LabBranchSettings" options={{ title: 'Location Settings', drawerItemStyle: { display: 'none' } }}>
      {() => <EntityLocationSettingsScreen profile={profile} collectionName="labBranches" title="Lab Branch Location Settings" />}
    </LabBranchDrawer.Screen>
        <LabBranchDrawer.Screen name="LabBranchNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
</LabBranchDrawer.Navigator>
);

// ── Scan Drawer ──
const ScanDrawerNavigator = ({ profile }) => (
  <ScanDrawer.Navigator
    drawerContent={(props) => <ScanDrawerContent {...props} profile={profile} isBranch={false} />}
    screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="ScanNotifications" />,
      headerStyle: { backgroundColor: ScanColors.primary },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      drawerStyle: { backgroundColor: ScanColors.primary, width: 280 },
    }}
  >
    <ScanDrawer.Screen name="ScanHome"    options={{ title: 'Dashboard' }}>
      {() => <ScanHomeScreen profile={profile} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanOrders"  options={{ title: 'Orders' }}>
      {() => <ScanOrdersScreen profile={profile} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanVerify"  options={{ title: 'Verify Patient' }}>
      {() => <ScanVerifyScreen profile={profile} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanResults" options={{ title: 'Reports' }}>
      {() => <ScanResultsScreen profile={profile} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanBranches" options={{ title: 'Branches' }}>
      {() => <DiagnosticBranchesScreen profile={profile} type={'scan'} detailRoute="ScanBranchDetail" accent={ScanColors.primary} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanBranchDetail" options={{ title: 'Branch', drawerItemStyle: { display: 'none' } }}>
      {() => <DiagnosticBranchDetailScreen profile={profile} type={'scan'} accent={ScanColors.primary} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanOrderDetail" options={{ title: 'Order detail', drawerItemStyle: { display: 'none' } }}>
      {() => <DiagnosticOrderDetailScreen profile={profile} type={'scan'} uploadRoute="ScanResults" accent={ScanColors.primary} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanReportIssue" options={{ title: 'Report Issue' }}>
      {() => <ReportIssueScreen profile={profile} reporterType="scan" accent={ScanColors.primary} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanPreferences" options={{ title: 'Settings' }}>
      {() => <DiagnosticSettingsScreen profile={profile} type={'scan'} isBranch={false} locationRoute="ScanSettings" accent={ScanColors.primary} />}
    </ScanDrawer.Screen>
    <ScanDrawer.Screen name="ScanSettings" options={{ title: 'Location Settings', drawerItemStyle: { display: 'none' } }}>
      {() => <EntityLocationSettingsScreen profile={profile} collectionName="scanCenters" title="Scan Center Location Settings" />}
    </ScanDrawer.Screen>
        <ScanDrawer.Screen name="ScanNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
</ScanDrawer.Navigator>
);

// ── Scan Branch Drawer ──
const ScanBranchDrawerNavigator = ({ profile }) => (
  <ScanBranchDrawer.Navigator
    drawerContent={(props) => <ScanDrawerContent {...props} profile={profile} isBranch={true} />}
    screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="ScanBranchNotifications" />,
      headerStyle: { backgroundColor: ScanColors.primary },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      drawerStyle: { backgroundColor: ScanColors.primary, width: 280 },
    }}
  >
    <ScanBranchDrawer.Screen name="ScanBranchHome"    options={{ title: 'Branch Dashboard' }}>
      {() => <ScanHomeScreen profile={profile} />}
    </ScanBranchDrawer.Screen>
    <ScanBranchDrawer.Screen name="ScanBranchOrders"  options={{ title: 'Orders' }}>
      {() => <ScanOrdersScreen profile={profile} />}
    </ScanBranchDrawer.Screen>
    <ScanBranchDrawer.Screen name="ScanBranchVerify"  options={{ title: 'Verify Patient' }}>
      {() => <ScanVerifyScreen profile={profile} />}
    </ScanBranchDrawer.Screen>
    <ScanBranchDrawer.Screen name="ScanBranchResults" options={{ title: 'Reports' }}>
      {() => <ScanResultsScreen profile={profile} />}
    </ScanBranchDrawer.Screen>
    <ScanBranchDrawer.Screen name="ScanBranchOrderDetail" options={{ title: 'Order detail', drawerItemStyle: { display: 'none' } }}>
      {() => <DiagnosticOrderDetailScreen profile={profile} type={'scan'} uploadRoute="ScanBranchResults" accent={ScanColors.primary} />}
    </ScanBranchDrawer.Screen>
    <ScanBranchDrawer.Screen name="ScanBranchReportIssue" options={{ title: 'Report Issue' }}>
      {() => <ReportIssueScreen profile={profile} reporterType="scan_branch" accent={ScanColors.primary} />}
    </ScanBranchDrawer.Screen>
    <ScanBranchDrawer.Screen name="ScanBranchPreferences" options={{ title: 'Settings' }}>
      {() => <DiagnosticSettingsScreen profile={profile} type={'scan'} isBranch={true} locationRoute="ScanBranchSettings" accent={ScanColors.primary} />}
    </ScanBranchDrawer.Screen>
    <ScanBranchDrawer.Screen name="ScanBranchSettings" options={{ title: 'Location Settings', drawerItemStyle: { display: 'none' } }}>
      {() => <EntityLocationSettingsScreen profile={profile} collectionName="scanBranches" title="Scan Branch Location Settings" />}
    </ScanBranchDrawer.Screen>
        <ScanBranchDrawer.Screen name="ScanBranchNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
</ScanBranchDrawer.Navigator>
);

// ── Doctor Drawer ──
const DoctorDrawerNavigator = ({ profile }) => {
  return (
    <DoctorDrawer.Navigator
      drawerContent={(props) => <DoctorDrawerContent {...props} profile={profile} />}
      screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="DoctorNotifications" />,
        headerStyle: { backgroundColor: DoctorColors.primaryDark },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        drawerStyle: { backgroundColor: DoctorColors.surface, width: 280 },
        drawerActiveTintColor: DoctorColors.primary,
        drawerInactiveTintColor: DoctorColors.textSecondary,
      }}
    >
      <DoctorDrawer.Screen name="DoctorHome"               component={DoctorHomeScreen}               options={{ title: 'Dashboard' }} />
      <DoctorDrawer.Screen name="DoctorPatients"           component={DoctorPatientsScreen}           options={{ title: 'My Patients' }} />
      <DoctorDrawer.Screen name="DoctorPatientPanel"       component={DoctorPatientPanelScreen}       options={{ title: 'Patient Panel' }} />
      <DoctorDrawer.Screen name="DoctorAppointments"       component={DoctorAppointmentsScreen}       options={{ title: 'Appointments' }} />
      <DoctorDrawer.Screen name="DoctorVideo"              component={DoctorVideoScreen}              options={{ title: 'Video Calls' }} />
      <DoctorDrawer.Screen name="DoctorMessages"           component={DoctorMessagesScreen}           options={{ title: 'Messages' }} />
      <DoctorDrawer.Screen name="DoctorWellness" options={{ title: 'Wellness' }}>
        {(props) => <ProviderWellnessScreen {...props} audience="my_patients" peopleNoun="patients" />}
      </DoctorDrawer.Screen>
      <DoctorDrawer.Screen name="DoctorFeedback" component={FeedbackResultsScreen} options={{ title: 'Patient feedback' }} />
      <DoctorDrawer.Screen name="DoctorPromotions" component={ProviderPromotionsScreen} options={{ title: 'Promotions' }} />
      <DoctorDrawer.Screen name="DoctorCheckIns" options={{ title: 'Check-ins' }}>
        {(props) => <ClinicianFollowUpsScreen {...props} role="DOCTOR" />}
      </DoctorDrawer.Screen>
      <DoctorDrawer.Screen name="DoctorBriefing" options={{ title: 'Consultation briefing' }}>
        {(props) => <AiClinicianBriefingScreen {...props} role="DOCTOR" />}
      </DoctorDrawer.Screen>
      <DoctorDrawer.Screen name="DoctorFeeOffers" component={ProviderPricePromotionsScreen} options={{ title: 'Offers on my fee' }} />
      <DoctorDrawer.Screen name="DoctorAiAssistant" options={{ title: 'NessaHub Clinical Assistant' }}>
        {(props) => <AiChatScreen {...props} clinician />}
      </DoctorDrawer.Screen>
      <DoctorDrawer.Screen name="DoctorNotificationPrefs" component={NotificationPreferencesScreen} options={{ title: 'Notification settings' }} />
      <DoctorDrawer.Screen name="DoctorNotes"              component={DoctorNotesScreen}              options={{ title: 'Notes' }} />
      <DoctorDrawer.Screen name="DoctorPrescriptions"      component={DoctorPrescriptionsScreen}      options={{ title: 'Prescriptions' }} />
      <DoctorDrawer.Screen name="DoctorCarePlans" options={{ title: 'Care Plans' }}>
        {(props) => <CarePlanComposerScreen {...props} role="DOCTOR" />}
      </DoctorDrawer.Screen>
      <DoctorDrawer.Screen name="DoctorDocuments" options={{ title: 'Documents' }}>
        {(props) => <AdminDocComposerScreen {...props} role="DOCTOR" />}
      </DoctorDrawer.Screen>
      <DoctorDrawer.Screen name="DoctorReferrals" options={{ title: 'Referrals' }}>
        {(props) => <ReferralComposerScreen {...props} role="DOCTOR" />}
      </DoctorDrawer.Screen>
      <DoctorDrawer.Screen name="DoctorDiagnosticResults"  component={DoctorDiagnosticResultsScreen}  options={{ title: 'Lab & Scan Results' }} />
      <DoctorDrawer.Screen name="DoctorReviews"            component={DoctorReviewsScreen}            options={{ title: 'Reviews' }} />
      <DoctorDrawer.Screen name="DoctorAnalytics"          component={DoctorAnalyticsScreen}          options={{ title: 'Analytics' }} />
      <DoctorDrawer.Screen name="DoctorSettings"           component={DoctorSettingsScreen}           options={{ title: 'Profile & Settings' }} />
          <DoctorDrawer.Screen name="DoctorNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
</DoctorDrawer.Navigator>
  );
};

// ── Therapist Drawer ──
const TherapistDrawerNavigator = ({ profile }) => {
  return (
    <TherapistDrawer.Navigator
      drawerContent={(props) => <TherapistDrawerContent {...props} profile={profile} />}
      // ZenCare, centrally: theming the navigator converts every header, the
      // drawer and the card background for every therapy screen inside it at
      // once. Mobile has no cascade to override with, so this is where the
      // module-wide look has to be set.
      screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="TherapistNotifications" tint={ZC.ink} />,
        headerStyle: { backgroundColor: ZC.surface },
        // Dark: the header is white now, so the back arrow and the hamburger
        // were painting white on white and vanished entirely.
        headerTintColor: ZC.ink,
        headerTitleStyle: { fontWeight: '700', color: ZC.ink },
        drawerStyle: { backgroundColor: ZC.surface, width: 280 },
        drawerActiveTintColor: ZC.accentDeep,
        drawerInactiveTintColor: ZC.ink2,
        drawerActiveBackgroundColor: ZC.accentWash,
        drawerLabelStyle: { fontWeight: '600' },
        sceneContainerStyle: { backgroundColor: ZC.bg },
      }}
    >
      <TherapistDrawer.Screen name="TherapistHome" options={{ title: 'Dashboard' }}>
        {(props) => <TherapistHomeScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistClients" options={{ title: 'My Clients', headerShown: false }}>
        {() => <TherapistClientsNavigator profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistCoupleCases" options={{ title: 'Couple Cases' }}>
        {(props) => <TherapistCoupleCaseScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistMessages" options={{ title: 'Staff' }}>
        {(props) => <TherapistMessagesScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistVideo" options={{ title: 'Video Call', headerShown: false }}>
        {() => <TherapistVideoNavigator profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistAppointments" options={{ title: 'Appointments' }}>
        {(props) => <TherapistAppointmentsScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistSchedule" options={{ title: 'Calendar' }}>
        {(props) => <TherapistScheduleScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistNotes" options={{ title: 'Notes' }}>
        {(props) => <TherapistNotesScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistCarePlans" options={{ title: 'Care Plans' }}>
        {(props) => <CarePlanComposerScreen {...props} role="THERAPIST" />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistDocuments" options={{ title: 'Documents' }}>
        {(props) => <AdminDocComposerScreen {...props} role="THERAPIST" />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistReferrals" options={{ title: 'Referrals' }}>
        {(props) => <ReferralComposerScreen {...props} role="THERAPIST" />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistMood"      component={TherapistMoodScreen}      options={{ title: 'Client Moods' }} />
      <TherapistDrawer.Screen name="TherapistReportIssue" options={{ title: 'Report Issue' }}>
        {(props) => <TherapistReportIssueScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistResources" options={{ title: 'Resources' }}>
        {(props) => <TherapistResourcesScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistWellness" options={{ title: 'Wellness' }}>
        {(props) => <ProviderWellnessScreen {...props} audience="my_clients" peopleNoun="clients" />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistFeedback" component={FeedbackResultsScreen} options={{ title: 'Patient feedback' }} />
      <TherapistDrawer.Screen name="TherapistPromotions" component={ProviderPromotionsScreen} options={{ title: 'Promotions' }} />
      <TherapistDrawer.Screen name="TherapistCheckIns" options={{ title: 'Check-ins' }}>
        {(props) => <ClinicianFollowUpsScreen {...props} role="THERAPIST" />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistBriefing" options={{ title: 'Consultation briefing' }}>
        {(props) => <AiClinicianBriefingScreen {...props} role="THERAPIST" />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistFeeOffers" component={ProviderPricePromotionsScreen} options={{ title: 'Offers on my fee' }} />
      <TherapistDrawer.Screen name="TherapistNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <TherapistDrawer.Screen name="TherapistAiAssistant" options={{ title: 'NessaHub Clinical Assistant' }}>
        {(props) => <AiChatScreen {...props} clinician />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistNotificationPrefs" component={NotificationPreferencesScreen} options={{ title: 'Notification settings' }} />
      <TherapistDrawer.Screen name="TherapistSettings"  component={TherapistSettingsScreen}  options={{ title: 'Settings' }} />
    </TherapistDrawer.Navigator>
  );
};

/** Redirect incomplete couple partners off Main (therapy dashboard). */
function TherapyMainCoupleGate({ profile, children }) {
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const profileStr = await AsyncStorage.getItem('userProfile');
          const resolved = profileStr ? JSON.parse(profileStr) : profile;
          if (active && resolved) await applyCoupleLandingIfNeeded(navigation, resolved);
        } catch (_) {}
      })();
      return () => {
        active = false;
      };
    }, [navigation, profile]),
  );

  return children;
}

// ── Therapy Drawer ──
const TherapyDrawerNavigator = ({ profile }) => {
  // The tier decides which dashboard this drawer serves: a Second Opinion user
  // must not be shown a programme they have not bought.
  //
  // Asked of the SERVER rather than read from the cached profile. A profile
  // cached before the tier existed — or before an upgrade — would be stale, and
  // being wrong here means showing someone the wrong product. The cached value
  // seeds it so the first render is not visibly wrong, then the server settles it.
  const [tier, setTier] = useState(profile?.membershipTier || profile?.tier || null);

  useEffect(() => {
    let alive = true;
    api('/api/v1/medpsych/me')
      .then((r) => { if (alive && r?.membershipTier) setTier(r.membershipTier); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const isSecondOpinion = tier === 'second_opinion';

  return (
    <TherapyDrawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} profile={profile} />}
      screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="Notifications" tint={ZC.ink} />,
        headerStyle: { backgroundColor: ZC.surface },
        headerTintColor: ZC.ink,
        headerTitleStyle: { fontWeight: '700', color: ZC.ink },
        drawerStyle: { backgroundColor: ZC.surface },
        drawerActiveTintColor: ZC.accentDeep,
        drawerInactiveTintColor: ZC.ink2,
        drawerActiveBackgroundColor: ZC.accentWash,
        drawerLabelStyle: { fontWeight: '600' },
        sceneContainerStyle: { backgroundColor: ZC.bg },
      }}
    >
      {/* A Second Opinion client bought ONE review, not a programme. They get
          the case dashboard, and Schedule/Resources are hidden rather than
          shown empty — those describe ongoing care they do not have. The full
          drawer returns the moment they convert to membership. */}
      <TherapyDrawer.Screen
        name="Home"
        component={isSecondOpinion ? SecondOpinionHomeScreen : ClientHomeScreen}
        options={{ title: isSecondOpinion ? 'My case' : 'Home' }}
      />
      <TherapyDrawer.Screen name="Messages" component={ClientMessagesScreen} />
      <TherapyDrawer.Screen name="Video" component={ClientVideoScreen} />
      {isSecondOpinion ? null : (
        <TherapyDrawer.Screen name="Schedule" component={ClientScheduleScreen} />
      )}
      {isSecondOpinion ? null : (
        <TherapyDrawer.Screen name="Resources" component={ClientResourcesScreen} />
      )}
      <TherapyDrawer.Screen
        name="BecomeMember"
        component={BecomeMemberScreen}
        options={{ title: 'Become a member' }}
      />
      <TherapyDrawer.Screen name="Billing" component={ClientBillingScreen} />
      <TherapyDrawer.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <TherapyDrawer.Screen name="TherapyAiAssistant" component={AiChatScreen} options={{ title: 'NessaHub Assistant' }} />
      <TherapyDrawer.Screen name="TherapyCare" component={CareCentreScreen} options={{ title: 'My Care' }} />
      {/* The receiving end of the therapist's wellness messages — email-only
          until now, so there was no way to re-read one. */}
      <TherapyDrawer.Screen name="TherapyRecords" options={{ title: 'My Records' }}>
        {(props) => <RecordExplorerScreen {...props} title="My records" />}
      </TherapyDrawer.Screen>
      <TherapyDrawer.Screen name="TherapyCarePlan" options={{ title: 'My Care Plan' }}>
        {(props) => <MyCarePlanScreen {...props} peopleNoun="therapist" />}
      </TherapyDrawer.Screen>
      <TherapyDrawer.Screen name="TherapyWellness" options={{ title: 'Wellness' }}>
        {(props) => <MyWellnessScreen {...props} peopleNoun="therapist" />}
      </TherapyDrawer.Screen>
      <TherapyDrawer.Screen name="TherapyNotificationPrefs" component={NotificationPreferencesScreen} options={{ title: 'Notification settings' }} />
      <TherapyDrawer.Screen name="Settings" component={ClientSettingsScreen} />
      <TherapyDrawer.Screen name="Support" component={ClientSupportScreen} />
    </TherapyDrawer.Navigator>
  );
};

// ── Medical Drawer ──
const MedicalDrawerNavigator = ({ profile }) => {
  return (
    <MedicalDrawer.Navigator
      drawerContent={(props) => <MedicalDrawerContent {...props} profile={profile} />}
      screenOptions={{
        // One line puts the bell on every screen in this navigator. It was
        // previously unreachable: the screen was registered but nothing
        // anywhere linked to it.
        headerRight: () => <NotificationBellButton screen="MedicalNotifications" />,
        headerStyle: { backgroundColor: MedicalColors.primary },
        headerTintColor: MedicalColors.surface,
        headerTitleStyle: { fontWeight: 'bold' },
        drawerStyle: { backgroundColor: MedicalColors.surface },
        drawerActiveTintColor: MedicalColors.primary,
        drawerInactiveTintColor: MedicalColors.textSecondary,
      }}
    >
      <MedicalDrawer.Screen name="MedicalHome"          component={MedicalHomeScreen}          options={{ title: 'Dashboard' }} />
      <MedicalDrawer.Screen name="MedicalTimeline"      component={MedicalTimelineScreen}      options={{ title: 'Health Timeline' }} />
      <MedicalDrawer.Screen name="MedicalAppointments"  component={MedicalAppointmentsScreen}  options={{ title: 'Appointments' }} />
      <MedicalDrawer.Screen name="MedicalMessages"      component={MedicalMessagesScreen}      options={{ title: 'Messages' }} />
      <MedicalDrawer.Screen name="MedicalVideo"         component={MedicalVideoScreen}         options={{ title: 'Video Calls' }} />
      <MedicalDrawer.Screen name="MedicalHistory"       component={MedicalHistoryScreen}       options={{ title: 'Medical History' }} />
      <MedicalDrawer.Screen name="MedicalPrescriptions" component={MedicalPrescriptionsScreen} options={{ title: 'Prescriptions' }} />
      <MedicalDrawer.Screen name="MedicalDiagnostic"    component={MedicalDiagnosticScreen}    options={{ title: 'Lab & Scan Orders' }} />
      <MedicalDrawer.Screen name="MedicalBilling"       component={MedicalBillingScreen}       options={{ title: 'Billing' }} />
      <MedicalDrawer.Screen name="MedicalNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <MedicalDrawer.Screen name="MedicalAiAssistant" component={AiChatScreen} options={{ title: 'NessaHub Assistant' }} />
      <MedicalDrawer.Screen name="MedicalCare" component={CareCentreScreen} options={{ title: 'My Care' }} />
      <MedicalDrawer.Screen name="MedicalRecords" options={{ title: 'My Records' }}>
        {(props) => <RecordExplorerScreen {...props} title="My records" />}
      </MedicalDrawer.Screen>
      <MedicalDrawer.Screen name="MedicalCarePlan" options={{ title: 'My Care Plan' }}>
        {(props) => <MyCarePlanScreen {...props} peopleNoun="doctor" />}
      </MedicalDrawer.Screen>
      <MedicalDrawer.Screen name="MedicalWellness" options={{ title: 'Wellness' }}>
        {(props) => <MyWellnessScreen {...props} peopleNoun="doctor" />}
      </MedicalDrawer.Screen>
      <MedicalDrawer.Screen name="MedicalNotificationPrefs" component={NotificationPreferencesScreen} options={{ title: 'Notification settings' }} />
      <MedicalDrawer.Screen name="MedicalSettings"      component={MedicalSettingsScreen}      options={{ title: 'My Profile' }} />
    </MedicalDrawer.Navigator>
  );
};

// ── Main App Navigator ──
const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userIntent, setUserIntent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userRole, setUserRole] = useState(null);

  // Lets the push-notification tap handler navigate from outside the tree.
  const navigationRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const token = await AsyncStorage.getItem('th.token');
        const userId = await AsyncStorage.getItem('th.userId');
        const role   = await AsyncStorage.getItem('userRole');

        if (!token || !userId) {
          if (!cancelled) { setIsAuthenticated(false); setProfile(null); setUserRole(null); setIsLoading(false); }
          return;
        }

        const allowedRoles = ['client','patient','therapist','admin','doctor','pharmacy','branch_user','lab','lab_branch','scan','scan_branch','homecare_nurse'];
        if (!allowedRoles.includes(role)) {
          await clearSession();
          if (!cancelled) { setIsAuthenticated(false); setIsLoading(false); }
          return;
        }

        const profileStr = await AsyncStorage.getItem('userProfile');
        const resolvedProfile = profileStr ? JSON.parse(profileStr) : { id: userId, role };

        let intent;
        if (role === 'therapist' || role === 'admin') intent = 'therapist';
        else if (role === 'doctor')       intent = 'doctor';
        else if (role === 'pharmacy')     intent = 'pharmacy';
        else if (role === 'branch_user')  intent = 'branch';
        else if (role === 'lab')          intent = 'lab';
        else if (role === 'lab_branch')   intent = 'lab_branch';
        else if (role === 'scan')         intent = 'scan';
        else if (role === 'scan_branch')  intent = 'scan_branch';
        else if (role === 'homecare_nurse') intent = 'homecare_nurse';
        else if (role === 'patient')      intent = 'medical';
        else intent = resolvedProfile?.userIntent || await AsyncStorage.getItem('userIntent') || 'therapy';

        await AsyncStorage.setItem('isAuthenticated', 'true');
        await AsyncStorage.setItem('userId', userId);
        await AsyncStorage.setItem('userIntent', intent);
        const privacyAccepted = await AsyncStorage.getItem(PRIVACY_STORAGE_KEY);
        if (privacyAccepted === 'true') {
          syncPrivacyConsentToUser({ userId, role, profileId: resolvedProfile?.id || userId }).catch(() => {});
        }

        if (!cancelled) {
          setProfile(resolvedProfile);
          setUserRole(role);
          setIsAuthenticated(true);
          setUserIntent(intent);
          setIsLoading(false);
        }

        // Re-detect current location on every app open (best-effort).
        import('../services/liveLocation')
          .then((m) => m.refreshCurrentLocation())
          .catch(() => {});

        // Re-register this device for push. Registration used to run only at
        // sign-in, and people rarely sign out — so once a token was rotated or
        // pruned as dead, push stayed broken until the next manual login. This
        // never prompts: it registers only where permission already exists.
        ensurePushRegistered().catch(() => {});
      } catch {
        if (!cancelled) { setIsAuthenticated(false); setIsLoading(false); }
      }
    };
    checkSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('refreshProfile', async () => {
      try {
        const profileStr = await AsyncStorage.getItem('userProfile');
        if (!profileStr) return;
        const merged = JSON.parse(profileStr);
        setProfile(merged);
        if (merged?.name) await AsyncStorage.setItem('userName', merged.name);
      } catch (_) {}
    });
    return () => sub.remove();
  }, []);

  /**
   * The session died mid-session (refresh token rejected or expired).
   *
   * apiClient has already cleared storage; this is the half that gets the
   * user somewhere they can act. Without it every screen just logged its own
   * "Session expired" to the console and the person stayed on a dashboard
   * that quietly loaded nothing.
   */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('sessionExpired', () => {
      setIsAuthenticated(false);
      setProfile(null);
      setUserRole(null);
      setIsLoading(false);
    });
    return () => sub.remove();
  }, []);

  /**
   * Tapping a push notification.
   *
   * The backend ships a `link` with every notification, but it is a web path
   * because the same notification drives the web bell — nothing here read it,
   * so a tap merely reopened the app wherever it was last left. This resolves
   * the link against the signed-in role and navigates, and marks the
   * notification read, since tapping it IS reading it.
   *
   * Two entry points, because they are genuinely different: a cold start
   * carries the tap in getLastNotificationResponseAsync, while a tap on a
   * running app arrives through the listener.
   */
  const handledResponse = useRef(null);

  const openFromNotification = useCallback((response) => {
    try {
      const id = response?.notification?.request?.identifier;
      // A cold start replays the same response to the listener as well; without
      // this the user is navigated twice.
      if (id && handledResponse.current === id) return;
      if (id) handledResponse.current = id;

      const data = response?.notification?.request?.content?.data || {};
      if (data.test) return;   // the settings-screen test push goes nowhere

      const screen = screenForNotification(data.link, userIntent);
      const stack = stackForIntent(userIntent);
      if (data.notificationId) markNotificationRead(data.notificationId).catch(() => {});
      if (!screen || !stack || !navigationRef.current?.isReady()) return;
      // Nested form on purpose: the target lives in a drawer under this stack
      // screen, and a bare navigate(screen) from the root resolves nothing.
      navigationRef.current.navigate(stack, { screen });
    } catch {
      /* A bad payload must never crash the app on launch. */
    }
  }, [userIntent]);

  useEffect(() => {
    // Only once the role is known — the same link maps to a different screen
    // for a client and a doctor.
    if (!isAuthenticated || !userIntent) return undefined;

    let cancelled = false;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => { if (!cancelled && response) openFromNotification(response); })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => { cancelled = true; sub.remove(); };
  }, [isAuthenticated, userIntent, openFromNotification]);

  const getInitialRoute = () => {
    if (isAuthenticated) {
      if (userIntent === 'therapist')  return 'TherapistMain';
      if (userIntent === 'doctor')     return 'DoctorMain';
      if (userIntent === 'medical')    return 'MedicalMain';
      if (userIntent === 'pharmacy')   return 'PharmacyMain';
      if (userIntent === 'branch')     return 'BranchMain';
      if (userIntent === 'lab')        return 'LabMain';
      if (userIntent === 'lab_branch') return 'LabBranchMain';
      if (userIntent === 'scan')       return 'ScanMain';
      if (userIntent === 'scan_branch')return 'ScanBranchMain';
      if (userIntent === 'homecare_nurse') return 'HomeCareNurseMain';
      if (userIntent === 'homecare') return 'HomeCareFlow';
      return 'Main';
    }
    return 'IntroHome';
  };

  const linking = {
    prefixes: ['nessahub://', 'https://nessahub.com', 'https://www.nessahub.com'],
    config: {
      screens: {
        CoupleInviteEntry: {
          path: 'couple/join',
          parse: {
            token: (token) => token,
          },
        },
      },
    },
  };

  if (isLoading) return <LoadingScreen />;

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      {/* Rings over any screen when a clinician calls. Always mounted: an in-app
          login doesn't update isAuthenticated/userIntent here, so the component
          checks the stored session itself and only polls for clients/patients. */}
      <IncomingCallMobile navigationRef={navigationRef} />
      <DashboardLocationGateMobile role={userRole} profile={profile} userIntent={userIntent} active={isAuthenticated && !isLoading} />
      <ForcedPasswordChangeGateMobile
        active={isAuthenticated && !isLoading}
        userRole={userRole}
        profile={profile}
        onSuccess={async () => {
          setProfile((p) => (p ? { ...p, mustChangePassword: false } : null));
          // Persist the cleared flag first — refreshProfile re-reads userProfile
          // from storage, so a stale `mustChangePassword: true` there would make
          // the gate pop straight back up.
          try {
            const raw = await AsyncStorage.getItem('userProfile');
            if (raw) {
              const merged = { ...JSON.parse(raw), mustChangePassword: false };
              await AsyncStorage.setItem('userProfile', JSON.stringify(merged));
            }
          } catch (_) {}
          DeviceEventEmitter.emit('refreshProfile');
        }}
      />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: Colors.primary },
          headerTintColor: Colors.surface,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
        initialRouteName={getInitialRoute()}
      >
        <Stack.Screen name="IntroHome" component={IntroHomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Intent" component={IntentScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
        <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} options={{ title: 'Getting to know you' }} />
        <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account' }} />
        <Stack.Screen name="MatchTherapist" component={MatchTherapistScreen} options={{ title: 'Choose your therapist' }} />
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Choose your plan' }} />
        <Stack.Screen name="ParentGuardianInfo" component={ParentGuardianInfoScreen} options={{ title: 'Parent/Guardian Information' }} />
        <Stack.Screen name="ChildInfo" component={ChildInfoScreen} options={{ title: 'Child Information' }} />
        <Stack.Screen name="ParentConsent" component={ParentConsentScreen} options={{ title: 'Parent Consent' }} />
        <Stack.Screen name="CoupleInitiation" component={CoupleInitiationScreen} options={{ title: 'Couple therapy' }} />
        <Stack.Screen
          name="CoupleIntake"
          component={CoupleIntakeScreen}
          options={{ title: 'Couple intake', gestureEnabled: true }}
        />
        <Stack.Screen name="CoupleWaitingPartner" component={CoupleWaitingPartnerScreen} options={{ title: 'Couple status' }} />
        <Stack.Screen name="CoupleAcceptInvite" component={CoupleAcceptInviteScreen} options={{ title: 'Accept invitation' }} />
        <Stack.Screen name="CoupleInviteEntry" component={CoupleInviteEntryScreen} options={{ title: 'Partner invitation' }} />
        <Stack.Screen name="CouplePartnerBWelcome" component={CouplePartnerBWelcomeScreen} options={{ title: 'Join couple therapy' }} />
        <Stack.Screen name="CoupleDashboard" component={CoupleDashboardScreen} options={{ title: 'Couple therapy' }} />
        <Stack.Screen name="TherapistCoupleCase" component={TherapistCoupleCaseScreen} options={{ title: 'Couple case' }} />

        {/* MedPsych: second-opinion psychiatry. Deliberately outside the therapy
            onboarding — these users skip the questionnaire entirely. */}
        <Stack.Screen name="MedPsychSignUp" component={MedPsychSignUpScreen} options={{ headerShown: false }} />
        <Stack.Screen name="MedPsychPsychiatrists" component={MedPsychPsychiatristsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SecondOpinionIntake" component={SecondOpinionIntakeScreen} options={{ title: 'Second Opinion' }} />
        <Stack.Screen name="MedPsychBooking" component={MedPsychBookingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="MedicalIntake" component={MedicalIntakeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="DoctorSearch" component={DoctorSearchScreen} options={{ title: 'Find a Doctor', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }} />
        <Stack.Screen name="DoctorProfile" component={DoctorProfileScreen} options={{ title: 'Doctor Profile', headerStyle: { backgroundColor: MedicalColors.primary } }} />
        <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} options={{ title: 'Book Appointment', headerStyle: { backgroundColor: MedicalColors.primary } }} />
        <Stack.Screen name="ReviewSubmit" component={ReviewSubmitScreen} options={{ title: 'Leave a Review', headerTintColor: '#FFFFFF', headerStyle: { backgroundColor: MedicalColors.primary } }} />

        <Stack.Screen name="PharmacyMain" options={{ headerShown: false }}>
          {() => <PharmacyDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="BranchMain" options={{ headerShown: false }}>
          {() => <BranchDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="DoctorMain" options={{ headerShown: false }}>
          {() => <DoctorDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="TherapistMain" options={{ headerShown: false }}>
          {() => <TherapistDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="Main" options={{ headerShown: false }}>
          {() => (
            <TherapyMainCoupleGate profile={profile}>
              <TherapyDrawerNavigator profile={profile} />
            </TherapyMainCoupleGate>
          )}
        </Stack.Screen>
        <Stack.Screen name="MedicalMain" options={{ headerShown: false }}>
          {() => <MedicalDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="LabMain" options={{ headerShown: false }}>
          {() => <LabDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="LabBranchMain" options={{ headerShown: false }}>
          {() => <LabBranchDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="ScanMain" options={{ headerShown: false }}>
          {() => <ScanDrawerNavigator profile={profile} />}
        </Stack.Screen>
        <Stack.Screen name="ScanBranchMain" options={{ headerShown: false }}>
          {() => <ScanBranchDrawerNavigator profile={profile} />}
        </Stack.Screen>

        <Stack.Screen name="HomeCareFlow" component={HomeCarePatientNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="HomeCareNurseMain" options={{ headerShown: false }}>
          {() => <HomeCareNurseNavigator profile={profile} />}
        </Stack.Screen>

        {/* The video call for every role, reachable from anywhere (incoming calls, join buttons). */}
        <Stack.Screen name="VideoCallSession" component={VideoCallSessionScreen} options={{ headerShown: false }} />

        <Stack.Screen name="InsuranceDetails" component={InsuranceDetailsScreen} options={{ title: 'Insurance Details', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }} />
        <Stack.Screen name="EmergencyContact" component={EmergencyContactScreen} options={{ title: 'Emergency Contacts', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }} />
        <Stack.Screen name="HealthRecords" component={HealthRecordsScreen} options={{ title: 'Health Records', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }} />
        <Stack.Screen name="EPharmacy" component={EPharmacyScreen} options={{ title: 'My E-Pharmacies', headerStyle: { backgroundColor: '#7c3aed' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
        <Stack.Screen name="DoctorDetail" component={DoctorDetailScreen} options={{ title: 'Doctor Profile', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }} />
        <Stack.Screen name="Support" component={SupportScreen} options={{ title: 'Support & Report', headerStyle: { backgroundColor: MedicalColors.primary }, headerTintColor: '#fff' }} />
        <Stack.Screen name="DoctorPatientDetail" component={DoctorPatientDetailScreen} options={{ title: 'Patient Detail', headerStyle: { backgroundColor: DoctorColors.primaryDark }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
        <Stack.Screen name="DoctorPatientOverview" component={DoctorPatientOverviewScreen} options={{ headerShown: false }} />
        <Stack.Screen name="DoctorDiagnosticOrder" component={DoctorDiagnosticScreen} options={{ title: 'Order Lab / Scan', headerStyle: { backgroundColor: DoctorColors.primaryDark }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
        <Stack.Screen name="DoctorDiagnosticDraftDetail" component={DoctorDiagnosticDraftDetailScreen} options={{ title: 'Draft order', headerStyle: { backgroundColor: DoctorColors.primaryDark }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
        <Stack.Screen name="DoctorPatientTimeline" component={DoctorPatientTimelineScreen} options={{ title: 'Patient Timeline', headerStyle: { backgroundColor: DoctorColors.primaryDark }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
