import { authStorage, usersApi } from './api';

let installed = false;

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Settings historically passed URL.createObjectURL(file) to usersApi.update().
 * A blob: URL only exists in the current browser tab, so persisting it in the DB
 * makes the avatar break after a reload. Keep the existing Settings API surface,
 * but transparently upload blob-backed profile photos to the real multipart route.
 */
export function installUserProfilePhotoFix(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalUpdate = usersApi.update.bind(usersApi);

  usersApi.update = async (uid: string, data: any) => {
    const payload = { ...(data || {}) };
    let uploadedUser: any = null;

    const candidate = payload.photoURL;
    if (typeof candidate === 'string' && candidate.startsWith('blob:')) {
      const token = authStorage.getToken();
      if (!token) throw new Error('انتهت الجلسة — سجّل الدخول مرة أخرى');

      const blobResponse = await fetch(candidate);
      if (!blobResponse.ok) throw new Error('تعذر قراءة صورة الملف الشخصي');

      const blob = await blobResponse.blob();
      const mime = blob.type || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        throw new Error('يسمح فقط بصور JPG أو PNG أو WEBP');
      }

      const form = new FormData();
      form.append('photo', new File([blob], `profile.${extensionForMime(mime)}`, { type: mime }));

      const uploadResponse = await fetch(`/api/users/${encodeURIComponent(uid)}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const uploadBody = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) {
        throw new Error(uploadBody?.error || `فشل رفع الصورة (${uploadResponse.status})`);
      }

      uploadedUser = uploadBody?.user || null;
      // The upload route now owns photoURL. Do not overwrite it with the blob URL
      // in the following JSON profile update.
      delete payload.photoURL;
    }

    const updatedUser = await originalUpdate(uid, payload);
    const finalUser = uploadedUser
      ? { ...uploadedUser, ...updatedUser, photoURL: updatedUser?.photoURL || uploadedUser?.photoURL }
      : updatedUser;

    // Keep the authenticated header/avatar in sync without requiring a reload.
    window.dispatchEvent(new CustomEvent('retal-user-profile-updated', { detail: finalUser }));
    return finalUser;
  };
}

installUserProfilePhotoFix();
