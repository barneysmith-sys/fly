import type { SimulationConfig, SimulationResponse } from "./types";

async function readTrace(response: Response): Promise<SimulationResponse> {
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
