export const LUNA_PER_NIM = 100_000

export function formatNim(nim: number): string {
  return nim.toLocaleString(undefined, { maximumFractionDigits: 5 })
}

export function shortAddress(address?: string | null): string {
  if (!address) return ''
  const compact = address.replace(/\s+/g, '')
  return `${compact.slice(0, 4)}…${compact.slice(-4)}`
}

/** Human countdown. Returns null once the deadline has passed. */
export function timeLeft(deadlineAt: number): string | null {
  const seconds = deadlineAt - Math.floor(Date.now() / 1000)
  if (seconds <= 0) return null

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/** Each category gets a tinted tile and a glyph, as in the design reference. */
export const CATEGORIES = [
  { value: 'coding', label: 'Coding', tint: 'bg-[#eeecfe] text-[#5546e8]', icon: 'm8 6-5 6 5 6M16 6l5 6-5 6' },
  { value: 'security', label: 'Security', tint: 'bg-[#e8f1fe] text-[#2b6fd6]', icon: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3Z' },
  { value: 'design', label: 'Design', tint: 'bg-[#e4f7f0] text-[#17a673]', icon: 'M3 21l3-1 11-11a2.1 2.1 0 0 0-3-3L3 17l-1 3ZM14 5l3 3' },
  { value: 'content', label: 'Content', tint: 'bg-[#fdeee2] text-[#d1741c]', icon: 'M8 3h8l4 4v14H4V3h4Zm0 8h8M8 15h5' },
  { value: 'research', label: 'Research', tint: 'bg-[#fef3e0] text-[#b8860b]', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3' },
  { value: 'community', label: 'Community', tint: 'bg-[#fde8f0] text-[#c2407a]', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M17 20a5 5 0 0 0-3-4.6' },
  { value: 'other', label: 'Other', tint: 'bg-[#eeeef4] text-[#6b6b85]', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
]

export function category(value: string) {
  return CATEGORIES.find(c => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1]!
}

export function categoryLabel(value: string): string {
  return category(value).label
}
