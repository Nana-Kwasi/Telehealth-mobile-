/** The provider application site (onboard.nessahub.com), opened in the browser. */
export const PROVIDER_PORTAL_URL = (process.env.EXPO_PUBLIC_PROVIDER_PORTAL_URL || 'https://onboard.nessahub.com').replace(/\/+$/, '');
export const PROVIDER_PORTAL_LINKS = {
  home: PROVIDER_PORTAL_URL,
  apply: `${PROVIDER_PORTAL_URL}/#/signup`,
  track: `${PROVIDER_PORTAL_URL}/#/track`,
  paperForms: `${PROVIDER_PORTAL_URL}/#/forms`,
};
