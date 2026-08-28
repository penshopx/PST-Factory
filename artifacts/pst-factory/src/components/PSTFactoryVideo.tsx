import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  Check,
  CircleDot,
  ClipboardCheck,
  FileCode2,
  FlaskConical,
  Hammer,
  Layers3,
  Package,
  Rocket,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import './pst-factory-video.css';

const BASE_URL = import.meta.env.BASE_URL;
const VIDEO_ASPECT_RATIO = '16 / 9';

const SCENES = [
  { id: 'signal', duration: 3300, label: 'Sinyal' },
  { id: 'problem', duration: 2700, label: 'Definisi masalah' },
  { id: 'architect', duration: 3100, label: 'Arsitek' },
  { id: 'blueprint', duration: 2900, label: 'Blueprint' },
  { id: 'reuse', duration: 3000, label: 'Aset reusable' },
  { id: 'assembly', duration: 3300, label: 'Perakitan' },
  { id: 'simulation', duration: 3200, label: 'Simulasi' },
  { id: 'qa', duration: 2900, label: 'QA' },
  { id: 'approval', duration: 2600, label: 'Persetujuan' },
  { id: 'publish', duration: 3800, label: 'Terbitkan' },
] as const;

const ease = [0.16, 1, 0.3, 1] as const;
const quickEase = [0.22, 1, 0.36, 1] as const;

type SceneId = (typeof SCENES)[number]['id'];

function SceneTitle({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: ReactNode;
  detail: string;
}) {
  return (
    <div className="video-copy">
      <motion.p
        className="video-eyebrow"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: quickEase }}
      >
        <span className="eyebrow-mark" />
        {eyebrow}
      </motion.p>
      <motion.h1
        className="video-title"
        initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.75, delay: 0.12, ease }}
      >
        {title}
      </motion.h1>
      <motion.p
        className="video-detail"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.36, ease }}
      >
        {detail}
      </motion.p>
    </div>
  );
}

function TinyLabel({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'cyan' | 'amber' | 'green' }) {
  return <span className={`tiny-label tiny-label-${tone}`}>{children}</span>;
}

function DataLine({ color = 'cyan', width = '72%', delay = 0 }: { color?: string; width?: string; delay?: number }) {
  return (
    <motion.div
      className="data-line"
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.65, delay, ease: quickEase }}
      style={{ '--line-width': width, '--line-color': `var(--${color})` } as CSSProperties}
    />
  );
}

function SceneShell({ children, id }: { children: ReactNode; id: SceneId }) {
  return (
    <motion.section
      key={id}
      className={`video-scene scene-${id}`}
      initial={{ opacity: 0, clipPath: 'inset(0 0 0 100%)' }}
      animate={{ opacity: 1, clipPath: 'inset(0 0 0 0%)' }}
      exit={{ opacity: 0, clipPath: 'inset(0 100% 0 0%)' }}
      transition={{ duration: 0.8, ease }}
    >
      {children}
    </motion.section>
  );
}

