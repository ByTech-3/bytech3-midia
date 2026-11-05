// Visualizador 3D do pacote de sequilhos (saco de filme transparente + rótulo adesivo + sequilhos dentro).
// Three.js r160. Medidas reais em metros: saco 17 x 27 cm, rótulo 9,5 x 15,5 cm.
import * as THREE from 'three';
import { OrbitControls } from './../vendor/OrbitControls.js';
import { RoomEnvironment } from './../vendor/RoomEnvironment.js';

const BAG = { W: 0.17, H: 0.27, D: 0.028, seal: 0.022 };
const LAB = { w: 0.095, h: 0.155 };
const COOKIE_R = 0.0152;

// ---------------------------------------------------------------- ruído determinístico
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const R0 = rng(11);
const BUMPS = Array.from({ length: 34 }, () => ({ u: 0.12 + R0() * 0.76, v: 0.14 + R0() * 0.72, r: 0.05 + R0() * 0.05, a: 0.5 + R0() * 0.8 }));
const WR = Array.from({ length: 4 }, () => ({ f: 7 + R0() * 5, p: R0() * 6.28, a: 0.4 + R0() * 0.6 }));

const S = BAG.seal / BAG.H;
let LABEL_UV = null; // [u0,u1,v0,v1] calculado pelo comprimento de arco

function labelMask(u, v) {
  if (!LABEL_UV) return 0;
  const [u0, u1, v0, v1] = LABEL_UV;
  const e = 0.02;
  const mu = Math.min(1, Math.max(0, Math.min(u - u0 + e, u1 + e - u) / e));
  const mv = Math.min(1, Math.max(0, Math.min(v - v0 + e, v1 + e - v) / e));
  return mu * mv;
}

// ponto da superfície (lado +1 frente, -1 verso)
function bagPoint(u, v, side, out = new THREE.Vector3()) {
  const tb = (v - S) / (1 - 2 * S);
  const inBody = tb > 0 && tb < 1;
  const hv = inBody ? Math.pow(Math.sin(Math.PI * tb), 0.40) : 0;
  const su = Math.sin(Math.PI * u);
  const hu = Math.pow(Math.max(su, 0), 0.55);
  const pinch = 0.085 * hv;
  const x = (u - 0.5) * BAG.W * (1 - pinch);
  const y = (v - 0.5) * BAG.H;
  let z = BAG.D * hu * hv;
  if (inBody) {
    // relevo dos sequilhos por dentro (menor debaixo do rótulo, que é mais rígido)
    let b = 0;
    for (const k of BUMPS) {
      const d2 = ((u - k.u) / k.r) ** 2 + ((v - k.v) / (k.r * 0.65)) ** 2;
      if (d2 < 4) b += k.a * Math.exp(-d2 * 1.6);
    }
    const lm = side > 0 ? labelMask(u, v) : 0;
    z += 0.0024 * b * hu * hv * (1 - 0.75 * lm);
    // vincos que nascem na solda
    const w = Math.exp(-tb / 0.075) + Math.exp(-(1 - tb) / 0.075);
    let wr = 0;
    for (const k of WR) wr += k.a * Math.sin(u * Math.PI * k.f + k.p + (side > 0 ? 0 : 1.3));
    z += 0.0019 * wr * w * Math.pow(Math.sin(Math.PI * tb), 0.45) * su;
  }
  out.set(x, y, side * (z + 0.00035));
  return out;
}

function arcRange(fixed, len, alongU) {
  // acha [a, b] centrado em 0,5 com comprimento de arco = len
  const P = new THREE.Vector3(), Q = new THREE.Vector3();
  const N = 400; const acc = [0];
  for (let i = 1; i <= N; i++) {
    const t0 = (i - 1) / N, t1 = i / N;
    alongU ? bagPoint(t0, fixed, 1, P) : bagPoint(fixed, t0, 1, P);
    alongU ? bagPoint(t1, fixed, 1, Q) : bagPoint(fixed, t1, 1, Q);
    acc.push(acc[i - 1] + P.distanceTo(Q));
  }
  const mid = acc[N / 2];
  const at = (target) => { for (let i = 1; i <= N; i++) if (acc[i] >= target) return (i - 1 + (target - acc[i - 1]) / (acc[i] - acc[i - 1])) / N; return 1; };
  return [at(mid - len / 2), at(mid + len / 2)];
}

