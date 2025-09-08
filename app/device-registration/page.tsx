// app/device-registration/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'my_app_device_id';

export default function DeviceRegistrationPage() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(STORAGE_KEY, id);
    }
    setDeviceId(id);
  }, []);

  const handleSubmit = async () => {
    if (!deviceId || !name) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name }),
      });
      const data = await res.json();

      if (res.ok) {
        router.push('/');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error(err);
      setError('Network error, please try again later');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-xl mb-4">User Registration</h1>
      <div className="mb-4">
        <label>User ID:</label>
        <div className="font-mono text-sm">{deviceId}</div>
      </div>
      <div className="mb-4">
        <label>User Name:</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border p-2 rounded"
          placeholder="Enter your name"
        />
      </div>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <button
        onClick={handleSubmit}
        disabled={!name || loading}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Registering...' : 'Complete Registration'}
      </button>
    </div>
  );
}
