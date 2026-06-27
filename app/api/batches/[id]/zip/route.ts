import { db } from "@/lib/db";
import { batches, jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as archiver from "archiver";
import fs from "fs";
import path from "path";

/**
 * GET /api/batches/[id]/zip
 *
 * Streams all completed files from a batch as a ZIP archive.
 * Uses archiver for streaming (never buffers the entire archive in memory).
 *
 * Only works for batches with status "done" or "partial".
 * Files are organized inside the ZIP as: {video_title}.{ext}
 *
 * Next.js 16: params is a Promise that must be awaited.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const batch = await db.query.batches.findFirst({
      where: eq(batches.id, id),
    });

    if (!batch) {
      return Response.json(
        { error: "Batch not found — it may have been removed" },
        { status: 404 }
      );
    }

    if (batch.status !== "done" && batch.status !== "partial") {
      return Response.json(
        {
          error:
            "This batch hasn't finished downloading yet — wait for it to complete before exporting",
        },
        { status: 400 }
      );
    }

    // Get all completed jobs with output paths
    const batchJobs = await db.query.jobs.findMany({
      where: eq(jobs.batchId, id),
    });

    const completedJobs = batchJobs.filter(
      (j) => j.status === "done" && j.outputPath
    );

    if (completedJobs.length === 0) {
      return Response.json(
        { error: "No completed files to export — all downloads may have failed" },
        { status: 400 }
      );
    }

    // Verify files exist on disk
    const filesToZip: Array<{ filePath: string; archiveName: string }> = [];

    for (const job of completedJobs) {
      const outputPath = job.outputPath!;

      if (fs.existsSync(outputPath)) {
        // Use just the filename inside the ZIP (flat structure)
        const archiveName = path.basename(outputPath);
        filesToZip.push({ filePath: outputPath, archiveName });
      } else {
        console.warn(
          `[ZIP] Output file not found: ${outputPath} — skipping`
        );
      }
    }

    if (filesToZip.length === 0) {
      return Response.json(
        {
          error:
            "Downloaded files were not found on disk — they may have been moved or deleted",
        },
        { status: 400 }
      );
    }

    // Create a streaming ZIP archive
    const archive = new archiver.ZipArchive({ zlib: { level: 6 } });

    // Set response headers for ZIP download
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set(
      "Content-Disposition",
      `attachment; filename="kymo-batch-${id.slice(0, 8)}.zip"`
    );

    // Create a ReadableStream from archiver events
    const stream = new ReadableStream({
      start(controller) {
        archive.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        archive.on("end", () => {
          controller.close();
        });

        archive.on("error", (err: Error) => {
          console.error("[ZIP] Archive error:", err);
          controller.error(err);
        });

        // Add all files to the archive
        for (const { filePath, archiveName } of filesToZip) {
          archive.file(filePath, { name: archiveName });
        }

        archive.finalize();
      },
    });

    return new Response(stream, { headers });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong creating the ZIP export";

    console.error("[GET /api/batches/:id/zip]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
