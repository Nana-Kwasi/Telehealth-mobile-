import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, STORAGE_KEYS } from './apiClient';
import { COUPLE_STATUSES, COUPLE_STORAGE_KEYS } from '../constants/coupleTherapyConfig';
import { sectionsForPartner } from '../constants/coupleIntakeSections';
import { validateAdultDateOfBirth } from '../constants/therapyAgeValidation';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function coupleDraftKey(coupleId, partnerKey) {
  return `th.coupleDraft_${coupleId}_${partnerKey}`;
}

export async function loadLocalCoupleDraft(coupleId, partnerKey) {
  try {
    const raw = await AsyncStorage.getItem(coupleDraftKey(coupleId, partnerKey));
    return raw ? JSON.parse(raw) : { sections: {} };
  } catch {
    return { sections: {} };
  }
}

async function partnerClaimKey() {
  const role = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole);
  return role === 'partnerB' ? 'partnerB' : 'partnerA';
}

function partnerKeyToBackend(partnerKey) {
  return partnerKey === 'partnerB' ? 'B' : 'A';
}

// ─── Registration ──────────────────────────────────────────────────────────────
export async function createCoupleRegistration(payload) {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  const data = await api('/api/v1/couples', {
    method: 'POST',
    body: {
      partnerAId: payload.partnerAId || userId,
      partnerAName: payload.partnerAName || payload.name || '',
      partnerAEmail: payload.partnerAEmail || payload.email || '',
      partnerBName: payload.partnerBName || '',
      partnerBEmail: payload.partnerBEmail || '',
      relationshipType: payload.relationshipType || '',
    },
  });
  if (data?.id) {
    await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, data.id);
    await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, 'partnerA');
  }
  return data;
}

export async function linkCouplePartnerAccount(coupleId, partnerKey, { clientId, name }) {
  return api('/api/v1/couples/link-partner', {
    method: 'POST',
    body: { coupleId, partnerKey: partnerKeyToBackend(partnerKey), clientId, name },
  });
}

export async function fetchCoupleByInviteToken(token) {
  return api(`/api/v1/couples/invite?token=${encodeURIComponent(token)}`);
}

export async function sendPartnerBInvitation(coupleId) {
  // Backend does not have a dedicated send-invitation endpoint; return a generated invite link
  const data = await api(`/api/v1/couples/${coupleId}/dashboard`);
  return { inviteToken: data?.registration?.inviteToken, coupleId };
}

export async function loadCouple(coupleId) {
  try {
    const data = await api(`/api/v1/couples/${coupleId}/dashboard`);
    return data?.registration || null;
  } catch {
    return null;
  }
}

export async function loadPartnerPrivate(coupleId, partnerKey) {
  try {
    const data = await api(`/api/v1/couples/${coupleId}/dashboard`);
    const backendKey = partnerKeyToBackend(partnerKey);
    const intakes = backendKey === 'A' ? data?.partnerAIntakeSections : data?.partnerBIntakeSections;
    if (!intakes?.length) return {};
    const sections = {};
    intakes.forEach((s) => { sections[s.sectionId] = s.sectionData ? JSON.parse(s.sectionData) : {}; });
    return { sections };
  } catch {
    return {};
  }
}

export async function syncLocalCoupleDraftFromServer(coupleId, partnerKey) {
  try {
    const priv = await loadPartnerPrivate(coupleId, partnerKey);
    if (!priv?.sections || Object.keys(priv.sections).length === 0) return;
    const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
    draft.sections = { ...(draft.sections || {}), ...priv.sections };
    await AsyncStorage.setItem(coupleDraftKey(coupleId, partnerKey), JSON.stringify(draft));
  } catch {}
}

export async function loadSectionData(coupleId, partnerKey, section) {
  let fromServer = {};
  try {
    const privateData = await loadPartnerPrivate(coupleId, partnerKey);
    fromServer = privateData.sections?.[section.id] || {};
  } catch {}
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  const fromDraft = draft.sections?.[section.id] || {};
  return { ...fromServer, ...fromDraft };
}