function surfaceGeometry(side, u0, u1, v0, v1, nu, nv, offset, uvFn) {
  const pos = [], uv = [], idx = [];
  const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), n = new THREE.Vector3();
  const eps = 1e-3;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv;
      bagPoint(u, v, side, P);
      if (offset) {
        bagPoint(Math.min(u + eps, 1), v, side, A).sub(bagPoint(Math.max(u - eps, 0), v, side, n));
        bagPoint(u, Math.min(v + eps, 1), side, B).sub(bagPoint(u, Math.max(v - eps, 0), side, n));
        n.crossVectors(A, B).normalize().multiplyScalar(side);
        P.addScaledVector(n, offset * (n.z * side > 0 ? 1 : -1));
      }
      pos.push(P.x, P.y, P.z);
      const t = uvFn(u, v);
      uv.push(t[0], t[1]);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
    if (side > 0) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- texturas do filme (estampa do saco, solda, serrilha)
function filmTextures() {
  const w = 1024, h = Math.round(1024 * BAG.H / BAG.W);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const [cc, cx] = mk(); const [tc, tx] = mk(); const [ac, ax] = mk(); const [rc, rx] = mk();
  cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
  tx.fillStyle = '#ffffff'; tx.fillRect(0, 0, w, h);          // transmissão total (filme limpo)
  rx.fillStyle = '#0d0d0d'; rx.fillRect(0, 0, w, h);          // filme liso e brilhante
  ax.fillStyle = '#ffffff'; ax.fillRect(0, 0, w, h);
  const sealPx = h * S, band = h * 0.17;
    // faixas impressas: sequilhos em traço branco sobre o filme transparente (como o saco atual), em cima e embaixo
  for (const top of [true, false]) {
    const y0 = top ? 0 : h - band;
    const edge = (x) => (top ? band : h - band) + Math.sin(x / w * Math.PI * 2 + (top ? 0 : 2)) * 14 * (top ? 1 : -1);
    for (const [g, cor] of [[cx, '#fffdf8'], [tx, '#000000']]) {
      g.save(); g.beginPath();
      g.moveTo(0, top ? 0 : h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, edge(x));
      g.lineTo(w, top ? 0 : h); g.closePath(); g.clip();
      g.strokeStyle = cor; g.lineWidth = 5; g.lineCap = 'round';
      const r2 = rng(top ? 5 : 9);
      for (let yy = y0 - 40; yy < y0 + band + 40; yy += 58) for (let xx = -40; xx < w + 40; xx += 58) {
        const x = xx + (Math.floor(yy / 58) % 2 ? 29 : 0) + (r2() - 0.5) * 12, y = yy + (r2() - 0.5) * 12, r = 18 + r2() * 4;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
        const a2 = r2() * Math.PI;
        for (const k of [-1, 0, 1]) {
          const ox = Math.cos(a2 + Math.PI / 2) * k * r * 0.38, oy = Math.sin(a2 + Math.PI / 2) * k * r * 0.38, l = r * (k ? 0.45 : 0.6);
          g.beginPath(); g.moveTo(x + ox - Math.cos(a2) * l, y + oy - Math.sin(a2) * l); g.lineTo(x + ox + Math.cos(a2) * l, y + oy + Math.sin(a2) * l); g.stroke();
        }
      }
      g.restore();
      // filete marrom acompanhando a borda da faixa
      g.strokeStyle = g === cx ? '#6b4226' : '#000000'; g.lineWidth = 7; g.beginPath();
      for (let x = 0; x <= w; x += 16) { const y = edge(x) + (top ? -10 : 10); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  }
  // solda: frisos horizontais (mais fosco) + serrilha recortada
  for (const top of [true, false]) {
    const y0 = top ? 0 : h - sealPx;
    for (let y = y0 + 6; y < y0 + sealPx - 4; y += 9) {
      cx.fillStyle = 'rgba(225,220,210,0.6)'; cx.fillRect(0, y, w, 3); tx.fillStyle = '#9a9a9a'; tx.fillRect(0, y, w, 3);
      rx.fillStyle = '#8a8a8a'; rx.fillRect(0, y, w, 4);
    }
    ax.fillStyle = '#000000';
    const tooth = 22;
    ax.beginPath();
    for (let x = 0; x <= w; x += tooth) {
      const yA = top ? 0 : h, yB = top ? 9 : h - 9;
      ax.moveTo(x, yA); ax.lineTo(x + tooth / 2, yB); ax.lineTo(x + tooth, yA);
    }
    ax.fill();
  }
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { map: tex(cc, true), transmission: tex(tc), alpha: tex(ac), rough: tex(rc) };
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- sequilhos
function cookieGeometry() {
  const r = COOKIE_R, hh = 0.0118;
  const prof = [[0, 0], [r * 0.78, 0], [r * 0.95, hh * 0.08], [r, hh * 0.25], [r * 0.97, hh * 0.47], [r * 0.85, hh * 0.7], [r * 0.6, hh * 0.9], [r * 0.3, hh * 0.98], [0, hh]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 30);
  g.translate(0, -hh / 2, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * r) * 0.92, 0.5 - p.getZ(i) / (2 * r) * 0.92);
  g.computeVertexNormals();
  return g;
}

function packCookies(n, seed) {
  // distribui ~n sequilhos dentro do volume do saco sem atravessar o filme (folga calculada pela inclinação de cada um)
  const R = rng(seed); const hh = 0.0118;
  const half = (u, v) => bagPoint(Math.min(Math.max(u, 0.001), 0.999), Math.min(Math.max(v, 0.001), 0.999), 1).z - 0.00035;
  const W2 = BAG.W * 0.915;
  const cs = [];
  for (let i = 0; i < n * 8 && cs.length < n; i++) {
    const u = 0.14 + R() * 0.72, v = S + 0.08 + R() * (1 - 2 * S - 0.16);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (R() - 0.5) * 0.8, (R() - 0.5) * 0.7, R() * Math.PI * 2));
    if (R() < 0.5) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
    const s = 0.9 + R() * 0.16, sy = 0.88 + R() * 0.24;
    const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const ez = Math.abs(ax.z) * hh / 2 * sy + Math.sqrt(Math.max(0, 1 - ax.z * ax.z)) * COOKIE_R * s + 0.0012;
    const lim = half(u, v) - ez;
    if (lim < 0.0005) continue;
    cs.push({ p: new THREE.Vector3((u - 0.5) * W2, (v - 0.5) * BAG.H, (R() * 2 - 1) * lim), q, s, sy, ez });
  }
  const d = COOKIE_R * 1.6;
  for (let it = 0; it < 80; it++) {
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
      const D = cs[b].p.clone().sub(cs[a].p); D.z *= 2.0;
      const L = D.length();
      if (L < d && L > 1e-6) { D.multiplyScalar((d - L) / L * 0.5); D.z /= 2.0; cs[a].p.sub(D); cs[b].p.add(D); }
    }
    for (const c of cs) {
      const u = Math.min(Math.max(c.p.x / W2 + 0.5, 0.14), 0.86), v = Math.min(Math.max(c.p.y / BAG.H + 0.5, S + 0.07), 1 - S - 0.07);
      c.p.x = (u - 0.5) * W2; c.p.y = (v - 0.5) * BAG.H;
      const lim = Math.max(half(u, v) - c.ez, 0);
      c.p.z = Math.min(Math.max(c.p.z, -lim), lim);
      c.ok = half(u, v) - c.ez > 0.0003;
    }
  }
  return cs.filter((c) => c.ok).map((c) => new THREE.Matrix4().compose(c.p, c.q, new THREE.Vector3(c.s, c.sy, c.s)));
}

