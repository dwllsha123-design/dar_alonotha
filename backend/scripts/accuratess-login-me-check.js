/**
 * Non-destructive login + me check (then optional one shipment via prod-verify).
 * Never prints username/password/token.
 */
const ep =
  process.env.ACCURATESS_ENDPOINT ||
  'https://mayar.lg.accuratess.com:8443/graphql';
const username = (process.env.ACCURATESS_USERNAME || '').trim();
const password = process.env.ACCURATESS_PASSWORD || '';

async function gql(query, variables, token) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(ep, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, snippet: text.slice(0, 180) };
}

(async () => {
  const out = {
    LOGIN_MUTATION: 'FAIL',
    FRESH_TOKEN_OBTAINED: 'NO',
    AUTHENTICATED_ME: 'FAIL',
    staticTokenPresent: Boolean((process.env.ACCURATESS_TOKEN || '').trim()),
    usernamePresent: Boolean(username),
    passwordPresent: Boolean(password),
    webhook: process.env.ACCURATESS_WEBHOOK_ENABLED || 'unset',
  };

  if (out.staticTokenPresent) {
    console.log(JSON.stringify({ ...out, error: 'ACCURATESS_TOKEN must be absent' }, null, 2));
    process.exit(1);
  }
  if (!username || !password) {
    console.log(JSON.stringify({ ...out, error: 'username/password missing' }, null, 2));
    process.exit(1);
  }

  const loginQuery = `
    mutation AccuratessLogin($input: LoginInput!) {
      login(input: $input) {
        token
        user {
          id
          username
          active
        }
      }
    }
  `;
  const login = await gql(loginQuery, {
    input: { username, password, rememberMe: true },
  });
  const token = login.json?.data?.login?.token;
  out.LOGIN_MUTATION =
    login.status === 200 && token && !login.json?.errors?.length ? 'PASS' : 'FAIL';
  out.FRESH_TOKEN_OBTAINED = token ? 'YES' : 'NO';
  console.log(
    'LOGIN',
    JSON.stringify({
      httpStatus: login.status,
      hasToken: Boolean(token),
      hasUser: Boolean(login.json?.data?.login?.user),
      errors: (login.json?.errors || []).map((e) => e.message).slice(0, 3),
    }),
  );

  if (!token) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const me = await gql('query AccuratessMe { me { id username active } }', undefined, token);
  out.AUTHENTICATED_ME =
    me.status === 200 && me.json?.data?.me ? 'PASS' : 'FAIL';
  console.log(
    'ME',
    JSON.stringify({
      httpStatus: me.status,
      hasMe: Boolean(me.json?.data?.me),
      active: me.json?.data?.me?.active ?? null,
      errors: (me.json?.errors || []).map((e) => e.message).slice(0, 3),
    }),
  );

  console.log(JSON.stringify(out, null, 2));
  if (out.LOGIN_MUTATION !== 'PASS' || out.AUTHENTICATED_ME !== 'PASS') process.exit(1);
})().catch((e) => {
  console.error('FATAL', String(e && e.message ? e.message : e));
  process.exit(1);
});
