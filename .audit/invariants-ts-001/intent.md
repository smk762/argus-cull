# Verify argus-cull does not hold its own copies of argus-cortex taxonom

## Night conductor remediation

The task supplied only the architecture rules and no argus-cull source, manifests, env files or dependency graph, so no code-level violations could be confirmed. Against the rules, argus-cull (role: ui) may only call argus-curator, agent-composer (wildcard) and argus-cortex (wildcard). It must not implement taxonomy_and_wire_schema (owner: argus-cortex) or comfyui_runtime (owner: voluptas). The findings below are rule-coverage gaps and checks that still need verification. None is a confirmed violation.

### Finding
```json
{
  "id": "ARCH-CULL-001",
  "severity": "HIGH",
  "confidence": "low",
  "type": "domain_ownership",
  "rule": "domain_ownership.taxonomy_and_wire_schema",
  "title": "Verify argus-cull does not hold its own copies of argus-cortex taxonomy or wire schemas",
  "evidence": "argus-cull is in forbidden_in for taxonomy_and_wire_schema. No code was provided to confirm or rule this out. Open PR#115 adds argus-curator.json and fixture-scan.json to argus-cull. If these contain schema definitions rather than test fixtures, they would fall in this domain.",
  "recommendation": "Search argus-cull for local taxonomy enums, label lists or versioned wire-schema definitions (JSON Schema, pydantic or zod models that mirror cortex). Replace any found with imports from the argus-cortex package. Do not reopen PR#115; review its JSON payloads as part of that PR.",
  "duplicate_of": null
}
```

### Agent work pack
- URL: http://192.168.1.198:8765/audit/packs/pack-ARCH-CULL-001
- id: `pack-ARCH-CULL-001`
- Discover: `GET /audit/packs?q=<repo-or-title>`

Draft PR — do not auto-merge.

