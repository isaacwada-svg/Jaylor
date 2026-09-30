const KEY = "jaylor:passportSessionToken";

/** The client's own device-local Passport session -- the server enforces the
 *  real 30-minute expiry; this is just where the token lives between pages. */
export function savePassportSession(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // ignore storage failures (private mode etc.)
  }
}

export function getPassportSession(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPassportSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
