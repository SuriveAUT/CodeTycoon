export function getIcon(id, cls = '') {
  return `<svg class="icon ${cls}"><use href="#icon-${id}"></use></svg>`;
}

export function resIcon(res, cls = '') {
  return getIcon(res, `res-${res} ${cls}`);
}

import { CATEGORIES } from '../data/buildings.js';

export const CATEGORY_ICONS = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));
