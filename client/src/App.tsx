import { useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { useSocket } from '@/hooks/useSocket';
import { LobbyPage } from '@/pages/LobbyPage';
import { RoomPage } from '@/pages/RoomPage';
import { useRoomStore } from '@/stores/useRoomStore';

/**
 * Racine de l'app.
 *
 * On branche les listeners Socket.io **une seule fois** ici, au plus haut
 * niveau, pour que les événements soient toujours reçus même quand on
 * change de page.
 */
export function App(): JSX.Element {
  const { socket } = useSocket();
  const attachSocket = useRoomStore((s) => s.attachSocket);

  useEffect(() => {
    attachSocket(socket);
  }, [socket, attachSocket]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/lobby" replace />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </Router>
  );
}
