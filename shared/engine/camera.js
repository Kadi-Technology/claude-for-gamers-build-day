// Cámara 2D.
// Contrato: createCamera(viewW, viewH) -> { x, y, follow(target, dt), shake(intensity, ms), apply(ctx),
//                                          worldToScreen(), screenToWorld() }
// Convención: (x, y) es la esquina SUPERIOR IZQUIERDA de la vista en coordenadas de mundo; la vista cubre
// [x, x + viewW] x [y, y + viewH]. La escala es 1 (sin zoom).
//   follow(target, dt)       suaviza la cámara hacia centrar a target {x, y}. Sin dt (o con dt <= 0) se coloca de golpe.
//                            Debe llamarse una vez por tick (también avanza el temblor).
//   shake(intensity, ms)     temblor en píxeles que decae linealmente; un temblor más débil no pisa a uno más fuerte.
//   apply(ctx)               ctx.translate(-cam) para dibujar en coordenadas de mundo (envolver en ctx.save()/restore()).
//   worldToScreen(wx, wy, out?) / screenToWorld(sx, sy, out?)   incluyen el temblor, así que coinciden con lo dibujado.
// Extras: setBounds(w, h) limita la cámara al mundo [0,w] x [0,h]; snap(target); update(dt) (solo temblor, para escenas sin
// follow); resize(w, h); isVisible(x, y, r); viewW, viewH, smooth.

const prefersReducedMotion = () => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function createCamera(viewW, viewH) {
  let shakeI = 0;
  let shakeT = 0;
  let shakeDur = 0;
  let ox = 0;
  let oy = 0;
  let placed = false;
  const shakeScale = prefersReducedMotion() ? 0.35 : 1;

  const cam = {
    x: 0,
    y: 0,
    viewW: viewW,
    viewH: viewH,
    smooth: 10, // 1/s: mayor = sigue más pegado
    bounds: null, // { w, h } o null

    follow(target, dt) {
      if (!target) return cam;
      let tx = target.x - cam.viewW / 2;
      let ty = target.y - cam.viewH / 2;
      if (cam.bounds) {
        tx = clampAxis(tx, cam.bounds.w, cam.viewW);
        ty = clampAxis(ty, cam.bounds.h, cam.viewH);
      }
      if (!placed || !(dt > 0)) {
        cam.x = tx;
        cam.y = ty;
        placed = true;
      } else {
        const k = 1 - Math.exp(-cam.smooth * dt);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
      }
      stepShake(dt);
      return cam;
    },

    snap(target) {
      placed = false;
      return cam.follow(target, 0);
    },

    update(dt) {
      stepShake(dt);
      return cam;
    },

    shake(intensity, ms) {
      const i = (+intensity || 0) * shakeScale;
      const t = (+ms || 0) / 1000;
      if (i <= 0 || t <= 0) return;
      const current = shakeDur > 0 ? shakeI * (shakeT / shakeDur) : 0;
      if (i >= current) {
        shakeI = i;
        shakeT = t;
        shakeDur = t;
      }
    },

    apply(ctx) {
      ctx.translate(-Math.round(cam.x + ox), -Math.round(cam.y + oy));
    },

    worldToScreen(wx, wy, out) {
      const o = out || {};
      o.x = wx - Math.round(cam.x + ox);
      o.y = wy - Math.round(cam.y + oy);
      return o;
    },

    screenToWorld(sx, sy, out) {
      const o = out || {};
      o.x = sx + Math.round(cam.x + ox);
      o.y = sy + Math.round(cam.y + oy);
      return o;
    },

    setBounds(w, h) {
      cam.bounds = w > 0 && h > 0 ? { w, h } : null;
      return cam;
    },

    resize(w, h) {
      cam.viewW = w;
      cam.viewH = h;
      return cam;
    },

    isVisible(x, y, r = 0) {
      const sx = cam.x + ox;
      const sy = cam.y + oy;
      return x + r >= sx && x - r <= sx + cam.viewW && y + r >= sy && y - r <= sy + cam.viewH;
    },
  };

  function clampAxis(t, worldSize, viewSize) {
    if (worldSize <= viewSize) return (worldSize - viewSize) / 2; // mundo más chico que la vista: centrar
    return t < 0 ? 0 : t > worldSize - viewSize ? worldSize - viewSize : t;
  }

  function stepShake(dt) {
    if (shakeT <= 0) {
      ox = 0;
      oy = 0;
      return;
    }
    const mag = shakeI * (shakeT / shakeDur);
    ox = (Math.random() * 2 - 1) * mag;
    oy = (Math.random() * 2 - 1) * mag;
    shakeT -= dt > 0 ? dt : 1 / 60;
    if (shakeT <= 0) {
      shakeT = 0;
      shakeI = 0;
      shakeDur = 0;
      ox = 0;
      oy = 0;
    }
  }

  return cam;
}

export default createCamera;
