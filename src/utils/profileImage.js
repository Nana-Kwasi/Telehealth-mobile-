// ─── profileImage ────────────────────────────────────────────────────────────
// Pick, upload and resolve a user's profile picture.
//
// Before this, only therapy clients and home-care nurses had anywhere to store an
// image (client_profiles_v2.avatar_url, home_care_nurses.profile_photo_url) —
// every other account type had no column at all, so the avatar in the header was
// always initials. The picture now lives on `users`, so one helper serves every
// role and every avatar in the app resolves from the same field.

import * as ImagePicker from 'expo-image-picker';
import { api, uploadFile, getStoredUserId } from '../services/apiClient';

// Same storage the chat attachments use. Keep the first path segment short:
// uploadFile sends it as the `domain` column, which is varchar(64).
const UPLOAD_PREFIX = 'avatars';

/** Profile pictures are small by design — this is a headshot, not a document. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * Every screen renders the avatar from a slightly different object (a profile, a
 * client record, a nurse row). Check the known field names in one place so an
 * image saved anywhere still shows up.
 */
export function avatarUrlOf(subject) {
  if (!subject) return null;
  const url =
    subject.avatarUrl
    || subject.photoURL
    || subject.profilePhotoUrl
    || subject.imageUrl
    || subject.photoUrl
    || null;
  // A blob:/file: url only resolves on the device that made it — treat as absent
  // rather than rendering a broken image.
  if (!url || String(url).startsWith('blob:') || String(url).startsWith('file:')) return null;
  return url;
}

/** Initials fallback, so a missing picture still reads as the right person. */
export function initialsOf(subject, fallback = '?') {
  const name =
    subject?.fullName || subject?.name || subject?.displayName || subject?.email || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Pick an image, upload it, and save it as the signed-in user's avatar.
 * @returns the stored url, or null if the user cancelled.
 */
export async function pickAndUploadAvatar(userId) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo access is needed to set a profile picture.');

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) {
    throw new Error(
      `That image is ${(asset.fileSize / 1024 / 1024).toFixed(1)} MB. Please choose one under ${MAX_AVATAR_BYTES / 1024 / 1024} MB.`,
    );
  }

  const uid = userId || (await getStoredUserId());
  if (!uid) throw new Error('You must be signed in to set a profile picture.');

  const ext = /\.([A-Za-z0-9]+)$/.exec(asset.fileName || '')?.[1]?.toLowerCase() || 'jpg';
  const url = await uploadFile(
    `${UPLOAD_PREFIX}/${uid}-${Date.now()}.${ext}`,
    asset.uri,
    asset.mimeType || 'image/jpeg',
  );

  await api(`/api/v1/auth/mobile/users/${uid}/avatar`, {
    method: 'PATCH',
    body: { avatarUrl: url },
  });
  return url;
}
