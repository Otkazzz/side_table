import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@shared/types/room';

/**
 * Type concret du socket côté client, entièrement typé.
 *
 * Exporté pour que les autres modules (store, composants, futurs hooks
 * Blackjack) consomment exactement les mêmes signatures.
 */
export type CasinoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL =
  (import.meta.env['VITE_SERVER_URL'] as string | undefined) ??
  'http://localhost:3001';

/**
 * Singleton de socket à l'échelle de l'onglet.
 *
 * On évite à tout prix de créer plusieurs connexions en mode dev
 * (StrictMode déclenche `useEffect` deux fois) — un singleton externe
 * au cycle de vie React résout ça proprement.
 */
let sharedSocket: CasinoSocket | null = null;

function getSocket(): CasinoSocket {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io(SERVER_URL, {
    autoConnect: true,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  }) as CasinoSocket;
  return sharedSocket;
}

export interface UseSocketResult {
  socket: CasinoSocket;
  isConnected: boolean;
}

/**
 * Hook React qui expose le socket Socket.io et son état de connexion.
 *
 * - Le socket est partagé par toute l'app (singleton).
 * - L'état `isConnected` est local au composant qui consomme le hook,
 *   mais il reste synchrone avec le vrai état du socket grâce aux
 *   listeners `connect` / `disconnect`.
 *
 * Les *handlers d'événements métier* (room:update, room:error, …)
 * doivent être enregistrés ailleurs (dans le store Zustand) pour ne
 * pas être démontés au gré des re-render.
 */
export function useSocket(): UseSocketResult {
  // useRef garantit qu'on ne change jamais de référence de socket entre re-renders.
  const socketRef = useRef<CasinoSocket | null>(null);
  if (socketRef.current === null) {
    socketRef.current = getSocket();
  }
  const socket = socketRef.current;

  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);

  useEffect(() => {
    const handleConnect = (): void => setIsConnected(true);
    const handleDisconnect = (): void => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      // Volontairement pas de `socket.disconnect()` ici : le socket est
      // partagé. Il vivra tant que l'onglet est ouvert.
    };
  }, [socket]);

  return { socket, isConnected };
}
