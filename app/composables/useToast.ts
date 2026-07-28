export interface Toast {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}

let nextId = 0

/** Small, shared toast queue. Confirms that an action landed. */
export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function push(message: string, tone: Toast['tone'] = 'info', ms = 3600) {
    const id = nextId++
    toasts.value = [...toasts.value, { id, message, tone }]
    if (import.meta.client) {
      setTimeout(() => dismiss(id), ms)
    }
    return id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return {
    toasts,
    dismiss,
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error', 5200),
    info: (message: string) => push(message, 'info'),
  }
}
