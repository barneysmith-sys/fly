import { useCallback, useEffect, useRef, useState } from "react";
import { indexAtTime } from "./playback";
import type { Sample } from "./types";

export type Playback = {
  index: number;
  playing: boolean;
  toggle: () => void;
  seek: (index: number) => void;
  jumpToEnd: () => void;
};

export function usePlayback(samples: Sample[] | null): Playback {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const indexRef = useRef(0);
  const playingRef = useRef(false);
  const samplesRef = useRef(samples);
  samplesRef.current = samples;
  playingRef.current = playing;

  useEffect(() => {
    if (!samples || samples.length === 0) {
      indexRef.current = 0;
      setIndex(0);
      setPlaying(false);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = reduceMotion ? samples.length - 1 : 0;
    indexRef.current = start;
    setIndex(start);
    setPlaying(!reduceMotion && samples.length > 1);
  }, [samples]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const data = samplesRef.current;
    if (!data || data.length < 2) {
      return;
    }
    const startWall = performance.now();
    const startSim = data[Math.min(indexRef.current, data.length - 1)].time_s;
    let frame = 0;
    const tick = (now: number) => {
      const current = samplesRef.current;
      if (!current || current.length === 0) {
        return;
      }
      const simTime = startSim + (now - startWall) / 1000;
      const lastTime = current[current.length - 1].time_s;
      if (simTime >= lastTime) {
        indexRef.current = current.length - 1;
        setIndex(current.length - 1);
        setPlaying(false);
        return;
      }
      const next = indexAtTime(current, simTime);
      if (next !== indexRef.current) {
        indexRef.current = next;
        setIndex(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seek = useCallback((next: number) => {
    const data = samplesRef.current;
    if (!data || data.length === 0) {
      return;
    }
    const clamped = Math.min(Math.max(next, 0), data.length - 1);
    indexRef.current = clamped;
    setIndex(clamped);
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    const data = samplesRef.current;
    if (!data || data.length < 2) {
      return;
    }
    if (!playingRef.current && indexRef.current >= data.length - 1) {
      indexRef.current = 0;
      setIndex(0);
    }
    setPlaying((value) => !value);
  }, []);

  const jumpToEnd = useCallback(() => {
    const data = samplesRef.current;
    if (!data || data.length === 0) {
      return;
    }
    indexRef.current = data.length - 1;
    setIndex(data.length - 1);
    setPlaying(false);
  }, []);

  return { index, playing, toggle, seek, jumpToEnd };
}
