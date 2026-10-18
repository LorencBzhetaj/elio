import type { ImageRef } from '../../features/content/schemas';
import type { HeroVariant } from '../../config/site';

export interface HeroAction {
  href: string;
  label: string;
}

/** Common contract for both homepage heroes (03-DESIGN.md). Focal points travel with each media item. */
export interface HeroProps {
  variant: HeroVariant;
  heading: string;
  description: string;
  media: ImageRef[];
  primaryAction: HeroAction;
  secondaryAction: HeroAction;
  tagline?: string;
  brand?: string;
}
