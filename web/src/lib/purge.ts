import type { ViewState } from "./types";

/** Drop the previous scan from the view when the folder changes.

Score floors and rule choices stay. Cluster ids, the names given to them,
scene labels, the open photo, and the scan id belong to the folder that was
just left.
*/
export function withoutScan(view: ViewState, folder = view.folder): ViewState {
  return {
    ...view,
    folder,
    scan: null,
    page: 1,
    photo: null,
    cluster: null,
    faceNames: {},
    filter: { ...view.filter, faceClusters: [], scenes: [] },
  };
}
