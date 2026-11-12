// Render: renderizador, materiales toon, contornos, cielo de atardecer, luz con sombras,
// pétalos (animados en GPU) y resolución adaptativa.
import * as THREE from 'three';

export const COLORES = {
  melocoton: 0xFFB38A,
  lila: 0x9B8CFF,
  sakura: 0xFF8FB8,
  cian: 0x3EE0FF,
  indigo: 0x2A2350,
  papel: 0xFFF7EE,
  horizonte: 0xFFC9A8,
};

const esMovil = matchMedia('(pointer: coarse)').matches;

// Rampa de 3 tonos: el sombreado plano del anime.
function rampaToon() {
  const datos = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(datos, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export const rampa = rampaToon();
const cacheToon = new Map();

// Material toon con colores por vértice (un solo material para casi todo: menos cambios de estado).
export function materialToon({ vertexColors = true, color = 0xffffff, emisivo = 0x000000 } = {}) {
  const clave = `${vertexColors}-${color}-${emisivo}`;
  if (cacheToon.has(clave)) return cacheToon.get(clave);
  const m = new THREE.MeshToonMaterial({ color, vertexColors, gradientMap: rampa, emissive: emisivo });
  cacheToon.set(clave, m);
  return m;
}

// Contorno por "casco invertido": se dibuja la cara trasera extruida por la normal.
export const materialContorno = new THREE.ShaderMaterial({
  uniforms: { grosor: { value: 0.022 }, color: { value: new THREE.Color(COLORES.indigo) } },
  vertexShader: `
    uniform float grosor;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vec3 p = position + normal * grosor;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `
    uniform vec3 color;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(color, 1.0);
      #include <fog_fragment>
    }`,
  side: THREE.BackSide,
  fog: true,
});
materialContorno.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, materialContorno.uniforms]);

// Material de contorno para cajas: la geometría ya viene agrandada, no hace falta extruir.
export const materialContornoCaja = new THREE.MeshBasicMaterial({ color: COLORES.indigo, side: THREE.BackSide, fog: true });

// Pinta todos los vértices de una geometría con un color (para fusionar piezas en una sola malla).
export function pintar(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export class Render {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !esMovil, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.escena = new THREE.Scene();
    this.escena.fog = new THREE.Fog(COLORES.horizonte, 45, 150);
    this.camara = new THREE.PerspectiveCamera(72, 1, 0.08, 220);
    this.escena.add(this.camara);

    this.calidad = 'auto';
    this.maxRatio = Math.min(window.devicePixelRatio || 1, esMovil ? 1.5 : 2);
    this.ratio = esMovil ? Math.min(1.25, this.maxRatio) : this.maxRatio;
    this._medias = { t: 0, n: 0 };

    this._luces();
    this._cielo();
    this._petalos();
    this.redimensionar();
  }

  _luces() {
    // Sombras lavanda en lugar de grises: la luz de relleno viene del cielo lila.
    this.hemi = new THREE.HemisphereLight(0xC9B8FF, 0x4A3D7A, 1.25);
    this.escena.add(this.hemi);
    this.sol = new THREE.DirectionalLight(0xFFD9BC, 2.4);
    this.sol.position.set(-30, 26, -18);
    this.sol.castShadow = true;
    const tam = esMovil ? 512 : 1024;
    this.sol.shadow.mapSize.set(tam, tam);
    const sc = this.sol.shadow.camera;
    sc.left = sc.bottom = -22; sc.right = sc.top = 22; sc.near = 1; sc.far = 90;
    this.sol.shadow.bias = -0.0008;
    this.sol.shadow.normalBias = 0.03;
    this.escena.add(this.sol, this.sol.target);
    this.dirSol = this.sol.position.clone().normalize();
  }

  // La luz y su sombra siguen al jugador: solo se calcula la sombra de lo que está cerca.
  seguirSombra(pos) {
    const texel = 44 / this.sol.shadow.mapSize.x;
    const x = Math.round(pos.x / texel) * texel, z = Math.round(pos.z / texel) * texel;
    this.sol.target.position.set(x, 0, z);
    this.sol.position.set(x + this.dirSol.x * 50, this.dirSol.y * 50, z + this.dirSol.z * 50);
  }

  _cielo() {
    const geo = new THREE.SphereGeometry(200, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        arriba: { value: new THREE.Color(0x8F7BEA) },
        medio: { value: new THREE.Color(0xF6A6C1) },
        horizonte: { value: new THREE.Color(COLORES.horizonte) },
        dirSol: { value: this.dirSol.clone() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 arriba, medio, horizonte, dirSol; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizonte, medio, smoothstep(0.0, 0.18, h));
          c = mix(c, arriba, smoothstep(0.18, 0.7, h));
          float s = dot(normalize(vDir), dirSol);
          c = mix(c, vec3(1.0, 0.97, 0.88), smoothstep(0.9975, 0.998, s));       // disco solar con borde nítido
          c += vec3(1.0, 0.7, 0.45) * pow(max(s, 0.0), 24.0) * 0.35;              // halo
          // Bandas suaves horizontales, como un fondo pintado.
          c += 0.025 * step(0.5, fract(h * 14.0)) * (1.0 - smoothstep(0.0, 0.35, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.cielo = new THREE.Mesh(geo, mat);
    this.cielo.frustumCulled = false;
    this.cielo.renderOrder = -1;
    this.camara.add(this.cielo); // va con la cámara: nunca se sale del encuadre
  }

  // Pétalos de cerezo: toda la animación ocurre en el shader (coste de CPU cero).
  _petalos() {
    const n = esMovil ? 140 : 260;
    const pos = new Float32Array(n * 3), sem = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 40; pos[i * 3 + 1] = Math.random() * 18; pos[i * 3 + 2] = Math.random() * 40;
      sem[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('semilla', new THREE.BufferAttribute(sem, 1));
    this.matPetalos = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tiempo: { value: 0 }, centro: { value: new THREE.Vector3() }, escala: { value: 1 } },
      vertexShader: `
        uniform float tiempo, escala; uniform vec3 centro; attribute float semilla; varying float vS;
        void main(){
          vec3 p = position;
          p.x += tiempo * (1.2 + semilla) + sin(tiempo * 1.3 + semilla * 30.0) * 0.8;
          p.y -= tiempo * (0.6 + semilla * 0.5);
          p.z += cos(tiempo * 0.9 + semilla * 20.0) * 0.8 + tiempo * 0.4;
          // Caja de 40 m que envuelve al jugador: los pétalos nunca se agotan.
          p.xz = mod(p.xz - centro.xz + 20.0, 40.0) - 20.0 + centro.xz;
          p.y = mod(p.y, 18.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = escala * (5.0 + semilla * 4.0) * (12.0 / -mv.z);
          vS = semilla;
        }`,
      fragmentShader: `
        varying float vS;
        void main(){
          vec2 q = gl_PointCoord - 0.5;
          float a = vS * 6.28;
          q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
          float d = length(q * vec2(1.0, 1.8));
          if (d > 0.45) discard;
          gl_FragColor = vec4(mix(vec3(1.0, 0.72, 0.84), vec3(1.0, 0.92, 0.95), step(d, 0.18)), 0.9);
        }`,
    });
    this.petalos = new THREE.Points(geo, this.matPetalos);
    this.petalos.frustumCulled = false;
    this.escena.add(this.petalos);
  }

  redimensionar() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.matPetalos.uniforms.escala.value = h * this.ratio / 700;
  }

  setCalidad(c) {
    this.calidad = c;
    if (c === 'alta') this.ratio = this.maxRatio;
    if (c === 'baja') this.ratio = Math.min(1, this.maxRatio) * 0.75;
    this.renderer.shadowMap.enabled = c !== 'baja';
    this.sol.castShadow = c !== 'baja';
    this.redimensionar();
  }

  // Resolución adaptativa: si un fotograma tarda más de lo que permiten 60 FPS, bajamos resolución.
  adaptar(dt) {
    if (this.calidad !== 'auto') return;
    const m = this._medias;
    m.t += dt; m.n++;
    if (m.t < 1.2) return;
    const media = m.t / m.n;
    m.t = 0; m.n = 0;
    let r = this.ratio;
    if (media > 1 / 52) r = Math.max(0.55, r - 0.15);
    else if (media < 1 / 58 && r < this.maxRatio) r = Math.min(this.maxRatio, r + 0.1);
    if (Math.abs(r - this.ratio) > 0.01) { this.ratio = r; this.redimensionar(); }
  }

  dibujar(t) {
    this.matPetalos.uniforms.tiempo.value = t;
    this.matPetalos.uniforms.centro.value.copy(this.camara.position);
    this.renderer.render(this.escena, this.camara);
  }
}
