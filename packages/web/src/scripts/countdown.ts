import { formatCountdown } from '../data/auctions';

// Demo countdowns on the mockups. Loops back to 3:00 so they never sit at 00:00.
export function startCountdowns() {
  setInterval(() => {
    document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
      let s = Number(el.dataset.countdown) - 1;
      if (s < 0) s = 180;
      el.dataset.countdown = String(s);
      el.textContent = formatCountdown(s);
      if (el.classList.contains('clock')) el.classList.toggle('calm', s >= 3600);
    });
  }, 1000);
}
