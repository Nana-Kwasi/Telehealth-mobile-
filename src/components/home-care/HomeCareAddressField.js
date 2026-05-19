import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getCurrentLocationMobile,
  reverseGeocodeMobile,
} from '../../services/homeCareService';
import { HomeCareColors as C } from '../../constants/homeCareColors';
import { hc } from './homeCareStyles';

/**
 * Visit address: tries GPS + reverse-geocode on mount (optional), always allows manual edit.
 */
export default function HomeCareAddressField({
  label = 'Visit address *',
  address,
  onAddressChange,
  coords,
  onCoordsChange,
  detectOnMount = true,
}) {
  const [locLoading, setLocLoading] = useState(false);
  const [locFailed, setLocFailed] = useState(false);
  const [detected, setDetected] = useState(false);

  const detectLocation = useCallback(async () => {
    setLocLoading(true);
    setLocFailed(false);
    try {
      const loc = await getCurrentLocationMobile();
      if (!loc) {
        setLocFailed(true);
        return;
      }
      onCoordsChange?.(loc);
      const labelText = await reverseGeocodeMobile(loc.latitude, loc.longitude);
      if (labelText) {
        onAddressChange(labelText);
        setDetected(true);
      } else {
        setLocFailed(true);
      }
    } catch {
      setLocFailed(true);
    } finally {
      setLocLoading(false);
    }
  }, [onAddressChange, onCoordsChange]);

  useEffect(() => {
    if (detectOnMount) detectLocation();
  }, [detectOnMount, detectLocation]);

  const onManualChange = (text) => {
    onAddressChange(text);
    if (detected) setDetected(false);
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={hc.label}>{label}</Text>
      {locLoading ? (
        <View style={[hc.row, { marginBottom: 8 }]}>
          <ActivityIndicator size="small" color={C.primary} />
          <Text style={[hc.sub, { marginLeft: 8 }]}>Detecting your location…</Text>
        </View>
      ) : null}
      {!locLoading && locFailed && !address.trim() ? (
        <Text style={[hc.sub, { color: '#b45309', marginBottom: 6 }]}>
          Location unavailable — type your address below or tap Use my location.
        </Text>
      ) : null}
      {!locLoading && detected && address ? (
        <Text style={[hc.sub, { marginBottom: 6, color: '#047857' }]}>
          Location detected — edit the address if needed.
        </Text>
      ) : null}
      <TextInput
        style={[hc.input, { minHeight: 60 }]}
        multiline
        value={address}
        onChangeText={onManualChange}
        placeholder="House number, street, area, city"
        editable={!locLoading}
      />
      <TouchableOpacity
        style={[hc.btnOutline, { marginTop: 8, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
        onPress={detectLocation}
        disabled={locLoading}
      >
        <Ionicons name="locate-outline" size={18} color={C.primary} />
        <Text style={hc.btnOutlineText}>{locLoading ? 'Detecting…' : 'Use my location'}</Text>
      </TouchableOpacity>
    </View>
  );
}
