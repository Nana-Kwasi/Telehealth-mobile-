import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api } from '../../services/apiClient';
import { COUPLE_STORAGE_KEYS } from '../../constants/coupleTherapyConfig';

/**
 * Partner B accepts a couple invitation.
 *
 * B has no account and does not get one here. They choose a password, which is
 * stored — hashed — on the draft, and go on to their own private intake. Both
 * accounts are created together when partner A pays for the first session.
 *
 * The old path sent B to the normal sign-up screen, which registered them
 * immediately. That left a real account behind whenever a couple did not go
 * through with it, and meant B could end up registered for a service nobody had
 * paid for.
 */
export default function CoupleAcceptInviteScreen({ navigation, route }) {
  const {
    draftToken,
    partnerBEmail = '',
    partnerBName = '',
    partnerAName = 'Your partner',
  } = route.params || {};

  const [name, setName] = useState(partnerBName);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if (!name.trim()) { Alert.alert('Your name', 'Please enter your full name.'); return; }
    if (password.length < 8) { Alert.alert('Password', 'Use at least 8 characters.'); return; }
    if (password !== confirm) { Alert.alert('Password', 'Those passwords do not match.'); return; }

    setBusy(true);
    try {
      await api('/api/v1/couples/drafts/accept', {
        method: 'POST',
        authenticated: false,
        body: { token: draftToken, password, name: name.trim() },
      });

      // Local breadcrumbs only — there is still no session, because there is
      // still no account.
      await AsyncStorage.multiSet([
        [COUPLE_STORAGE_KEYS.inviteToken, draftToken],
        [COUPLE_STORAGE_KEYS.partnerRole, 'partnerB'],
        [COUPLE_STORAGE_KEYS.myPartnerName, name.trim()],
        [COUPLE_STORAGE_KEYS.otherPartnerName, partnerAName],
      ]);

      navigation.replace('CoupleIntake', { draftToken, partnerRole: 'partnerB' });
    } catch (e) {
      Alert.alert('Could not accept', e?.message || 'Please try again.');
      setBusy(false);
    }
  };

  return (
    <ZCGround>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          <View style={zcStyles.badge}>
            <Text style={zcStyles.badgeText}>Couple therapy</Text>
          </View>

          <Text style={[zcStyles.display, styles.title]}>
            {partnerAName} invited you
          </Text>
          <Text style={[zcStyles.body, styles.lead]}>
            Choose a password and complete your own private intake. {partnerAName} will
            never see your answers. Your account is created once the first session is
            paid for.
          </Text>

          <View style={[styles.card, glassStyle]}>
            <GlassFill />
            <Text style={zcStyles.eyebrow}>Your details</Text>

            <Text style={zcStyles.label}>Full name</Text>
            <TextInput
              style={zcStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={ZC.ink4}
            />

            <Text style={zcStyles.label}>Email</Text>
            {/* Fixed: the invitation was addressed to this mailbox, and letting
                it be edited would detach the acceptance from the invite. */}
            <TextInput
              style={[zcStyles.input, styles.locked]}
              value={partnerBEmail}
              editable={false}
            />

            <Text style={zcStyles.label}>Password</Text>
            <TextInput
              style={zcStyles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={ZC.ink4}
              secureTextEntry
            />

            <Text style={zcStyles.label}>Confirm password</Text>
            <TextInput
              style={zcStyles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat your password"
              placeholderTextColor={ZC.ink4}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[zcStyles.btnPrimary, busy && { opacity: 0.6 }]}
            onPress={accept}
            disabled={busy}
          >
            <Text style={zcStyles.btnPrimaryText}>
              {busy ? 'Accepting…' : 'Accept and continue'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ZCGround>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  title: { marginTop: 12 },
  lead: { marginBottom: 4 },
  card: { borderRadius: 20, padding: 18, gap: 8 },
  locked: { opacity: 0.7 },
});
