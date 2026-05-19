import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { submitPatientFeedback } from '../../../services/homeCareService';
import { hc } from '../../../components/home-care/homeCareStyles';

export default function HomeCareFeedbackScreen({ navigation, route }) {
  const { bookingId } = route.params;
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await submitPatientFeedback(bookingId, {
        rating,
        review: review.trim(),
        punctual: true,
        professional: true,
        wouldRebook: rating >= 4,
        createdAt: new Date().toISOString(),
      });
      Alert.alert('Thank you', 'Your feedback was submitted.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not submit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Leave feedback</Text>
      <Text style={hc.label}>Rating (1–5)</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => setRating(n)}>
            <Text style={{ fontSize: 28 }}>{n <= rating ? '★' : '☆'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={hc.label}>Review (optional)</Text>
      <TextInput style={[hc.input, { minHeight: 100 }]} multiline value={review} onChangeText={setReview} />
      <TouchableOpacity style={[hc.btn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        <Text style={hc.btnText}>Submit feedback</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
