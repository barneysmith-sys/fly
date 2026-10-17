import { BROWSER_MODEL, runOpenLoop } from "./sim/verticalPlant";
import type {
  ExperimentResponse,
  ExperimentSummary,
  ModelDocument,
  SimulationConfig,
  SimulationResponse,
} from "./types";

const NO_API = "NO_PYTHON_API";

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch" || error.message === "NO_PYTHON_API") {
      return "This host has no Python plant. Start it with python -m aerosim.api.server, or use the browser open-loop lesson.";
    }
    return error.message;
  }
  return "The model did not respond.";
}

async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!type.includes("json") || text.trim().startsWith("<")) {
    throw new Error(NO_API);
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new Error(NO_API);
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `The model returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function readTrace(response: Response): Promise<SimulationResponse> {
  const body = await readJson(response);
  if (
    typeof body !== "object" ||
    body === null ||
    !("samples" in body) ||
    !Array.isArray(body.samples) ||
    !("summary" in body) ||
    !("acceptance" in body)
  ) {
    throw new Error("The response did not contain a simulation trace.");
  }
  return body as SimulationResponse;
}

export async function fetchHover(signal?: AbortSignal): Promise<SimulationResponse> {
  const response = await fetch("/api/scenarios/hover-2m", { signal });
  return readTrace(response);
}

export async function postSimulation(
  config: SimulationConfig,
  signal?: AbortSignal,
): Promise<SimulationResponse> {
  const response = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal,
  });
  try {
    const trace = await readTrace(response);
    return { ...trace, plant: trace.plant ?? "python" };
  } catch (caught) {
    if (caught instanceof Error && caught.message === NO_API && config.control_mode === "open_loop") {
      return runOpenLoop(config);
    }
    if (caught instanceof Error && caught.message === NO_API) {
      throw new Error("Closed-loop experiments need the Python API. This host only runs the open-loop browser plant.");
    }
    throw caught;
  }
}

export async function fetchModel(signal?: AbortSignal): Promise<ModelDocument> {
  const response = await fetch("/api/model", { signal });
  if (!response.ok && response.status !== 200) {
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) {
      return BROWSER_MODEL;
    }
  }
  const body = await readJson(response).catch((caught: unknown) => {
    if (caught instanceof Error && caught.message === NO_API) {
      return BROWSER_MODEL;
    }
    throw caught;
  });
  if (typeof body !== "object" || body === null || !("equations" in body)) {
    throw new Error("The model document was not returned.");
  }
  return body as ModelDocument;
}

export async function fetchExperiments(signal?: AbortSignal): Promise<ExperimentSummary[]> {
  const response = await fetch("/api/experiments", { signal });
  const body = await readJson(response);
  if (
    typeof body !== "object" ||
    body === null ||
    !("experiments" in body) ||
    !Array.isArray(body.experiments)
  ) {
    throw new Error("The experiment catalog was not returned.");
  }
  return body.experiments as ExperimentSummary[];
}

export async function fetchExperiment(
  experimentId: string,
  signal?: AbortSignal,
): Promise<ExperimentResponse> {
  const response = await fetch(`/api/experiments/${encodeURIComponent(experimentId)}`, { signal });
  const trace = await readTrace(response);
  if (!("experiment" in trace)) {
    throw new Error("The experiment response did not include its checks.");
  }
  return trace as ExperimentResponse;
}
