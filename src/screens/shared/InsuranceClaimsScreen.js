import React from 'react';
import { ProviderClaimsMobile } from '../../components/ProviderInsuranceMobile';

// Insurance claims for any provider (pharmacy, branch, lab, scan).
export default function InsuranceClaimsScreen({ accent }) {
  return <ProviderClaimsMobile accent={accent} />;
}
