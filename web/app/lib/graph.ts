import { ConfidentialClientApplication } from "@azure/msal-node";

const graphBase = "https://graph.microsoft.com/v1.0";
let cachedCca: ConfidentialClientApplication | null = null;

function getGraphEnv() {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("ENTRA_TENANT_ID/ENTRA_CLIENT_ID/ENTRA_CLIENT_SECRET must be set");
  }
  return { tenantId, clientId, clientSecret };
}

function getCca() {
  if (cachedCca) return cachedCca;
  const { tenantId, clientId, clientSecret } = getGraphEnv();
  cachedCca = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  });
  return cachedCca;
}

async function getAppToken() {
  const result = await getCca().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) {
    throw new Error("Failed to acquire Graph token");
  }
  return result.accessToken;
}

export async function graphGet(path: string) {
  const token = await getAppToken();
  const res = await fetch(`${graphBase}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function graphDelete(path: string) {
  const token = await getAppToken();
  const res = await fetch(`${graphBase}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph error ${res.status}: ${text}`);
  }
}
