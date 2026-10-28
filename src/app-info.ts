/** Build date and commit, set at build time in vite.config.ts, so a bug report says which build it's about. */
export const APP_VERSION: string = __APP_VERSION__;

export const REPO_URL = "https://github.com/christophwong/startlistmaker";

/** The product's contact address for help, requests and feedback. */
export const CONTACT_EMAIL = "help@startlistmaker.online";

/** A mailto: link with the subject and the build version filled in. */
export function contactUrl(subject: string, body = "") {
  const text = `${body}${body ? "\n\n" : ""}(Start List Maker ${APP_VERSION})`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
