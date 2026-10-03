// A PHOTO FOR THE RESIDENT: the file a user picked or the camera frame they
// took (site/app/camera.mjs), made into the
// composer's photo attachment (`src/attachment.rs`, `user_message`): JPEG,
// its longer side at most MAX_PHOTO_SIDE, as base64 with its size.
//
// The same numbers as Android (android/kotlin/dev/quine/shell/PhotoHelper.kt):
// a model reads a photo at about this size, and a photograph re-encoded
// losslessly would cost megabytes for no gain. The bytes are TRANSIENT: they
// ride the one message and are never written down (only the `[photo]`
// caption is).

const MAX_PHOTO_SIDE = 1568;
const PHOTO_JPEG_QUALITY = 0.85;

/**
 * @param {Blob | HTMLVideoElement} file  an image the user picked, or the
 *   camera's live video at the moment they took the photo
 * @returns {Promise<{kind: "photo", b64: string, width: number, height: number}>}
 */
export async function photoAttachment(file) {
  // `from-image`: a phone photo's EXIF rotation is applied, so the model sees
  // it the way up the user does.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser gives no 2D canvas to re-encode the photo");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: PHOTO_JPEG_QUALITY });
  return { kind: "photo", b64: base64(new Uint8Array(await jpeg.arrayBuffer())), width, height };
}

/**
 * Bytes as base64, the attachments' wire form (photos, voice messages).
 * @param {Uint8Array} bytes
 */
export function base64(bytes) {
  let binary = "";
  // In chunks: String.fromCharCode spreads its arguments on the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
