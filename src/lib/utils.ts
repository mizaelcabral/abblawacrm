import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name?: string | null): string {
  if (!name) return "?"
  const clean = name.trim()
  if (!clean) return "?"

  // If numeric/phone number format like +551199999999
  if (/^\+?\d[\d\s\-()]+$/.test(clean)) {
    const digitsOnly = clean.replace(/\D/g, "")
    return digitsOnly.slice(-2) || "?"
  }

  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  "bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30",
  "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
]

export function getAvatarColor(identifier?: string | null): string {
  if (!identifier) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

export function getCleanSlug(profile?: {
  slug?: string | null
  full_name?: string | null
  account_id?: string | null
  id?: string | null
} | null): string {
  if (!profile) return ''

  if (profile.slug && typeof profile.slug === 'string' && profile.slug.trim()) {
    return profile.slug.trim()
  }

  if (profile.full_name && typeof profile.full_name === 'string' && profile.full_name.trim()) {
    const slug = profile.full_name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (slug) return slug
  }

  return profile.account_id || profile.id || ''
}

