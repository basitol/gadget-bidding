export { default as api, getErrorMessage } from './api';
export { authService } from './auth.service';
export { walletService } from './wallet.service';
export { auctionService } from './auction.service';
export type {
  GadgetCategory,
  CreateGadgetData,
  SellerDashboard,
} from './auction.service';
export { orderService } from './order.service';
export { addressService } from './address.service';
export { notificationService } from './notification.service';
export { socketService } from './socket.service';
export { supportService } from './support.service';
export type { SupportThread, SupportMessage } from './support.service';
