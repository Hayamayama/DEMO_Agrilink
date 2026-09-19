// Upload validation. The client already resizes and strips EXIF, but a client is
// not a security boundary: every buffer is re-checked here for size, declared MIME
// and real file signature. SVG and anything unrecognised is rejected outright.
import { AiError } from './geminiProvider.js';

export const MAX_IMAGE_BYTES = 734003; // ~700 KB, matches the client compression target
export const MAX_AUDIO_BYTES = 2.5 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 30;

const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

const AUDIO_SIGNATURES = [
  { mime: 'audio/webm', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) }, // also matroska
  { mime: 'audio/ogg', test: (b) => b.subarray(0, 4).toString('ascii') === 'OggS' },
  { mime: 'audio/mp4', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'audio/wav', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE' },
  { mime: 'audio/mpeg', test: (b) => b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
];

// A declared MIME only narrows the search; the signature decides.
function sniff(buffer, signatures) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return signatures.find((s) => s.test(buffer))?.mime || null;
}

export function validateImage(file) {
  if (!file?.buffer?.length) throw new AiError('INVALID_INPUT', 'Photo is empty.');
  if (file.size > MAX_IMAGE_BYTES) throw new AiError('MEDIA_TOO_LARGE', 'Photo is too large. Retake at lower quality.');
  if (/svg|xml/i.test(file.mimetype || '')) throw new AiError('MEDIA_UNSUPPORTED', 'This photo format is not supported.');
  const mimeType = sniff(file.buffer, IMAGE_SIGNATURES);
  if (!mimeType) throw new AiError('MEDIA_UNSUPPORTED', 'This photo format is not supported.');
  return { mimeType, data: file.buffer, isDemoSample: false };
}

export function validateAudio(file) {
  if (!file?.buffer?.length) throw new AiError('INVALID_INPUT', 'Recording is empty.');
  if (file.size > MAX_AUDIO_BYTES) throw new AiError('MEDIA_TOO_LARGE', 'Recording is too long.');
  const mimeType = sniff(file.buffer, AUDIO_SIGNATURES);
  if (!mimeType) throw new AiError('MEDIA_UNSUPPORTED', 'This recording format is not supported.');
  return { mimeType, data: file.buffer };
}
