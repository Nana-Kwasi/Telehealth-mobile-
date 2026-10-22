import { api } from './apiClient';

/**
 * Save the therapy questionnaire to the client profile (preferencesJson).
 * Merged over what is already stored, so an existing account — e.g. a medical
 * patient adding therapy, or a returning client — keeps its earlier answers
 * underneath the new ones. PATCH upserts; POST is the create fallback.
 */
export async function saveTherapyIntake(userId, clientData, { name, email, phone } = {}) {
  let prefs = {};
  try {
    const existing = await api(`/api/v1/clients/${userId}`);
    prefs = existing?.preferencesJson ? JSON.parse(existing.preferencesJson) : {};
  } catch { /* no profile yet */ }

  const phoneValue = phone || clientData?.phone || null;
  const body = {
    ...(phoneValue ? { phone: phoneValue } : {}),
    preferencesJson: JSON.stringify({
      ...prefs,
      ...clientData,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      completedAt: clientData?.completedAt || new Date().toISOString(),
    }),
    status: 'active',
  };
  try {
    await api(`/api/v1/clients/${userId}`, { method: 'PATCH', body });
  } catch {
    await api('/api/v1/clients', {
      method: 'POST',
      body: { clientId: userId, ...body },
    }).catch(() => {});
  }
}
