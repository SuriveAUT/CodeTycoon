const handlers = [];

export function onToast(fn) {
  handlers.push(fn);
  return () => {
    const i = handlers.indexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function emitToast(message, type = 'good') {
  for (const fn of handlers) fn(message, type);
}
