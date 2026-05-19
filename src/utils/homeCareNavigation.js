import { CommonActions } from '@react-navigation/native';

export function resetToHomeCarePatientDashboard(navigation) {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'HomeCareFlow',
          state: {
            index: 0,
            routes: [{ name: 'HomeCarePatientDashboard' }],
          },
        },
      ],
    }),
  );
}
