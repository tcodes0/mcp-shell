#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { execa } from 'execa';

const BLACKLISTED = [
  'bash',
  'sh',
  'zsh',
  'fish',
  'ksh',
  'csh',
  'tcsh',
  'sudo',
  'su',
  'doas',
  'rm',
  'rmdir',
  'del',
  'mkfs',
  'format',
  'dd',
  'chmod',
  'chown',
  'exec',
  'eval',
  'source',
  'nc',
  'netcat',
  'scp',
  'sftp',
  'ftp',
  'rsync',
  'crontab',
  'at',
  'launchctl',
  'systemctl',
  'service',
  'kill',
  'killall',
  'pkill',
  'shutdown',
  'reboot',
  'init',
  'halt',
  'write',
  'wall',
];

const BLACKLISTED_PATHS = ['/etc/'];

const BLACKLISTED_INTERPRETERS = [
  'node',
  'python',
  'python3',
  'ruby',
  'perl',
  'php',
  'lua',
  'java',
  'groovy',
];

const CMD_RUN = 'run_shell_command2';
const CMD_LIST_DIRS = 'list_allowed_shell_directories2';

class ShellServer {
  private server: Server;
  private allowedDirs: string[];

  constructor(allowedDirs: string[]) {
    this.allowedDirs = allowedDirs;
    this.server = new Server(
      {
        name: 'shell-server',
        version: '0.1.0',
        description:
          'Executes shell commands in whitelisted directories. Supports common development tools (go, git, grep, make, etc). Sensitive and destructive commands are blacklisted.',
      },
      { capabilities: { tools: { listChanged: false } } }
    );

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
    this.setupToolHandlers();
  }

  private listAllowedDirs() {
    return {
      content: [{ type: 'text', text: this.allowedDirs.join('\n'), mimeType: 'text/plain' }],
    };
  }

  private async runCommand(args: Record<string, unknown>) {
    const command = args.command as string;
    const cwd = args.cwd as string;

    if (!this.allowedDirs.some((dir) => cwd === dir || cwd.startsWith(dir + '/'))) {
      throw new Error(`Directory not allowed: ${cwd}`);
    }

    const base = command.trim().split(/\s+/)[0];

    if (BLACKLISTED.some((token) => new RegExp(`\\b${token}\\b`).test(command))) {
      throw new Error(`Command not allowed: ${command}`);
    }

    if (BLACKLISTED_PATHS.some((path) => command.includes(path))) {
      throw new Error(`Command not allowed: ${command}`);
    }

    if (BLACKLISTED_INTERPRETERS.includes(base)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    const { stdout, stderr } = await execa(command, [], { shell: true, env: process.env, cwd });
    return {
      content: [{ type: 'text', text: stdout || stderr, mimeType: 'text/plain' }],
    };
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: CMD_RUN,
          description:
            'Run a shell command in a specific directory. ' +
            'Use list_allowed_directories first to get the list of valid values for cwd.',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              cwd: {
                type: 'string',
                description:
                  'Working directory for the command. Must be one of the allowed directories returned by list_allowed_directories.',
              },
            },
            required: ['command', 'cwd'],
          },
        },
        {
          name: CMD_LIST_DIRS,
          description: 'Returns the list of directories where commands are allowed to run.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = request.params.arguments ?? {};
      try {
        switch (request.params.name) {
          case CMD_LIST_DIRS:
            return this.listAllowedDirs();
          case CMD_RUN:
            return await this.runCommand(args);
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return { content: [{ type: 'text', text: String(error), mimeType: 'text/plain' }] };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Although this is just an informative message, we must log to stderr,
    // to avoid interfering with MCP communication that happens on stdout
    console.error('MCP server running on stdio');
  }
}

async function main() {
  const server = new ShellServer(process.argv.slice(2));
  await server.run();
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
