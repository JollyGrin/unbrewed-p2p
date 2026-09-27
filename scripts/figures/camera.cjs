/**
 * The camera elevation miniatures are rendered from (unbrewed-p2p-926).
 *
 * The tabletop tips the board back by DEFAULT_TILT_DEG, measured from FACING
 * the camera (`rotateX` in lib/pro/tableProjection.ts). The renderer's `elev`
 * is measured UP FROM THE GROUND — the complementary angle. A flat circle on
 * the board shows at height:width = cos(tilt); a camera `elev` above the
 * ground sees a model's round base at sin(elev). They agree only when
 * elev = 90° − tilt.
 *
 * The tilt is read out of tableProjection.ts, not repeated here, so retuning
 * the board cannot leave the renders at the old angle — re-render after it.
 */
const fs = require("fs");
const path = require("path");

const PROJECTION = path.resolve(__dirname, "..", "..", "lib", "pro", "tableProjection.ts");

const boardTiltDeg = (source = fs.readFileSync(PROJECTION, "utf8")) => {
  const m = /^export const DEFAULT_TILT_DEG = (\d+(?:\.\d+)?);/m.exec(source);
  if (!m) throw new Error(`DEFAULT_TILT_DEG not found in ${PROJECTION}`);
  return Number(m[1]);
};

const elevForTilt = (tiltDeg) => 90 - tiltDeg;

const defaultElevDeg = (source) => elevForTilt(boardTiltDeg(source));

module.exports = { boardTiltDeg, elevForTilt, defaultElevDeg };
