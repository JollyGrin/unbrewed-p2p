/**
 * Guard for the one client-only line in lib/pro/protocol.ts (#1700).
 *
 * The file is a verbatim mirror of the engine's protocol/protocol.ts, except for
 * `REMATCH_PROTOCOL_VERSION`. A mirror that copies the engine file over it drops
 * the export; useProSocket.ts and wireVersion.ts import it, so the build goes red
 * and the rematch offer turns off. This fails first, and says why.
 */
import { readFileSync } from "fs";
import { join } from "path";
import * as protocol from "./protocol";

const MIRROR_HINT =
  "lib/pro/protocol.ts must keep the client-only `export const REMATCH_PROTOCOL_VERSION = 35;` " +
  "(directly after PROTOCOL_VERSION) when the engine's protocol/protocol.ts is mirrored over it.";

describe("lib/pro/protocol.ts client-only export", () => {
  it("exports REMATCH_PROTOCOL_VERSION", () => {
    const exported = (protocol as Record<string, unknown>).REMATCH_PROTOCOL_VERSION;
    if (exported === undefined) throw new Error(MIRROR_HINT);
    expect(exported).toBe(35);
  });

  it("keeps it no higher than PROTOCOL_VERSION", () => {
    const exported = (protocol as Record<string, unknown>).REMATCH_PROTOCOL_VERSION as number;
    expect(exported).toBeLessThanOrEqual(protocol.PROTOCOL_VERSION);
  });

  it("declares it in the source, marked client-only", () => {
    const source = readFileSync(join(__dirname, "protocol.ts"), "utf8");
    if (!/^export const REMATCH_PROTOCOL_VERSION = 35;$/m.test(source)) throw new Error(MIRROR_HINT);
    expect(source).toMatch(/CLIENT-ONLY ADDITION \(p2p #880/);
  });
});
