// Remembers who is leaving feedback, per browser, so reviewers type their name and email once.
// Self-reported and unverified: it labels feedback, it doesn't authenticate anyone.
const STORAGE_KEY = "heard:reporter"

export interface ReporterIdentity {
  name: string
  email: string
}

export function loadReporterIdentity(): ReporterIdentity {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReporterIdentity>
      return {
        name: typeof parsed.name === "string" ? parsed.name : "",
        email: typeof parsed.email === "string" ? parsed.email : "",
      }
    }
  } catch {
    // Storage blocked (private mode, sandboxed iframe): ask every time.
  }
  return { name: "", email: "" }
}

export function saveReporterIdentity(identity: ReporterIdentity): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        name: identity.name.trim(),
        email: identity.email.trim(),
      })
    )
  } catch {
    // Not fatal: the report still carries the name and email.
  }
}
