import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setHomeCareReturnTarget(returnScreen, returnParams = {}) {
  await AsyncStorage.setItem('userIntent', 'homecare');
  await AsyncStorage.setItem(
    'hc.returnAfterAuth',
    JSON.stringify({ screen: returnScreen, params: returnParams }),
  );
}

export async function requireHomeCarePatient(navigation, { returnScreen, returnParams, message } = {}) {
  const token = await AsyncStorage.getItem('th.token');
  if (token) return true;
  navigation.navigate('HomeCareSignUpModal', {
    returnScreen: returnScreen || 'HomeCareHome',
    returnParams: returnParams || {},
    message: message || 'Create a free account to book home-care nurses.',
  });
  return false;
}
