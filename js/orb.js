/* Живой шар ОТМАЗ-4 Turbo: WebGL-шейдер + пружинная физика.
   Один шар на весь сайт: он перелетает между «слотами» на экранах, тянется к курсору,
   а когда модель думает — ускоряется и меняет цвет. */
window.Orb = (() => {
  const R_UV = 0.56;            // радиус шара относительно половины холста (остальное — свечение)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime,uEnergy,uR,uAA,uHue,uPoke,uBlur;
uniform vec2 uMouse;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 nm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
vec3 hue(vec3 c,float a){const vec3 k=vec3(.57735);float ca=cos(a);return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca);}
void main(){
  vec2 p=(vUv*2.-1.)/uR;
  float r=length(p);
  vec3 IRIS=vec3(.427,.357,1.),ROSE=vec3(1.,.478,.776),SKY=vec3(.341,.847,1.),LAV=vec3(.80,.74,1.),DEEP=vec3(.25,.17,.80);
  float t=uTime;
  vec3 col=vec3(0.);float a=0.;
  if(r<1.02+uBlur*.3){
    float z=sqrt(max(1.-r*r,0.));
    vec3 n=normalize(vec3(p,z));
    vec3 q=n;q.xy+=uMouse*.28*(1.-z*.3);
    float sw=.9+uEnergy*1.5+uPoke*1.8;
    vec3 w=vec3(fbm(q*1.1+vec3(0.,0.,t*.12)),fbm(q*1.1+vec3(4.1,2.3,t*.12+3.)),0.);
    float f=fbm(q*1.35+w*sw+vec3(t*.05,0.,t*.18));
    float g=fbm(q*.9-w*sw*.8+vec3(2.,t*.1,5.));
    col=mix(IRIS,ROSE,smoothstep(-.35,.55,f));
    col=mix(col,SKY,smoothstep(-.05,.65,g)*.9);
    col=mix(col,LAV,smoothstep(.25,.85,f*g*2.+.2)*.35);
    col=mix(col,DEEP,smoothstep(.2,.9,-f-g)*.5);
    col=hue(col,uHue);
    vec3 L=normalize(vec3(-.5+uMouse.x*.6,.6+uMouse.y*.6,.8));
    float diff=max(dot(n,L),0.);
    col*=.74+.36*diff;
    float spec=pow(max(dot(reflect(-L,n),vec3(0.,0.,1.)),0.),28.);
    float fres=pow(1.-z,3.);
    col+=vec3(1.)*spec*.55+mix(LAV,vec3(1.),.5)*fres*.42;
    col+=vec3(1.)*smoothstep(.55,0.,length(p-vec2(-.36,.42)-uMouse*.1))*.3;
    col=clamp(col,0.,1.);
    // «расфокус» под модальным окном: мягкий край и приглушённый рисунок вместо дорогого backdrop-filter
    col=mix(col,mix(IRIS,ROSE,.45)*.9+.12,uBlur*.55);
    float aa=mix(uAA,.42,uBlur);
    a=1.-smoothstep(1.-aa,1.+aa*.6,r);
  }
  vec2 gp=p-vec2(0.,-.24);
  float gr=length(gp*vec2(1.,1.12));
  float glow=exp(-max(gr-.72,0.)*3.)*.30*(1.+uEnergy*1.1+uPoke);
  glow*=1.-smoothstep(1./uR-.55,1./uR-.02,r);
  vec3 gc=hue(mix(IRIS,ROSE,.35+.25*sin(t*.4)),uHue);
  gl_FragColor=vec4(col*a+gc*glow*(1.-a),a+glow*(1.-a));
}`;

  let el, canvas, gl, U = {}, ok = false;
  let W = 0, D0 = 0, dprUsed = 1;
  let slot = null, opts = {};
  const S = { x: 0, y: 0, d: 0, o: 0, b: 0, vx: 0, vy: 0, vd: 0, vo: 0, vb: 0 };
  const mouse = { x: -1e4, y: -1e4, speed: 0, t: 0 };
  const um = { x: 0, y: 0 };
  let energy = 0, energyTarget = 0, poke = 0, time = 0, last = 0, started = false;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function initGL() {
    gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    const pr = gl.createProgram();
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uTime', 'uEnergy', 'uR', 'uAA', 'uHue', 'uPoke', 'uBlur', 'uMouse'].forEach(n => (U[n] = gl.getUniformLocation(pr, n)));
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  function resize() {
    const ref = document.getElementById('slot-home');
    D0 = Math.max(160, ref ? ref.offsetWidth : 240);
    W = Math.round(D0 / R_UV);
    el.style.width = el.style.height = W + 'px';
    dprUsed = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = canvas.height = Math.round(W * dprUsed);
    if (ok) gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function readTarget() {
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    if (!r.width) return null;
    let x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (opts.clamp) { const [a, b] = opts.clamp(); y = Math.min(Math.max(y, a), b); }
    return { x, y, d: r.width };
  }

  function step(k, c, pos, vel, target, dt) {
    const f = -k * (S[pos] - target) - c * S[vel];
    S[vel] += f * dt;
    S[pos] += S[vel] * dt;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    const tg = readTarget();
    if (tg) {
      let { x, y, d } = tg;
      const R = Math.max(S.d, 1) / 2;
      const dx = mouse.x - S.x, dy = mouse.y - S.y;
      const dist = Math.hypot(dx, dy);
      let hover = false;
      if (opts.magnet !== false && !reduce.matches && d > 80) {
        const reach = R * 3.4;
        if (dist < reach) {
          const f = 1 - dist / reach;
          x += dx * 0.09 * f; y += dy * 0.09 * f;
          hover = dist < R * 1.02;
        }
      }
      d *= (1 + energy * (opts.grow || 0)) * (hover ? 1.04 : 1) * (1 + poke * 0.07);
      const o = opts.opacity == null ? 1 : opts.opacity;
      if (!started || reduce.matches) {
        S.x = x; S.y = y; S.d = started ? d : d * 0.55; S.o = started ? o : 0;
        started = true;
      }
      step(150, 21, 'x', 'vx', x, dt);
      step(150, 21, 'y', 'vy', y, dt);
      step(170, 20, 'd', 'vd', d, dt);
      step(90, 19, 'o', 'vo', o, dt);
      step(120, 22, 'b', 'vb', opts.blur || 0, dt);
      const tx = mouse.x > -1e3 ? Math.max(-1, Math.min(1, dx / (R * 4))) : 0;
      const ty = mouse.x > -1e3 ? Math.max(-1, Math.min(1, -dy / (R * 4))) : 0;
      um.x += (tx - um.x) * Math.min(1, dt * 4);
      um.y += (ty - um.y) * Math.min(1, dt * 4);
    }
    const s = Math.max(S.d, 0) / D0;
    el.style.transform = `translate3d(${(S.x - W / 2).toFixed(2)}px,${(S.y - W / 2).toFixed(2)}px,0) scale(${s.toFixed(4)})`;
    el.style.opacity = Math.max(0, Math.min(1, S.o)).toFixed(3);

    mouse.speed *= Math.pow(0.02, dt);
    const target = Math.max(energyTarget, Math.min(0.32, mouse.speed / 5000));
    energy += (target - energy) * Math.min(1, dt * (target > energy ? 3.2 : 1.6));
    poke *= Math.pow(0.08, dt);
    time += dt * (reduce.matches ? 0.12 : 0.55 + energy * 2.6 + poke * 2.5);
    el.classList.toggle('is-thinking', energy > 0.5);

    if (ok && S.o > 0.01) {
      const hue = energy * (0.62 + 0.38 * Math.sin(time * 0.8)) + poke * 0.5;
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uEnergy, energy);
      gl.uniform1f(U.uR, R_UV);
      gl.uniform1f(U.uAA, 2.2 / (canvas.width * 0.5 * R_UV));
      gl.uniform1f(U.uHue, hue);
      gl.uniform1f(U.uPoke, poke);
      gl.uniform1f(U.uBlur, Math.max(0, Math.min(1, S.b)));
      gl.uniform2f(U.uMouse, um.x, um.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  return {
    init() {
      el = document.getElementById('orb');
      canvas = el.querySelector('canvas');
      try { ok = initGL(); } catch (e) { console.warn('Orb: WebGL недоступен, включаю CSS-шар', e); ok = false; }
      if (!ok) el.classList.add('orb-css');
      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('pointermove', e => {
        const now = performance.now();
        const ddt = Math.max(1, now - mouse.t);
        if (mouse.x > -1e3) mouse.speed = Math.max(mouse.speed, Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y) / ddt * 1000);
        mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = now;
      }, { passive: true });
      document.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
      requestAnimationFrame(t => { last = t; loop(t); });
    },
    to(target, o = {}) { slot = target; opts = o; },
    get slot() { return slot; },
    energy(v) { energyTarget = v; },
    poke() { poke = 1; },
  };
})();
