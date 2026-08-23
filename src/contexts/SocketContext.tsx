import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
    });
    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !user?.uid) return;
    const joinRoom = () => socket.emit('join:user', user.uid);
    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);
    return () => { socket.off('connect', joinRoom); };
  }, [user?.uid]);

  return (
    <SocketContext.Provider value={socketRef.current}>
      <AppointmentNotificationListener socket={socketRef.current} />
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
