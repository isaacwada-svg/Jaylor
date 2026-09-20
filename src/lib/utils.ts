import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Recognized database/network errors, rewritten in plain language before they ever reach a user. */
const KNOWN_ERROR_PATTERNS: { test: RegExp; message: string }[] = [
  {
    test: /unique constraint "stores_slug_key"/i,
    message: "That shop link is already taken. Try a different one.",
  },
  {
    test: /duplicate key value violates unique constraint/i,
    message: "That already exists. Please try something different.",
  },
  {
    test: /violates row-level security policy/i,
    message: "You don't have permission to do this.",
  },
  {
    test: /violates foreign key constraint/i,
    message: "This can't be completed because it's linked to other records.",
  },
  {
    test: /violates check constraint/i,
    message: "One of the values entered isn't allowed here.",
  },
  {
    test: /null value in column/i,
    message: "Please fill in all required fields.",
  },
  {
    test: /invalid input syntax for type/i,
    message: "One of the values entered isn't valid.",
  },
  {
    test: /JWT expired|invalid JWT|not authenticated/i,
    message: "Your session has expired. Please sign in again.",
  },
  {
    test: /Failed to fetch|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED/i,
    message: "Check your internet connection and try again.",
  },
];

/** Message text that looks like raw database/driver internals rather than something meant for a user. */
const RAW_ERROR_SIGNS = /relation "|column "|constraint "|syntax error at|PGRST\d{3}|SQLSTATE/i;

/**
 * Supabase's PostgrestError (and other plain error-shaped objects) don't
 * extend the built-in Error class, so `error instanceof Error` misses them
 * and silently discards the real message. Check for a `message` string
 * instead of relying on the prototype chain.
 *
 * Known database/network errors are rewritten in plain language. Anything
 * else that still looks like raw driver output falls back to the caller's
 * own message rather than leaking internals to the user; genuinely
 * human-written messages (ours, or a Postgres `raise exception`) pass
 * through unchanged.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      const known = KNOWN_ERROR_PATTERNS.find((p) => p.test.test(message));
      if (known) return known.message;
      if (RAW_ERROR_SIGNS.test(message)) return fallback;
      return message;
    }
  }
  return fallback;
}
