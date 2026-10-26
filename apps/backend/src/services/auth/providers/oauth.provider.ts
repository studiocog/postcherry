import { createHash, createHmac } from 'crypto';
import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';

// PKCE (POSTIZ_OAUTH_PKCE=true) for identity providers that require it.
// The verifier is derived from the login state nonce, so nothing is stored.
const pkceEnabled = () => process.env.POSTIZ_OAUTH_PKCE === 'true';
const codeVerifier = (state: string) =>
  createHmac('sha256', process.env.JWT_SECRET!)
    .update(`oauth-pkce:${state}`)
    .digest('base64url');

@AuthProvider({ provider: 'GENERIC' })
export class OauthProvider extends AuthProviderAbstract {
  private getConfig() {
    const {
      POSTIZ_OAUTH_AUTH_URL,
      POSTIZ_OAUTH_CLIENT_ID,
      POSTIZ_OAUTH_CLIENT_SECRET,
      POSTIZ_OAUTH_TOKEN_URL,
      POSTIZ_OAUTH_USERINFO_URL,
      FRONTEND_URL,
    } = process.env;

    if (
      !POSTIZ_OAUTH_USERINFO_URL ||
      !POSTIZ_OAUTH_TOKEN_URL ||
      !POSTIZ_OAUTH_CLIENT_ID ||
      !POSTIZ_OAUTH_CLIENT_SECRET ||
      !POSTIZ_OAUTH_AUTH_URL ||
      !FRONTEND_URL
    ) {
      throw new Error('POSTIZ_OAUTH environment variables are not set');
    }

    return {
      authUrl: POSTIZ_OAUTH_AUTH_URL,
      clientId: POSTIZ_OAUTH_CLIENT_ID,
      clientSecret: POSTIZ_OAUTH_CLIENT_SECRET,
      tokenUrl: POSTIZ_OAUTH_TOKEN_URL,
      userInfoUrl: POSTIZ_OAUTH_USERINFO_URL,
      frontendUrl: FRONTEND_URL,
    };
  }

  generateLink(query?: { state?: string }): string {
    const { authUrl, clientId, frontendUrl } = this.getConfig();
    const state = query?.state || 'login';
    const params = new URLSearchParams({
      client_id: clientId,
      scope: process.env.POSTIZ_OAUTH_SCOPE || 'openid profile email',
      response_type: 'code',
      state,
      redirect_uri: `${frontendUrl}/settings`,
    });

    if (pkceEnabled()) {
      params.set(
        'code_challenge',
        createHash('sha256').update(codeVerifier(state)).digest('base64url')
      );
      params.set('code_challenge_method', 'S256');
    }

    return `${authUrl}?${params.toString()}`;
  }

  async getToken(
    code: string,
    _redirectUri?: string,
    state?: string
  ): Promise<string> {
    const { tokenUrl, clientId, clientSecret, frontendUrl } = this.getConfig();
    const response = await fetch(`${tokenUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${frontendUrl}/settings`,
        ...(pkceEnabled() && state
          ? { code_verifier: codeVerifier(state) }
          : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token request failed: ${error}`);
    }

    const { access_token } = await response.json();
    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const { userInfoUrl } = this.getConfig();
    const response = await fetch(`${userInfoUrl}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`User info request failed: ${error}`);
    }

    const { email, sub: id } = await response.json();
    return { email, id };
  }
}
