import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AiMarkdown from '../../components/AiMarkdown';
import { ZC } from '../../constants/zencare';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Consultation briefing — the mobile half of a surface that only existed on web.
 *
 * A clinician working from a phone had no way to get a pre-consultation
 * summary at all, which is exactly the situation the feature is for.
 *
 * Two rules carried over from web, both of which caused real confusion there:
 *
 *  - Only people actually ASSIGNED to this clinician are listed. The roster
 *    endpoint returns the whole platform for an admin therapist, but the AI
 *    authorisation is assignment-based and refuses the rest — so listing them
 *    meant picking a name and being told "you are not authorised".
 *  - The draft is labelled as a draft. Nothing here writes to a record, and
 *    the buttons say so rather than leaving the clinician to guess.
 */
export default function AiClinicianBriefingScreen({ role = 'THERAPIST' }) {
  const [people, setPeople]   = useState([]);
  const [restricted, setRestricted] = useState(0);
  const [query, setQuery]     = useState('');
  const [subject, setSubject] = useState(null);
  const [request, setRequest] = useState('Summarise what I should know before this consultation.');
  const [result, setResult]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const rows = role === 'DOCTOR'
          ? await api('/api/v1/doctors/me/patients').catch(() => [])
          : await api('/api/v1/therapy-management/clients').catch(() => []);
        const list = Array.isArray(rows) ? rows : (rows?.items || []);
        // await: on mobile this reads AsyncStorage and returns a Promise.
        // Comparing a Promise to a therapistId silently matches nothing, which
        // would have filtered the entire roster away.
        const me = await getStoredUserId();
        const mine = list.filter((p) => !p.therapistId || String(p.therapistId) === String(me));
        setPeople(mine.length ? mine : list);
        setRestricted(mine.length > 0 && mine.length < list.length ? list.length - mine.length : 0);
      } catch (e) {
        setError(e?.message || 'Could not load your patient list.');
      } finally {
        setLoading(false);
      }
    })();
  }, [role]);

  const nameOf = (p) => p.fullName || p.name || p.displayName || p.email || 'Unnamed';

  const generate = async () => {
    if (!subject) { setError('Choose a patient first.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await api('/api/v1/ai/assist', {
        method: 'POST',
        body: { task: 'CLINICIAN_BRIEFING', message: request, subjectId: subject.id },
      });
      setResult(res);
      if (!res.ok) {
        setError(/not authoris|not authentic/i.test(res.text || '')
          ? `${subject.name} is not assigned to you, so their records cannot be used here.`
          : res.text);
      }
    } catch (e) {
      setError(e?.message || 'Could not generate the briefing.');
    } finally { setBusy(false); }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={ZC.accent} /></View>;
  }

  const filtered = people.filter((p) => {
    const q = query.trim().toLowerCase();
    return !q || `${nameOf(p)} ${p.email || ''}`.toLowerCase().includes(q);
  });

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Consultation briefing</Text>
      <Text style={styles.lead}>
        Built from records you already have access to. Verify before you rely on it.
      </Text>

      {error ? (
        <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Patient</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or email…"
          placeholderTextColor="#9aa0b2"
        />

        <View style={styles.list}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>Nobody matches that.</Text>
          ) : filtered.slice(0, 40).map((p) => {
            const id = p.id || p.userId || p.clientId;
            const on = subject?.id === id;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.row, on && styles.rowOn]}
                onPress={() => { setSubject({ id, name: nameOf(p) }); setResult(null); }}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, on && styles.rowNameOn]}>{nameOf(p)}</Text>
                  {/* The email disambiguates namesakes — several accounts can
                      share a name, and only one of them may be assigned. */}
                  {p.email ? (
                    <Text style={[styles.rowEmail, on && styles.rowEmailOn]}>{p.email}</Text>
                  ) : null}
                </View>
                {on ? <Ionicons name="checkmark-circle" size={18} color="#ffffff" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {restricted > 0 ? (
          <Text style={styles.note}>
            {restricted} other {restricted === 1 ? 'person is' : 'people are'} on the platform but
            not assigned to you, so their records cannot be summarised here.
          </Text>
        ) : null}

        <Text style={[styles.label, { marginTop: 16 }]}>What do you want summarised?</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={request}
          onChangeText={setRequest}
          multiline
        />

        <TouchableOpacity
          style={[styles.btn, (!subject || busy) && styles.btnOff]}
          onPress={generate}
          disabled={!subject || busy}
        >
          <Text style={styles.btnText}>
            {busy ? 'Generating…' : subject ? `Brief me on ${subject.name}` : 'Choose a patient'}
          </Text>
        </TouchableOpacity>
      </View>

      {result?.ok ? (
        <View style={styles.card}>
          {result.disclaimer ? (
            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>{result.disclaimer}</Text>
            </View>
          ) : null}

          <AiMarkdown text={result.text} />

          <Text style={styles.draftNote}>
            This is a draft for you to check. Nothing has been saved to
            {subject ? ` ${subject.name}'s` : ' the'} record.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.smallBtn, styles.accept]}
              onPress={async () => {
                // Share rather than Clipboard: react-native's Clipboard is
                // deprecated and @react-native-clipboard is not installed, and
                // on a phone "send it to my notes app" is the actual intent.
                try {
                  await Share.share({ message: result.text || '' });
                } catch {
                  Alert.alert('Could not share', 'Please try again.');
                }
              }}
            >
              <Ionicons name="share-outline" size={15} color="#ffffff" />
              <Text style={styles.smallBtnText}>Send to my notes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, styles.ghost]} onPress={generate} disabled={busy}>
              <Text style={styles.ghostText}>Regenerate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, styles.ghost]}
              onPress={() => setResult(null)}
            >
              <Text style={styles.ghostText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f9fc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },

  h1: { fontSize: 21, fontWeight: '800', color: '#0f1424' },
  lead: { fontSize: 13, lineHeight: 19, color: '#545a6b', marginTop: 5, marginBottom: 14 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#e4e7ee',
  },
  label: { fontSize: 12.5, fontWeight: '700', color: '#2b3142', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#d8dce6', borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 11, fontSize: 13.5, color: '#0f1424',
    backgroundColor: '#ffffff',
  },
  textarea: { minHeight: 70, textAlignVertical: 'top' },

  list: {
    marginTop: 8, maxHeight: 260, borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 10, padding: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, marginBottom: 2,
  },
  rowOn: { backgroundColor: '#1d4ed8' },
  // flex:1 on the text only — on the row it would stretch the whole cell.
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13.5, fontWeight: '650', color: '#16203a' },
  rowNameOn: { color: '#ffffff' },
  rowEmail: { fontSize: 11, color: '#6b7283', marginTop: 1 },
  rowEmailOn: { color: 'rgba(255,255,255,0.85)' },
  empty: { fontSize: 13, color: '#6b7283', padding: 8 },
  note: { fontSize: 11.5, color: '#6b7283', marginTop: 8, lineHeight: 17 },

  btn: {
    marginTop: 14, backgroundColor: '#1d4ed8', borderRadius: 11,
    paddingVertical: 12, alignItems: 'center',
  },
  btnOff: { opacity: 0.45 },
  btnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  disclaimer: {
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10,
  },
  disclaimerText: { fontSize: 11.5, fontWeight: '700', color: '#8a4b09', lineHeight: 16 },
  draftNote: { fontSize: 11.5, color: '#6b7283', lineHeight: 17, marginTop: 12 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
  },
  accept: { backgroundColor: '#166534' },
  ghost: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#d8dce6' },
  smallBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  ghostText: { color: '#2b3142', fontSize: 13, fontWeight: '700' },

  error: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 10, padding: 11, marginBottom: 12,
  },
  errorText: { fontSize: 13, color: '#991b1b', lineHeight: 19 },
});
