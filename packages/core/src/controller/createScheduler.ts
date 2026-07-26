export type SchedulerFrameCallback = (timestamp: number) => boolean | void;

export type SchedulerOptions = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
  onFrame: SchedulerFrameCallback;
  onRefresh: () => void | Promise<void>;
  refreshDebounceMs?: number;
};

export type Scheduler = {
  wake(): void;
  requestRefresh(): Promise<void>;
  listen(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): () => void;
  destroy(): void;
};

function debounceDelay(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 80;
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  type RefreshTask = {
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  };
  let destroyed = false;
  let frameHandle: number | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRefresh: RefreshTask | null = null;
  let activeRefresh: RefreshTask | null = null;
  let queuedRefresh: RefreshTask | null = null;
  const listenerCleanups = new Set<() => void>();
  const refreshDebounceMs = debounceDelay(options.refreshDebounceMs);

  const scheduleFrame = () => {
    if (destroyed || frameHandle !== null) return;
    frameHandle = options.requestFrame(runFrame);
  };

  const runFrame: FrameRequestCallback = () => {
    if (destroyed) return;
    frameHandle = null;
    const shouldContinue = options.onFrame(options.now()) === true;
    if (shouldContinue) scheduleFrame();
  };

  const wake = () => {
    scheduleFrame();
  };

  const createRefreshTask = (): RefreshTask => {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    return { promise, resolve, reject };
  };

  const startRefresh = (task: RefreshTask) => {
    if (destroyed) {
      task.resolve();
      return;
    }
    activeRefresh = task;
    let refreshResult: void | Promise<void>;
    try {
      refreshResult = options.onRefresh();
    } catch (error) {
      finishRefresh(task, error);
      return;
    }
    void Promise.resolve(refreshResult).then(
      () => finishRefresh(task),
      (error) => finishRefresh(task, error)
    );
  };

  function finishRefresh(task: RefreshTask, error?: unknown) {
    if (activeRefresh === task) activeRefresh = null;
    const followUp = queuedRefresh;
    queuedRefresh = null;
    if (error === undefined) task.resolve();
    else task.reject(error);
    if (!destroyed && followUp) startRefresh(followUp);
    else followUp?.resolve();
  }

  const schedulePendingRefresh = () => {
    if (!pendingRefresh) return;
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const task = pendingRefresh;
      pendingRefresh = null;
      if (task) startRefresh(task);
    }, refreshDebounceMs);
  };

  const requestRefresh = () => {
    if (destroyed) return Promise.resolve();
    if (activeRefresh) {
      queuedRefresh ??= createRefreshTask();
      return queuedRefresh.promise;
    }
    pendingRefresh ??= createRefreshTask();
    schedulePendingRefresh();
    return pendingRefresh.promise;
  };

  const listen: Scheduler["listen"] = (
    target,
    type,
    listener,
    listenerOptions
  ) => {
    if (destroyed) return () => undefined;
    target.addEventListener(type, listener, listenerOptions);
    let active = true;
    const cleanup = () => {
      if (!active) return;
      active = false;
      target.removeEventListener(type, listener, listenerOptions);
      listenerCleanups.delete(cleanup);
    };
    listenerCleanups.add(cleanup);
    return cleanup;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (frameHandle !== null) {
      options.cancelFrame(frameHandle);
      frameHandle = null;
    }
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    pendingRefresh?.resolve();
    activeRefresh?.resolve();
    queuedRefresh?.resolve();
    pendingRefresh = null;
    activeRefresh = null;
    queuedRefresh = null;
    for (const cleanup of [...listenerCleanups]) cleanup();
  };

  return { wake, requestRefresh, listen, destroy };
}
