import React, { useEffect, useState } from 'react';
import ProviderDrawer from './provider/ProviderDrawer';
import { api } from '../services/apiClient';
import { LabColors as C } from '../constants/colors';

const LAB_NAV = [
  { name: 'LabHome', label: 'Overview', icon: 'grid-outline' },
  { name: 'LabOrders', label: 'All Orders', icon: 'clipboard-outline' },
  { name: 'LabResults', label: 'Results', icon: 'document-text-outline' },
  { name: 'LabBranches', label: 'Branches', icon: 'business-outline' },
  { name: 'LabCatalog', label: 'Test Catalog', icon: 'pricetags-outline' },
  { name: 'LabReports', label: 'Reports', icon: 'stats-chart-outline' },
  { name: 'LabInsuranceClaims', label: 'Insurance claims', icon: 'shield-checkmark-outline' },
  { name: 'LabPreauth', label: 'Pre-authorisations', icon: 'checkmark-done-outline' },
  { name: 'LabReportIssue', label: 'Report Issue', icon: 'mail-outline' },
  { name: 'LabPreferences', label: 'Settings', icon: 'settings-outline' },
];

const LAB_BRANCH_NAV = [
  { name: 'LabBranchHome', label: 'Overview', icon: 'grid-outline' },
  { name: 'LabBranchOrders', label: 'Worklist', icon: 'clipboard-outline' },
  { name: 'LabBranchResults', label: 'Results', icon: 'document-text-outline' },
  { name: 'LabBranchCatalog', label: 'Test Catalog', icon: 'pricetags-outline' },
  { name: 'LabBranchReports', label: 'Reports', icon: 'stats-chart-outline' },
  { name: 'LabBranchInsuranceClaims', label: 'Insurance claims', icon: 'shield-checkmark-outline' },
  { name: 'LabBranchPreauth', label: 'Pre-authorisations', icon: 'checkmark-done-outline' },
  { name: 'LabBranchReportIssue', label: 'Report Issue', icon: 'mail-outline' },
  { name: 'LabBranchPreferences', label: 'Settings', icon: 'settings-outline' },
];

export default function LabDrawerContent({ navigation, state, profile, isBranch = false }) {
  const [parentName, setParentName] = useState('');
  useEffect(() => {
    if (!isBranch || !profile?.labId) return;
    api(`/api/v1/admin/users/${profile.labId}`).then((data) => {
      if (data?.labName || data?.name) setParentName(data.labName || data.name || '');
    }).catch(() => {});
  }, [isBranch, profile?.labId]);

  const name = profile?.labName || profile?.branchName || 'Lab Center';
  return (
    <ProviderDrawer
      navigation={navigation}
      state={state}
      items={isBranch ? LAB_BRANCH_NAV : LAB_NAV}
      accent={C.primary}
      accentSoft={C.primaryLight}
      roleLabel={isBranch ? 'Lab branch' : 'Lab'}
      accountName={name}
      accountKind={isBranch ? 'Branch account' : 'Parent account'}
      parentName={isBranch ? parentName : ''}
      location={[profile?.city, profile?.country].filter(Boolean).join(' · ')}
    />
  );
}