// ---------------------------------------------------------------- pacote
export class Pacote {
  constructor(shared, seed = 1) {
    this.group = new THREE.Group();
    const { film, frontGeo, backGeo, labelFGeo, labelBGeo, cookieGeo, cookieMat } = shared;
    this.film = film;
    this.front = new THREE.Mesh(frontGeo, film); this.back = new THREE.Mesh(backGeo, film);
    // papel do rótulo fora do tone mapping: as cores na tela batem com o arquivo da gráfica
    const papel = () => new THREE.MeshPhysicalMaterial({ roughness: 0.55, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.4, envMapIntensity: 0.3,
      emissive: 0xffffff, emissiveIntensity: 0.1, alphaTest: 0.5, toneMapped: false });
    this.labelF = new THREE.Mesh(labelFGeo, papel());
    this.labelB = new THREE.Mesh(labelBGeo, papel());
    this.cookieMat = cookieMat.clone();
    const mats = packCookies(54, seed);
    this.cookies = new THREE.InstancedMesh(cookieGeo, this.cookieMat, mats.length);
    mats.forEach((m, i) => this.cookies.setMatrixAt(i, m));
    for (const m of [this.front, this.back, this.labelF, this.labelB, this.cookies]) { m.castShadow = m !== this.cookies; this.group.add(m); }
    this.front.receiveShadow = this.back.receiveShadow = false;
  }
  setLabels(texF, texB, tint) {
    for (const [m, t] of [[this.labelF.material, texF], [this.labelB.material, texB]]) { m.map = t; m.emissiveMap = t; m.needsUpdate = true; }
    if (tint) this.cookieMat.color.set(tint);
  }
}

