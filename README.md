# mcp-shell

MCP server that executes shell commands in whitelisted directories.

## Warning

Very unsafe, trivial to bypass all "security" in this repo.
Use containers with bind mounts: *link_tbd*.
This is a POC/study project.

## Setup

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "shell": {
      "command": "node",
      "args": [
        "/path/to/mcp-shell/build/index.js",
        "/your/allowed/dir",
        "/another/allowed/dir"
      ]
    }
  }
}
```

## Tools

- `run_shell_command` — runs a shell command in a given `cwd`. Call `list_allowed_shell_directories` first.
- `list_allowed_shell_directories` — returns the list of directories commands are allowed to run in.

## Security

Destructive and sensitive commands are blacklisted.
Allowed directories are passed at startup and enforced at runtime.
None of this really matters though, use containers.