export async function enrichCoupleIntakePersonalSection(coupleId, partnerKey, form = {}) {
  const merged = { ...form };
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);

  if (!merged.fullName?.trim()) {
    const storedName = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myPartnerName);
    let profileName = '';
    try {
      const profileStr = await AsyncStorage.getItem('userProfile');
      if (profileStr) {
        const p = JSON.parse(profileStr);
        profileName = (p.fullName || p.name || p.displayName || '').trim();
      }
    } catch {}
    let coupleName = '';
    if (coupleId) {
      try {
        const reg = await loadCouple(coupleId);
        coupleName = partnerKey === 'partnerA' ? (reg?.partnerAName || '') : (reg?.partnerBName || '');
      } catch {}
    }
    merged.fullName = storedName?.trim() || profileName || coupleName || '';
  }

  if (!merged.email?.trim()) {
    try {
      const profileStr = await AsyncStorage.getItem('userProfile');
      if (profileStr) {
        const p = JSON.parse(profileStr);
        merged.email = (p.email || '').trim();
      }
    } catch {}
  }

  if (merged.dateOfBirth) merged.age = calculateAgeFromDob(merged.dateOfBirth);
  return merged;
}

export async function savePartnerSection(coupleId, partnerKey, sectionId, sectionData) {
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  draft.sections[sectionId] = sectionData;
  await AsyncStorage.setItem(coupleDraftKey(coupleId, partnerKey), JSON.stringify(draft));

  try {
    await api(`/api/v1/couples/${coupleId}/intake`, {
      method: 'POST',
      body: { partnerKey: partnerKeyToBackend(partnerKey), sectionId, sectionData: JSON.stringify(sectionData) },
    });
  } catch (e) {
    console.warn('savePartnerSection backend sync:', e?.message);
  }
}

export async function markPartnerIntakeComplete(coupleId, partnerKey) {
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  const data = await api(`/api/v1/couples/${coupleId}/intake/complete`, {
    method: 'POST',
    body: { partnerKey: partnerKeyToBackend(partnerKey) },
  });
  await AsyncStorage.removeItem(coupleDraftKey(coupleId, partnerKey));
  return data;
}

// ─── Session management ────────────────────────────────────────────────────────
export function isTherapistSelectionUnlocked(couple) {
  if (!couple) return false;
  return (
    couple.therapistSelectionUnlocked === true ||
    couple.status === COUPLE_STATUSES.READY_FOR_THERAPIST ||
    couple.status === COUPLE_STATUSES.THERAPIST_PENDING_CONFIRM ||
    couple.status === COUPLE_STATUSES.THERAPIST_SELECTED ||
    couple.status === 'matched' ||
    couple.status === 'active'
  );
}

export function isPaymentAllowed(couple) {
  return isTherapistSelectionUnlocked(couple) && !couple?.paymentComplete;
}

export function canBrowseTherapists(couple) {
  return isTherapistSelectionUnlocked(couple) && couple?.paymentComplete === true;
}

export async function linkCouplePartnerAuth(coupleId, partnerKey, { authUid, clientId, name }) {
  return linkCouplePartnerAccount(coupleId, partnerKey, { clientId: clientId || authUid, name });
}

export async function clearCoupleLocalSession() {
  await Promise.all(Object.values(COUPLE_STORAGE_KEYS).map((key) => AsyncStorage.removeItem(key)));
}

export function waitForAuthUser(timeoutMs = 12000) {
  return new Promise(async (resolve, reject) => {
    const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId).catch(() => null);
    if (userId) { resolve({ uid: userId }); return; }
    reject(new Error('Auth session not ready'));
  });
}

export async function getAuthCoupleHints() {
  try {
    const coupleId = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
    const partnerRole = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole) || 'partnerA';
    return { coupleId: coupleId || null, partnerRole };
  } catch {
    return {};
  }
}

async function applyClaimToStorage(data) {
  if (data.coupleId) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, data.coupleId);
  if (data.partnerRole) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, data.partnerRole);
  if (data.registeredEmail) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myRegistrationEmail, data.registeredEmail);
  if (data.otherPartnerName) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.otherPartnerName, data.otherPartnerName);
  if (data.intakeComplete) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');
  else await AsyncStorage.removeItem(COUPLE_STORAGE_KEYS.myIntakeComplete);
}

export async function ensureCoupleSession(coupleIdHint, options = {}) {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId).catch(() => null);
  if (!userId) return { ok: false, reason: 'not_signed_in', message: 'Please sign in first.' };

  const storedCoupleId = coupleIdHint || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
  if (!storedCoupleId) {
    // Try to find couple by listing
    try {
      const couples = await api('/api/v1/couples');
      const match = Array.isArray(couples) ? couples[0] : null;
      if (!match) return { ok: false, reason: 'no_couple_for_email', message: 'No couple registration found.' };
      return buildSessionFromRegistration(match, userId, options);
    } catch {
      return { ok: false, reason: 'no_couple_for_email', message: 'No couple registration found.' };
    }
  }

  try {
    const data = await api(`/api/v1/couples/${storedCoupleId}/dashboard`);
    return buildSessionFromDashboard(data, storedCoupleId, userId, options);
  } catch (e) {
    return { ok: false, reason: 'error', message: mapCoupleCallableError(e) };
  }
}

