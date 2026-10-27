// Ayudantes de DOM. Todo el texto dinámico (alias incluido) se pinta con textContent, nunca con innerHTML.

export function el(tag, cls, text, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
  return n;
}

export function add(parent, ...kids) {
  for (const k of kids) if (k) parent.appendChild(k);
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/** Formatea un entero con separador de miles (es-MX). */
export function fmt(n) {
  try {
    return Math.round(n).toLocaleString('es-MX');
  } catch {
    return String(Math.round(n));
  }
}
