# Piclaw extensions

Self-contained extensions live here. Each has its own code and dependencies; the runtime does not depend on anything outside `piclaw_runtime/`.

## twitter_api

Twitter API client and read-only verification for Piclaw.

- **Python 3** required. On the Pi: `pip install -r extensions/twitter_api/requirements.txt` (or use a venv).
- Env: `PICLAW_TWITTER_AUTH_TOKEN`, `PICLAW_TWITTER_CT0`, `PICLAW_TWITTER_SCREEN_NAME`.
- `twitter_check.py` is used by the Node bridge for `/twitter` verification only (no posting).
