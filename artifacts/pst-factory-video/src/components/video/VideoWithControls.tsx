import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS: Record<string, { title: string; filePath: string }> = {
  problem: { title: 'Masalah', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
  blueprint: { title: 'Rancangan', filePath: 'src/components/video/video_scenes/Scene2.tsx' },
  build: { title: 'Perakitan', filePath: 'src/components/video/video_scenes/Scene3.tsx' },
  qa: { title: 'Periksa', filePath: 'src/components/video/video_scenes/Scene4.tsx' },
  outro: { title: 'Terbitkan', filePath: 'src/components/video/video_scenes/Scene5.tsx' },
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function PlaybackStatus({
  sceneKeys, activeIndex, activeDuration, activeStartTime, totalDuration, tick, paused, onJumpTo,
}: {
  sceneKeys: string[]; activeIndex: number; activeDuration: number; activeStartTime: number;
  totalDuration: number; tick: number; paused: boolean; onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBase = useRef(0);
  useEffect(() => { setElapsed(0); elapsedBase.current = 0; }, [tick]);
  useEffect(() => {
    if (paused) return;
    const startedAt = performance.now();
    const id = window.setInterval(
      () => setElapsed(elapsedBase.current + performance.now() - startedAt),
      60,
    );
    return () => {
      window.clearInterval(id);
      elapsedBase.current += performance.now() - startedAt;
    };
  }, [paused, tick]);

  const progress = activeDuration ? Math.min(100, (elapsed / activeDuration) * 100) : 0;
  const totalElapsed = Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration));
  return (
    <>
      <div className="flex flex-1 items-center gap-[0.5vw]">
        {sceneKeys.map((key, index) => (
          <button
            key={key}
            onClick={() => onJumpTo(index)}
            className="relative h-[1.1vh] min-h-[7px] flex-1 overflow-hidden rounded-full bg-white/20"
            aria-label={`Buka adegan ${index + 1}: ${SCENE_DETAILS[key].title}`}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[#16d9f5]"
              style={{ width: index === activeIndex ? `${progress}%` : '0%' }}
            />
          </button>
        ))}
      </div>
      <span className="font-mono text-[1.2vw] text-white/70">{activeIndex + 1}/{sceneKeys.length}</span>
      <span className="min-w-[8vw] text-right font-mono text-[1.2vw] text-white/80">
        {formatTime(totalElapsed)} / {formatTime(totalDuration)}
      </span>
    </>
  );
}

export default function VideoWithControls() {
  const isIframed = window.self !== window.top;
  const controls = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!controls.paused) return;
    const frozen = document.getAnimations().filter((animation) => animation.playState === 'running');
    frozen.forEach((animation) => animation.pause());
    return () => frozen.forEach((animation) => animation.play());
  }, [controls.paused]);

  const jumpTo = useCallback((index: number) => {
    controls.jumpTo(index);
    const key = controls.sceneKeys[index];
    const details = SCENE_DETAILS[key];
    window.parent.postMessage({
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: controls.sceneKeys.length,
        sceneTitle: details.title,
        filePath: details.filePath,
        lineNumber: 1,
      },
    }, '*');
  }, [controls]);

  if (!isIframed) return <VideoTemplate />;

  const visible = !collapsed || hovering || tapPinned;
  const buttonClass = 'grid h-[5vh] w-[5vh] min-h-9 min-w-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white';
  return (
    <div className="relative h-screen w-full overflow-hidden">
      <VideoTemplate
        key={controls.mountKey}
        durations={controls.durations}
        paused={controls.paused}
        muted={muted}
        onSceneChange={controls.onSceneChange}
      />
      <div
        ref={sensorRef}
        className="absolute inset-x-0 bottom-0 z-50 flex h-1/4 flex-col justify-end"
        onPointerEnter={(event: ReactPointerEvent) => event.pointerType === 'mouse' && setHovering(true)}
        onPointerLeave={(event: ReactPointerEvent) => event.pointerType === 'mouse' && setHovering(false)}
        onPointerDown={(event: ReactPointerEvent) => event.pointerType !== 'mouse' && collapsed && setTapPinned(true)}
      >
        <div className="flex-1" />
        <div className={`flex items-center gap-[0.8vw] bg-black/55 px-[1.5vw] py-[1.2vh] backdrop-blur-md transition-all ${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`}>
          <button className={buttonClass} onClick={controls.togglePause} aria-label={controls.paused ? 'Putar' : 'Jeda'}>
            {controls.paused ? <Play className="h-[2.5vh] w-[2.5vh]" /> : <Pause className="h-[2.5vh] w-[2.5vh]" />}
          </button>
          <button className={`${buttonClass} ${controls.locked ? 'bg-white/15 text-white' : ''}`} onClick={controls.toggleLock} aria-label="Ulangi adegan">
            <Repeat className="h-[2.5vh] w-[2.5vh]" />
          </button>
          <button className={buttonClass} onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Aktifkan suara' : 'Bisukan'}>
            {muted ? <VolumeX className="h-[2.5vh] w-[2.5vh]" /> : <Volume2 className="h-[2.5vh] w-[2.5vh]" />}
          </button>
          <div className="h-[4vh] w-px bg-white/15" />
          <PlaybackStatus
            {...controls}
            onJumpTo={jumpTo}
          />
          <button
            className={buttonClass}
            onClick={() => {
              setCollapsed((value) => !value);
              setHovering(false);
              setTapPinned(false);
            }}
            aria-label={collapsed ? 'Tampilkan kontrol' : 'Sembunyikan kontrol'}
          >
            {collapsed ? <ChevronUp className="h-[3vh] w-[3vh]" /> : <ChevronDown className="h-[3vh] w-[3vh]" />}
          </button>
        </div>
      </div>
    </div>
  );
}