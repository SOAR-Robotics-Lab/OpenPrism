# Skill: Rebuild & Restart OpenCode

Rebuild the OpenPrism plugin and restart the OpenCode web server to pick up changes.

## Steps

1. **Build the plugin**
   ```bash
   npm run build
   ```
   Working directory: `/home/hao_xu/develop/OpenPrism`
   Verify: exit code 0, no errors.

2. **Stop the running OpenCode web server**
   ```
   tmux send-keys -t opencode-web C-c
   ```
   Wait 1 second, then verify the process exited by checking the tmux pane output ends with a shell prompt.

3. **Restart OpenCode web server**
   ```
   tmux send-keys -t opencode-web "cd /home/hao_xu/develop/OpenPrism && opencode web --port 9999" Enter
   ```
   Wait 3 seconds, then verify by checking the tmux pane output contains `Web interface:      http://127.0.0.1:9999/`.

## Tmux Sessions

| Session | Purpose |
|---------|---------|
| `opencode-web` | OpenCode web UI (port 9999) — the primary test instance |
| `opencode-10000` | OpenCode web UI (port 10000) — secondary instance |

## Notes

- Always `npm run build` before restarting — OpenCode loads from `dist/`.
- The plugin is loaded via `.opencode/plugins/openprism.ts` which re-exports from `dist/`.
- If port 9999 is occupied, kill the old process first or use a different port.
- No `OPENCODE_SERVER_PASSWORD` is set; the server is unsecured (dev only).
