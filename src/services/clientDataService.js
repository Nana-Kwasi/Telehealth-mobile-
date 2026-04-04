import { auth, db } from './firebaseConfig';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

let clientDataCache = null;
let therapistDataCache = null;

export async function fetchClientData() {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user');
    }

    // Get client ID from multiple sources
    let clientId = await AsyncStorage.getItem('th.clientId');
    
    // If not in AsyncStorage, check auth collection
    if (!clientId) {
      try {
        const authDoc = await getDoc(doc(db, 'auth', currentUser.uid));
        if (authDoc.exists() && authDoc.data().clientId) {
          clientId = authDoc.data().clientId;
          await AsyncStorage.setItem('th.clientId', clientId);
        }
      } catch (error) {
        console.log('Error checking auth collection:', error);
      }
    }
    
    // Fallback to uid if still no clientId
    if (!clientId) {
      clientId = currentUser.uid;
    }
    
    // Fetch client profile data
    let clientDoc = await getDoc(doc(db, 'clients', clientId));
    
    // If not found with clientId, try with uid
    if (!clientDoc.exists() && clientId !== currentUser.uid) {
      clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      if (clientDoc.exists()) {
        clientId = currentUser.uid;
        await AsyncStorage.setItem('th.clientId', clientId);
      }
    }
    
    let clientData = {};
    
    if (clientDoc.exists()) {
      clientData = {
        id: clientDoc.id,
        ...clientDoc.data(),
        email: clientDoc.data().email || currentUser.email,
        name: clientDoc.data().name || clientDoc.data().displayName || currentUser.displayName || 'Client',
      };
    } else {
      // Create basic profile if doesn't exist
      clientData = {
        id: clientId,
        uid: currentUser.uid,
        email: currentUser.email,
        name: currentUser.displayName || 'Client',
        role: 'client',
        status: 'active',
      };
    }
    
    // Fetch assigned therapist if available
    if (clientData.assignedTherapist || clientData.assignedTherapistId) {
      const therapistId = clientData.assignedTherapist || clientData.assignedTherapistId;
      
      // Try therapistt collection first
      let therapistDoc = await getDoc(doc(db, 'therapistt', therapistId));
      
      if (!therapistDoc.exists()) {
        // Try therapists collection
        therapistDoc = await getDoc(doc(db, 'therapists', therapistId));
      }
      
      if (therapistDoc.exists()) {
        therapistDataCache = {
          id: therapistDoc.id,
          ...therapistDoc.data(),
        };
        clientData.therapist = therapistDataCache;
      }
    }
    
    // Cache the data
    clientDataCache = clientData;
    await AsyncStorage.setItem('clientData', JSON.stringify(clientData));
    if (therapistDataCache) {
      await AsyncStorage.setItem('therapistData', JSON.stringify(therapistDataCache));
    }
    
    return clientData;
  } catch (error) {
    console.error('Error fetching client data:', error);
    throw error;
  }
}

export function getCachedClientData() {
  return clientDataCache;
}

export function getCachedTherapistData() {
  return therapistDataCache;
}

export async function refreshClientData() {
  clientDataCache = null;
  therapistDataCache = null;
  return await fetchClientData();
}

// Subscribe to client data changes
export function subscribeToClientData(callback) {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  let clientId = null;
  
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    
    try {
      clientId = await AsyncStorage.getItem('th.clientId') || user.uid;
      const clientDoc = doc(db, 'clients', clientId);
      
      return onSnapshot(clientDoc, (snapshot) => {
        if (snapshot.exists()) {
          const data = {
            id: snapshot.id,
            ...snapshot.data(),
          };
          clientDataCache = data;
          callback(data);
        }
      });
    } catch (error) {
      console.error('Error subscribing to client data:', error);
    }
  });
  
  return unsubscribe;
}
