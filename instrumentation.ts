/**
 * Next.js instrumentation hook.
 *
 * Auto-forks the download worker on server startup with auto-restart.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { spawn } = await import("child_process");
    const { default: path } = await import("path");

    const cwd = process.cwd();
    const workerFile = path.join(cwd, "worker.ts");

    const MAX_RESTARTS = 5;
    const RESTART_DELAY_MS = 3_000;
    let restartCount = 0;
    let child: ReturnType<typeof spawn> | null = null;

    function startWorker() {
      console.log("[instrumentation] Starting download worker...");

      child = spawn("npx", ["tsx", workerFile], {
        cwd,
        stdio: "inherit",
        shell: true,
      });

      child.on("error", (err) => {
        console.error("[instrumentation] Worker process error:", err);
      });

      child.on("exit", (code, signal) => {
        if (signal === "SIGTERM" || signal === "SIGINT") {
          console.log(
            `[instrumentation] Worker exited gracefully (signal: ${signal})`
          );
          return;
        }

        console.log(
          `[instrumentation] Worker exited with code ${code}`
        );

        // Auto-restart if not shutting down and under restart limit
        if (restartCount < MAX_RESTARTS) {
          restartCount++;
          console.log(
            `[instrumentation] Restarting worker in ${RESTART_DELAY_MS}ms (attempt ${restartCount}/${MAX_RESTARTS})...`
          );
          setTimeout(startWorker, RESTART_DELAY_MS);
        } else {
          console.error(
            `[instrumentation] Worker crashed ${MAX_RESTARTS} times — giving up. Start manually with "npm run worker".`
          );
        }
      });
    }

    startWorker();

    // Kill worker on server shutdown
    process.on("SIGTERM", () => {
      if (child) child.kill("SIGTERM");
    });

    process.on("SIGINT", () => {
      if (child) child.kill("SIGINT");
    });
  }
}
