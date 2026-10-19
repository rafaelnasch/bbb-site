// Água WebGL (SPEC 6.2, P1): topo da home e das coleções, nunca no produto nem sobre foto de produto.
// Shader próprio: ondas que refratam uma trama larga e suave de cáusticas (células animadas) com o brilho
// da luz de estúdio (--glow), apagada atrás do texto para não disputar com o H1, e anéis de ondulação
// ao toque. Só nasce depois do load, com o navegador ocioso, nunca é o LCP (o canvas aparece por cima
// de um gradiente estático já pintado). Pausa fora da tela e com a aba oculta;
// DPR máximo 1,5 e resolução reduzida. Modo lite ou sem WebGL: fica o gradiente.
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const alvos = [...d.querySelectorAll('[data-agua]')];
  if (!alvos.length) return;

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;
varying vec2 v;uniform vec2 uR;uniform float uT;uniform vec4 uP[4];uniform vec3 uA,uB,uL,uG;
vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
float cel(vec2 p,float t){vec2 i=floor(p),f=fract(p);float a=8.,b=8.;
for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=.5+.42*sin(t+6.2831*h2(i+g));float e=length(g+o-f);if(e<a){b=a;a=e;}else if(e<b)b=e;}
return b-a;}
float onda(vec2 p,float t){return sin(p.x*1.7+t*.6)*.5+sin(p.y*2.3-t*.5+p.x*.8)*.35+sin((p.x+p.y)*3.1+t*.9)*.15;}
void main(){
float asp=uR.x/uR.y;vec2 p=vec2(v.x*asp,v.y);float t=uT;
vec2 ds=vec2(0.);float an=0.;
for(int k=0;k<4;k++){vec4 r=uP[k];float age=t-r.z;if(r.w>0.&&age>0.&&age<4.){vec2 q=p-vec2(r.x*asp,r.y);float di=length(q);float fr=age*.42;float o=exp(-pow((di-fr)*14.,2.))*exp(-age*1.1)*r.w;ds+=q/(di+.001)*o*.035;an+=o;}}
vec2 q=p*2.2;vec2 e=vec2(.01,0.);
vec2 gr=vec2(onda(q+e.xy,t)-onda(q-e.xy,t),onda(q+e.yx,t)-onda(q-e.yx,t))/.02;
vec2 pc=p*2.3+gr*.05+ds*5.;pc+=.38*vec2(sin(pc.y*1.1+t*.35),cos(pc.x*.9-t*.3));
float c1=cel(pc,t*.45),c2=cel(pc*1.7+3.1,t*.6);
float wb=pow(1.-smoothstep(0.,.34,c1),2.6)*.5+pow(1.-smoothstep(0.,.22,c2),2.4)*.18;
float luz=smoothstep(1.3,.05,length(v-vec2(.8,.88)));
float txt=mix(.12,1.,smoothstep(.15,.95,length((v-vec2(.2,.42))*vec2(.85,1.15))));
vec3 base=mix(uA,uB,smoothstep(0.,1.,v.y*.8+.1));
vec3 c=base+uL*wb*(.035+.12*luz)*txt+uG*pow(wb,3.)*.07*luz*txt+uL*an*.08;
gl_FragColor=vec4(c,1.);}`;

  const hex = (s, padrao) => {
    const m = /^#?([\da-f]{6})$/i.exec(String(s || '').trim());
    const n = parseInt(m ? m[1] : padrao, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  function montar(el) {
    if (el.dataset.aguaOk) return;
    const cv = d.createElement('canvas');
    cv.className = 'agua__cv';
    cv.setAttribute('aria-hidden', 'true');
    let gl;
    try { gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false }); } catch { gl = null; }
    if (!gl) return;
    // Compilação sem travar a página: com KHR_parallel_shader_compile o driver compila em outra
    // thread e o status é consultado quadro a quadro; só então o programa é usado.
    const par = gl.getExtension('KHR_parallel_shader_compile');
    const sh = (tipo, src) => {
      const s = gl.createShader(tipo);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    const pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.linkProgram(pr);
    el.dataset.aguaOk = '1';
    const esperar = () => {
      if (par && !gl.getProgramParameter(pr, par.COMPLETION_STATUS_KHR)) { requestAnimationFrame(esperar); return; }
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { delete el.dataset.aguaOk; return; }
      pronto();
    };
    requestAnimationFrame(esperar);
  function pronto() {
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(pr, n);
    const uR = U('uR'), uT = U('uT'), uP = U('uP');
    const cs = getComputedStyle(d.documentElement);
    gl.uniform3fv(U('uA'), hex(cs.getPropertyValue('--room'), '071C2B'));
    gl.uniform3fv(U('uB'), hex('#123A52', '123A52'));
    gl.uniform3fv(U('uL'), hex(cs.getPropertyValue('--line'), '8DBBD9'));
    gl.uniform3fv(U('uG'), hex(cs.getPropertyValue('--glow'), 'E9B87C'));

    el.append(cv);
    const area = el.closest('section') || el;
    const ondas = new Float32Array(16);
    let iOnda = 0, t0 = performance.now(), raf = 0, ativo = false, vis = true, ultimaOnda = 0, quadro = 0;
    const movel = w.matchMedia('(max-width:700px)').matches;
    const escala = movel ? 0.5 : 0.62;
    const tempo = () => (performance.now() - t0) / 1000;

    const medir = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(w.devicePixelRatio || 1, 1.5) * escala;
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; gl.viewport(0, 0, W, H); }
      gl.uniform2f(uR, W, H);
    };
    const onda = (x, y, amp) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const k = (iOnda++ % 4) * 4;
      ondas[k] = (x - r.left) / r.width;
      ondas[k + 1] = 1 - (y - r.top) / r.height;
      ondas[k + 2] = tempo();
      ondas[k + 3] = amp;
      gl.uniform4fv(uP, ondas);
      ligar();
    };
    function desenhar() {
      raf = 0;
      if (!ativo) return;
      // No celular, um quadro sim, outro não (cerca de 30 fps): metade do trabalho da GPU.
      if (!movel || quadro++ % 2 === 0) {
        gl.uniform1f(uT, tempo());
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (!cv.classList.contains('is-viva')) cv.classList.add('is-viva');
      }
      raf = requestAnimationFrame(desenhar);
    }
    function ligar() {
      ativo = vis && !d.hidden && !BBB.lite;
      if (ativo && !raf) raf = requestAnimationFrame(desenhar);
    }
    function desligar() { ativo = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    area.addEventListener('pointerdown', (e) => onda(e.clientX, e.clientY, 1), { passive: true });
    area.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const agora = performance.now();
      if (agora - ultimaOnda < 140) return;
      ultimaOnda = agora;
      onda(e.clientX, e.clientY, 0.35);
    }, { passive: true });
    if ('ResizeObserver' in w) new ResizeObserver(medir).observe(el); else w.addEventListener('resize', medir);
    if ('IntersectionObserver' in w) {
      new IntersectionObserver((es) => { vis = es.some((x) => x.isIntersecting); if (vis) ligar(); else desligar(); }).observe(el);
    }
    d.addEventListener('visibilitychange', () => (d.hidden ? desligar() : ligar()));
    w.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { if (e.matches) { desligar(); cv.remove(); } });
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); desligar(); cv.remove(); delete el.dataset.aguaOk; });
    medir();
    ligar();
  }
  }

  const iniciar = () => { if (!BBB.lite) alvos.forEach(montar); };
  const ocioso = () => requestAnimationFrame(() => requestAnimationFrame(() => (w.requestIdleCallback ? w.requestIdleCallback(iniciar, { timeout: 2500 }) : setTimeout(iniciar, 300))));
  if (d.readyState === 'complete') ocioso(); else w.addEventListener('load', ocioso, { once: true });
})();
