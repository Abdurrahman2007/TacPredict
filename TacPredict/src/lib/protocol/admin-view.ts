// Adapted from the user's requested TwinMind Astra review; verified locally, not model-tested.
import { z } from "zod";
export const adminSections = [
  "Dashboard",
  "Markets",
  "Trading",
  "Resolution",
  "Users",
  "Blockchain",
  "Treasury",
  "Analytics",
  "Audit",
  "Settings",
] as const;
export const adminSectionSchema = z.enum(adminSections);
export type AdminSection = (typeof adminSections)[number];
export const adminRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  usdcAtoms: z.string().regex(/^\d+$/).nullable(),
  observedAt: z.string().nullable(),
});
export const adminSnapshotSchema = z.object({
  chainId: z.literal(8453),
  section: adminSectionSchema,
  rows: z.array(adminRowSchema).max(50),
  observedAt: z.string(),
});
export function formatAdminUSDC(value: unknown): string {
  if (value === null) return "Unavailable";
  if (typeof value !== "string" || !value.length || /[^0-9]/u.test(value))
    throw new TypeError("Expected nonnegative USDC atomic digits");
  const atoms = BigInt(value);
  const whole = (atoms / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(atoms % 1_000_000n).toString().padStart(6, "0")} USDC`;
}
