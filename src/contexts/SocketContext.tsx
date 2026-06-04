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
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

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
