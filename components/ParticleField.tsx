'use client';

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Dot-matrix light field. A full-screen fragment shader draws an even grid of
// round particles whose size and brightness follow slow, folding bands of
// light (silk-like), plus a soft lift around the cursor. One draw call per
// frame, so thousands of particles cost almost nothing. Falls back to a static
// CSS dot grid without WebGL, and holds a single still frame for reduced motion.
// ---------------------------------------------------------------------------

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_cell;
uniform float u_dpr;
// Brand pulse: origin (px) in xy, seconds since it started in z (< 0 = none), strength in w.
uniform vec4 u_pulse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 id = floor(fc / u_cell);
  vec2 center = (id + 0.5) * u_cell;
  vec2 local = fc - center;
  vec2 p = center / u_res.y;
  float t = u_time * 0.055;

  // Two layers of warped diagonal waves fold into silk-like bands of light.
  float w1 = sin(p.x * 2.6 - p.y * 4.2 + t * 2.0 + sin(p.y * 2.1 + t * 1.1) * 1.7);
  float w2 = sin(p.x * 1.5 + p.y * 3.1 - t * 1.4 + sin(p.x * 2.8 - t * 0.8) * 1.3);
  float band = 0.5 + 0.5 * (0.6 * w1 + 0.4 * w2);
  band = smoothstep(0.18, 1.0, band);
  band = pow(band, 1.9);

  // Gentle per-particle shimmer so the field never looks printed.
  float h = hash(id);
  float shimmer = 0.06 * sin(u_time * (0.6 + h * 0.9) + h * 6.2831);

  // Cursor lift.
  float glow = 0.0;
  if (u_mouse.x >= 0.0) {
    float d = distance(center, u_mouse) / (u_cell * 16.0);
    glow = 0.42 * exp(-d * d);
  }

  // The pulse: one ring of light travelling outward from the logo's plus, fading as it goes.
  if (u_pulse.z >= 0.0) {
    float d = distance(center, u_pulse.xy);
    float r = u_pulse.z * u_res.y * 0.62;
    float w = u_cell * 7.0;
    float x = (d - r) / w;
    glow += u_pulse.w * 0.75 * exp(-x * x) * exp(-u_pulse.z * 0.85);
  }

  // Ambient falloff toward the bottom edge.
  float ambient = mix(0.55, 1.0, smoothstep(0.0, 0.7, fc.y / u_res.y));

  float b = clamp((band * 1.05 + 0.04 + shimmer) * ambient + glow, 0.0, 1.0);
  float radius = u_cell * mix(0.11, 0.42, b);
  float edge = smoothstep(radius, radius - 1.1 * u_dpr, length(local));
  float alpha = edge * mix(0.14, 1.0, b);

  // Blue-grey in the shadows, silver-white in the highlights.
  vec3 col = mix(vec3(0.46, 0.52, 0.62), vec3(0.95, 0.96, 0.97), smoothstep(0.15, 0.85, b));
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/** Event the brand pulse listens for; see `emitPulse` in components/motion.tsx. */
export const PULSE_EVENT = 'cp:pulse';
export type PulseDetail = { x: number; y: number; strength?: number };

/**
 * `hero` runs at full frame rate with cursor tracking (home, sign-in).
 * `ambient` is the dim band behind work screens: 20 fps and no cursor work.
 */
export default function ParticleField({ className = '', mode = 'hero' }: { className?: string; mode?: 'hero' | 'ambient' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, powerPreference: 'low-power' });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl && vs && fs ? gl.createProgram() : null;
    if (!gl || !vs || !fs || !program) {
      if (fallbackRef.current) fallbackRef.current.style.display = 'block';
      canvas.style.display = 'none';
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (fallbackRef.current) fallbackRef.current.style.display = 'block';
      canvas.style.display = 'none';
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uCell = gl.getUniformLocation(program, 'u_cell');
    const uDpr = gl.getUniformLocation(program, 'u_dpr');
    const uPulse = gl.getUniformLocation(program, 'u_pulse');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    let dpr = 1;
    let cell = 9;
    const mouse = { x: -1, y: -1, tx: -1, ty: -1 };
    const pulse = { x: 0, y: 0, start: -1, strength: 1 };
    const PULSE_SECONDS = 4.5;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      cell = (w < 640 ? 11 : 9) * dpr;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (time: number) => {
      // Ease the cursor so the lift trails it softly.
      if (mouse.tx >= 0) {
        mouse.x = mouse.x < 0 ? mouse.tx : mouse.x + (mouse.tx - mouse.x) * 0.08;
        mouse.y = mouse.y < 0 ? mouse.ty : mouse.y + (mouse.ty - mouse.y) * 0.08;
      }
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uCell, cell);
      gl.uniform1f(uDpr, dpr);
      let pulseT = -1;
      if (pulse.start >= 0) {
        pulseT = (performance.now() - pulse.start) / 1000;
        if (pulseT > PULSE_SECONDS) pulse.start = pulseT = -1;
      }
      gl.uniform4f(uPulse, pulse.x, pulse.y, pulseT, pulse.strength);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let raf = 0;
    let last = 0;
    let visible = true;
    const start = performance.now() - 40_000; // start mid-flow, not at t=0

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // A pulse in flight always gets full rate so the ring stays smooth.
      const frameMs = pulse.start >= 0 ? 0 : modeRef.current === 'ambient' ? 1000 / 20 : coarse ? 1000 / 30 : 0;
      if (frameMs && now - last < frameMs) return;
      last = now;
      draw((now - start) / 1000);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      if (reduced.matches) {
        draw(40);
        return;
      }
      if (visible && !document.hidden) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (modeRef.current === 'ambient') {
        mouse.tx = mouse.ty = mouse.x = mouse.y = -1;
        return;
      }
      const r = canvas.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) * dpr;
      mouse.ty = (r.bottom - e.clientY) * dpr; // GL origin is bottom-left
    };
    const onLeave = () => {
      mouse.tx = mouse.ty = mouse.x = mouse.y = -1;
    };
    const onResize = () => {
      resize();
      if (reduced.matches) draw(40);
    };
    // Reduced motion keeps the still field; the pulse is decorative, so it is skipped.
    const onPulse = (e: Event) => {
      const d = (e as CustomEvent<PulseDetail>).detail;
      if (!d || reduced.matches) return;
      const r = canvas.getBoundingClientRect();
      pulse.x = (d.x - r.left) * dpr;
      pulse.y = (r.bottom - d.y) * dpr;
      pulse.strength = d.strength ?? 1;
      pulse.start = performance.now();
    };

    resize();
    run();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      run();
    });
    io.observe(canvas);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener(PULSE_EVENT, onPulse);
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', run);
    reduced.addEventListener('change', run);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener(PULSE_EVENT, onPulse);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', run);
      reduced.removeEventListener('change', run);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div
        ref={fallbackRef}
        className="absolute inset-0 hidden"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(195,205,221,0.22) 1.2px, transparent 1.6px)',
          backgroundSize: '9px 9px',
        }}
      />
    </div>
  );
}
