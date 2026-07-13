/**
 * DEV-ONLY map annotation editor (docs/pro/tasks/T-009). The implementation
 * lives in components/MapEditor/ (canvas, toolbar, inspector, history hook +
 * pure model); this page is just the route entry point.
 *
 * hard 404s in production builds — this is an internal authoring tool.
 */
import { MapEditor } from "@/components/MapEditor/MapEditor";

export default function MapEditorPage() {
  return <MapEditor />;
}
