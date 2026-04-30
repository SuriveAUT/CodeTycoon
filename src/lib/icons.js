export function getIcon(id) {
  return `<svg class="icon"><use href="#icon-${id}"></use></svg>`;
}

export function resIcon(res) {
  return getIcon(res);
}
