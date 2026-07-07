/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(baseUrl: string): Record<string, unknown> {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

/** RFC 9728 protected resource metadata — points MCP clients at our authorization server. */
export function protectedResourceMetadata(baseUrl: string): Record<string, unknown> {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
  };
}
