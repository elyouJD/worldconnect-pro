export const cloudinaryConfig = {
  cloudName: "wvjj7mvf",
  uploadPreset: "worldconnect_profiles",
};

export const cloudinaryConfigured = () => {
  return Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);
};
