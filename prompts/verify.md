Read logs/verify.log and output JSON only using codex-output-schema.json.

If VERIFY_OK is present and there are no errors:
- status="ok"
- verify_ok=true
- summary: one short line

If any step fails:
- status="fail"
- verify_ok=false
- failed_step: one of ["install","lint","test","build","other"]
- summary: one short line
- notes: up to 5 actionable bullet-like strings
