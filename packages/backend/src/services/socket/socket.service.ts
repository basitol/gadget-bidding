import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../../config';
import logger from '../../utils/logger';
import * as biddingService from '../bidding/bidding.service';
import * as auctionService from '../auction/auction.service';
import type { JwtPayload } from '../../utils/jwt';

let io: Server;

// Track connected users and their rooms
const connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds
const auctionRooms = new Map<string, Set<string>>(); // auctionId -> Set of userIds

/**
 * Initialize Socket.io server
 */
export const initializeSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin:
        config.isDeployed
          ? [config.frontendUrl, config.mobileAppUrl]
          : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      socket.data.user = decoded;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user?.user_id;

    if (userId) {
      // Track connected user
      if (!connectedUsers.has(userId)) {
        connectedUsers.set(userId, new Set());
      }
      connectedUsers.get(userId)!.add(socket.id);

      logger.info(`User connected: ${userId} (socket: ${socket.id})`);
    }

    // Join support thread room (seller or admin)
    socket.on('support:join', (threadId: string) => {
      if (!threadId || typeof threadId !== 'string') return;
      socket.join(`support:${threadId}`);
      logger.info(
        `User ${userId} joined support thread room ${threadId} (socket: ${socket.id})`
      );
    });

    socket.on('support:leave', (threadId: string) => {
      if (!threadId || typeof threadId !== 'string') return;
      socket.leave(`support:${threadId}`);
    });

    // Join auction room
    socket.on('auction:join', async (auctionId: string) => {
      try {
        // Validate auction exists
        const auction = await auctionService.getAuctionById(auctionId);
        if (!auction) {
          socket.emit('error', { message: 'Auction not found' });
          return;
        }

        // Join the room
        socket.join(`auction:${auctionId}`);

        // Track user in auction room
        if (!auctionRooms.has(auctionId)) {
          auctionRooms.set(auctionId, new Set());
        }
        if (userId) {
          auctionRooms.get(auctionId)!.add(userId);
        }

        // Send current auction state
        const timeRemaining = Math.max(
          0,
          new Date(auction.end_time).getTime() - Date.now()
        );

        socket.emit('auction:state', {
          auction,
          currentPrice: auction.current_price,
          totalBids: auction.total_bids,
          timeRemaining,
          isActive: auction.status === 'active',
        });

        logger.info(`User ${userId} joined auction room: ${auctionId}`);
      } catch (error) {
        logger.error('Join auction error:', error);
        socket.emit('error', { message: 'Failed to join auction' });
      }
    });

    // Leave auction room
    socket.on('auction:leave', (auctionId: string) => {
      socket.leave(`auction:${auctionId}`);

      if (userId && auctionRooms.has(auctionId)) {
        auctionRooms.get(auctionId)!.delete(userId);
      }

      logger.info(`User ${userId} left auction room: ${auctionId}`);
    });

    // Place bid via socket
    socket.on(
      'bid:place',
      async (data: { auctionId: string; amount: number }) => {
        try {
          if (!userId) {
            socket.emit('error', { message: 'Authentication required' });
            return;
          }

          const { bid, previousHighBidderId } = await biddingService.placeBid(
            userId,
            { auction_id: data.auctionId, amount: data.amount }
          );

          // Get updated auction
          const auction = await auctionService.getAuctionById(data.auctionId);

          // Emit bid placed to all users in the auction room
          io.to(`auction:${data.auctionId}`).emit('bid:placed', {
            bid,
            bidder: {
              id: userId,
              full_name: socket.data.user?.full_name || 'Anonymous',
            },
            amount: data.amount,
            timestamp: new Date(),
            totalBids: auction?.total_bids || 0,
            currentPrice: auction?.current_price || data.amount,
          });

          // Notify previous high bidder they've been outbid
          if (previousHighBidderId && previousHighBidderId !== userId) {
            emitToUser(previousHighBidderId, 'bid:outbid', {
              auctionId: data.auctionId,
              newHighestBid: data.amount,
              message: `You've been outbid! New highest bid: ₦${data.amount.toLocaleString()}`,
            });
          }

          // Confirm to bidder
          socket.emit('bid:confirmed', { bid });

          logger.info(`Bid placed via socket: ${bid.id}`);
        } catch (error: any) {
          logger.error('Socket bid error:', error);
          socket.emit('bid:error', {
            message: error.message || 'Failed to place bid',
          });
        }
      }
    );

    // Disconnect handler
    socket.on('disconnect', () => {
      if (userId) {
        const userSockets = connectedUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            connectedUsers.delete(userId);
          }
        }
      }

      logger.info(`User disconnected: ${userId} (socket: ${socket.id})`);
    });
  });

  logger.info('Socket.io server initialized');

  return io;
};

/**
 * Get Socket.io server instance
 */
export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

/**
 * Emit event to a specific user (all their connected sockets)
 */
export const emitToUser = (userId: string, event: string, data: any): void => {
  const userSockets = connectedUsers.get(userId);
  if (userSockets) {
    userSockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  }
};

/**
 * Emit event to all users in an auction room
 */
export const emitToAuction = (
  auctionId: string,
  event: string,
  data: any
): void => {
  io.to(`auction:${auctionId}`).emit(event, data);
};

/**
 * Emit event to everyone watching a support thread
 */
export const emitToSupportThread = (
  threadId: string,
  event: string,
  data: any
): void => {
  if (!io) return;
  io.to(`support:${threadId}`).emit(event, data);
};

/**
 * Broadcast auction ended event
 */
export const broadcastAuctionEnded = (
  auctionId: string,
  winnerId?: string,
  finalPrice?: number
): void => {
  emitToAuction(auctionId, 'auction:ended', {
    auctionId,
    winnerId,
    finalPrice,
    timestamp: new Date(),
  });

  // Notify winner
  if (winnerId) {
    emitToUser(winnerId, 'auction:won', {
      auctionId,
      finalPrice,
      message: `Congratulations! You won the auction for ₦${finalPrice?.toLocaleString()}`,
    });
  }
};

/**
 * Broadcast auction starting soon
 */
export const broadcastAuctionStartingSoon = (
  auctionId: string,
  minutesRemaining: number
): void => {
  emitToAuction(auctionId, 'auction:starting_soon', {
    auctionId,
    minutesRemaining,
    message: `Auction starting in ${minutesRemaining} minutes!`,
  });
};

/**
 * Broadcast auction ending soon
 */
export const broadcastAuctionEndingSoon = (
  auctionId: string,
  minutesRemaining: number
): void => {
  emitToAuction(auctionId, 'auction:ending_soon', {
    auctionId,
    minutesRemaining,
    message: `Auction ending in ${minutesRemaining} minutes!`,
  });
};

/**
 * Broadcast auction extended
 */
export const broadcastAuctionExtended = (
  auctionId: string,
  newEndTime: Date,
  extendedMinutes: number
): void => {
  emitToAuction(auctionId, 'auction:extended', {
    auctionId,
    newEndTime,
    extendedMinutes,
    message: `Auction extended by ${extendedMinutes} minutes!`,
  });
};

/**
 * Get number of users watching an auction
 */
export const getAuctionViewerCount = (auctionId: string): number => {
  return auctionRooms.get(auctionId)?.size || 0;
};

/**
 * Check if user is online
 */
export const isUserOnline = (userId: string): boolean => {
  return connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
};