function SignalScene() {
  return (
    <SceneShell id="signal">
      <div className="scene-split">
        <SceneTitle
          eyebrow="Titik awal"
          title={<>Ide bagus belum menjadi <em>alat.</em></>}
          detail="PST Factory mengubah bukti yang tersebar menjadi jalur berulang dari masalah menuju kemajuan."
        />
        <div className="signal-board">
          <motion.div className="signal-orbit orbit-one" animate={{ rotate: 360 }} transition={{ duration: 18, ease: 'linear', repeat: Infinity }} />
          <motion.div className="signal-orbit orbit-two" animate={{ rotate: -360 }} transition={{ duration: 24, ease: 'linear', repeat: Infinity }} />
          <div className="signal-core"><span>?</span></div>
          {[
            { text: 'tiket dukungan', x: '2%', y: '12%', rotate: -8, accent: 'cyan' },
            { text: 'catatan lapangan', x: '58%', y: '4%', rotate: 7, accent: 'amber' },
            { text: 'panggilan customer', x: '72%', y: '64%', rotate: -5, accent: 'green' },
            { text: 'spreadsheet', x: '7%', y: '72%', rotate: 6, accent: 'muted' },
          ].map((item, index) => (
            <motion.div
              key={item.text}
              className={`signal-note note-${item.accent}`}
              style={{ left: item.x, top: item.y, rotate: item.rotate }}
              initial={{ opacity: 0, scale: 0.7, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
              transition={{ opacity: { delay: 0.4 + index * 0.12, duration: 0.45 }, scale: { delay: 0.4 + index * 0.12, duration: 0.55, ease }, y: { delay: 1 + index * 0.2, duration: 3.6 + index * 0.4, repeat: Infinity, ease: 'easeInOut' } }}
            >
              <span className="note-dot" />{item.text}
            </motion.div>
          ))}
          <motion.div className="signal-sweep" animate={{ x: ['-10%', '110%'] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'linear', repeatDelay: 0.8 }} />
        </div>
      </div>
    </SceneShell>
  );
}

function ProblemScene() {
  return (
    <SceneShell id="problem">
      <SceneTitle eyebrow="01 / definisikan" title={<>Mulai dari <em>gesekan.</em></>} detail="Pernyataan masalah yang tajam memberi setiap keputusan berikutnya arah yang jelas." />
      <div className="problem-canvas">
        <motion.div className="problem-card problem-card-back" initial={{ opacity: 0, x: 42, y: 22, rotate: 5 }} animate={{ opacity: 0.5, x: 34, y: 18, rotate: 4 }} transition={{ delay: 0.2, duration: 0.8, ease }} />
        <motion.div className="problem-card" initial={{ opacity: 0, y: 35, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ delay: 0.22, duration: 0.8, ease }}>
          <div className="card-top"><TinyLabel tone="cyan">pernyataan masalah</TinyLabel><span className="card-index">01</span></div>
          <p className="problem-question">Di mana momentum<br /><span>terhenti?</span></p>
          <div className="problem-fields">
            <div><TinyLabel>sinyal</TinyLabel><DataLine width="81%" delay={0.65} /></div>
            <div><TinyLabel>dampak</TinyLabel><DataLine color="amber" width="61%" delay={0.78} /></div>
            <div><TinyLabel>hasil yang diinginkan</TinyLabel><DataLine color="green" width="73%" delay={0.9} /></div>
          </div>
          <motion.div className="cursor-mark" animate={{ x: [0, 12, 0], y: [0, -5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}><span /></motion.div>
        </motion.div>
        <motion.div className="problem-bracket" initial={{ opacity: 0, scaleY: 0 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ delay: 0.75, duration: 0.6, ease }}><span>buat dapat diamati</span></motion.div>
      </div>
    </SceneShell>
  );
}

function ArchitectScene() {
  const blocks = [
    { icon: Target, label: 'Hasil', value: 'lebih sedikit pengerjaan ulang', accent: 'cyan' },
    { icon: Workflow, label: 'Pola', value: 'pilihan terpandu', accent: 'amber' },
    { icon: Users, label: 'Pengguna', value: 'pemimpin tim', accent: 'green' },
  ];
  return (
    <SceneShell id="architect">
      <SceneTitle eyebrow="02 / arsitektur" title={<>Beri masalah itu <em>bentuk.</em></>} detail="Arsitek menghubungkan niat, audiens, dan intervensi terkecil yang berguna." />
      <div className="architect-map">
        <div className="map-lines"><span /><span /><span /></div>
        <motion.div className="architect-node architect-origin" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.7, ease }}>
          <Target size={22} /><TinyLabel tone="cyan">arah utama</TinyLabel><strong>kejelasan</strong>
        </motion.div>
        <div className="architect-blocks">
          {blocks.map(({ icon: Icon, label, value, accent }, index) => (
            <motion.div className={`architect-node architect-node-${accent}`} key={label} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.42 + index * 0.14, duration: 0.6, ease }}>
              <div className="node-header"><Icon size={15} /><TinyLabel tone={accent as 'cyan' | 'amber' | 'green'}>{label}</TinyLabel></div>
              <strong>{value}</strong><span className="node-pin" />
            </motion.div>
          ))}
        </div>
        <motion.div className="architect-stamp" initial={{ opacity: 0, rotate: -10, scale: 1.3 }} animate={{ opacity: 1, rotate: -6, scale: 1 }} transition={{ delay: 1.2, duration: 0.55, ease }}>SELARAS<br /><span>berdasarkan rancangan</span></motion.div>
      </div>
    </SceneShell>
  );
}

