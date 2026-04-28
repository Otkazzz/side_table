import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { GAME_DEFINITIONS, GAME_IDS, type GameId } from '@shared/types/room';

import blackjackImg from '@/image/bj.jpg';
import pokerImg from '@/image/poker.jpg';
import rouletteImg from '@/image/roulette.jpg';

import { PlayerList } from '@/components/PlayerList';
import { useSocket } from '@/hooks/useSocket';
import { selectIsHost, useRoomStore } from '@/stores/useRoomStore';

const GAME_DESCRIPTIONS: Record<GameId, string> = {
  blackjack: 'Affrontez le crupier — 21 ou rien.',
  poker: 'Bluff, mises et nerfs d’acier.',
  roulette: 'Rouge, noir, ou la chance du zéro.',
};

const GAME_IMAGES: Record<GameId, string> = {
  blackjack: blackjackImg,
  poker: pokerImg,
  roulette: rouletteImg,
};

const GAME_OPTIONS = GAME_IDS.map((id) => ({
  ...GAME_DEFINITIONS[id],
  description: GAME_DESCRIPTIONS[id],
  image: GAME_IMAGES[id],
}));

/**
 * Page d'une room : affiche la liste des joueurs en temps réel et expose
 * les actions « Lancer la partie » (host) / « Quitter » (tout le monde).
 *
 * Si l'utilisateur arrive ici en tapant l'URL directement (refresh,
 * partage de lien…) on le renvoie au lobby pour qu'il choisisse un pseudo
 * — le serveur exige un `room:join` explicite.
 */