export function criarCompartilhado(renderer, cookieTexUrl) {
  const [lu0, lu1] = arcRange(0.5, LAB.w, true);
  const [lv0, lv1] = arcRange(0.5, LAB.h, false);
  LABEL_UV = [lu0, lu1, lv0 - 0.012, lv1 - 0.012];
  const [u0, u1, v0, v1] = LABEL_UV;
  const ft = filmTextures();
  const film = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: ft.map, transmission: 1, transmissionMap: ft.transmission, thickness: 0.0004, ior: 1.46,
    roughness: 1, roughnessMap: ft.rough, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.08,
    alphaMap: ft.alpha, alphaTest: 0.5, specularIntensity: 1, envMapIntensity: 1.25, side: THREE.FrontSide,
  });
  const nu = 84, nv = 132;
  const frontGeo = surfaceGeometry(1, 0, 1, 0, 1, nu, nv, 0, (u, v) => [u, v]);
  const backGeo = surfaceGeometry(-1, 0, 1, 0, 1, nu, nv, 0, (u, v) => [1 - u, v]);
  const labelFGeo = surfaceGeometry(1, u0, u1, v0, v1, 50, 82, 0.0011, (u, v) => [(u - u0) / (u1 - u0), (v - v0) / (v1 - v0)]);
  const labelBGeo = surfaceGeometry(-1, u0, u1, v0, v1, 50, 82, 0.0011, (u, v) => [(u1 - u) / (u1 - u0), (v - v0) / (v1 - v0)]);
  const ct = new THREE.TextureLoader().load(cookieTexUrl); ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = 4;
  const cookieMat = new THREE.MeshStandardMaterial({ map: ct, bumpMap: ct, bumpScale: 2.2, roughness: 0.95, metalness: 0, color: 0xe2c08c, envMapIntensity: 0.6 });
  return { film, frontGeo, backGeo, labelFGeo, labelBGeo, cookieGeo: cookieGeometry(), cookieMat };
}

