import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadNurseDocument, fetchNurseProfile } from '../../../services/homeCareService';
import NursePageHeader from '../../../components/home-care/NursePageHeader';
import { hc } from '../../../components/home-care/homeCareStyles';

export default function NurseDocumentsScreen({ profile, embedded = false }) {
  const [nurse, setNurse] = useState(profile);
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = async (type) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Allow photo access to upload documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      await uploadNurseDocument(profile.id, type, result.assets[0].uri);
      setNurse(await fetchNurseProfile(profile.id));
      Alert.alert('Uploaded', 'Document submitted for admin review.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const body = (
    <>
      {embedded ? (
        <Text style={[hc.sub, { marginBottom: 8 }]}>Status: {nurse?.documentsStatus || 'not submitted'}</Text>
      ) : null}
      <View style={hc.card}>
        <Text style={hc.sub}>License: {nurse?.licenseVerified ? 'Verified' : 'Pending'}</Text>
        {nurse?.licenseDocUrl ? (
          <TouchableOpacity onPress={() => Linking.openURL(nurse.licenseDocUrl)}>
            <Text style={{ color: '#0d9488', fontWeight: '700' }}>View license document</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[hc.btn, { marginTop: 10 }, uploading && { opacity: 0.6 }]} onPress={() => pickAndUpload('license')} disabled={uploading}>
          <Text style={hc.btnText}>Upload license</Text>
        </TouchableOpacity>
      </View>
      <View style={hc.card}>
        {nurse?.idDocUrl ? (
          <TouchableOpacity onPress={() => Linking.openURL(nurse.idDocUrl)}>
            <Text style={{ color: '#0d9488', fontWeight: '700' }}>View ID document</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[hc.btnOutline, uploading && { opacity: 0.6 }]} onPress={() => pickAndUpload('id')} disabled={uploading}>
          <Text style={hc.btnOutlineText}>Upload ID</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (embedded) return <View>{body}</View>;

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="Verification documents" subtitle={`Status: ${nurse?.documentsStatus || 'not submitted'}`} />
      {body}
    </ScrollView>
  );
}
