export function getIcon(id, cls = '') {
  return `<svg class="icon ${cls}"><use href="#icon-${id}"></use></svg>`;
}

export function resIcon(res, cls = '') {
  return getIcon(res, `res-${res} ${cls}`);
}

export const CATEGORY_ICONS = {
  'Dev Team': 'scrap',
  'Sales & Ads': 'energy',
  'QA & DevOps': 'alloy',
  'Marketing & R&D': 'research',
  'Social Media': 'influence',
  'Management': 'briefcase'
};
