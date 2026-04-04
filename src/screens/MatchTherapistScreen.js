import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';

const MatchTherapistScreen = ({ navigation }) => {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTherapists();
  }, []);

  const calculateRelevanceScore = (therapist, data) => {
    let score = 50;
    
    // Role bonus (admin therapists get highest scores)
    if (therapist.role === 'admin') score += 25;
    else if (therapist.role === 'therapist') score += 15;
    else if (therapist.role === 'user') score += 10;
    
    // Type match
    if (therapist.type && data.therapyType) {
      if (therapist.type.toLowerCase().includes(data.therapyType)) score += 10;
    }
    
    // Religious match
    if (data.preferChristianTherapist === 'Yes' && therapist.religion === 'Christianity') {
      score += 8;
    }
    
    // Gender preference match
    if (data.therapistGender && data.therapistGender !== 'No preference') {
      if (therapist.gender && therapist.gender.toLowerCase() === data.therapistGender.toLowerCase()) {
        score += 5;
      }
    }
    
    // LGBTQIA+ match
    if (data.lgbtqia === 'Yes, this is important to me' && therapist.lgbtqiaAffirming) {
      score += 7;
    }
    
    // Experience bonus
    if (therapist.yearsExperience) {
      score += Math.min(therapist.yearsExperience, 20) * 0.5;
    }
    
    return score;
  };

  const loadTherapists = async () => {
    try {
      setLoading(true);
      const questionnaireData = await AsyncStorage.getItem('th.onboard');
      const clientId = await AsyncStorage.getItem('th.clientId');
      const data = questionnaireData ? JSON.parse(questionnaireData) : {};

      // Try therapists collection first, then therapistt
      let therapistsRef = collection(db, 'therapists');
      let snapshot = await getDocs(therapistsRef);
      
      if (snapshot.empty) {
        therapistsRef = collection(db, 'therapistt');
        snapshot = await getDocs(therapistsRef);
      }
      
      const allTherapists = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Enhanced matching based on questionnaire data (matching web version)
      const filtered = allTherapists.filter((t) => {
        // Basic type matching
        const typeMatch = !data.therapyType || 
          (t.type || '').toLowerCase().includes(data.therapyType);
        
        // Religious preference matching
        const christianPref = data.preferChristianTherapist === 'Yes';
        const religionMatch = !christianPref || 
          (t.religion || '').toLowerCase() === 'christianity';
        
        // Gender preference matching
        const genderPref = data.therapistGender;
        const genderMatch = !genderPref || genderPref === 'No preference' || 
          (t.gender || '').toLowerCase() === genderPref.toLowerCase();
        
        // LGBTQIA+ preference matching
        const lgbtqiaPref = data.lgbtqia;
        const lgbtqiaMatch = !lgbtqiaPref || lgbtqiaPref === 'No preference' || 
          (t.lgbtqiaAffirming === true);
        
        return typeMatch && religionMatch && genderMatch && lgbtqiaMatch;
      });
      
      // Sort by relevance score (matching web version)
      const scored = filtered.map(t => ({
        ...t,
        score: calculateRelevanceScore(t, data)
      }));
      
      scored.sort((a, b) => b.score - a.score);
      setTherapists(scored);
    } catch (error) {
      console.error('Error loading therapists:', error);
      setTherapists([]);
    } finally {
      setLoading(false);
    }
  };

  const chooseTherapist = async (therapist) => {
    try {
      const user = auth.currentUser;
      const clientId = await AsyncStorage.getItem('th.clientId');

      if (user && clientId) {
        // Update client document with therapist assignment (matching web version)
        await setDoc(doc(db, 'clients', clientId), {
          assignedTherapistId: therapist.id,
          assignedTherapistName: therapist.name,
          assignedAt: new Date().toISOString(),
        }, { merge: true });

        // Add client to therapist's clients subcollection (matching web version)
        await setDoc(doc(db, 'therapists', therapist.id, 'clients', clientId), {
          clientId: clientId,
          assignedAt: new Date().toISOString(),
        });
      }

      // Navigate to dashboard after therapist selection (matching web version)
      navigation.replace('Main');
    } catch (error) {
      console.error('Error assigning therapist:', error);
      Alert.alert('Error', 'There was an error assigning your therapist. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading therapists...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Choose your therapist</Text>
      <Text style={styles.subtitle}>We matched options based on your preferences</Text>

      {therapists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No matches found. We'll assign the best available therapist shortly.</Text>
        </View>
      ) : (
        <View style={styles.therapistsList}>
          {therapists.map((therapist) => (
            <TouchableOpacity
              key={therapist.id}
              style={styles.therapistCard}
              onPress={() => chooseTherapist(therapist)}
            >
              <View style={styles.therapistHeader}>
                {therapist.photoURL ? (
                  <Image source={{ uri: therapist.photoURL }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>🧑‍⚕️</Text>
                  </View>
                )}
                <View style={styles.therapistInfo}>
                  <Text style={styles.therapistName}>{therapist.name}</Text>
                  <Text style={styles.therapistType}>{therapist.type || 'Therapist'}</Text>
                  {therapist.yearsExperience && (
                    <Text style={styles.therapistExp}>{therapist.yearsExperience} years experience</Text>
                  )}
                </View>
              </View>
              {therapist.specialties && therapist.specialties.length > 0 && (
                <Text style={styles.specialties}>
                  Specialties: {Array.isArray(therapist.specialties) ? therapist.specialties.join(', ') : therapist.specialties}
                </Text>
              )}
              {therapist.languagesSpoken && therapist.languagesSpoken.length > 0 && (
                <Text style={styles.languages}>
                  Languages: {Array.isArray(therapist.languagesSpoken) ? therapist.languagesSpoken.join(', ') : therapist.languagesSpoken}
                </Text>
              )}
              {therapist.score && (
                <View style={styles.matchScore}>
                  <Text style={styles.matchScoreText}>Match: {Math.round(therapist.score)}%</Text>
                </View>
              )}
              <TouchableOpacity 
                style={styles.selectButton}
                onPress={() => chooseTherapist(therapist)}
              >
                <Text style={styles.selectButtonText}>Select This Therapist</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  therapistsList: {
    gap: 16,
  },
  therapistCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  therapistHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 30,
  },
  therapistInfo: {
    flex: 1,
  },
  therapistName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  therapistType: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  therapistExp: {
    fontSize: 12,
    color: Colors.textLight,
  },
  specialties: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  languages: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  matchScore: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  matchScoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  selectButton: {
    backgroundColor: Colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default MatchTherapistScreen;
