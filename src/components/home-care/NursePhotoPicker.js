import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadNursePhoto } from '../../services/homeCareService';
import { useHomeCareNurse } from '../../contexts/HomeCareNurseContext';
import { HomeCareColors as C } from '../../constants/homeCareColors';
import NurseAvatar from './NurseAvatar';

export default function NursePhotoPicker({ nurse, size = 56, style }) {
  const { profile, nurse: ctxNurse, setNurse } = useHomeCareNurse();
  const display = nurse || ctxNurse;
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const nurseId = await AsyncStorage.getItem('th.userId') || profile?.id;
    if (!nurseId) {
      Alert.alert('Error', 'You must be signed in to upload a photo.');
      return;
    }

    setUploading(true);
    try {
      const photoURL = await uploadNursePhoto(nurseId, result.assets[0].uri);
      setNurse((prev) => ({ ...(prev || display || {}), photoURL }));
    } catch (e) {
      const msg = e?.message || 'Upload failed.';
      Alert.alert(
        'Upload failed',
        msg.includes('storage/unauthorized')
          ? 'Storage permission denied. Deploy Firebase storage rules (homeCare/nurses path).'
          : msg
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.wrap, style]}
      onPress={pickPhoto}
      disabled={uploading}
      activeOpacity={0.85}
      accessibilityLabel="Change profile photo"
    >
      <NurseAvatar nurse={display} size={size} />
      <View style={styles.badge}>
        {uploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="camera" size={14} color="#fff" />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.primaryDark,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
