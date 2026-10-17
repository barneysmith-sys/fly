import { PLAYBACK_SPEEDS, type Playback } from "../usePlayback";
import { formatFixed } from "../format";

type TransportProps = {
  playback: Playback;
  sampleCount: number;
  timeS: number | null;
};

export function Transport({ playback, sampleCount, timeS }: TransportProps) {
  const disabled = sampleCount < 2;
  return (
    <div className="transport">
      <button type="button" onClick={playback.toggle} disabled={disabled}>
        {playback.playing ? "Pause" : "Play"}
      </button>
      <button type="button" onClick={playback.restart} disabled={sampleCount === 0}>
        Restart
      </button>
      <button type="button" onClick={playback.jumpToEnd} disabled={sampleCount === 0}>
        End
      </button>
      <div className="speeds" role="group" aria-label="Simulation speed">
        {PLAYBACK_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            aria-pressed={playback.speed === speed}
            onClick={() => playback.setSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>
      <label className="scrubber">
        <span className="sr-only">Simulation time</span>
        <input
          type="range"
          min={0}
          max={Math.max(sampleCount - 1, 0)}
          value={sampleCount === 0 ? 0 : Math.min(playback.index, sampleCount - 1)}
          disabled={sampleCount === 0}
          onChange={(event) => playback.seek(Number(event.target.value))}
        />
      </label>
      <span className="time-readout">{timeS === null ? "—" : `${formatFixed(timeS, 2)} s`}</span>
    </div>
  );
}
