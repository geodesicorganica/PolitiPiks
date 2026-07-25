const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.text();
  let parsedBody = body;

  try {
    parsedBody = body ? JSON.parse(body) : null;
  } catch {
    // Keep non-JSON bodies as text for easier debugging.
  }

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${body}`);
  }

  return parsedBody;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const health = await request("/api/health");
  assert(health?.status === "ok", "Health endpoint did not return status=ok");

  const sources = await request("/api/data-sources");
  assert(Array.isArray(sources), "Data sources endpoint did not return an array");

  const races = await request("/api/races");
  assert(Array.isArray(races), "Races endpoint did not return an array");

  const ballotMeasures = await request("/api/ballot-measures");
  assert(Array.isArray(ballotMeasures), "Ballot measures endpoint did not return an array");

  console.log("Smoke test passed.");
  console.log(JSON.stringify({
    baseUrl,
    firebaseAdmin: health.services?.firebaseAdmin ?? false,
    congressApiConfigured: health.services?.congressApiConfigured ?? false,
    geminiConfigured: health.services?.geminiConfigured ?? false,
    dataSources: sources.length,
    races: races.length,
    ballotMeasures: ballotMeasures.length,
  }, null, 2));
}

main().catch((error) => {
  console.error("Smoke test failed.");
  console.error(error.message);
  process.exitCode = 1;
});
