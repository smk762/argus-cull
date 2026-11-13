# Rule labels match no declared role, so argus-cull goes unchecked

## Night conductor remediation

No confirmed code-level invariant violations: repo contents were unavailable. Two rule-configuration gaps leave argus-cull's dependency direction and service-boundary checks ineffective. A source scan is still required to verify the HIGH-severity domain_ownership bans.

### Finding
```json
{
  "id": "ARCH-CULL-001",
  "severity": "MEDIUM",
  "category": "rules_config",
  "rule": "dependency_direction",
  "title": "Rule labels match no declared role, so argus-cull goes unchecked",
  "detail": "The dependency_direction rule allows 'gateway->services' and 'services->libraries'. The roles declared in service_roles are ui, worker, library and tooling. No role is named 'gateway' or 'services', and 'libraries' does not exactly match 'library'. argus-cull has role 'ui', which none of these labels covers. Its dependency direction (ui->worker, ui->library) is therefore either unconstrained or rejected, depending on how the checker resolves the labels.",
  "evidence": "architecture_rules: dependency_direction.allowed; service_roles: argus-cull role=ui",
  "recommendation": "Rewrite allowed edges in role terms, e.g. 'ui->worker', 'ui->library', 'worker->worker', 'worker->library'.",
  "confidence": "high"
}
```

### Agent work pack
- URL: http://192.168.1.198:8765/audit/packs/pack-ARCH-CULL-001
- id: `pack-ARCH-CULL-001`
- Discover: `GET /audit/packs?q=<repo-or-title>`

Draft PR — do not auto-merge.

