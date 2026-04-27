import type { Server, Socket } from 'socket.io';

import type {
  ClientToServerEvents,
  CreateRoomAck,
  InterServerEvents,
  JoinRoomAck,
  LeaveRoomAck,
  RoomError,
  ServerToClientEvents,
  SocketData,
  StartGameAck,
} from '@shared/types/room.js';

import { RoomManager, RoomManagerError } from '../roomManager.js';

type CasinoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type CasinoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Convertit n'importe quelle erreur en `RoomError` standardisée.
 * Toutes les erreurs non typées tombent dans `INVALID_INPUT` pour ne jamais
 * fuiter de stack trace côté client.
 */
function toRoomError(err: unknown): RoomError {
  if (err instanceof RoomManagerError) return err.error;
  if (err instanceof Error) {
    return { code: 'INVALID_INPUT', message: err.message };
  }
  return { code: 'INVALID_INPUT', message: 'Erreur inconnue.' };
}

/**
 * Garde un callback ack typé. Socket.io n'oblige pas le client à fournir
 * un callback : on le sécurise pour ne jamais planter le serveur.
 */
function safeAck<T>(ack: ((response: T) => void) | undefined, response: T): void {
  if (typeof ack === 'function') ack(response);
}

/**
 * Branche tous les handlers Socket.io d'une room sur un socket donné.
 *
 * On découple volontairement `RoomManager` (pure logique, testable) de
 * cette couche (effets de bord Socket.io). Quand on ajoutera le moteur
 * Blackjack, on fera pareil : `BlackjackEngine` pur + `blackjackHandlers`.
 */
export function registerRoomHandlers(
  io: CasinoServer,
  socket: CasinoSocket,
  rooms: RoomManager,
): void {
  /**
   * Notifie tous les sockets d'une room d'un changement d'état.
   * Centralisé pour rester cohérent : un seul format diffusé partout.
   */
  const broadcastRoomUpdate = (code: string): void => {
    const room = rooms.getRoom(code);
    if (!room) return;
    io.to(code).emit('room:update', rooms.toPublic(room));
  };

  socket.on('room:create', (payload, ack) => {
    try {
      const room = rooms.createRoom({
        socketId: socket.id,
        username: payload.username,
        ...(payload.maxPlayers !== undefined ? { maxPlayers: payload.maxPlayers } : {}),
      });

      socket.data.username = payload.username.trim();
      socket.data.roomCode = room.code;
      void socket.join(room.code);

      const publicRoom = rooms.toPublic(room);
      const response: CreateRoomAck = { ok: true, data: publicRoom };
      safeAck(ack, response);
      // L'host est seul dans la room → pas besoin de broadcast, mais on
      // émet quand même pour homogénéiser l'UX (un seul chemin de mise à jour).
      io.to(room.code).emit('room:update', publicRoom);
    } catch (err) {
      const error = toRoomError(err);
      const response: CreateRoomAck = { ok: false, error };
      safeAck(ack, response);
      socket.emit('room:error', error);
    }
  });

  socket.on('room:join', (payload, ack) => {
    try {
      const room = rooms.joinRoom({
        socketId: socket.id,
        code: payload.code,
        username: payload.username,
      });

      socket.data.username = payload.username.trim();
      socket.data.roomCode = room.code;
      void socket.join(room.code);

      const publicRoom = rooms.toPublic(room);
      const response: JoinRoomAck = { ok: true, data: publicRoom };
      safeAck(ack, response);
      io.to(room.code).emit('room:update', publicRoom);
    } catch (err) {
      const error = toRoomError(err);
      const response: JoinRoomAck = { ok: false, error };
      safeAck(ack, response);
      socket.emit('room:error', error);
    }
  });

  socket.on('room:leave', (ack) => {
    const { room, code } = rooms.leaveRoom(socket.id);

    if (code) {
      void socket.leave(code);
      socket.data.roomCode = undefined;
    }

    const response: LeaveRoomAck = { ok: true, data: null };
    safeAck(ack, response);

    if (room) {
      io.to(room.code).emit('room:update', rooms.toPublic(room));
    }
  });

  socket.on('room:start', (ack) => {
    try {
      const room = rooms.startGame(socket.id);
      const publicRoom = rooms.toPublic(room);
      const response: StartGameAck = { ok: true, data: publicRoom };
      safeAck(ack, response);

      io.to(room.code).emit('room:update', publicRoom);
      io.to(room.code).emit('game:started', publicRoom);
    } catch (err) {
      const error = toRoomError(err);
      const response: StartGameAck = { ok: false, error };
      safeAck(ack, response);
      socket.emit('room:error', error);
    }
  });

  /**
   * Déconnexion : on retire le joueur de sa room (s'il en a une) et on
   * notifie les autres. Géré ici plutôt que dans `server.ts` parce que
   * c'est intrinsèquement lié au cycle de vie d'une room.
   */
  socket.on('disconnect', () => {
    const { room, code } = rooms.leaveRoom(socket.id);
    if (room && code) {
      broadcastRoomUpdate(code);
    }
  });
}