function buildSessionFromDashboard(data, coupleId, userId, options) {
  const reg = data?.registration || data;
  return buildSessionFromRegistration(reg, userId, options);
}

function buildSessionFromRegistration(reg, userId, options) {
  if (!reg) return { ok: false, reason: 'no_couple_for_email', message: 'No couple registration found.' };

  const isA = reg.partnerAId === userId;
  const isB = reg.partnerBId === userId;
  const partnerRole = options.claimAs || (isB ? 'partnerB' : 'partnerA');
  const otherPartnerName = partnerRole === 'partnerA' ? (reg.partnerBName || '') : (reg.partnerAName || '');
  const myIntakeComplete = partnerRole === 'partnerA' ? reg.partnerAIntakeComplete : reg.partnerBIntakeComplete;

  return {
    ok: true,
    coupleId: reg.id,
    partnerRole,
    intakeComplete: !!myIntakeComplete,
    partnerAIntakeComplete: !!reg.partnerAIntakeComplete,
    partnerBIntakeComplete: !!reg.partnerBIntakeComplete,
    therapistSelectionUnlocked: reg.status === 'matched' || reg.status === 'active' || !!reg.therapistId,
    paymentComplete: !!reg.paymentComplete,
    therapistId: reg.therapistId || null,
    otherPartnerName,
    inviteUrl: reg.inviteToken ? `nessahub://couple-invite?token=${reg.inviteToken}` : null,
  };
}

/** @deprecated use ensureCoupleSession */
export async function ensureCouplePartnerLinked(coupleId, partnerKey) {
  const claimAs = partnerKey === 'partnerB' ? 'partnerB' : 'partnerA';
  return ensureCoupleSession(coupleId, { claimAs });
}

export async function isCoupleIntakeDoneLocally() {
  return (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete)) === 'true';
}

export async function syncCoupleSessionFromProfile(profile) {
  if (!profile) return;
  if (profile.coupleId) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, profile.coupleId);
  if (profile.couplePartnerRole) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, profile.couplePartnerRole);
  const regName = (profile.name || profile.displayName || profile.clientName || '').trim();
  if (regName) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, regName);
  if (profile.coupleIntakeComplete === true) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');
}

export function mapCoupleCallableError(err) {
  const msg = err?.message || String(err);
  if (/permission|insufficient|not linked|not a couple/i.test(msg)) {
    return 'Could not verify your couple account. Sign out, sign in with the email you used when starting couple registration, then retry.';
  }
  return msg;
}

export async function buildLocalWaitingFallback(coupleId) {
  const partnerName = (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.otherPartnerName)) || 'your partner';
  const intakeDone = (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete)) === 'true';
  if (!coupleId || !intakeDone) return null;
  return {
    myRole: 'partnerA',
    couple: {
      id: coupleId, status: COUPLE_STATUSES.AWAITING_PARTNER_B,
      partnerA: { intakeComplete: true, consentComplete: true },
      partnerB: { intakeComplete: false, name: partnerName },
    },
    otherPartnerName: partnerName, waitingForPartner: true, inviteUrl: null, _localFallback: true,
  };
}

export async function enrichCoupleProfile(profile) {
  const merged = { ...(profile || {}) };
  try {
    const onboard = JSON.parse((await AsyncStorage.getItem('th.onboard')) || '{}');
    if (onboard.therapyType === 'couples') merged.therapyType = 'couples';
    if (onboard.coupleId && !merged.coupleId) merged.coupleId = onboard.coupleId;
  } catch {}
  if (!merged.coupleId) {
    const stored = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
    if (stored) merged.coupleId = stored;
  }
  return merged;
}

export async function getCoupleIdHint(profile) {
  if (profile?.coupleId) return profile.coupleId;
  const stored = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
  if (stored) return stored;
  try {
    const onboard = JSON.parse((await AsyncStorage.getItem('th.onboard')) || '{}');
    if (onboard.coupleId) return onboard.coupleId;
  } catch {}
  return null;
}

