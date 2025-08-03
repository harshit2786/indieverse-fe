import { Upload, Sparkles, Cpu, Zap } from "lucide-react"
export function encodeFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result); // This will be a base64 string
      } else {
        reject("Failed to convert file.");
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file); // Includes `data:<mime>;base64,` prefix
  });
}

export const colors: [number, number, number][] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
];

export const BACKEND_URL = import.meta.env.VITE_APP_BACKEND_URL || "";

export const BACKEND_TOKEN = import.meta.env.VITE_APP_TOKEN || "";

export const processingSteps = [
    { icon: Upload, text: "Uploading your image...", color: "text-blue-500" },
    { icon: Cpu, text: "Analyzing building structure...", color: "text-purple-500" },
    { icon: Sparkles, text: "Generating AI masks...", color: "text-pink-500" },
    { icon: Zap, text: "Finalizing segments...", color: "text-green-500" },
  ]