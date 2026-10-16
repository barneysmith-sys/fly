import type {
  ExperimentResponse,
  ExperimentSummary,
  ModelDocument,
  SimulationConfig,
  SimulationResponse,
} from "./types";

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "The Python API is not reachable. Start it with python -m aerosim.api.server.";
    }
    return error.message;
  }
  return "The model did not respond.";
}

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
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
  return readTrace(response);
}

export async function fetchModel(signal?: AbortSignal): Promise<ModelDocument> {
  const response = await fetch("/api/model", { signal });
  const body = await readJson(response);
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
