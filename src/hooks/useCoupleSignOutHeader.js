import { useLayoutEffect } from 'react';
import { StyleSheet } from 'react-native';
import CoupleSignOutHeaderButton from '../components/CoupleSignOutHeaderButton';

/**
 * Header "Sign out" for couple onboarding screens.
 * Uses a dedicated header component so presses work reliably and navigation resets after logout.
 */
export function useCoupleSignOutHeader(navigation) {
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <CoupleSignOutHeaderButton />,
      headerRightContainerStyle: styles.headerRightContainer,
    });
  }, [navigation]);
}

const styles = StyleSheet.create({
  headerRightContainer: {
    paddingRight: 12,
    justifyContent: 'center',
  },
});
