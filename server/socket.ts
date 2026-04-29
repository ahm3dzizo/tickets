import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";

let io: SocketServer;

export function setupSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    socket.on("ticket:assign", (data) => {
      io.emit("notification:assignment", data);
    });
  });

  return io;
}

export function getIO(): SocketServer {
  return io;
}
