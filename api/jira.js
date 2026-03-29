export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Atlassian-Token, Accept");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Credentials from server env vars (never exposed to browser)
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;

  if (!baseUrl || !email || !token) {
    return res.status(500).json({ error: "Jira credentials not configured in Vercel environment variables" });
  }

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path param" });

  const url = `${baseUrl.replace(/\/$/, "")}/rest${decodeURIComponent(path)}`;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  try {
    const bodyBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

    const forwardHeaders = {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    };

    if (req.headers["content-type"]) {
      forwardHeaders["Content-Type"] = req.headers["content-type"];
    }
    if (req.headers["x-atlassian-token"]) {
      forwardHeaders["X-Atlassian-Token"] = req.headers["x-atlassian-token"];
    }

    const fetchOpts = { method: req.method, headers: forwardHeaders };
    if (req.method !== "GET" && bodyBuffer.length > 0) {
      fetchOpts.body = bodyBuffer;
    }

    const jiraRes = await fetch(url, fetchOpts);
    const rawText = await jiraRes.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText };
    }

    return res.status(jiraRes.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
