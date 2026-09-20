import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Supabase's PostgrestError (and other plain error-shaped objects) don't
 * extend the built-in Error class, so `error instanceof Error` misses them
 * and silently discards the real message. Check for a `message` string
 * instead of relying on the prototype chain.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}
