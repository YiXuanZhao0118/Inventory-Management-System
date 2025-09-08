// lib/devices.ts
import fs from 'fs';
import path from 'path';

const DEVICES_PATH = path.resolve(process.cwd(), 'app/data/device.json');

export interface DeviceItem {
  deviceId: string;
  name:   string;
  currentDate: string;
}

export type Device = DeviceItem[];

export function getDevices(): Device {
  const raw = fs.readFileSync(DEVICES_PATH, 'utf-8');
  return JSON.parse(raw) as Device;
}

export function saveDevices(data: Device): void {
  fs.writeFileSync(
    DEVICES_PATH,
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}