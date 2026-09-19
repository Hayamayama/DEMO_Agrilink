import 'dotenv/config';
import { synthesize } from './services/ttsService.js';
import { writeFileSync } from 'fs';

async function run() {
  try {
    console.log('Synthesizing...');
    const result = await synthesize('Hello world, this is a test.');
    console.log('Mime type:', result.mimeType);
    console.log('Audio bytes:', result.audio.length);
    writeFileSync('test.audio', result.audio);
    console.log('Saved to test.audio');
  } catch (err) {
    console.error(err);
  }
}
run();
