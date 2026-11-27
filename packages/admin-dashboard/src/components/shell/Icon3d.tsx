import autobid from '@/assets/3d/icon-autobid.png';
import bell from '@/assets/3d/icon-bell.png';
import box from '@/assets/3d/icon-box.png';
import camera from '@/assets/3d/icon-camera.png';
import gavel from '@/assets/3d/icon-gavel.png';
import idcard from '@/assets/3d/icon-idcard.png';
import phonecheck from '@/assets/3d/icon-phonecheck.png';
import shield from '@/assets/3d/icon-shield.png';
import store from '@/assets/3d/icon-store.png';
import tag from '@/assets/3d/icon-tag.png';
import truck from '@/assets/3d/icon-truck.png';
import wallet from '@/assets/3d/icon-wallet.png';
import logoMark from '@/assets/brand/logo-mark.svg';
import { cn } from '@/lib/utils';

export const ICONS_3D = {
  autobid,
  bell,
  box,
  camera,
  gavel,
  idcard,
  phonecheck,
  shield,
  store,
  tag,
  truck,
  wallet,
};
export type Icon3dName = keyof typeof ICONS_3D;

/** Brand 3D icon (decorative; the label next to it carries the meaning). */
export function Icon3d({ name, size = 28, className }: { name: Icon3dName; size?: number; className?: string }) {
  return (
    <img
      src={ICONS_3D[name]}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logoMark}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn('shrink-0 select-none', className)}
      style={{ width: size, height: size }}
    />
  );
}
