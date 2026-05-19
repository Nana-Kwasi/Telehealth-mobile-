import * as Notifications from 'expo-notifications';
import { registerPushToken } from './homeCareService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerHomeCarePush(uid, collectionName = 'homeCareNurses') {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (token) await registerPushToken(uid, token, collectionName);
    return token;
  } catch (e) {
    console.warn('Push registration failed', e);
    return null;
  }
}
