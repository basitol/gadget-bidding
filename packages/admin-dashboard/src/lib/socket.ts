import { io, Socket } from 'socket.io-client';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

let socket: Socket | null = null;

function getToken() {
  return localStorage.getItem('gb_admin_token');
}

export function connectAdminSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;

  if (socket?.connected) return socket;

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  return socket;
}

export function getAdminSocket() {
  return socket;
}

export function joinSupportThread(threadId: string) {
  const s = connectAdminSocket();
  if (!s || !threadId) return;
  if (s.connected) {
    s.emit('support:join', threadId);
  } else {
    s.once('connect', () => s.emit('support:join', threadId));
  }
}

export function leaveSupportThread(threadId: string) {
  if (socket?.connected && threadId) {
    socket.emit('support:leave', threadId);
  }
}

export function disconnectAdminSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
