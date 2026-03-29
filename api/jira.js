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

  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const projectKey = process.env.JIRA_PROJECT_KEY;

  if (!baseUrl || !email || !token || !projectKey) {
    return res.status(500).json({ error: `Missing env vars. Have: baseUrl=${!!baseUrl} email=${!!email} token=${!!token} projectKey=${!!projectKey}` });
  }

  // Special endpoint to expose project key to frontend
  if (req.query.getConfig) {
    return res.status(200).json({ projectKey });
  }

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path param" });

  // Replace :projectKey placeholder in path
  const resolvedPath = decodeURIComponent(path).replace(":projectKey", projectKey);
  const url = `${baseUrl.replace(/\/$/, "")}/rest${resolvedPath}`;
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
