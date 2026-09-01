import { AUDIO } from '../core/Constants.js';

let track = null;
let playing = false;

function getTrack() {
  if (track) return track;
  track = new Audio(AUDIO.BGM_URL);
  track.loop = true;
  track.preload = 'none';
  track.volume = AUDIO.BGM_GAIN;
  return track;
}

export function startAmbient() {
  if (playing) return false;
  const audio = getTrack();
  playing = true;
  Promise.resolve(audio.play()).catch((error) => {
    playing = false;
    console.warn('배경음악을 재생하지 못했습니다.', error);
  });
  return true;
}

export function stopAmbient() {
  if (!playing || !track) return false;
  playing = false;
  track.pause();
  track.currentTime = 0;
  return true;
}

export function getAmbientPlaybackState() {
  return {
    playing,
    backend: 'streamed-file',
    url: AUDIO.BGM_URL,
    oscillatorCount: 0,
  };
}
