import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ZC } from '../constants/zencare';
import { api } from '../services/apiClient';
import AiChatScreen from '../screens/shared/AiChatScreen';

/**
 * Floating entry point to the AI assistant.
 *
 * Sits above the dashboard so help is one tap away rather than buried in the
 * drawer. It hides itself entirely when AI is unavailable — a button that
 * opens a sheet saying "not available" is worse than no button.
 *
 * The label is always visible on first render rather than an unexplained
 * sparkle: a patient should know what they are tapping before they tap it.
 */
export default function AiAssistantFab({ clinician = false, bottom = 24 }) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api('/api/v1/ai/status');
        if (!cancelled) setAvailable(Boolean(s?.available));
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!available) return null;

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { bottom }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={clinician ? 'Open AI clinical assistant' : 'Open AI health assistant'}
      >
        <Ionicons name="sparkles" size={18} color="#ffffff" />
        <Text style={styles.fabText}>{clinician ? 'AI Assistant' : 'Ask AI'}</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>
            {clinician ? 'NessaHub Clinical Assistant' : 'NessaHub Assistant'}
          </Text>
          <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={ZC.ink2} />
          </TouchableOpacity>
        </View>
        <View style={styles.sheetBody}>
          <AiChatScreen clinician={clinician} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ZC.accent,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    // Raised, so it reads as floating above the content rather than part of it.
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 18 : 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13,13,13,0.12)',
    backgroundColor: '#ffffff',
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: ZC.ink },
  sheetBody: { flex: 1 },
});
