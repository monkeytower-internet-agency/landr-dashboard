/**
 * Comic illustration system — Landr "Comic Testival" style.
 *
 * Mascot:
 *   import { Mascot } from "@/components/illustrations";
 *   <Mascot pose="wave" size={200} />
 *
 * Scenes:
 *   import { EmptyBookings, SuccessScene, … } from "@/components/illustrations";
 *
 * All components are tree-shakeable named exports.
 * No raster images. No external dependencies.
 *
 * CSS custom properties used (with sensible fallbacks):
 *   --comic-bookings-sky, --comic-bookings-sky2
 *   --comic-ground, --comic-ground-dark
 *   --comic-surface, --comic-accent, --comic-accent-light
 *   --comic-sky, --comic-sky2, --comic-gold
 *   --comic-mountain, --comic-mountain2, --comic-snow, --comic-wood
 *   --comic-error, --comic-error-sky, --comic-success
 *   --comic-skin, --comic-cap, --comic-lens-tint
 *   --comic-spine, --comic-cal-header, --comic-phone, --comic-screen
 */

export { Mascot } from "./Mascot";
export type { MascotPose } from "./Mascot";

export {
  EmptyBookings,
  EmptyContacts,
  EmptyProducts,
  EmptyCalendar,
  EmptyTickets,
  EmptySearch,
  ErrorScene,
  SuccessScene,
  OnboardingHero,
  FirstBooking,
} from "./scenes";