function BlueprintScene() {
  return (
    <SceneShell id="blueprint">
      <div className="scene-split blueprint-layout">
        <SceneTitle eyebrow="03 / blueprint" title={<>Buat langkah berikutnya <em>jelas.</em></>} detail="Blueprint adalah kontrak antara ide bagus dan pengalaman yang dapat dibangun." />
        <motion.div className="blueprint-sheet" initial={{ opacity: 0, rotateY: 18, x: 40 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} transition={{ delay: 0.18, duration: 0.9, ease }}>
          <div className="sheet-ruler"><span>00</span><span>12</span><span>24</span><span>36</span><span>48</span></div>
          <div className="sheet-header"><div><TinyLabel tone="cyan">PST / blueprint</TinyLabel><h3>Cashflow clarity</h3></div><FileCode2 size={19} /></div>
          <div className="blueprint-flow">
            {['notice', 'choose', 'commit'].map((label, index) => <motion.div className="blueprint-step" key={label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52 + index * 0.16, duration: 0.5, ease }}><span className="step-number">0{index + 1}</span><strong>{label}</strong><span className="step-line" /></motion.div>)}
          </div>
          <div className="sheet-footer"><span>jalur keputusan</span><span className="sheet-footer-right"><CircleDot size={10} /> siap dirakit</span></div>
          <motion.div className="blueprint-corner" animate={{ rotate: [0, 5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}><ArrowDownRight size={24} /></motion.div>
        </motion.div>
      </div>
    </SceneShell>
  );
}

function ReuseScene() {
  const assets = [
    { icon: Package, label: 'kartu keputusan', version: 'v2.4', color: 'cyan' },
    { icon: Layers3, label: 'pola sinyal', version: 'v1.8', color: 'amber' },
    { icon: FlaskConical, label: 'resep refleksi', version: 'v3.1', color: 'green' },
  ];
  return (
    <SceneShell id="reuse">
      <SceneTitle eyebrow="04 / gunakan kembali" title={<>Jangan bangun ulang <em>bagian yang bagus.</em></>} detail="Aset, pola, dan resep terus bertambah manfaatnya. Setiap toolkit baru dimulai lebih maju." />
      <div className="asset-tray">
        <div className="tray-top"><TinyLabel tone="cyan">kecerdasan reusable</TinyLabel><span className="tray-count">03 / 28</span></div>
        <div className="asset-stack">
          {assets.map(({ icon: Icon, label, version, color }, index) => (
            <motion.div className={`asset-tile tile-${color}`} key={label} initial={{ opacity: 0, y: 45, rotate: index === 1 ? 3 : -3 }} animate={{ opacity: 1, y: index * 4, rotate: index === 1 ? 1 : index === 2 ? 4 : -2 }} transition={{ delay: 0.18 + index * 0.18, duration: 0.72, ease }}>
              <div className="asset-icon"><Icon size={20} /></div><div className="asset-name"><strong>{label}</strong><span>{version} · siap</span></div><Check size={15} className="asset-check" />
            </motion.div>
          ))}
        </div>
        <motion.div className="asset-connector" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.9, duration: 0.65, ease }}><span /><span /><span /></motion.div>
        <motion.div className="asset-note" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.15, duration: 0.5, ease }}><Sparkles size={14} /> Setiap penggunaan kembali memperpendek jalan menuju nilai.</motion.div>
      </div>
    </SceneShell>
  );
}

function AssemblyScene() {
  const pieces = [
    { label: 'masalah', x: '-5%', y: '12%', rotate: -9, color: 'cyan' },
    { label: 'pola', x: '56%', y: '2%', rotate: 8, color: 'amber' },
    { label: 'resep', x: '70%', y: '68%', rotate: -6, color: 'green' },
  ];
  return (
    <SceneShell id="assembly">
        <SceneTitle eyebrow="05 / rakit" title={<>Ubah rencana menjadi <em>toolkit.</em></>} detail="Pabrik merakit bagian-bagian menjadi satu pengalaman terpandu yang dapat digunakan kembali." />
      <div className="assembly-floor">
        <div className="assembly-grid" />
        <motion.div className="assembly-rail" animate={{ x: ['-5%', '105%'] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 0.35 }} />
        {pieces.map((piece, index) => (
          <motion.div className={`assembly-piece piece-${piece.color}`} key={piece.label} style={{ left: piece.x, top: piece.y, rotate: piece.rotate }} initial={{ opacity: 0, scale: 0.6, x: index % 2 ? 45 : -45 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ delay: 0.2 + index * 0.16, duration: 0.7, ease }}>
            <span className="piece-bolt" />{piece.label}<span className="piece-bracket" />
          </motion.div>
        ))}
        <motion.div className="assembly-core" initial={{ opacity: 0, scale: 0.4, rotate: -15 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.72, duration: 0.9, ease }}>
          <div className="core-mark"><Hammer size={24} /></div><TinyLabel tone="cyan">PST dirakit</TinyLabel><h3>Kejernihan arus kas</h3><div className="core-row"><span>5 langkah</span><span>3 aset</span><span>1 hasil</span></div>
        </motion.div>
      </div>
    </SceneShell>
  );
}

