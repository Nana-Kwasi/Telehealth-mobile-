import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer, useFocusEffect, useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { View, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveRole } from '../services/authService';
import { clearSession } from '../services/apiClient';
import { applyCoupleLandingIfNeeded } from '../services/coupleTherapyService';
import { PRIVACY_STORAGE_KEY, syncPrivacyConsentToUser } from '../services/privacyConsentService';

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
import TherapistScheduleScreen from '../screens/therapist-dashboard/TherapistScheduleScreen';
import TherapistAppointmentsScreen from '../screens/therapist-dashboard/TherapistAppointmentsScreen';
import TherapistNotesScreen from '../screens/therapist-dashboard/TherapistNotesScreen';
import TherapistSettingsScreen from '../screens/therapist-dashboard/TherapistSettingsScreen';
import TherapistMoodScreen from '../screens/therapist-dashboard/TherapistMoodScreen';
import TherapistReportIssueScreen from '../screens/therapist-dashboard/TherapistReportIssueScreen';
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
  </PharmacyDrawer.Navigator>
);

// ── Branch Drawer ──
const BranchDrawerNavigator = ({ profile }) => (
  <BranchDrawer.Navigator
    drawerContent={(props) => <PharmacyDrawerContent {...props} profile={profile} isBranch={true} />}
    screenOptions={{
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
  </BranchDrawer.Navigator>
);

// ── Lab Drawer ──
const LabDrawerNavigator = ({ profile }) => (
  <LabDrawer.Navigator
    drawerContent={(props) => <LabDrawerContent {...props} profile={profile} isBranch={false} />}
    screenOptions={{
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
  </LabDrawer.Navigator>
);

// ── Lab Branch Drawer ──
const LabBranchDrawerNavigator = ({ profile }) => (
  <LabBranchDrawer.Navigator
    drawerContent={(props) => <LabDrawerContent {...props} profile={profile} isBranch={true} />}
    screenOptions={{
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
  </LabBranchDrawer.Navigator>
);

// ── Scan Drawer ──
const ScanDrawerNavigator = ({ profile }) => (
  <ScanDrawer.Navigator
    drawerContent={(props) => <ScanDrawerContent {...props} profile={profile} isBranch={false} />}
    screenOptions={{
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
  </ScanDrawer.Navigator>
);

// ── Scan Branch Drawer ──
const ScanBranchDrawerNavigator = ({ profile }) => (
  <ScanBranchDrawer.Navigator
    drawerContent={(props) => <ScanDrawerContent {...props} profile={profile} isBranch={true} />}
    screenOptions={{
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
  </ScanBranchDrawer.Navigator>
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
      <DoctorDrawer.Screen name="DoctorHome"               component={DoctorHomeScreen}               options={{ title: 'Dashboard' }} />
      <DoctorDrawer.Screen name="DoctorPatients"           component={DoctorPatientsScreen}           options={{ title: 'My Patients' }} />
      <DoctorDrawer.Screen name="DoctorPatientPanel"       component={DoctorPatientPanelScreen}       options={{ title: 'Patient Panel' }} />
      <DoctorDrawer.Screen name="DoctorAppointments"       component={DoctorAppointmentsScreen}       options={{ title: 'Appointments' }} />
      <DoctorDrawer.Screen name="DoctorVideo"              component={DoctorVideoScreen}              options={{ title: 'Video Calls' }} />
      <DoctorDrawer.Screen name="DoctorMessages"           component={DoctorMessagesScreen}           options={{ title: 'Messages' }} />
      <DoctorDrawer.Screen name="DoctorNotes"              component={DoctorNotesScreen}              options={{ title: 'Notes' }} />
      <DoctorDrawer.Screen name="DoctorPrescriptions"      component={DoctorPrescriptionsScreen}      options={{ title: 'Prescriptions' }} />
      <DoctorDrawer.Screen name="DoctorDiagnosticResults"  component={DoctorDiagnosticResultsScreen}  options={{ title: 'Lab & Scan Results' }} />
      <DoctorDrawer.Screen name="DoctorReviews"            component={DoctorReviewsScreen}            options={{ title: 'Reviews' }} />
      <DoctorDrawer.Screen name="DoctorAnalytics"          component={DoctorAnalyticsScreen}          options={{ title: 'Analytics' }} />
      <DoctorDrawer.Screen name="DoctorSettings"           component={DoctorSettingsScreen}           options={{ title: 'Profile & Settings' }} />
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
      <TherapistDrawer.Screen name="TherapistMood"      component={TherapistMoodScreen}      options={{ title: 'Client Moods' }} />
      <TherapistDrawer.Screen name="TherapistReportIssue" options={{ title: 'Report Issue' }}>
        {(props) => <TherapistReportIssueScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistResources" options={{ title: 'Resources' }}>
        {(props) => <TherapistResourcesScreen {...props} profile={profile} />}
      </TherapistDrawer.Screen>
      <TherapistDrawer.Screen name="TherapistNotifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
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
      <TherapyDrawer.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
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
    <NavigationContainer linking={linking}>
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
        <Stack.Screen name="CoupleInviteEntry" component={CoupleInviteEntryScreen} options={{ title: 'Partner invitation' }} />
        <Stack.Screen name="CouplePartnerBWelcome" component={CouplePartnerBWelcomeScreen} options={{ title: 'Join couple therapy' }} />
        <Stack.Screen name="CoupleDashboard" component={CoupleDashboardScreen} options={{ title: 'Couple therapy' }} />
        <Stack.Screen name="TherapistCoupleCase" component={TherapistCoupleCaseScreen} options={{ title: 'Couple case' }} />

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
