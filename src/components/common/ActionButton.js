// ─── ActionButton (mobile) ───────────────────────────────────────────────────
// Mobile counterpart of the web ActionButton, with the same contract: give it an
// async `onPress` and it shows a spinner, blocks repeat taps, and re-enables
// itself when the promise settles.
//
// Repeat taps matter more here than on web — a slow network plus an unchanged
// button is exactly how a client ends up booking the same session twice.
//
//   <ActionButton onPress={save} label="Save changes" />
//   <ActionButton variant="danger" label="Delete" busyLabel="Deleting…" onPress={remove} />

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PALETTE = {
  primary:   { bg: '#4f46e5', fg: '#ffffff', border: 'transparent' },
  secondary: { bg: '#ffffff', fg: '#334155', border: '#e2e8f0' },
  danger:    { bg: '#dc2626', fg: '#ffffff', border: 'transparent' },
  ghost:     { bg: 'transparent', fg: '#475569', border: 'transparent' },
};

export default function ActionButton({
  onPress,
  label,
  busyLabel,
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon = null,
  style,
  textStyle,
}) {
  const [busy, setBusy] = useState(false);
  // Saving after the screen has been popped warns and leaks — track liveness.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const handlePress = useCallback(async () => {
    if (busy || disabled || typeof onPress !== 'function') return;
    setBusy(true);
    try {
      await onPress();
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, disabled, onPress]);

  const colors = PALETTE[variant] || PALETTE.primary;
  const isSm = size === 'sm';

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={busy || disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy || disabled }}
      style={[
        styles.base,
        isSm ? styles.sm : styles.md,
        { backgroundColor: colors.bg, borderColor: colors.border },
        (busy || disabled) && styles.dimmed,
        style,
      ]}
    >
      <View style={styles.row}>
        {busy && <ActivityIndicator size="small" color={colors.fg} style={styles.spinner} />}
        {!busy && icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text
          style={[styles.label, isSm && styles.labelSm, { color: colors.fg }, textStyle]}
          numberOfLines={1}
        >
          {busy ? (busyLabel || label) : label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: { paddingVertical: 14, paddingHorizontal: 20 },
  sm: { paddingVertical: 9, paddingHorizontal: 14 },
  // Busy and disabled read the same here; the spinner is what distinguishes them.
  dimmed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spinner: { marginRight: 2 },
  icon: { marginRight: 2 },
  label: { fontSize: 15, fontWeight: '700' },
  labelSm: { fontSize: 13 },
});
