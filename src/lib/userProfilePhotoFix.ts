import { usersApi } from './api';

let installed = false;

async function blobUrlToCompressedAvatar(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  if (!response.ok) throw new Error('تعذر قراءة الصورة المختارة');

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('الملف المختار ليس صورة صالحة');
  }

  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('صيغة الصورة غير مدعومة على هذا الجهاز'));
      img.src = sourceUrl;
    });

    const maxSide = 384;
    const width = Math.max(1, image.naturalWidth || image.width || 1);
    const height = Math.max(1, image.naturalHeight || image.height || 1);
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر تجهيز الصورة');

    // White background keeps transparent PNGs readable after JPEG conversion.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('تعذر حفظ الصورة');
    }

    // A 384px avatar should normally be far below this. Protect the user record
    // from accidentally storing multi-megabyte images if a browser misbehaves.
    if (dataUrl.length > 600_000) {
      throw new Error('الصورة كبيرة جدًا — اختر صورة أصغر');
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/**
 * Settings uses a local blob URL for instant preview. Blob URLs expire with the
 * browser tab and must never be stored in the database. Convert the preview to a
 * small durable avatar before the existing usersApi.update call reaches the API.
 * This deliberately avoids filesystem/NGINX/upload persistence issues for tiny
 * profile avatars while keeping the Settings component API unchanged.
 */
export function installUserProfilePhotoFix(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalUpdate = usersApi.update.bind(usersApi);

  usersApi.update = async (uid: string, data: any) => {
    const payload = { ...(data || {}) };

    if (typeof payload.photoURL === 'string' && payload.photoURL.startsWith('blob:')) {
      payload.photoURL = await blobUrlToCompressedAvatar(payload.photoURL);
    }

    // Never persist a stale blob URL even if one somehow arrives from old UI.
    if (typeof payload.photoURL === 'string' && payload.photoURL.startsWith('blob:')) {
      delete payload.photoURL;
    }

    const updatedUser = await originalUpdate(uid, payload);

    // Read back the authoritative DB value so the header/settings/avatar all use
    // exactly what will survive a reload rather than the temporary preview URL.
    let authoritativeUser = updatedUser;
    try {
      authoritativeUser = await usersApi.getMe();
    } catch {
      // The update already succeeded; keep its response if refresh fails.
    }

    window.dispatchEvent(new CustomEvent('retal-user-profile-updated', {
      detail: authoritativeUser,
    }));

    return authoritativeUser;
  };
}

installUserProfilePhotoFix();
