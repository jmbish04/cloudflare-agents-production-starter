import type { WorkerEnv } from './types';

export async function handleAuthDefault(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  
  // Handle the root OAuth path
  if (url.pathname === '/') {
    return new Response(getLoginPageHTML(), {
      headers: {
        'Content-Type': 'text/html'
      }
    });
  }
  
  // Handle other auth-related paths
  if (url.pathname === '/login') {
    return new Response(getLoginPageHTML(), {
      headers: {
        'Content-Type': 'text/html'
      }
    });
  }
  
  if (url.pathname === '/info') {
    return new Response(getInfoPageHTML(), {
      headers: {
        'Content-Type': 'text/html'
      }
    });
  }
  
  // Default 404 for unhandled paths
  return new Response('Not found', { status: 404 });
}

function getLoginPageHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secure MCP Server - Login</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 600px;
            margin: 2rem auto;
            padding: 1rem;
            line-height: 1.6;
        }
        .container {
            background: #f8f9fa;
            padding: 2rem;
            border-radius: 8px;
            border: 1px solid #e9ecef;
        }
        .btn {
            background: #007bff;
            color: white;
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 4px;
            text-decoration: none;
            display: inline-block;
            margin: 0.5rem 0;
        }
        .btn:hover {
            background: #0056b3;
        }
        code {
            background: #e9ecef;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 Secure MCP Server</h1>
        <p>Welcome to the Secure Model Context Protocol (MCP) Server. This server provides authenticated access to secure tools and resources.</p>
        
        <h2>OAuth 2.1 Authentication</h2>
        <p>This server uses OAuth 2.1 for secure authentication. To access the MCP endpoints, you need to:</p>
        
        <ol>
            <li>Obtain an access token through the OAuth flow</li>
            <li>Use the token to authenticate your MCP client</li>
            <li>Connect to the secure MCP endpoints</li>
        </ol>
        
        <h2>Available Endpoints</h2>
        <ul>
            <li><code>GET /authorize</code> - OAuth authorization endpoint</li>
            <li><code>POST /token</code> - OAuth token exchange endpoint</li>
            <li><code>GET /sse</code> - MCP over Server-Sent Events</li>
            <li><code>GET /mcp</code> - MCP over WebSocket</li>
        </ul>
        
        <h2>MCP Tools Available</h2>
        <p>Once authenticated, you can access these secure tools:</p>
        <ul>
            <li><strong>echo</strong> - Echo back messages securely</li>
            <li><strong>get_time</strong> - Get current server time</li>
            <li><strong>get_info</strong> - Get server information</li>
        </ul>
        
        <a href="/authorize" class="btn">Start OAuth Flow</a>
        <a href="/info" class="btn">Server Information</a>
    </div>
</body>
</html>
  `;
}

function getInfoPageHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Server Information</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 600px;
            margin: 2rem auto;
            padding: 1rem;
            line-height: 1.6;
        }
        .container {
            background: #f8f9fa;
            padding: 2rem;
            border-radius: 8px;
            border: 1px solid #e9ecef;
        }
        code {
            background: #e9ecef;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: monospace;
        }
        pre {
            background: #e9ecef;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📋 MCP Server Information</h1>
        
        <h2>Server Details</h2>
        <ul>
            <li><strong>Protocol:</strong> Model Context Protocol (MCP)</li>
            <li><strong>Version:</strong> 2024-11-05</li>
            <li><strong>Authentication:</strong> OAuth 2.1</li>
            <li><strong>Transport:</strong> WebSocket & Server-Sent Events</li>
        </ul>
        
        <h2>Security Features</h2>
        <ul>
            <li>🔐 OAuth 2.1 authentication required</li>
            <li>🛡️ Secure tool access control</li>
            <li>🔍 Request validation and sanitization</li>
            <li>📝 Structured logging and monitoring</li>
        </ul>

        <h2>Implementation Notes</h2>
        <p>This MCP server is built on Cloudflare Workers with Durable Objects, providing:</p>
        <ul>
            <li>Global distribution and low latency</li>
            <li>Stateful agent instances</li>
            <li>SQLite-based persistent storage</li>
            <li>WebSocket real-time communication</li>
        </ul>
        
        <p><a href="/">← Back to Login</a></p>
    </div>
</body>
</html>
  `;
}