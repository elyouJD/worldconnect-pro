// Configuración pública de Cloudinary para cargas unsigned de imágenes.
// No incluir aquí API Secret.
export const cloudinary = {
  cloudName: "wvjj7mvf",
  uploadPreset: "worldconnect_profiles",
};
export const cloudinaryReady = () =>
  Boolean(cloudinary.cloudName && cloudinary.uploadPreset);