export async function isCouplesClient(profile) {
  if (profile?.therapyType === 'couples' || profile?.coupleId) return true;
  try {
    const onboard = JSON.parse((await AsyncStorage.getItem('th.onboard')) || '{}');
    if (onboard.therapyType === 'couples') return true;
  } catch {}
  return !!(await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
}

// ─── Therapist matching ────────────────────────────────────────────────────────
export async function getCoupleMatchedTherapists(coupleId) {
  const data = await api(`/api/v1/couples/${coupleId}/matched-therapists`);
  // Endpoint returns { therapists: [...] }; the screen reads match.therapists.
  if (Array.isArray(data)) return { therapists: data };
  return data && Array.isArray(data.therapists) ? data : { therapists: [] };
}

export async function proposeCoupleTherapist(coupleId, therapistId, therapistName) {
  return api(`/api/v1/couples/${coupleId}/propose-therapist`, {
    method: 'POST',
    body: { therapistId, therapistName },
  });
}

export async function confirmCoupleTherapist(coupleId, accept = true) {
  return api(`/api/v1/couples/${coupleId}/confirm-therapist`, {
    method: 'POST',
    body: { accept },
  });
}

export async function markCouplePaymentComplete(coupleId, plan) {
  return api(`/api/v1/couples/${coupleId}/payment-complete`, {
    method: 'POST',
    body: { paymentPlan: plan },
  });
}

export async function getCoupleDashboard(coupleId, claimAs) {
  const data = await api(`/api/v1/couples/${coupleId}/dashboard`);
  const reg = data?.registration || {};
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  const role = claimAs || (reg.partnerBId === userId ? 'partnerB' : 'partnerA');
  const otherRole = role === 'partnerA' ? 'partnerB' : 'partnerA';
  return {
    couple: {
      id: reg.id, status: reg.status, relationshipType: reg.relationshipType,
      therapistSelectionUnlocked: reg.status === 'matched' || reg.status === 'active' || !!reg.therapistId,
      paymentComplete: !!reg.paymentComplete,
      therapistId: reg.therapistId, therapistName: reg.therapistName,
      therapistProposal: reg.proposedTherapistId ? { therapistId: reg.proposedTherapistId, therapistName: reg.proposedTherapistName } : null,
      partnerA: { name: reg.partnerAName, intakeComplete: reg.partnerAIntakeComplete, consentComplete: reg.partnerAIntakeComplete },
      partnerB: { name: reg.partnerBName, intakeComplete: reg.partnerBIntakeComplete, consentComplete: reg.partnerBIntakeComplete },
    },
    myRole: role,
    otherPartnerName: role === 'partnerA' ? reg.partnerBName : reg.partnerAName,
    waitingForPartner: role === 'partnerA' ? !reg.partnerBIntakeComplete : !reg.partnerAIntakeComplete,
    inviteUrl: reg.inviteToken ? `nessahub://couple-invite?token=${reg.inviteToken}` : null,
  };
}

export async function fetchCoupleDashboard(coupleId, { skipEnsure = false } = {}) {
  const session = skipEnsure
    ? { ok: true, coupleId, partnerRole: await partnerClaimKey() }
    : await ensureCoupleSession(coupleId);
  const activeId = session.coupleId || coupleId;
  if (!session.ok) {
    const fallback = await buildLocalWaitingFallback(activeId);
    if (fallback) return fallback;
    throw new Error(session.message || 'Could not verify couple account.');
  }
  const claimAs = session.partnerRole || (await partnerClaimKey());
  try {
    return await getCoupleDashboard(activeId, claimAs);
  } catch (e) {
    const fallback = await buildLocalWaitingFallback(activeId);
    if (fallback) return fallback;
    throw new Error(mapCoupleCallableError(e));
  }
}

export async function getCoupleCaseForTherapist(coupleId) {
  return api(`/api/v1/couples/${coupleId}/case-for-therapist`);
}

/** Couples assigned to the signed-in therapist (server scopes by therapistId). */
export async function listMyCouples() {
  const rows = await api('/api/v1/couples').catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

// ─── Navigation helpers (pure — unchanged) ────────────────────────────────────
function partnerKeyFromProfile(profile, sessionRole) {
  if (sessionRole === 'partnerB' || sessionRole === 'partnerA') return sessionRole;
  if (profile?.couplePartnerRole === 'partnerB') return 'partnerB';
  return 'partnerA';
}

function coupleNavStateFromClaim(data) {
  if (!data || data.partnerAIntakeComplete === undefined) return null;
  return {
    partnerAIntakeComplete: !!data.partnerAIntakeComplete,
    partnerBIntakeComplete: !!data.partnerBIntakeComplete,
    therapistSelectionUnlocked: !!data.therapistSelectionUnlocked,
    paymentComplete: !!data.paymentComplete,
    therapistId: data.therapistId || null,
  };
}

export function resolveCoupleFunnelScreen(coupleId, partnerKey, navState) {
  const partnerRole = partnerKey === 'partnerB' ? 'partnerB' : 'partnerA';
  const params = { coupleId, partnerRole };
  const myDone = partnerKey === 'partnerA' ? navState.partnerAIntakeComplete : navState.partnerBIntakeComplete;

  if (!myDone) return { screen: 'CoupleIntake', params };
  if (!navState.partnerAIntakeComplete || !navState.partnerBIntakeComplete) {
    if (partnerKey === 'partnerA') return { screen: 'CoupleWaitingPartner', params: { coupleId } };
    return { screen: 'CoupleDashboard', params: { coupleId } };
  }
  if (!navState.therapistSelectionUnlocked) return { screen: 'CoupleDashboard', params: { coupleId } };
  if (!navState.paymentComplete) return { screen: 'Payment', params: { coupleId, therapyType: 'couples' } };
  if (navState.therapistId) return { screen: 'Main', params: {} };
  return { screen: 'MatchTherapist', params: { coupleId, therapyType: 'couples' } };
}

export async function resolveCoupleLandingScreen(profile) {
  const enriched = await enrichCoupleProfile(profile);
  await syncCoupleSessionFromProfile(enriched);
  const hint = await getCoupleIdHint(enriched);
  const likelyCouple = (await isCouplesClient(enriched)) || !!hint;
  const claimAs = enriched?.couplePartnerRole === 'partnerB' ? 'partnerB' : 'partnerA';

  if (!likelyCouple) {
    const probe = await ensureCoupleSession(undefined, { claimAs });
    if (!probe.ok) return null;
  }

  const session = await ensureCoupleSession(hint || undefined, { claimAs });
  if (!session.ok) {
    const coupleId = hint || enriched?.coupleId;
    if (coupleId) {
      const partnerKey = partnerKeyFromProfile(enriched, null);
      await AsyncStorage.multiSet([
        [COUPLE_STORAGE_KEYS.coupleId, coupleId],
        [COUPLE_STORAGE_KEYS.partnerRole, partnerKey],
      ]);
      return { screen: 'CoupleIntake', params: { coupleId, partnerRole: partnerKey } };
    }
    if (session.reason === 'no_couple_for_email') return null;
    return { screen: 'CoupleInitiation', params: {} };
  }

  const coupleId = session.coupleId;
  const partnerKey = partnerKeyFromProfile(enriched, session.partnerRole);
  const navFromClaim = coupleNavStateFromClaim(session);
  if (navFromClaim) return resolveCoupleFunnelScreen(coupleId, partnerKey, navFromClaim);
  if (!session.intakeComplete && !(await isCoupleIntakeDoneLocally())) {
    return { screen: 'CoupleIntake', params: { coupleId, partnerRole: partnerKey } };
  }
  try {
    const navState = await resolveCoupleNavState(coupleId);
    return resolveCoupleFunnelScreen(coupleId, partnerKey, navState);
  } catch {
    return { screen: 'CoupleDashboard', params: { coupleId, partnerRole: partnerKey } };
  }
}

function stackRootNavigation(navigation) {
  let nav = navigation;
  while (nav.getParent?.()) nav = nav.getParent();
  return nav;
}

export async function applyCoupleLandingIfNeeded(navigation, profile, options = {}) {
  const landing = await resolveCoupleLandingScreen(profile);
  if (!landing || landing.screen === 'Main') return false;
  const current = navigation.getState?.();
  const currentRoute = current?.routes?.[current.index]?.name;
  if (options.allowCoupleDashboard && currentRoute === 'CoupleDashboard' && landing.screen === 'CoupleWaitingPartner') {
    return false;
  }
  stackRootNavigation(navigation).replace(landing.screen, landing.params);
  return true;
}

async function resolveCoupleNavState(coupleId, completionResult) {
  if (completionResult?.partnerAIntakeComplete != null) {
    return {
      partnerAIntakeComplete: completionResult.partnerAIntakeComplete,
      partnerBIntakeComplete: completionResult.partnerBIntakeComplete,
      therapistSelectionUnlocked: completionResult.therapistSelectionUnlocked,
      paymentComplete: completionResult.paymentComplete,
      therapistId: completionResult.therapistId,
    };
  }
  const session = await ensureCoupleSession(coupleId);
  const navFromClaim = coupleNavStateFromClaim(session);
  if (navFromClaim) return navFromClaim;
  const dash = await fetchCoupleDashboard(coupleId, { skipEnsure: true });
  const c = dash.couple;
  return {
    partnerAIntakeComplete: !!c.partnerA?.intakeComplete,
    partnerBIntakeComplete: !!c.partnerB?.intakeComplete,
    therapistSelectionUnlocked: !!c.therapistSelectionUnlocked,
    paymentComplete: !!c.paymentComplete,
    therapistId: c.therapistId || null,
  };
}

export async function navigateAfterCoupleIntake(navigation, coupleId, partnerKey, completionResult) {
  const navState = await resolveCoupleNavState(coupleId, completionResult);
  let landing = resolveCoupleFunnelScreen(coupleId, partnerKey, navState);
  if (landing.screen === 'CoupleIntake') {
    const localDone = (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete)) === 'true';
    if (localDone || completionResult?.partnerAIntakeComplete || completionResult?.partnerBIntakeComplete) {
      landing = partnerKey === 'partnerA'
        ? { screen: 'CoupleWaitingPartner', params: { coupleId } }
        : { screen: 'CoupleDashboard', params: { coupleId } };
    }
  }
  let nav = navigation;
  while (nav.getParent?.()) nav = nav.getParent();
  nav.replace(landing.screen, landing.params);
}

// ─── Validation helpers (pure — unchanged) ────────────────────────────────────
export async function createPartnerClientRecord(coupleId, partnerKey, partnerEmail, displayName, authUid) {
  if (!authUid) throw new Error('authUid is required to create a client profile');
  // With the backend, the user account is created via auth/register; just link them to the couple
  await linkCouplePartnerAccount(coupleId, partnerKey, { clientId: authUid, name: displayName });
  return authUid;
}

export function isSectionDataComplete(section, data) {
  if (!data || typeof data !== 'object') return false;
  return Object.keys(validateSection(section, data)).length === 0;
}

export async function findResumeSectionIndex(coupleId, partnerKey, sections) {
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  let saved = { ...(draft.sections || {}) };
  try {
    const priv = await loadPartnerPrivate(coupleId, partnerKey);
    saved = { ...saved, ...(priv.sections || {}) };
  } catch {}
  for (let i = 0; i < sections.length; i++) {
    if (!isSectionDataComplete(sections[i], saved[sections[i].id] || {})) return i;
  }
  return Math.max(0, sections.length - 1);
}

export function isMyCoupleIntakeComplete(dashboardData) {
  if (!dashboardData?.couple || !dashboardData?.myRole) return false;
  const p = dashboardData.couple[dashboardData.myRole];
  return p?.intakeComplete === true && p?.consentComplete === true;
}

export function calculateAgeFromDob(dob) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(String(dob).trim())) return '';
  const today = new Date();
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '';
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

