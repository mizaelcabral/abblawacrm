const fs = require('fs');
const path = require('path');

// Manually parse env.local
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const firstEquals = trimmed.indexOf('=');
      if (firstEquals !== -1) {
        const key = trimmed.substring(0, firstEquals).trim();
        const val = trimmed.substring(firstEquals + 1).trim();
        if (key && val) {
          process.env[key] = val;
        }
      }
    }
  });
}

// In Next.js App Router, Request is global.
// We can mock a minimal Request object.
class MockRequest {
  constructor(body) {
    this.bodyData = body;
  }
  async json() {
    return this.bodyData;
  }
}

async function run() {
  console.log('Running with tsx...');
  
  // We must mock the supabase auth inside the handler, but wait, the handler calls createClient()
  // which reads cookies to authenticate the user.
  // To bypass authentication, we can temporarily mock createClient to return a superadmin user!
  const supabaseServer = require('../src/lib/supabase/server.ts');
  const originalCreateClient = supabaseServer.createClient;
  supabaseServer.createClient = async () => {
    return {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: 'superadmin-mock-id', email: 'affilushub@gmail.com' }
          },
          error: null
        })
      },
      from: (table) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { role: 'super_admin' },
                  error: null
                })
              })
            })
          };
        }
        // Fallback to original
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        };
      }
    };
  };

  const { POST } = require('../src/app/api/superadmin/ecommerce/onboardings/route.ts');

  // Mizael account_id
  const accountId = 'dc698780-5cf0-481b-85cc-243960f1c96d';
  const req = new MockRequest({
    accountId,
    action: 'approve',
    // no appId passed to trigger automatic mode
    pixKey: 'affilushub@gmail.com'
  });

  console.log('Calling POST handler...');
    return {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: 'superadmin-mock-id', email: 'affilushub@gmail.com' }
          },
          error: null
        })
      },
      from: (table) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { role: 'super_admin' },
                  error: null
                })
              })
            })
          };
        }
        // Fallback to original
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        };
      }
    };
  };

  try {
    const response = await POST(req);
    console.log('Response Status:', response.status);
    const json = await response.json();
    console.log('Response JSON:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    supabaseServer.createClient = originalCreateClient;
  }
}

run();
