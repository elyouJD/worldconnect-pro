import{cloudinary,cloudinaryReady}from"./cloudinary-config.js";export async function uploadImage(file){if(!cloudinaryReady())throw Error("Configura Cloudinary primero.");if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Formato no permitido.");if(file.size>5*1024*1024)throw Error("Máximo 5 MB.");const data=new FormData();data.append("file",file);data.append("upload_preset",cloudinary.uploadPreset);data.append("folder","worldconnect/profiles");const r=await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,{method:"POST",body:data});const j=await r.json();if(!r.ok)throw Error(j.error?.message||"Error subiendo imagen");return{url:j.secure_url,publicId:j.public_id};}

export async function uploadPostMedia(file){
  if(!cloudinaryReady())throw Error("Configura Cloudinary primero.");
  const isVideo=file.type.startsWith("video/");
  if(!isVideo&&!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type))throw Error("Formato de imagen o vídeo no permitido.");
  if(file.size>50*1024*1024)throw Error("El archivo supera el máximo de 50 MB.");
  const data=new FormData();data.append("file",file);data.append("upload_preset",cloudinary.uploadPreset);data.append("folder","worldconnect/posts");
  const resource=isVideo?"video":"image";
  const response=await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/${resource}/upload`,{method:"POST",body:data});
  const result=await response.json();if(!response.ok)throw Error(result.error?.message||"Error subiendo el archivo.");
  return {url:result.secure_url,publicId:result.public_id,resourceType:resource};
}
