import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import type { Database } from "./db-types";

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

// Expo SecureStore keeps refresh tokens encrypted on native; on web/SSR we fall
// back to localStorage or an in-memory map (SSR render has no SecureStore).
function makeStorage(): StorageLike {
  const isWeb = typeof window !== "undefined" && !!window.localStorage;
  const canUseSecure = !isWeb && Platform.OS !== "web" && typeof SecureStore !== "undefined";

  return {
    async getItem(key) {
      if (isWeb) return window.localStorage.getItem(key);
      if (canUseSecure) {
        try {
          return await SecureStore.getItemAsync(key);
        } catch {
          return memoryStore.get(key) ?? null;
        }
      }
      return memoryStore.get(key) ?? null;
    },
    async setItem(key, value) {
      if (isWeb) {
        window.localStorage.setItem(key, value);
        return;
      }
      if (canUseSecure) {
        try {
          await SecureStore.setItemAsync(key, value);
          return;
        } catch {
          // fall through to memory
        }
      }
      memoryStore.set(key, value);
    },
    async removeItem(key) {
      if (isWeb) {
        window.localStorage.removeItem(key);
        return;
      }
      if (canUseSecure) {
        try {
          await SecureStore.deleteItemAsync(key);
          return;
        } catch {
          // fall through
        }
      }
      memoryStore.delete(key);
    },
  };
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env",
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: makeStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Deep-link helper for the app scheme (shareable listing links). */
export function listingShareUrl(listingId: string): string {
  return `${Linking.createURL("listing", {})}/${listingId}`;
}
