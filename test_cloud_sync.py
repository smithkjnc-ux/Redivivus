import json
import subprocess
try:
    r = subprocess.run(
        ["gcloud", "run", "revisions", "list", "--service=redivivus-backend", "--region=us-east4", "--project=redivivus-core", "--format=json"],
        capture_output=True, text=True, timeout=15)
    revisions = json.loads(r.stdout)
    latest = revisions[0] if revisions else {}
    metadata = latest.get("metadata", {})
    deploy_ts  = metadata.get("creationTimestamp", "")
    print(f"Deploy TS: {deploy_ts}")
except Exception as e:
    print(f"Error: {e}")
