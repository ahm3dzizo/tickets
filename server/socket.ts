import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";

let io: SocketServer;

export function setupSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    // Join user-specific room for targeted notifications
    socket.on("join:user", (uid: string) => {
      if (uid) socket.join(`user:${uid}`);
    });

    socket.on("ticket:assign", (data) => {
      io.emit("notification:assignment", data);
    });
  });

  return io;
}

export function getIO(): SocketServer {
  return io;
}
