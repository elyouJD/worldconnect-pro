import { cloudinaryConfig, cloudinaryConfigured } from "./cloudinary-config.js";

export async function uploadImage(file) {
  if (!cloudinaryConfigured()) {
    throw new Error("Configura Cloudinary primero.");
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Formato no permitido.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Máximo 5 MB.");
  }

  const data = new FormData();
  data.append("file", file);
  data.append("upload_preset", cloudinaryConfig.uploadPreset);
  data.append("folder", "worldconnect/profiles");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
    {
      method: "POST",
      body: data,
    },
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("Cloudinary error:", result);
    throw new Error(result.error?.message || "Error subiendo imagen");
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}
