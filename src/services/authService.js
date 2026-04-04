import { auth, db } from './firebaseConfig';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where, addDoc, serverTimestamp } from 'firebase/firestore';

export async function signInWithEmailOrUsername(identifier, password) {
  try {
    const looksLikeEmail = /@/.test(identifier);
    if (looksLikeEmail) {
      try {
        const res = await signInWithEmailAndPassword(auth, identifier, password);
        const roleResult = await resolveRole(res.user.uid);
        return roleResult;
      } catch (e) {
        throw e;
      }
    }
    
    const userDoc = await findUserByUsernameOrEmail(identifier);
    if (!userDoc) {
      throw new Error('User not found');
    }
    
    const { email } = userDoc;
    const res = await signInWithEmailAndPassword(auth, email, password);
    const roleResult = await resolveRole(res.user.uid);
    
    return roleResult;
  } catch (error) {
    throw error;
  }
}

export async function resolveRole(uid) {
  // Check doctors collection
  const doctorRef = doc(db, 'doctors', uid);
  const doctorSnap = await getDoc(doctorRef);

  if (doctorSnap.exists()) {
    return {
      role: 'doctor',
      profile: {
        id: doctorSnap.id,
        ...doctorSnap.data(),
        role: 'doctor'
      }
    };
  }

  // Check therapists collection
  const therapistRef = doc(db, 'therapists', uid);
  const therapistSnap = await getDoc(therapistRef);

  if (therapistSnap.exists()) {
    return {
      role: 'therapist',
      profile: {
        id: therapistSnap.id,
        ...therapistSnap.data()
      }
    };
  }

  // Check auth collection for clients
  const authRef = doc(db, 'auth', uid);
  const authSnap = await getDoc(authRef);

  if (authSnap.exists()) {
    const authData = authSnap.data();
    let clientStatus = authData.status || 'active';

    if (authData.clientId) {
      try {
        const clientRef = doc(db, 'clients', authData.clientId);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const clientData = clientSnap.data();
          clientStatus = clientData.status || clientStatus;
        }
      } catch (error) {
        console.log('Error checking clients collection:', error);
      }
    }

    if (clientStatus !== 'active') {
      throw new Error('Your account is not active. Please contact your therapist or administrator for assistance.');
    }

    return {
      role: 'client',
      profile: {
        id: authSnap.id,
        ...authData,
        status: clientStatus,
        // Preserve userIntent if set (therapy or medical)
        userIntent: authData.userIntent || 'therapy'
      }
    };
  }

  return { role: 'guest', profile: null };
}

export async function findUserByUsernameOrEmail(identifier) {
  // Check auth collection for clients
  const cQ = query(collection(db, 'auth'), where('username', '==', identifier));
  const cR = await getDocs(cQ);
  if (!cR.empty) return { id: cR.docs[0].id, ...cR.docs[0].data() };

  const cQE = query(collection(db, 'auth'), where('email', '==', identifier));
  const cRE = await getDocs(cQE);
  if (!cRE.empty) return { id: cRE.docs[0].id, ...cRE.docs[0].data() };

  // Check doctors collection (to detect and reject on mobile)
  const dQ = query(collection(db, 'doctors'), where('username', '==', identifier));
  const dR = await getDocs(dQ);
  if (!dR.empty) return { id: dR.docs[0].id, ...dR.docs[0].data() };

  const dQE = query(collection(db, 'doctors'), where('email', '==', identifier));
  const dRE = await getDocs(dQE);
  if (!dRE.empty) return { id: dRE.docs[0].id, ...dRE.docs[0].data() };

  return null;
}

export async function logUserLogout(userId, userRole, profile) {
  try {
    const logoutLog = {
      userId,
      userRole,
      profile: profile || {},
      logoutTime: new Date().toISOString(),
      timestamp: serverTimestamp(),
      logoutSource: 'mobile_app',
      deviceInfo: {
        platform: 'mobile',
        userAgent: 'React Native'
      }
    };

    await addDoc(collection(db, 'userLogoutLogs'), logoutLog);
  } catch (error) {
    console.error('Error logging user logout:', error);
  }
}

export { signOut };
