import type { Detectors, GuardPolicy } from "./types";

export interface DetectorGroup {
  id: "insightface" | "mivolo" | "places365" | "garments";
  label: string;
  ready: boolean;
  hint: string;
}

export function detectorGroups(detectors: Detectors): DetectorGroup[] {
  return [
    {
      id: "insightface",
      label: "People and pose",
      ready: detectors.insightface,
      hint: 'InsightFace is not loaded. Install it with pip install "argus-curator[faces]".',
    },
    {
      id: "mivolo",
      label: "MiVOLO",
      ready: detectors.mivolo,
      hint: "MiVOLO weights are not loaded. argus-curator mivolo-convert produces the ONNX file.",
    },
    {
      id: "places365",
      label: "Places365",
      ready: detectors.places365,
      hint: "Places365 weights are not loaded. argus-curator places365-convert produces the ONNX file.",
    },
    {
      id: "garments",
      label: "Fashionpedia",
      ready: detectors.garments,
      hint: "Fashionpedia weights are not loaded. argus-curator garments-convert produces the ONNX file.",
    },
  ];
}

/** The NudeNet group stays absent until the server reports a NudeNet URL. */
export function contentRatingAvailable(detectors: Detectors): boolean {
  return detectors.nudenet === true;
}

/** The SingGuard group stays absent until the server reports a SingGuard URL. */
export function policyAvailable(detectors: Detectors): boolean {
  return detectors.singguard === true;
}

/** The server runs SingGuard and lists *policy* among the ones a scan can name. */
export function policyOffered(detectors: Detectors | null, policy: GuardPolicy): boolean {
  return detectors?.singguard === true && (detectors.singguard_policies ?? []).includes(policy);
}
