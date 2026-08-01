import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { SOCKET_URL, STORAGE_KEYS, API_BASE_URL } from '../constants';
import { Bid, Auction } from '../types';

type SocketCallback<T> = (data: T) => void;

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<SocketCallback<any>>> = new Map();

  // Refresh token if needed
  private async getValidToken(): Promise<string | null> {
    let token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);

    if (!token) {
      console.log('Socket: No access token available');
      return null;
    }

    // Try to decode and check if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();

      // If token expires in less than 30 seconds, refresh it
      if (expiresAt - now < 30000) {
        console.log('Socket: Token expiring soon, refreshing...');
        const refreshToken = await SecureStore.getItemAsync(
          STORAGE_KEYS.REFRESH_TOKEN
        );

        if (!refreshToken) {
          console.log('Socket: No refresh token available');
          return null;
        }

        try {
          const response = await axios.post(
            `${API_BASE_URL}/auth/refresh-token`,
            {
              refresh_token: refreshToken,
            }
          );

          const { access_token, refresh_token: newRefreshToken } =
            response.data.data || {};

          if (access_token && typeof access_token === 'string') {
            await SecureStore.setItemAsync(
              STORAGE_KEYS.ACCESS_TOKEN,
              access_token
            );
            token = access_token;
            console.log('Socket: Token refreshed successfully');
          }

          if (newRefreshToken && typeof newRefreshToken === 'string') {
            await SecureStore.setItemAsync(
              STORAGE_KEYS.REFRESH_TOKEN,
              newRefreshToken
            );
          }
        } catch (refreshError) {
          console.error('Socket: Failed to refresh token', refreshError);
          return null;
        }
      }
    } catch (e) {
      // If we can't decode the token, just use it as-is
      console.log('Socket: Could not decode token, using as-is');
    }

    return token;
  }

  // Connect to socket server
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      console.log('Socket: Already connected');
      return;
    }

    const token = await this.getValidToken();

    // Don't connect if no token
    if (!token) {
      console.log('Socket: No valid token available, skipping connection');
      return;
    }

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    return new Promise(resolve => {
      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('Socket connected successfully');
        resolve();
      });

      this.socket.on('disconnect', reason => {
        console.log('Socket disconnected:', reason);
      });

      this.socket.on('connect_error', async error => {
        console.error('Socket connection error:', error.message);

        // If token is invalid/expired, try to reconnect with a fresh token
        if (
          error.message === 'Invalid token' ||
          error.message.includes('jwt expired')
        ) {
          console.log(
            'Socket: Token invalid, attempting to reconnect with fresh token...'
          );
          this.socket?.disconnect();
          this.socket = null;

          // Wait a bit and try to reconnect
          setTimeout(async () => {
            await this.connect();
          }, 1000);
        }

        resolve(); // Resolve anyway to not block
      });

      // Set up event listeners
      this.setupEventListeners();

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.socket?.connected) {
          console.log('Socket: Connection timeout, resolving anyway');
          resolve();
        }
      }, 5000);
    });
  }

  // Disconnect from socket server
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  // Join auction room
  joinAuction(auctionId: string): void {
    console.log(
      'Socket: Attempting to join auction room',
      auctionId,
      'connected:',
      this.socket?.connected
    );
    if (this.socket?.connected) {
      this.socket.emit('auction:join', auctionId);
      console.log('Socket: Emitted auction:join for', auctionId);
    } else {
      console.log('Socket: Not connected, will retry joining when connected');
      // Set up a one-time listener to join when connected
      const onConnect = () => {
        console.log('Socket: Now connected, joining auction room', auctionId);
        this.socket?.emit('auction:join', auctionId);
        this.socket?.off('connect', onConnect);
      };
      this.socket?.on('connect', onConnect);
    }
  }

  // Leave auction room
  leaveAuction(auctionId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('auction:leave', auctionId);
    }
  }

  joinSupportThread(threadId: string): void {
    if (!threadId) return;
    if (this.socket?.connected) {
      this.socket.emit('support:join', threadId);
      return;
    }
    const onConnect = () => {
      this.socket?.emit('support:join', threadId);
      this.socket?.off('connect', onConnect);
    };
    this.socket?.on('connect', onConnect);
  }

  leaveSupportThread(threadId: string): void {
    if (this.socket?.connected && threadId) {
      this.socket.emit('support:leave', threadId);
    }
  }

  // Set up event listeners
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Auction state (when joining a room)
    this.socket.on('auction:state', (data: any) => {
      this.emit('auction:state', data);
    });

    // Bid placed event
    this.socket.on(
      'bid:placed',
      (data: {
        bid: Bid;
        amount: number;
        currentPrice: number;
        totalBids: number;
      }) => {
        console.log(
          'Socket: Received bid:placed event from server',
          JSON.stringify(data, null, 2)
        );
        const eventData = {
          auction_id: data.bid.auction_id,
          bid: data.bid,
          current_price: data.currentPrice,
          total_bids: data.totalBids,
        };
        console.log(
          'Socket: Emitting new_bid to local listeners',
          JSON.stringify(eventData, null, 2)
        );
        this.emit('new_bid', eventData);
      }
    );

    // Bid confirmed (for the bidder)
    this.socket.on('bid:confirmed', (data: { bid: Bid }) => {
      this.emit('bid:confirmed', data);
    });

    // Bid error
    this.socket.on('bid:error', (data: { message: string }) => {
      this.emit('bid:error', data);
    });

    // Outbid notification
    this.socket.on(
      'bid:outbid',
      (data: { auctionId: string; newHighestBid: number; message: string }) => {
        this.emit('outbid', {
          auction_id: data.auctionId,
          new_bid: { amount: data.newHighestBid },
        });
      }
    );

    // Auction ended event
    this.socket.on(
      'auction:ended',
      (data: { auctionId: string; winnerId?: string; finalPrice?: number }) => {
        this.emit('auction_ended', {
          auction_id: data.auctionId,
          winner_id: data.winnerId,
        });
      }
    );

    // Auction won notification
    this.socket.on(
      'auction:won',
      (data: { auctionId: string; finalPrice: number; message: string }) => {
        this.emit('auction_won', {
          auction_id: data.auctionId,
        });
      }
    );

    // Auction extended
    this.socket.on(
      'auction:extended',
      (data: {
        auctionId: string;
        newEndTime: Date;
        extendedMinutes: number;
      }) => {
        this.emit('auction:extended', data);
      }
    );

    // Auction ending soon
    this.socket.on(
      'auction:ending_soon',
      (data: { auctionId: string; minutesRemaining: number }) => {
        this.emit('auction:ending_soon', data);
      }
    );

    // Support chat message
    this.socket.on('support:message', (data: unknown) => {
      this.emit('support:message', data);
    });

    // Generic error
    this.socket.on('error', (data: { message: string }) => {
      console.error('Socket error:', data.message);
    });
  }

  // Subscribe to events
  on<T>(event: string, callback: SocketCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  // Emit to local listeners
  private emit<T>(event: string, data: T): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  // Check if connected
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
