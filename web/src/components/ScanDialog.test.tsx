import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScanDialog } from "./ScanDialog";

describe("ScanDialog", () => {
  it("names the folder Scan will send, before any listing has loaded", () => {
    const html = renderToStaticMarkup(
      <ScanDialog
        initial={{ folder: "sets/b", policy: { policy: "adult", variants: [] }, withGarments: true, setAge: false, readBodies: false, drops: [], cropWatermarks: false, cropMaxCut: 15 }}
        from={null}
        detectors={null}
        health={null}
        canScan
        busyLabel={null}
        onClose={() => {}}
        onScan={() => {}}
      />,
    );
    expect(html).toContain("Scan sets/b");
    expect(html).not.toContain("Scan source root");
  });
});
