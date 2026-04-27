import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Petit helper inspiré de shadcn/ui : combine classes conditionnelles
 * (`clsx`) et fusion intelligente des classes Tailwind (`twMerge`).
 *
 * Permet d'écrire `cn('px-2 py-1', isActive && 'bg-gold-500', extraClasses)`
 * sans craindre les conflits Tailwind.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
