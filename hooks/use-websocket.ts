"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const MAX_BACKOFF_MS = 30_000
const INITIAL_BACKOFF_MS = 1_000

function buildWsUrl(path: string): string {
  if (typeof window === "undefined") return ""
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  const host = window.location.host
  return `${proto}//${host}${path}`
}

interface UseWebSocketOptions {
  enabled?: boolean
}

export function useWebSocket<T = unknown>(
  path: string,
  onMessage: (data: T) => void,
  { enabled = true }: UseWebSocketOptions = {},
): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoffRef = useRef(INITIAL_BACKOFF_MS)
  const onMessageRef = useRef(onMessage)
  const mountedRef = useRef(true)

  // Keep onMessage ref current without re-connecting
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return

    const url = buildWsUrl(path)
    if (!url) return

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close()
        return
      }
      backoffRef.current = INITIAL_BACKOFF_MS
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T
        onMessageRef.current(data)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setIsConnected(false)
      if (enabled) {
        const delay = backoffRef.current
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS)
        retryTimerRef.current = setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [path, enabled])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) {
      connect()
    }
    return () => {
      mountedRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null  // prevent reconnect on intentional close
        wsRef.current.close()
      }
      setIsConnected(false)
    }
  }, [connect, enabled])

  return { isConnected }
}
