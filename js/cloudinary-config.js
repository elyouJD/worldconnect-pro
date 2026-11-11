// Cloudinary unsigned upload configuration. Never place API_SECRET in frontend code.
export const cloudinary = {
  cloudName: "wvjj7mvf",
  uploadPreset: "worldconnect_profiles"
};
export const cloudinaryReady = () =>
  Boolean(cloudinary.cloudName && cloudinary.uploadPreset);
