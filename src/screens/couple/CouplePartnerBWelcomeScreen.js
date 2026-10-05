import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../constants/colors';

export default function CouplePartnerBWelcomeScreen({ navigation, route }) {
  const {
    coupleId,
    token,
    partnerAName = 'Your partner',
    partnerBEmail = '',
    partnerBName = '',
    draftToken,
  } = route.params || {};

  // A draft invite has no couple record and no account yet — B is being asked
  // to join a sign-up that has not been paid for. They set a password and do
  // their intake; the accounts are created when partner A completes payment.
  const isDraft = Boolean(draftToken || (!coupleId && token));
  const inviteToken = draftToken || token;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Couples therapy invitation</Text>
      </View>

      <Text style={styles.title}>Join {partnerAName}</Text>
      <Text style={styles.subtitle}>
        <Text style={styles.bold}>{partnerAName}</Text> has started couples therapy on NessaHub and invited you to join
        them.
      </Text>
      <Text style={styles.body}>
        You will create your own account with your own email and password. Then you will complete a short private
        intake form.
      </Text>

      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>Completely confidential</Text>
        <Text style={styles.privacyText}>
          Your answers are private. {partnerAName} will never see what you write. Only your shared therapist can read
          your individual responses.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => {
          if (isDraft) {
            // Straight to the intake, carrying the token. No account is created
            // here — the old path sent B to SignUp, which registered them
            // before anyone had paid.
            navigation.navigate('CoupleAcceptInvite', {
              draftToken: inviteToken,
              partnerBEmail,
              partnerBName,
              partnerAName,
            });
            return;
          }
          navigation.navigate('SignUp', {
            clientData: {
              therapyType: 'couples',
              coupleId,
              couplePartnerRole: 'partnerB',
              email: partnerBEmail,
              displayName: partnerBName,
              name: partnerBName,
              inviteToken: token,
              lockEmail: true,
              invitePartnerName: partnerAName,
            },
          });
        }}
      >
        <Text style={styles.primaryBtnText}>
          {isDraft ? 'Accept invitation' : 'Create my account'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.ghostBtn}
        onPress={() =>
          navigation.navigate('Login', {
            coupleResume: true,
            coupleId,
            partnerRole: 'partnerB',
          })
        }
      >
        <Text style={styles.ghostBtnText}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: Colors.background, justifyContent: 'center' },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  badgeText: { color: '#047857', fontWeight: '700', fontSize: 12 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, lineHeight: 24, marginBottom: 12 },
  bold: { fontWeight: '700', color: Colors.text },
  body: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 20 },
  privacyBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
  },
  privacyTitle: { fontWeight: '800', color: '#92400e', marginBottom: 8, fontSize: 15 },
  privacyText: { color: '#92400e', lineHeight: 20, fontSize: 14 },
  primaryBtn: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: Colors.surface, fontWeight: '700', fontSize: 17 },
  ghostBtn: { padding: 12, alignItems: 'center' },
  ghostBtnText: { color: Colors.primary, fontWeight: '600' },
});
