/** Shared floating tooltip. One instance, positioned near the pointer/element. */
import { clear, el } from './dom.js';

const tip = document.getElementById('tooltip');

export function showTooltip(x, y, title, sub) {
  clear(tip);
  tip.append(el('div', { text: title }));
  if (sub) tip.append(el('div', { class: 'tt-sub', text: sub }));
  tip.hidden = false;

  const pad = 12;
  const rect = tip.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
  tip.style.left = `${Math.max(4, left)}px`;
  tip.style.top = `${Math.max(4, top)}px`;
}

export function hideTooltip() {
  tip.hidden = true;
}
