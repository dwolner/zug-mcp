import { randomUUID } from "crypto";
import type { Response } from "express";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StoredCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
}

interface StoredToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

const clients = new Map<string, OAuthClientInformationFull>();
const authCodes = new Map<string, StoredCode>();
const accessTokens = new Map<string, StoredToken>();
const refreshTokens = new Map<string, { clientId: string }>();

const TOKEN_TTL_MS = 3600 * 1000;

export const zugOAuthProvider: OAuthServerProvider = {
  clientsStore: {
    getClient: (clientId: string) => clients.get(clientId),

    registerClient: (client: OAuthClientInformationFull): OAuthClientInformationFull => {
      const allClaudeAi = client.redirect_uris.every((uri) =>
        uri.startsWith("https://claude.ai/")
      );
      if (!allClaudeAi) {
        throw new Error("Only claude.ai redirect URIs are permitted");
      }
      clients.set(client.client_id, client);
      return client;
    },
  },

  authorize: async (
    client: OAuthClientInformationFull,
    params: { state?: string; scopes?: string[]; codeChallenge: string; redirectUri: string },
    res: Response
  ): Promise<void> => {
    const code = randomUUID();
    authCodes.set(code, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });
    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state) redirectUrl.searchParams.set("state", params.state);
    res.redirect(redirectUrl.toString());
  },

  challengeForAuthorizationCode: async (
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> => {
    const stored = authCodes.get(authorizationCode);
    if (!stored || stored.clientId !== client.client_id || stored.expiresAt < Date.now()) {
      authCodes.delete(authorizationCode); // lazy cleanup of expired codes
      throw new Error("Invalid or expired authorization code");
    }
    return stored.codeChallenge;
  },

  exchangeAuthorizationCode: async (
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> => {
    const stored = authCodes.get(authorizationCode);
    // Delete first — single use (even on validation failure to prevent timing oracle)
    authCodes.delete(authorizationCode);
    if (!stored || stored.clientId !== client.client_id || stored.expiresAt < Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }

    const access_token = randomUUID();
    const refresh_token = randomUUID();
    accessTokens.set(access_token, {
      clientId: client.client_id,
      scopes: [],
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    refreshTokens.set(refresh_token, { clientId: client.client_id });

    return { access_token, refresh_token, token_type: "bearer", expires_in: TOKEN_TTL_MS / 1000 };
  },

  exchangeRefreshToken: async (
    client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> => {
    const stored = refreshTokens.get(refreshToken);
    // Rotate: delete old refresh token immediately (OAuth 2.1 §6)
    refreshTokens.delete(refreshToken);
    if (!stored || stored.clientId !== client.client_id) {
      throw new Error("Invalid refresh token");
    }
    const access_token = randomUUID();
    const new_refresh_token = randomUUID();
    accessTokens.set(access_token, {
      clientId: client.client_id,
      scopes: [],
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    refreshTokens.set(new_refresh_token, { clientId: client.client_id });
    return { access_token, refresh_token: new_refresh_token, token_type: "bearer", expires_in: TOKEN_TTL_MS / 1000 };
  },

  verifyAccessToken: async (token: string): Promise<AuthInfo> => {
    const stored = accessTokens.get(token);
    if (!stored || stored.expiresAt < Date.now()) {
      accessTokens.delete(token); // lazy cleanup of expired tokens
      throw new Error("Invalid or expired access token");
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt / 1000),
    };
  },

  revokeToken: async (
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> => {
    accessTokens.delete(request.token);
    refreshTokens.delete(request.token);
  },
};
