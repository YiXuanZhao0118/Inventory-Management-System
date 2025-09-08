"use client";
import useSWR from "swr";

export async function fetcher<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

interface User {
  id: string;
  username: string;
}

export function useAuthUser() {
  const { data: user, error, isLoading } = useSWR<User>("/api/user", fetcher);
  const isAuthenticated = !error && !isLoading && !!user;
  return {
    user,
    isLoading,
    error,
    isAuthenticated,
  };
} 