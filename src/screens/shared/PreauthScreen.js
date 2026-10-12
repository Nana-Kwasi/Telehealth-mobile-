import React from 'react';
import { ProviderPreauthMobile } from '../../components/ProviderInsuranceMobile';

// Pre-authorisation requests a provider sent to insurers.
export default function PreauthScreen({ accent }) {
  return <ProviderPreauthMobile accent={accent} />;
}
