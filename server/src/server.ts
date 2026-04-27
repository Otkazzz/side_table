import { createServer } from 'node:http';

import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@shared/types/room.js';

import { registerRoomHandlers } from './handlers/roomHandlers.js';
import { RoomManager } from './roomManager.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

/**
 * Construit un *matcher* d'origine CORS à partir d'une chaîne d'env.
 *
 * Formats supportés :
 * - `*`                                         → tout est autorisé (test uniquement).
 * - `http://localhost:5173`                     → une origine exacte.
 * - `http://localhost:5173,https://app.com`     → liste séparée par virgules.
 * - `https://*.trycloudflare.com`               → wildcard de sous-domaine
 *                                                 (utile pour les URLs de tunnel
 *                                                 qui changent à chaque session).
 *
 * Retourne un callback compatible avec `cors` et `socket.io` :
 * `(origin, cb) => cb(null, allowed)`.
 */
type OriginCallback = (
  err: Error | null,
  allow?: boolean,
) => void;

function buildOriginMatcher(
  raw: string,
): (origin: string | undefined, cb: OriginCallback) => void {
  const patterns = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowAll = patterns.includes('*');

  // Pré-compile chaque pattern en RegExp (les wildcards `*` deviennent `.*`).
  const regexes = patterns.map((p) => {
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });

  return (origin, cb) => {
    // Requêtes sans Origin (curl, health checks, requêtes server-to-server) → on laisse passer.
    if (!origin) return cb(null, true);
    if (allowAll) return cb(null, true);
    const ok = regexes.some((r) => r.test(origin));
    return cb(null, ok);
  };
}

const corsOrigin = buildOriginMatcher(CLIENT_ORIGIN);

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const httpServer = createServer(app);

/**
 * Singleton `RoomManager` partagé par toutes les connexions.
 * Quand on passera à un déploiement multi-instance, on remplacera
 * l'implémentation in-memory par un `RoomManager` adossé à Redis sans
 * toucher aux handlers ni aux types Socket.io.
 */
const rooms = new RoomManager();

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  registerRoomHandlers(io, socket, rooms);
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[casino-server] listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[casino-server] CORS origin: ${CLIENT_ORIGIN}`);
});
