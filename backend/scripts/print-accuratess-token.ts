/**
 * Fetch a fresh Accuratess (Mayar) API token and print it for UI / env paste.
 *
 * Usage:
 *   npm run accuratess:token
 *   ACCURATESS_USERNAME=اسلام ACCURATESS_PASSWORD=123456 npm run accuratess:token
 */
import * as https from 'https';

const endpoint =
  process.env.ACCURATESS_ENDPOINT ||
  'https://mayar.lg.accuratess.com:8443/graphql';
const username = (process.env.ACCURATESS_USERNAME || 'اسلام').trim();
const password = process.env.ACCURATESS_PASSWORD || '123456';

const LOGIN_MUTATION = `
  mutation AccuratessLogin($input: LoginInput!) {
    login(input: $input) {
      token
      expiresAt
      user { id username active }
    }
  }
`;

function postGraphql(body: unknown): Promise<{ status: number; json: any }> {
  const url = new URL(endpoint);
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        // Partner endpoint may use a custom cert chain in some environments
        rejectUnauthorized: process.env.ACCURATESS_TLS_STRICT === 'true',
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(text) });
          } catch {
            reject(new Error(`Invalid JSON (HTTP ${res.statusCode}): ${text.slice(0, 400)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Accuratess login…');
  console.log(`  endpoint: ${endpoint}`);
  console.log(`  username: ${username}`);

  const { status, json } = await postGraphql({
    query: LOGIN_MUTATION,
    variables: {
      input: {
        username,
        password,
        rememberMe: true,
      },
    },
  });

  if (status < 200 || status >= 300) {
    console.error(`HTTP ${status}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  if (json.errors?.length) {
    console.error('Login failed:');
    for (const e of json.errors) console.error(`  - ${e.message}`);
    process.exit(1);
  }

  const login = json.data?.login;
  const token: string | undefined = login?.token;
  if (!token) {
    console.error('No token in response:');
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log('');
  console.log('--- Accuratess token (copy into UI settings / ACCURATESS_TOKEN) ---');
  console.log(token);
  console.log('--- end token ---');
  console.log('');
  console.log(
    `user: id=${login.user?.id} username=${login.user?.username} active=${login.user?.active}`,
  );
  console.log(`expiresAt: ${login.expiresAt ?? 'null (no expiry returned)'}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
