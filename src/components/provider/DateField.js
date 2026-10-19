import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

/**
 * A date you pick from a calendar instead of typing. Value is 'YYYY-MM-DD'.
 * iOS: a sheet with the calendar and Done. Android: the system date dialog.
 */
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s) => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1) : new Date(); };

export default function DateField({ label, value, onChange, accent = '#0c4a6e', minimumDate, maximumDate }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(fromIso(value));
  const shown = value ? fromIso(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose date';

  const show = () => { setDraft(fromIso(value)); setOpen(true); };

  return (
    <View style={{ flex: 1 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TouchableOpacity style={s.field} onPress={show} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${label || 'Date'}: ${shown}`}>
        <Ionicons name="calendar-outline" size={17} color={accent} />
        <Text style={s.value} numberOfLines={1}>{shown}</Text>
        <Ionicons name="chevron-down" size={15} color="#94a3b8" />
      </TouchableOpacity>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker value={draft} mode="date" display="calendar" minimumDate={minimumDate} maximumDate={maximumDate}
          onChange={(e, d) => { setOpen(false); if (e.type === 'set' && d) onChange(toIso(d)); }} />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <TouchableOpacity onPress={() => setOpen(false)}><Text style={s.cancel}>Cancel</Text></TouchableOpacity>
              <Text style={s.sheetTitle}>{label || 'Choose date'}</Text>
              <TouchableOpacity onPress={() => { onChange(toIso(draft)); setOpen(false); }}><Text style={[s.done, { color: accent }]}>Done</Text></TouchableOpacity>
            </View>
            {/* Pinned light: the picker follows the system theme and drew light text on this white sheet in dark mode. */}
            <DateTimePicker value={draft} mode="date" display="inline" themeVariant="light" accentColor={accent}
              minimumDate={minimumDate} maximumDate={maximumDate} onChange={(e, d) => d && setDraft(d)} />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 10 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff' },
  value: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0f172a' },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 28, paddingHorizontal: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cancel: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  done: { fontSize: 15, fontWeight: '800' },
});
