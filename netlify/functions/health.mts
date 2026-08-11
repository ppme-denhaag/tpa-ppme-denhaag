import type { Config } from '@netlify/functions'

// Foundation-scope placeholder confirming the Functions pipeline (bundling,
// deploy, routing) works end-to-end. The 8 real functions from the TAD/
// OpenAPI spec (notify-absence, publish-report, etc.) land with the
// milestones that own them.
export default async () => {
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  path: '/.netlify/functions/health',
}
