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
  // Check labs collection
  const labRef = doc(db, 'labs', uid);
  const labSnap = await getDoc(labRef);
  if (labSnap.exists()) {
    const data = labSnap.data();
    return { role: 'lab', profile: { id: labSnap.id, ...data, role: 'lab' } };
  }

  // Check lab branches
  const labBranchRef = doc(db, 'labBranches', uid);
  const labBranchSnap = await getDoc(labBranchRef);
  if (labBranchSnap.exists()) {
    const data = labBranchSnap.data();
    return { role: 'lab_branch', profile: { id: labBranchSnap.id, ...data, role: 'lab_branch' } };
  }

  // Check scan centers collection
  const scanRef = doc(db, 'scanCenters', uid);
  const scanSnap = await getDoc(scanRef);
  if (scanSnap.exists()) {
    const data = scanSnap.data();
    return { role: 'scan', profile: { id: scanSnap.id, ...data, role: 'scan' } };
  }

  // Check scan branches
  const scanBranchRef = doc(db, 'scanBranches', uid);
  const scanBranchSnap = await getDoc(scanBranchRef);
  if (scanBranchSnap.exists()) {
    const data = scanBranchSnap.data();
    return { role: 'scan_branch', profile: { id: scanBranchSnap.id, ...data, role: 'scan_branch' } };
  }

  // Check pharmacies collection
  const pharmacyRef = doc(db, 'pharmacies', uid);
  const pharmacySnap = await getDoc(pharmacyRef);
  if (pharmacySnap.exists()) {
    const data = pharmacySnap.data();
    return { role: 'pharmacy', profile: { id: pharmacySnap.id, ...data, role: 'pharmacy' } };
  }

  // Check pharmacy branches
  const branchRef = doc(db, 'pharmacyBranches', uid);
  const branchSnap = await getDoc(branchRef);
  if (branchSnap.exists()) {
    const data = branchSnap.data();
    return { role: 'branch_user', profile: { id: branchSnap.id, ...data, role: 'branch_user' } };
  }

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

  // Check doctors collection
  const dQ = query(collection(db, 'doctors'), where('username', '==', identifier));
  const dR = await getDocs(dQ);
  if (!dR.empty) return { id: dR.docs[0].id, ...dR.docs[0].data() };

  const dQE = query(collection(db, 'doctors'), where('email', '==', identifier));
  const dRE = await getDocs(dQE);
  if (!dRE.empty) return { id: dRE.docs[0].id, ...dRE.docs[0].data() };

  // Check pharmacies
  const phQ = query(collection(db, 'pharmacies'), where('username', '==', identifier));
  const phR = await getDocs(phQ);
  if (!phR.empty) return { id: phR.docs[0].id, ...phR.docs[0].data() };

  const phQE = query(collection(db, 'pharmacies'), where('email', '==', identifier));
  const phRE = await getDocs(phQE);
  if (!phRE.empty) return { id: phRE.docs[0].id, ...phRE.docs[0].data() };

  // Check pharmacy branches
  const brQ = query(collection(db, 'pharmacyBranches'), where('username', '==', identifier));
  const brR = await getDocs(brQ);
  if (!brR.empty) return { id: brR.docs[0].id, ...brR.docs[0].data() };

  const brQE = query(collection(db, 'pharmacyBranches'), where('email', '==', identifier));
  const brRE = await getDocs(brQE);
  if (!brRE.empty) return { id: brRE.docs[0].id, ...brRE.docs[0].data() };

  // Check labs
  const lbQ = query(collection(db, 'labs'), where('username', '==', identifier));
  const lbR = await getDocs(lbQ);
  if (!lbR.empty) return { id: lbR.docs[0].id, ...lbR.docs[0].data() };

  const lbQE = query(collection(db, 'labs'), where('email', '==', identifier));
  const lbRE = await getDocs(lbQE);
  if (!lbRE.empty) return { id: lbRE.docs[0].id, ...lbRE.docs[0].data() };

  // Check lab branches
  const lbrQ = query(collection(db, 'labBranches'), where('username', '==', identifier));
  const lbrR = await getDocs(lbrQ);
  if (!lbrR.empty) return { id: lbrR.docs[0].id, ...lbrR.docs[0].data() };

  const lbrQE = query(collection(db, 'labBranches'), where('email', '==', identifier));
  const lbrRE = await getDocs(lbrQE);
  if (!lbrRE.empty) return { id: lbrRE.docs[0].id, ...lbrRE.docs[0].data() };

  // Check scan centers
  const scQ = query(collection(db, 'scanCenters'), where('username', '==', identifier));
  const scR = await getDocs(scQ);
  if (!scR.empty) return { id: scR.docs[0].id, ...scR.docs[0].data() };

  const scQE = query(collection(db, 'scanCenters'), where('email', '==', identifier));
  const scRE = await getDocs(scQE);
  if (!scRE.empty) return { id: scRE.docs[0].id, ...scRE.docs[0].data() };

  // Check scan branches
  const sbrQ = query(collection(db, 'scanBranches'), where('username', '==', identifier));
  const sbrR = await getDocs(sbrQ);
  if (!sbrR.empty) return { id: sbrR.docs[0].id, ...sbrR.docs[0].data() };

  const sbrQE = query(collection(db, 'scanBranches'), where('email', '==', identifier));
  const sbrRE = await getDocs(sbrQE);
  if (!sbrRE.empty) return { id: sbrRE.docs[0].id, ...sbrRE.docs[0].data() };

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
