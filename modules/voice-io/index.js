import { requireOptionalNativeModule } from "expo-modules-core";

// Null in Expo Go and on Android: the app then falls back to expo-av, where the microphone
// is off while the assistant speaks and interrupting is a tap.
export default requireOptionalNativeModule("VoiceIo");