function SimulationScene() {
  return (
    <SceneShell id="simulation">
      <div className="scene-split simulation-layout">
        <SceneTitle eyebrow="06 / simulasi" title={<>Lihat melalui <em>mata customer.</em></>} detail="Sebelum dirilis, jalani alurnya seolah-olah Anda adalah orang yang membutuhkan jawabannya." />
        <motion.div className="workspace-window" initial={{ opacity: 0, y: 40, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.2, duration: 0.85, ease }}>
          <div className="window-chrome"><div className="window-dots"><i /><i /><i /></div><span>workspace / kejernihan-arus-kas</span><TinyLabel tone="green">pratinjau</TinyLabel></div>
          <div className="workspace-body">
            <div className="workspace-sidebar"><div className="workspace-logo">P</div><span /><span /><span /><div className="workspace-avatar">MC</div></div>
            <div className="workspace-content"><TinyLabel tone="cyan">langkah 02 dari 05</TinyLabel><h3>Apa yang berubah<br /><em>minggu ini?</em></h3><p>Pilih satu sinyal sebelum memilih respons.</p><div className="workspace-options"><span className="selected"><Check size={12} /> Pendapatan</span><span>Biaya</span><span>Waktu</span></div><div className="workspace-progress"><span /><span /><span className="active" /><span /><span /></div></div>
          </div>
          <motion.div className="scan-beam" animate={{ y: ['-20%', '220%'] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }} />
        </motion.div>
      </div>
    </SceneShell>
  );
}

function QAScene() {
  const rows = [
    { label: 'Masalah dapat diamati', state: 'pass', icon: Check },
    { label: 'Alur bekerja dari awal hingga akhir', state: 'pass', icon: Check },
    { label: 'Teks tidak ambigu', state: 'pass', icon: Check },
    { label: 'Customer dapat bertindak', state: 'fix', icon: X },
  ];
  return (
    <SceneShell id="qa">
      <SceneTitle eyebrow="07 / qa" title={<>Temukan titik patah <em>sebelum customer.</em></>} detail="Simulasi mengubah asumsi menjadi bukti. QA membuat bukti itu dapat ditindaklanjuti." />
      <div className="qa-panel">
        <div className="qa-header"><div><TinyLabel tone="cyan">kandidat rilis 0.9.7</TinyLabel><h3>Gerbang kualitas</h3></div><ScanLine size={21} /></div>
        <div className="qa-progress"><span /><strong>75%</strong><TinyLabel>terverifikasi</TinyLabel></div>
        <div className="qa-rows">
          {rows.map(({ label, state, icon: Icon }, index) => (
            <motion.div className={`qa-row qa-${state}`} key={label} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.22 + index * 0.13, duration: 0.55, ease }}>
              <div className="qa-state"><Icon size={13} /></div><span>{label}</span><TinyLabel tone={state === 'pass' ? 'green' : 'amber'}>{state === 'pass' ? 'lulus' : 'tinjau'}</TinyLabel>
            </motion.div>
          ))}
        </div>
        <motion.div className="qa-callout" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.55, ease }}><ClipboardCheck size={15} /><span>Satu perbaikan ditemukan. Itulah tujuannya.</span></motion.div>
      </div>
    </SceneShell>
  );
}

function ApprovalScene() {
  return (
    <SceneShell id="approval">
      <div className="approval-stage">
        <SceneTitle eyebrow="08 / setujui" title={<>Terbitkan sesuatu yang dapat <em>Anda pertanggungjawabkan.</em></>} detail="Tanda tangan manusia menutup lingkaran antara produksi dan janji." />
        <motion.div className="approval-seal" initial={{ opacity: 0, scale: 1.5, rotate: -18 }} animate={{ opacity: 1, scale: 1, rotate: -8 }} transition={{ delay: 0.25, duration: 0.8, ease }}>
          <div className="seal-ring"><ShieldCheck size={34} /><span>disetujui</span><small>diverifikasi manusia</small></div>
          <div className="seal-rays">{Array.from({ length: 8 }).map((_, i) => <i key={i} style={{ transform: `rotate(${i * 45}deg)` }} />)}</div>
        </motion.div>
        <motion.div className="approval-signature" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.95, duration: 0.55, ease }}><span>ditandatangani oleh</span><strong>Mara Chen</strong><small>Arsitek produk · 09:42</small></motion.div>
      </div>
    </SceneShell>
  );
}