export function validateSection(section, form) {
  const errors = {};
  for (const field of section.fields) {
    if (field.readOnly) continue;
    if (field.type === 'consent_check') { if (field.required && !form[field.name]) errors[field.name] = 'Required'; continue; }
    if (field.type === 'signature') { if (field.required && !String(form[field.name] || '').trim()) errors[field.name] = 'Signature is required'; continue; }
    if (field.name === 'previousCoupleOutcome' && form.previousCoupleCounselling !== 'Yes') continue;
    if (field.name === 'treatmentObjectivesOther') { const sel = form.treatmentObjectives || []; if (!Array.isArray(sel) || !sel.some((v) => /other/i.test(v))) continue; }
    if (field.name === 'infidelityWho' && form.infidelity === 'No') continue;
    if (!field.required) continue;
    const val = form[field.name];
    if (field.type === 'multiselect') { if (!Array.isArray(val) || val.length === 0) errors[field.name] = 'Required'; }
    else if (field.type === 'scale') { if (val === undefined || val === null || val === '') errors[field.name] = 'Required'; }
    else if (field.type === 'number') { if (val === '' || val === undefined || val === null) errors[field.name] = 'Required'; }
    else if (field.type === 'birthdate' || field.type === 'date') {
      if (!String(val || '').trim()) { errors[field.name] = 'Required'; }
      else if (field.name === 'dateOfBirth') { const ageErr = validateAdultDateOfBirth(val, calculateAgeFromDob); if (ageErr) errors[field.name] = ageErr; }
    } else if (!val && val !== 0) { errors[field.name] = 'Required'; }
  }
  return errors;
}

export { sectionsForPartner };
