import type { Exercise, GenerateOptions } from "./exercise";
import type { GenerateRequest, GenerateResponse } from "./generator.worker";

type Options = Omit<GenerateOptions, "rng">;

/** Promise wrapper around the generator worker. */
export class ExerciseGenerator {
  private worker = new Worker(new URL("./generator.worker.ts", import.meta.url), { type: "module" });
  private nextId = 0;
  private pending = new Map<number, { resolve: (e: Exercise) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<GenerateResponse>) => {
      const res = e.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res.exercise);
      else p.reject(new Error(res.error));
    };
  }

  generate(options: Options): Promise<Exercise> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, options } satisfies GenerateRequest);
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