function PublishScene() {
  return (
    <SceneShell id="publish">
      <div className="publish-stage">
        <motion.div className="publish-glow" animate={{ scale: [1, 1.12, 1], opacity: [0.25, 0.42, 0.25] }} transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="publish-lockup" initial={{ opacity: 0, y: 25, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15, duration: 0.85, ease }}>
          <img src={`${BASE_URL}logo.svg`} alt="PST Factory" className="video-logo" />
          <div className="publish-rule" />
          <TinyLabel tone="cyan">masalah → workspace</TinyLabel>
          <h1>Jadikan masalah<br /><em>siap diluncurkan.</em></h1>
        </motion.div>
        <motion.div className="publish-workspace" initial={{ opacity: 0, x: 75, rotate: 5 }} animate={{ opacity: 1, x: 0, rotate: 3 }} transition={{ delay: 0.52, duration: 0.9, ease }}>
          <div className="mini-window-top"><span /><span /><span /></div><div className="mini-window-body"><div className="mini-sidebar"><b>P</b><i /><i /><i /></div><div><TinyLabel tone="green">workspace aktif</TinyLabel><strong>Kejernihan arus kas</strong><div className="mini-bar"><span /></div><p>01 / amati · 02 / pilih · 03 / komitmen</p></div></div>
        </motion.div>
        <motion.div className="publish-path" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1, duration: 0.9, ease }}><span /><span /><span /><span /><span /></motion.div>
        <motion.div className="publish-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.28, duration: 0.55, ease }}>Satu pabrik. Jalan ke depan yang lebih jelas.</motion.div>
        <motion.div className="publish-loop-mark" animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}><Rocket size={15} /></motion.div>
      </div>
    </SceneShell>
  );
}

const SCENE_COMPONENTS: Record<SceneId, () => ReactElement> = {
  signal: SignalScene,
  problem: ProblemScene,
  architect: ArchitectScene,
  blueprint: BlueprintScene,
  reuse: ReuseScene,
  assembly: AssemblyScene,
  simulation: SimulationScene,
  qa: QAScene,
  approval: ApprovalScene,
  publish: PublishScene,
};

function PersistentStage({ sceneIndex }: { sceneIndex: number }) {
  const progress = ((sceneIndex + 1) / SCENES.length) * 100;
  const activeScene = SCENES[sceneIndex];
  return (
    <>
      <div className="video-grid" />
      <div className="video-noise" />
      <motion.div className="ambient-orb orb-cyan" animate={{ x: sceneIndex % 2 ? '12vw' : '-4vw', y: sceneIndex > 6 ? '20vh' : '-6vh', scale: sceneIndex === 9 ? 1.25 : 1 }} transition={{ duration: 1.8, ease }} />
      <motion.div className="ambient-orb orb-amber" animate={{ x: sceneIndex > 4 ? '-8vw' : '8vw', y: sceneIndex % 3 === 0 ? '9vh' : '-3vh', scale: sceneIndex === 6 ? 1.2 : 0.9 }} transition={{ duration: 2.2, ease }} />
      <motion.div className="route-line" animate={{ rotate: sceneIndex > 6 ? -4 : 3, scaleX: sceneIndex === 9 ? 1.08 : 1 }} transition={{ duration: 1.4, ease }}><span /><span /><span /><span /></motion.div>
      <div className="video-brand"><div className="brand-mark">P</div><span>PST pabrik</span></div>
      <div className="video-sequence"><span className="sequence-current">{String(sceneIndex + 1).padStart(2, '0')}</span><span className="sequence-slash"> / </span><span>{String(SCENES.length).padStart(2, '0')}</span><span className="sequence-name">{activeScene.label}</span></div>
      <div className="video-progress" aria-hidden="true"><motion.span animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease }} /></div>
    </>
  );
}

export default function PSTFactoryVideo() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const currentScene = useMemo(() => SCENES[sceneIndex], [sceneIndex]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSceneIndex((value) => (value + 1) % SCENES.length), currentScene.duration);
    return () => window.clearTimeout(timer);
  }, [currentScene.duration]);

  const Scene = SCENE_COMPONENTS[currentScene.id];
  return (
    <main className="video-viewport" style={{ '--video-aspect-ratio': VIDEO_ASPECT_RATIO } as CSSProperties} aria-label="Film proses PST Factory">
      <div className="video-frame">
        <PersistentStage sceneIndex={sceneIndex} />
        <AnimatePresence mode="sync" initial={false}>
          <Scene key={`${currentScene.id}-${sceneIndex}`} />
        </AnimatePresence>
        <div className="video-footer"><span>sistem produksi untuk pemecah masalah</span><span>selalu bergerak</span></div>
      </div>
    </main>
  );
}