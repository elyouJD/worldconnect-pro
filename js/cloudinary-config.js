// Crea un Upload Preset UNSIGNED limitado a imágenes. Nunca publiques API_SECRET.
export const cloudinary={cloudName:"TU_CLOUD_NAME",uploadPreset:"TU_UNSIGNED_PRESET"};
export const cloudinaryReady=()=>cloudinary.cloudName!=="TU_CLOUD_NAME"&&cloudinary.uploadPreset!=="TU_UNSIGNED_PRESET";
