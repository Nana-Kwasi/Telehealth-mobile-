import React, { useEffect, useState } from 'react';
import ProviderDrawer from './provider/ProviderDrawer';
import { api } from '../services/apiClient';
import { ScanColors as C } from '../constants/colors';

const SCAN_NAV = [
  { name: 'ScanHome', label: 'Overview', icon: 'grid-outline' },
  { name: 'ScanOrders', label: 'All Orders', icon: 'clipboard-outline' },
  { name: 'ScanResults', label: 'Results', icon: 'document-text-outline' },
  { name: 'ScanBranches', label: 'Branches', icon: 'business-outline' },
  { name: 'ScanCatalog', label: 'Scan Catalog', icon: 'pricetags-outline' },
  { name: 'ScanReports', label: 'Reports', icon: 'stats-chart-outline' },
  { name: 'ScanInsuranceClaims', label: 'Insurance claims', icon: 'shield-checkmark-outline' },
  { name: 'ScanPreauth', label: 'Pre-authorisations', icon: 'checkmark-done-outline' },
  { name: 'ScanReportIssue', label: 'Report Issue', icon: 'mail-outline' },
  { name: 'ScanPreferences', label: 'Settings', icon: 'settings-outline' },
];

const SCAN_BRANCH_NAV = [
  { name: 'ScanBranchHome', label: 'Overview', icon: 'grid-outline' },
  { name: 'ScanBranchOrders', label: 'Worklist', icon: 'clipboard-outline' },
  { name: 'ScanBranchResults', label: 'Results', icon: 'document-text-outline' },
  { name: 'ScanBranchCatalog', label: 'Scan Catalog', icon: 'pricetags-outline' },
  { name: 'ScanBranchReports', label: 'Reports', icon: 'stats-chart-outline' },
  { name: 'ScanBranchInsuranceClaims', label: 'Insurance claims', icon: 'shield-checkmark-outline' },
  { name: 'ScanBranchPreauth', label: 'Pre-authorisations', icon: 'checkmark-done-outline' },
  { name: 'ScanBranchReportIssue', label: 'Report Issue', icon: 'mail-outline' },
  { name: 'ScanBranchPreferences', label: 'Settings', icon: 'settings-outline' },
];

export default function ScanDrawerContent({ navigation, state, profile, isBranch = false }) {
  const [parentName, setParentName] = useState('');
  useEffect(() => {
    if (!isBranch || !profile?.scanId) return;
    api(`/api/v1/admin/users/${profile.scanId}`).then((data) => {
      if (data?.centerName || data?.name) setParentName(data.centerName || data.name || '');
    }).catch(() => {});
  }, [isBranch, profile?.scanId]);

  const name = profile?.centerName || profile?.branchName || 'Scan Center';
  return (
    <ProviderDrawer
      navigation={navigation}
      state={state}
      items={isBranch ? SCAN_BRANCH_NAV : SCAN_NAV}
      accent={C.primary}
      accentSoft={C.primaryLight}
      roleLabel={isBranch ? 'Scan centre branch' : 'Scan centre'}
      accountName={name}
      accountKind={isBranch ? 'Branch account' : 'Parent account'}
      parentName={isBranch ? parentName : ''}
      location={[profile?.city, profile?.country].filter(Boolean).join(' · ')}
    />
  );
}
