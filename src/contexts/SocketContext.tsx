import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    let disposed = false;
    let currentSocket: Socket | null = null;

    setSocket(null);
    if (!user?.uid) return;

    void import('socket.io-client')
      .then(({ io }) => {
        if (disposed) return;
        currentSocket = io(window.location.origin, {
          transports: ['polling', 'websocket'],
          autoConnect: true,
        });
        setSocket(currentSocket);
      })
      .catch((error) => {
        console.warn('[socket] failed to load realtime client', error);
      });

    return () => {
      disposed = true;
      currentSocket?.disconnect();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!socket || !user?.uid) return;
    const joinRoom = () => socket.emit('join:user', user.uid);
    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);
    return () => { socket.off('connect', joinRoom); };
  }, [socket, user?.uid]);

  return (
    <SocketContext.Provider value={socket}>
      <AppointmentNotificationListener socket={socket} />
      {children}
    </SocketContext.Provider>
  );
}

function AppointmentNotificationListener({ socket }: { socket: Socket | null }) {
  useAppointmentNotifications(socket);
  return null;
}

export function useSocket() {
  return useContext(SocketContext);
}
