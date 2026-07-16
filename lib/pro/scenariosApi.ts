/**
 * Client for the Pro server's curated scenario catalogue. Scenarios are fixed
 * seed/setup/action-log vectors, but the server expands them through the current
 * rules engine on every request so visible frames track rules/content changes.
 */
import type { ReplayExpansion, ReplayResponse } from "./protocol";
import { replayHttpBase } from "./replayApi";

export interface ScenarioSummary {
  id: string;
  deckId: string;
  deckName: string;
  title: string;
  description: string;
  tags: string[];
  actionCount: number;
  expectedFinalHash: string;
}

interface ScenarioCatalogueResponse {
  ok?: boolean;
  scenarios?: ScenarioSummary[];
  message?: string;
}

export type ScenarioCatalogueResult =
  | { ok: true; scenarios: ScenarioSummary[] }
  | { ok: false; message: string };

export type ScenarioReplayResult =
  | { ok: true; expansion: ReplayExpansion }
  | { ok: false; message: string };

export async function fetchScenarioCatalogue(opts: { wsUrl?: string; signal?: AbortSignal } = {}): Promise<ScenarioCatalogueResult> {
  const url = `${replayHttpBase(opts.wsUrl)}/scenarios.json`;
  let res: Response;
  try {
    res = await fetch(url, { signal: opts.signal, cache: "no-store" });
  } catch (e) {
    return { ok: false, message: `Could not reach the scenario server (${(e as Error).message}). Is it running?` };
  }

  let body: ScenarioCatalogueResponse | null = null;
  try {
    body = (await res.json()) as ScenarioCatalogueResponse;
  } catch {
    return { ok: false, message: `Scenario server returned a non-JSON response (HTTP ${res.status}).` };
  }

  if (res.ok && body?.ok === true && Array.isArray(body.scenarios)) {
    return { ok: true, scenarios: body.scenarios };
  }
  return { ok: false, message: body?.message ?? `Scenario catalogue rejected (HTTP ${res.status}).` };
}

export async function fetchScenarioReplay(id: string, opts: { wsUrl?: string; signal?: AbortSignal } = {}): Promise<ScenarioReplayResult> {
  const url = `${replayHttpBase(opts.wsUrl)}/scenarios/${encodeURIComponent(id)}/replay.json`;
  let res: Response;
  try {
    res = await fetch(url, { signal: opts.signal, cache: "no-store" });
  } catch (e) {
    return { ok: false, message: `Could not reach the scenario server (${(e as Error).message}). Is it running?` };
  }

  let body: ReplayResponse | null = null;
  try {
    body = (await res.json()) as ReplayResponse;
  } catch {
    return { ok: false, message: `Scenario server returned a non-JSON response (HTTP ${res.status}).` };
  }

  if (res.ok && body?.ok === true) return { ok: true, expansion: body };
  const message = body?.ok === false ? body.message : undefined;
  return { ok: false, message: message ?? `Scenario replay rejected (HTTP ${res.status}).` };
}
