const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function readAvatarDataUrl(file: File): Promise<string> {
  if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
    return Promise.reject(
      new Error("Choose a JPG, PNG, WebP, or GIF image."),
    );
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return Promise.reject(new Error("Choose an image smaller than 5 MB."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read the selected image."));
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}