// ---------------------------------------------------------------- cena
export class Palco {
  constructor(canvas, { cookieTex }) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAniso = r.capabilities.getMaxAnisotropy();
    const scene = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(r), 0.035).texture;
    const cam = this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
    cam.position.set(0.24, 0.05, 0.68);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-0.6, 0.9, 1.0); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -0.4; key.shadow.camera.right = key.shadow.camera.top = 0.4; key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe2b0, 1.6); rim.position.set(0.7, 0.5, -0.9); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xfff8ef, 0x3a2a1c, 0.55));
    const topo = new THREE.DirectionalLight(0xffffff, 1.1); topo.position.set(0.25, 1.3, 0.35); scene.add(topo);
    const ctl = this.controls = new OrbitControls(cam, canvas);
    ctl.enableDamping = true; ctl.dampingFactor = 0.07; ctl.enablePan = false;
    ctl.minDistance = 0.32; ctl.maxDistance = 4.5; ctl.minPolarAngle = Math.PI * 0.18; ctl.maxPolarAngle = Math.PI * 0.82;
    ctl.autoRotate = true; ctl.autoRotateSpeed = 1.5; ctl.rotateSpeed = 0.8;
    this.girar = true; this._idle = null;
    ctl.addEventListener('start', () => { ctl.autoRotate = false; clearTimeout(this._idle); this._tween = null; });
    ctl.addEventListener('end', () => { clearTimeout(this._idle); this._idle = setTimeout(() => { if (this.girar) ctl.autoRotate = true; }, 3500); });
    this.shared = criarCompartilhado(r, cookieTex);
    this.sombra = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    this.sombra.rotation.x = -Math.PI / 2; this.sombra.position.y = -0.2; scene.add(this.sombra);
    this.pacotes = []; this.modo = 'um';
    this.root = new THREE.Group(); scene.add(this.root);
    this.loader = new THREE.TextureLoader();
    this.cache = new Map();
    this.clock = new THREE.Clock();
    this.resize(); window.addEventListener('resize', () => this.resize());
    if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reduzido) { ctl.autoRotate = false; this.girar = false; }
    r.setAnimationLoop(() => this.frame());
  }
  resize() {
    const c = this.renderer.domElement, w = c.parentElement.clientWidth, h = c.parentElement.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 40 : 30;
    this.camera.updateProjectionMatrix();
    if (this.layout && !this._tween) this.irPara(this.distancia(), null);
  }
  tex(url) {
    if (!this.cache.has(url)) {
      this.cache.set(url, new Promise((ok, ko) => this.loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.maxAniso; ok(t); }, undefined, ko)));
    }
    return this.cache.get(url);
  }
  garantir(n) {
    while (this.pacotes.length < n) { const p = new Pacote(this.shared, 7 + this.pacotes.length * 13); this.pacotes.push(p); this.root.add(p.group); }
  }
  async mostrar(itens, modo = 'um') {
    // itens: [{frente, verso, tom}]
    const texs = await Promise.all(itens.map((i) => Promise.all([this.tex(i.frente), this.tex(i.verso)])));
    this.garantir(itens.length);
    this.modo = modo;
    this.pacotes.forEach((p, k) => { p.group.visible = k < itens.length; if (k < itens.length) p.setLabels(texs[k][0], texs[k][1], itens[k].tom); });
    const n = itens.length;
    const cols = n === 1 ? 1 : (this.camera.aspect < 0.95 ? 3 : n), rows = Math.ceil(n / cols);
    const sx = 0.205, sy = 0.31;
    this.pacotes.slice(0, n).forEach((p, k) => {
      const c = k % cols, r = Math.floor(k / cols);
      const x = (c - (cols - 1) / 2) * sx, y = ((rows - 1) / 2 - r) * sy;
      p.base = new THREE.Vector3(x, y, -Math.abs(x) * 0.3); p.yaw = n === 1 ? 0 : -x * 0.9;
    });
    this.sombra.visible = rows === 1;
    this.sombra.scale.set(n === 1 ? 1 : cols * 0.55, 1, n === 1 ? 1 : 1.6);
    this.layout = { cols, rows, n };
    this.irPara(this.distancia(), n === 1 ? null : 0);
    this._primeira = false;
  }
  distancia() {
    const { cols = 1, rows = 1 } = this.layout || {};
    const vt = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hw = cols === 1 ? 0.12 : cols * 0.205 / 2 + 0.06, hh = rows === 1 ? 0.185 : rows * 0.31 / 2 + 0.05;
    return Math.max(hh / vt, hw / (vt * this.camera.aspect)) * 1.04;
  }
  irPara(dist, azimute) {
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    this._tween = { r0: sph.radius, r1: dist ?? sph.radius, t0: sph.theta, t1: azimute ?? sph.theta, p0: sph.phi, p1: Math.PI / 2 - 0.04, k: 0 };
  }
  verso() {
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    const alvo = Math.cos(sph.theta) > 0 ? Math.PI : 0;
    let d = alvo - sph.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.controls.autoRotate = false; clearTimeout(this._idle);
    this._idle = setTimeout(() => { if (this.girar) this.controls.autoRotate = true; }, 5000);
    this.irPara(null, sph.theta + d);
  }
  setGirar(on) { this.girar = on; this.controls.autoRotate = on; }
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    if (this._tween) {
      const w = this._tween; w.k = Math.min(1, w.k + dt / 1.1);
      const e = w.k < 0.5 ? 2 * w.k * w.k : 1 - Math.pow(-2 * w.k + 2, 2) / 2;
      const sph = new THREE.Spherical(w.r0 + (w.r1 - w.r0) * e, w.p0 + (w.p1 - w.p0) * e, w.t0 + (w.t1 - w.t0) * e);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      if (w.k >= 1) this._tween = null;
    }
    const amp = this.reduzido ? 0 : 1;
    this.pacotes.forEach((p, k) => {
      if (!p.group.visible || !p.base) return;
      const f = t * 1.05 + k * 0.9;
      p.group.position.set(p.base.x, p.base.y + Math.sin(f) * 0.009 * amp, p.base.z);
      p.group.rotation.set(Math.sin(f * 0.8) * 0.035 * amp, p.yaw + Math.sin(f * 0.5) * 0.05 * amp, Math.sin(f * 0.65) * 0.025 * amp);
    });
    const h = this.pacotes[0]?.group.position.y ?? 0;
    this.sombra.material.opacity = 0.75 - h * 12;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
