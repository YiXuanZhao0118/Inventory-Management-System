// lib/device.ts
export const DEVICE_STORAGE_KEY = "my_app_device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_STORAGE_KEY, id);
  }
  return id;
}
