import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROOM_CONSTRAINTS } from '@shared/types/room';

import { useSocket } from '@/hooks/useSocket';
import { useRoomStore } from '@/stores/useRoomStore';

type LobbyMode = 'menu' | 'create' | 'join';

/**
 * Page d'entrée du jeu : choix entre créer une nouvelle room ou en rejoindre
 * une existante via son code à 6 caractères.
 *
 * Le pseudo est saisi ici, **avant** de toucher au socket — c'est plus simple
 * pour l'utilisateur et ça nous permet de valider côté client avant l'aller-retour.
 */
export function LobbyPage(): JSX.Element {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const { username, setUsername, createRoom, joinRoom, error, clearError } =
    useRoomStore();

  const [mode, setMode] = useState<LobbyMode>('menu');
  const [code, setCode] = useState<string>('');
  const [pendingUsername, setPendingUsername] = useState<string>(username);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const trimmedUsername = pendingUsername.trim();
  const usernameValid =
    trimmedUsername.length >= ROOM_CONSTRAINTS.USERNAME_MIN_LENGTH &&
    trimmedUsername.length <= ROOM_CONSTRAINTS.USERNAME_MAX_LENGTH;

  const handleCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!usernameValid || isSubmitting) return;
    setIsSubmitting(true);
    clearError();
    setUsername(trimmedUsername);
    const response = await createRoom(socket, trimmedUsername);
    setIsSubmitting(false);
    if (response.ok) {
      navigate(`/room/${response.data.code}`);
    }
  };

  const handleJoin = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (
      !usernameValid ||
      normalizedCode.length !== ROOM_CONSTRAINTS.ROOM_CODE_LENGTH ||
      isSubmitting
    ) {
      return;
    }
    setIsSubmitting(true);
    clearError();
    setUsername(trimmedUsername);
    const response = await joinRoom(socket, normalizedCode, trimmedUsername);
    setIsSubmitting(false);
    if (response.ok) {
      navigate(`/room/${response.data.code}`);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 py-10">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center"
      >
        <h1 className="font-display text-5xl font-bold tracking-tight text-gold-400 drop-shadow">
          Casino
        </h1>
        <p className="mt-2 text-white/70">
          Soirée poker, blackjack et roulette entre amis. Pas d'argent réel,
          juste de la frime.
        </p>
      </motion.header>

      <motion.section
        layout
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card w-full"
      >
        {mode === 'menu' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                clearError();
                setMode('create');
              }}
              className="btn-primary py-6 text-lg"
            >
              Créer une room
            </button>
            <button
              type="button"
              onClick={() => {
                clearError();
                setMode('join');
              }}
              className="btn-secondary py-6 text-lg"
            >
              Rejoindre avec un code
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4">
            <BackButton onClick={() => setMode('menu')} />
            <h2 className="text-xl font-semibold">Créer une nouvelle room</h2>
            <UsernameField
              value={pendingUsername}
              onChange={setPendingUsername}
            />
            <button
              type="submit"
              disabled={!usernameValid || !isConnected || isSubmitting}
              className="btn-primary w-full py-3"
            >
              {isSubmitting ? 'Création…' : 'Créer la room'}
            </button>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <BackButton onClick={() => setMode('menu')} />
            <h2 className="text-xl font-semibold">Rejoindre une room</h2>
            <UsernameField
              value={pendingUsername}
              onChange={setPendingUsername}
            />
            <div>
              <label
                htmlFor="room-code"
                className="mb-1 block text-sm font-medium text-white/70"
              >
                Code de la room
              </label>
              <input
                id="room-code"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, ROOM_CONSTRAINTS.ROOM_CODE_LENGTH),
                  )
                }
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="input text-center font-mono text-2xl tracking-[0.5em]"
                maxLength={ROOM_CONSTRAINTS.ROOM_CODE_LENGTH}
              />
            </div>
            <button
              type="submit"
              disabled={
                !usernameValid ||
                code.length !== ROOM_CONSTRAINTS.ROOM_CODE_LENGTH ||
                !isConnected ||
                isSubmitting
              }
              className="btn-primary w-full py-3"
            >
              {isSubmitting ? 'Connexion…' : 'Rejoindre'}
            </button>
          </form>
        )}

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200"
          >
            {error.message}
          </motion.p>
        )}

        {!isConnected && (
          <p className="mt-4 text-center text-xs text-white/40">
            Connexion au serveur en cours…
          </p>
        )}
      </motion.section>
    </div>
  );
}

function UsernameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div>
      <label
        htmlFor="username"
        className="mb-1 block text-sm font-medium text-white/70"
      >
        Votre pseudo
      </label>
      <input
        id="username"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Le Joueur Masqué"
        maxLength={ROOM_CONSTRAINTS.USERNAME_MAX_LENGTH}
        className="input"
        autoComplete="nickname"
      />
      <p className="mt-1 text-xs text-white/40">
        Entre {ROOM_CONSTRAINTS.USERNAME_MIN_LENGTH} et{' '}
        {ROOM_CONSTRAINTS.USERNAME_MAX_LENGTH} caractères.
      </p>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-white/50 transition hover:text-white"
    >
      ← Retour
    </button>
  );
}
