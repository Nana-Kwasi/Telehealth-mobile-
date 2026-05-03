import { useState } from 'react';
import * as Location from 'expo-location';

export default function useAddressAutofillMobile() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const detectAddress = async (onDetected) => {
    setLoading(true);
    setMessage('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setMessage('Location access helps us provide better services like nearby pharmacies, labs, and doctors. You can continue manually, but some features may be limited.');
        setLoading(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const latitude = pos?.coords?.latitude;
      const longitude = pos?.coords?.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setMessage('Could not fetch live location. Please enter your address manually.');
        setLoading(false);
        return;
      }

      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
      const data = await resp.json();
      const addr = data?.address || {};
      const country = addr?.country || '';
      const countryCode = (addr?.country_code || '').toUpperCase();
      const region = addr?.state || addr?.region || '';
      const city = addr?.city || addr?.town || addr?.village || addr?.county || '';
      const area = addr?.suburb || addr?.neighbourhood || addr?.city_district || '';
      const street = addr?.road || addr?.pedestrian || '';
      const display = data?.display_name || [street, area, city, region, country].filter(Boolean).join(', ');

      onDetected?.({
        address: display,
        latitude,
        longitude,
        country,
        countryCode,
        region,
        city,
        area,
        street,
        geocodedAt: new Date().toISOString(),
      });
      setMessage('Location detected and address suggested.');
    } catch {
      setMessage('Could not reverse-detect your address. Please enter it manually.');
    } finally {
      setLoading(false);
    }
  };

  return { detectAddress, loading, message, setMessage };
}
