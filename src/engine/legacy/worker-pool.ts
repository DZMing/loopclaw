/**
 * 🦞 龙虾 Worker 线程池
 *
 * 将 CPU 密集型任务卸载到 worker 线程，避免阻塞事件循环。
 * 该实现保证：
 * - 任务 ID 与 Promise 一一对应
 * - worker 异常时正确 reject 正在执行的任务
 * - 构建产物缺失 worker 脚本时 fail-fast，不进入重启风暴
 */

import fs from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface WorkerTask<T = unknown> {
  id: string;
  type: string;
  data: unknown;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export interface WorkerPoolConfig {
  poolSize?: number;
  taskTimeout?: number;
  maxTasksPerWorker?: number;
}

const DEFAULT_WORKER_CONFIG: Required<WorkerPoolConfig> = {
  poolSize: Math.max(1, cpus().length - 1),
  taskTimeout: 30_000,
  maxTasksPerWorker: 1000,
};

export class WorkerPool {
  private workers: Worker[] = [];
  private idleWorkers: Set<Worker> = new Set();
  private busyWorkers: Set<Worker> = new Set();
  private taskQueue: WorkerTask<any>[] = [];
  private workerTaskCount: Map<Worker, number> = new Map();
  private pendingTasks: Map<string, WorkerTask<any>> = new Map();
  private assignedTaskIds: Map<Worker, string> = new Map();
  private intentionallyStoppingWorkers: Set<Worker> = new Set();
  private config: Required<WorkerPoolConfig>;
  private workerScriptPath = join(__dirname, "worker-script.js");
  private initialized = false;
  private shuttingDown = false;
  private taskSequence = 0;
  private fatalInitializationError: Error | null = null;

  constructor(config: WorkerPoolConfig = {}) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.ensureWorkerScript();
    this.shuttingDown = false;

    for (let i = 0; i < this.config.poolSize; i++) {
      this.createWorker();
    }

    this.initialized = true;
    console.log(`🦞 Worker 池初始化完成: ${this.config.poolSize} 个 worker`);
  }

  async execute<T = unknown>(type: string, data: unknown): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.fatalInitializationError) {
      throw this.fatalInitializationError;
    }

    return new Promise<T>((resolve, reject) => {
      const task: WorkerTask<T> = {
        id: `worker-task-${Date.now()}-${this.taskSequence++}`,
        type,
        data,
        resolve,
        reject,
      };

      task.timeout = setTimeout(() => {
        this.pendingTasks.delete(task.id);
        this.taskQueue = this.taskQueue.filter(
          (queuedTask) => queuedTask.id !== task.id,
        );

        const worker = this.findWorkerByTaskId(task.id);
        if (worker) {
          this.assignedTaskIds.delete(worker);
          this.releaseWorker(worker);
          void this.recycleWorker(worker);
        }

        reject(new Error(`任务超时: ${type}`));
        this.processQueue();
      }, this.config.taskTimeout);

      this.pendingTasks.set(task.id, task);

      const worker = this.acquireWorker();
      if (worker) {
        this.dispatchToWorker(worker, task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  private async ensureWorkerScript(): Promise<void> {
    try {
      await fs.access(this.workerScriptPath);
      this.fatalInitializationError = null;
    } catch {
      this.fatalInitializationError = new Error(
        `worker 脚本缺失: ${this.workerScriptPath}. 请先执行 npm run build 生成完整产物。`,
      );
      throw this.fatalInitializationError;
    }
  }

  private createWorker(): Worker {
    if (this.fatalInitializationError) {
      throw this.fatalInitializationError;
    }

    const worker = new Worker(this.workerScriptPath);
    this.workers.push(worker);
    this.idleWorkers.add(worker);
    this.workerTaskCount.set(worker, 0);

    worker.on("message", (result) => this.handleWorkerMessage(worker, result));
    worker.on("error", (error) => this.handleWorkerError(worker, error));
    worker.on("exit", (code) => this.handleWorkerExit(worker, code));

    return worker;
  }

  private acquireWorker(): Worker | undefined {
    const worker = this.idleWorkers.values().next().value as Worker | undefined;
    if (!worker) {
      return undefined;
    }

    this.idleWorkers.delete(worker);
    this.busyWorkers.add(worker);
    return worker;
  }

  private dispatchToWorker(worker: Worker, task: WorkerTask<any>): void {
    const taskCount = this.workerTaskCount.get(worker) ?? 0;

    if (taskCount >= this.config.maxTasksPerWorker) {
      this.taskQueue.unshift(task);
      this.releaseWorker(worker);
      void this.recycleWorker(worker);
      return;
    }

    try {
      this.assignedTaskIds.set(worker, task.id);
      worker.postMessage({
        id: task.id,
        type: task.type,
        data: task.data,
      });
      this.workerTaskCount.set(worker, taskCount + 1);
    } catch (error) {
      this.assignedTaskIds.delete(worker);
      this.pendingTasks.delete(task.id);
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      task.reject(error instanceof Error ? error : new Error(String(error)));
      this.releaseWorker(worker);
      this.processQueue();
    }
  }

  private handleWorkerMessage(worker: Worker, result: unknown): void {
    const payload = result as {
      id?: string;
      success?: boolean;
      value?: unknown;
      error?: string;
    };

    const taskId = payload.id;
    if (!taskId) {
      this.releaseWorker(worker);
      this.processQueue();
      return;
    }

    const task = this.pendingTasks.get(taskId);
    this.assignedTaskIds.delete(worker);

    if (!task) {
      this.releaseWorker(worker);
      this.processQueue();
      return;
    }

    this.pendingTasks.delete(taskId);
    if (task.timeout) {
      clearTimeout(task.timeout);
    }

    if (payload.success) {
      task.resolve(payload.value);
    } else {
      task.reject(new Error(payload.error ?? "worker 执行失败"));
    }

    this.releaseWorker(worker);
    this.processQueue();
  }

  private handleWorkerError(worker: Worker, error: Error): void {
    this.rejectAssignedTask(worker, error);
    void this.recycleWorker(worker);
  }

  private handleWorkerExit(worker: Worker, code: number): void {
    if (this.intentionallyStoppingWorkers.has(worker)) {
      this.intentionallyStoppingWorkers.delete(worker);
      return;
    }

    this.removeWorker(worker);

    if (this.shuttingDown) {
      return;
    }

    this.rejectAssignedTask(worker, new Error(`worker 异常退出: code ${code}`));
    void this.spawnReplacementWorker();
  }

  private releaseWorker(worker: Worker): void {
    if (!this.workers.includes(worker) || this.shuttingDown) {
      return;
    }

    this.busyWorkers.delete(worker);
    this.idleWorkers.add(worker);
  }

  private removeWorker(worker: Worker): void {
    this.workers = this.workers.filter((candidate) => candidate !== worker);
    this.idleWorkers.delete(worker);
    this.busyWorkers.delete(worker);
    this.workerTaskCount.delete(worker);
    this.assignedTaskIds.delete(worker);
  }

  private rejectAssignedTask(worker: Worker, error: Error): void {
    const taskId = this.assignedTaskIds.get(worker);
    if (!taskId) {
      return;
    }

    this.assignedTaskIds.delete(worker);
    const task = this.pendingTasks.get(taskId);
    if (!task) {
      return;
    }

    this.pendingTasks.delete(taskId);
    if (task.timeout) {
      clearTimeout(task.timeout);
    }
    task.reject(error);
  }

  private findWorkerByTaskId(taskId: string): Worker | undefined {
    for (const [worker, assignedTaskId] of this.assignedTaskIds.entries()) {
      if (assignedTaskId === taskId) {
        return worker;
      }
    }
    return undefined;
  }

  private async recycleWorker(worker: Worker): Promise<void> {
    if (this.intentionallyStoppingWorkers.has(worker)) {
      return;
    }

    this.removeWorker(worker);
    this.intentionallyStoppingWorkers.add(worker);
    void worker.terminate().catch(() => {
      // ignore termination errors during recycle
    });

    if (!this.shuttingDown) {
      await this.spawnReplacementWorker();
    }
  }

  private async spawnReplacementWorker(): Promise<void> {
    try {
      await this.ensureWorkerScript();
      this.createWorker();
      this.processQueue();
    } catch (error) {
      const workerError =
        error instanceof Error ? error : new Error(String(error));
      this.fatalInitializationError = workerError;
      this.rejectQueuedTasks(workerError);
    }
  }

  private rejectQueuedTasks(error: Error): void {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (!task) {
        continue;
      }
      this.pendingTasks.delete(task.id);
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      task.reject(error);
    }
  }

  private processQueue(): void {
    if (this.fatalInitializationError) {
      this.rejectQueuedTasks(this.fatalInitializationError);
      return;
    }

    while (this.taskQueue.length > 0) {
      const worker = this.acquireWorker();
      if (!worker) {
        break;
      }

      const task = this.taskQueue.shift();
      if (task) {
        this.dispatchToWorker(worker, task);
      }
    }
  }

  getStats(): {
    totalWorkers: number;
    idleWorkers: number;
    busyWorkers: number;
    queuedTasks: number;
  } {
    return {
      totalWorkers: this.workers.length,
      idleWorkers: this.idleWorkers.size,
      busyWorkers: this.busyWorkers.size,
      queuedTasks: this.taskQueue.length,
    };
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.initialized = false;

    const shutdownError = new Error("worker 池已关闭");

    for (const task of this.pendingTasks.values()) {
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      task.reject(shutdownError);
    }
    this.pendingTasks.clear();

    for (const task of this.taskQueue) {
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      task.reject(shutdownError);
    }
    this.taskQueue = [];

    const workers = [...this.workers];
    this.workers = [];
    this.idleWorkers.clear();
    this.busyWorkers.clear();
    this.workerTaskCount.clear();
    this.assignedTaskIds.clear();

    await Promise.all(
      workers.map(async (worker) => {
        this.intentionallyStoppingWorkers.add(worker);
        try {
          await worker.terminate();
        } catch {
          // ignore termination errors during shutdown
        } finally {
          this.intentionallyStoppingWorkers.delete(worker);
        }
      }),
    );
  }
}

let globalWorkerPool: WorkerPool | null = null;

export function getGlobalWorkerPool(): WorkerPool {
  if (!globalWorkerPool) {
    globalWorkerPool = new WorkerPool();
  }
  return globalWorkerPool;
}

export async function shutdownGlobalWorkerPool(): Promise<void> {
  if (globalWorkerPool) {
    await globalWorkerPool.shutdown();
    globalWorkerPool = null;
  }
}
