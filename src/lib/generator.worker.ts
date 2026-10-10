// Generating an exercise takes a few seconds of engine search, so it runs off
// the main thread to keep the UI responsive.

import { generateExercise, type GenerateOptions } from "./exercise";

export interface GenerateRequest {
  id: number;
  options: Omit<GenerateOptions, "rng">;
}

export type GenerateResponse =
  | { id: number; ok: true; exercise: ReturnType<typeof generateExercise> }
  | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { id, options } = e.data;
  let response: GenerateResponse;
  try {
    response = { id, ok: true, exercise: generateExercise(options) };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