export function RoomPage(): JSX.Element {
  const { code: routeCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const currentRoom = useRoomStore((s) => s.currentRoom);
  const error = useRoomStore((s) => s.error);
  const status = useRoomStore((s) => s.status);
  const selfId = useRoomStore((s) => s.selfId);
  const isHost = useRoomStore(selectIsHost);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const startGame = useRoomStore((s) => s.startGame);
  const clearError = useRoomStore((s) => s.clearError);

  const [copied, setCopied] = useState<boolean>(false);
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);

  // Garde-fou : sans room en mémoire, on renvoie au lobby.
  // Cela couvre : refresh de la page, navigation directe par URL, etc.
  useEffect(() => {
    if (status === 'idle' && !currentRoom) {
      navigate('/lobby', { replace: true });
    }
  }, [status, currentRoom, navigate]);

  // Sécurité supplémentaire : si le code de l'URL ne correspond pas à la
  // room réellement chargée (ex: redirection serveur), on resynchronise l'URL.
  useEffect(() => {
    if (currentRoom && routeCode && currentRoom.code !== routeCode.toUpperCase()) {
      navigate(`/room/${currentRoom.code}`, { replace: true });
    }
  }, [currentRoom, routeCode, navigate]);

  const handleLeave = async (): Promise<void> => {
    await leaveRoom(socket);
    navigate('/lobby');
  };

  const handleStart = async (): Promise<void> => {
    if (!selectedGame) return;
    await startGame(socket, selectedGame);
    // Pour ce ticket on reste sur la page et on affiche juste le statut :
    // c'est la prochaine itération (game engine Blackjack) qui ajoutera
    // une route /game/:code et la navigation correspondante.
  };

  const handleCopyCode = async (): Promise<void> => {
    if (!currentRoom) return;
    try {
      await navigator.clipboard.writeText(currentRoom.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refusé (navigateur, contexte non-sécurisé) : on ignore.
    }
  };

  if (!currentRoom) {
    // État transitoire (le useEffect plus haut va déclencher la redirection).
    return (
      <div className="flex min-h-screen items-center justify-center text-white/60">
        Chargement…
      </div>
    );
  }

  const playersCount = currentRoom.players.length;
  const selectedGameMeta =
    GAME_OPTIONS.find((g) => g.id === selectedGame) ?? null;
  const minPlayersForGame = selectedGameMeta?.minPlayers ?? null;
  const hasEnoughPlayersForGame =
    minPlayersForGame !== null && playersCount >= minPlayersForGame;
  const canStart =
    isHost &&
    currentRoom.status === 'waiting' &&
    selectedGameMeta !== null &&
    hasEnoughPlayersForGame;

  const launchHelperText = ((): string => {
    if (!selectedGameMeta) {
      return 'Choisis un jeu pour pouvoir lancer la partie !';
    }
    if (!hasEnoughPlayersForGame) {
      const min = selectedGameMeta.minPlayers;
      const plural = min > 1 ? 'joueurs' : 'joueur';
      return `Il faut au moins ${min} ${plural} pour lancer ${selectedGameMeta.label}.`;
    }
    return `Quand tout le monde est prêt, lance ${selectedGameMeta.label}.`;
  })();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">
            Code de la room
          </p>
          <button
            type="button"
            onClick={handleCopyCode}
            className="group flex items-center gap-3 font-display text-4xl font-bold tracking-[0.3em] text-gold-400"
            title="Cliquer pour copier le code"
          >
            {currentRoom.code}
            <span className="text-xs font-sans tracking-normal text-white/40 transition group-hover:text-white/70">
              {copied ? 'Copié !' : 'Copier'}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={handleLeave}
          className="btn-secondary"
        >
          Quitter
        </button>
      </header>

      <section className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Joueurs{' '}
            <span className="text-white/40">
              ({playersCount}/{currentRoom.maxPlayers})
            </span>
          </h2>
          <StatusBadge status={currentRoom.status} />
        </div>

        <PlayerList
          players={currentRoom.players}
          selfId={selfId}
          maxPlayers={currentRoom.maxPlayers}
        />

      </section>

      <section className="card mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Choix du jeu</h2>
          {selectedGameMeta && (
            <span className="rounded-full bg-gold-500/20 px-3 py-1 text-xs font-semibold text-gold-400">
              {selectedGameMeta.label}
            </span>
          )}
        </div>

        <div
          role="radiogroup"
          aria-label="Sélection du jeu"
          className="grid gap-3 sm:grid-cols-3"
        >
          {GAME_OPTIONS.map((game) => {
            const isSelected = selectedGame === game.id;
            const disabled = !isHost;
            return (
              <button
                key={game.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() =>
                  setSelectedGame((prev) => (prev === game.id ? null : game.id))
                }
                className={[
                  'group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  isSelected
                    ? 'border-gold-400 bg-gold-500/10 shadow-[0_0_0_1px_rgba(212,175,55,0.4)]'
                    : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10',
                ].join(' ')}
              >
                <div
                  className={[
                    'relative h-16 w-full overflow-hidden rounded-lg',
                    'ring-1 transition-all',
                    isSelected ? 'ring-gold-400/60' : 'ring-white/10',
                  ].join(' ')}
                >
                  <img
                    src={game.image}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                </div>

                <div className="flex w-full items-center justify-between px-1">
                  <span className="font-semibold text-white">{game.label}</span>
                  <span
                    aria-hidden
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-full border',
                      isSelected
                        ? 'border-gold-400 bg-gold-400'
                        : 'border-white/30 bg-transparent',
                    ].join(' ')}
                  >
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-felt-900" />
                    )}
                  </span>
                </div>
                <p className="px-1 text-xs text-white/60">{game.description}</p>
                <p className="px-1 text-[11px] uppercase tracking-wider text-white/40">
                  {game.minPlayers === 1
                    ? '1 joueur min.'
                    : `${game.minPlayers} joueurs min.`}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isHost ? (
            <>
              <p className="text-sm text-white/60">{launchHelperText}</p>
              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart}
                className="btn-primary"
              >
                Lancer la partie
              </button>
            </>
          ) : (
            <p className="text-sm text-white/60">
              {selectedGameMeta
                ? `En attente que l'hôte lance ${selectedGameMeta.label}…`
                : "En attente que l'hôte choisisse un jeu…"}
            </p>
          )}
        </div>
      </section>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-2 text-sm text-red-100 backdrop-blur"
            role="alert"
            onClick={clearError}
          >
            {error.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: 'waiting' | 'playing' }): JSX.Element {
  const isWaiting = status === 'waiting';
  return (
    <span
      className={
        isWaiting
          ? 'rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70'
          : 'rounded-full bg-gold-500/20 px-3 py-1 text-xs font-semibold text-gold-400'
      }
    >
      {isWaiting ? 'En attente' : 'Partie en cours'}
    </span>
  );
}
