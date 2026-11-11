// Unsigned preset: do not add API_SECRET to frontend code.
export const cloudinary={cloudName:"wvjj7mvf",uploadPreset:"worldconnect_profiles"};
export const cloudinaryReady=()=>Boolean(cloudinary.cloudName&&cloudinary.uploadPreset&&cloudinary.cloudName!=="TU_CLOUD_NAME"&&cloudinary.uploadPreset!=="TU_UNSIGNED_PRESET");
