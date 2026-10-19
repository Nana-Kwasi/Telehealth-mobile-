import React from 'react';
import ProviderDrawer from './provider/ProviderDrawer';
import { PharmacyColors as C } from '../constants/colors';

const PHARMACY_NAV = [
  { name: 'PharmacyHome',          label: 'Overview',      icon: 'grid-outline' },
  { name: 'PharmacyBranches',      label: 'Manage Branches',      icon: 'storefront-outline' },
  { name: 'PharmacyPrescriptions', label: 'Prescriptions', icon: 'medical-outline' },
  { name: 'PharmacyOpen',          label: 'Open Prescriptions', icon: 'mail-open-outline' },
  { name: 'PharmacyReports',       label: 'Reports',       icon: 'stats-chart-outline' },
  { name: 'PharmacyInsuranceClaims', label: 'Insurance claims', icon: 'shield-checkmark-outline' },
  { name: 'PharmacyPreauth', label: 'Pre-authorisations', icon: 'checkmark-done-outline' },
  { name: 'PharmacyFormulary',     label: 'Formulary',     icon: 'library-outline' },
  { name: 'PharmacyReportIssue',   label: 'Report Issue',  icon: 'mail-outline' },
  { name: 'PharmacyPreferences',   label: 'Settings',      icon: 'settings-outline' },
];

const BRANCH_NAV = [
  { name: 'BranchHome',          label: 'Overview',      icon: 'grid-outline' },
  { name: 'BranchPrescriptions', label: 'Prescriptions', icon: 'medical-outline' },
  { name: 'BranchOpen',          label: 'Open Prescriptions', icon: 'mail-open-outline' },
  { name: 'BranchWalkIn',        label: 'Walk-in Verify',icon: 'search-outline' },
  { name: 'BranchTransfers',     label: 'Transfers',     icon: 'swap-horizontal-outline' },
  { name: 'BranchActivity',      label: 'Activity',      icon: 'receipt-outline' },
  { name: 'BranchReports',       label: 'Reports',       icon: 'stats-chart-outline' },
  { name: 'BranchInsuranceClaims', label: 'Insurance claims', icon: 'shield-checkmark-outline' },
  { name: 'BranchPreauth', label: 'Pre-authorisations', icon: 'checkmark-done-outline' },
  { name: 'BranchReportIssue',   label: 'Report Issue',  icon: 'mail-outline' },
  { name: 'BranchPreferences',   label: 'Settings',      icon: 'settings-outline' },
];

export default function PharmacyDrawerContent({ navigation, state, profile, isBranch = false }) {
  const name = (isBranch ? (profile?.branchName || profile?.pharmacyName) : (profile?.pharmacyName || profile?.branchName)) || 'Pharmacy';
  return (
    <ProviderDrawer
      navigation={navigation}
      state={state}
      items={isBranch ? BRANCH_NAV : PHARMACY_NAV}
      accent={C.primary}
      accentSoft={C.primaryLight}
      roleLabel={isBranch ? 'Pharmacy branch' : 'Pharmacy'}
      accountName={name}
      accountKind={isBranch ? 'Branch account' : 'Parent account'}
      parentName={isBranch && profile?.pharmacyName && profile.pharmacyName !== name ? profile.pharmacyName : ''}
      location={[profile?.city, profile?.country].filter(Boolean).join(' · ')}
    />
  );
}
