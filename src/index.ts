import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const dataPath = process.env.DATA_PATH || "./data";

const tryParse = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

type Stateful = { id: string; version: number };
type AddAction = Stateful & { type: "add"; key: string; value: object };
type RemoveAction = Stateful & { type: "remove"; key: string };
type Action = AddAction | RemoveAction;
type State = Stateful & { state: object };

class StoredMap<K, V> extends Map<K, V> {
  constructor(...args) {
    super(...args);
    const stateFiles = readdirSync(dataPath);

    for (const next of stateFiles) {
      const filePath = join(dataPath, next);
      const raw = readFileSync(filePath, "utf-8");
      const json = tryParse(raw);

      if (json) {
        super.set(next as K, json as V);
      } else {
        unlinkSync(filePath);
      }
    }
  }

  set(key: K, value: V) {
    const r = super.set(key, value);
    writeFileSync(join(dataPath, String(key)), JSON.stringify(value));
    return r;
  }
}

const hub = new StoredMap<string, State>();
const esm = readFileSync("./state.mjs", "utf-8");

function onRequest(request: IncomingMessage, response: ServerResponse) {
  const method = String(request.method).toUpperCase();
  const url = new URL(
    request.url,
    "http://" + String(request.headers["x-forwarded-for"] || "localhost")
  );
  const route = `${method} ${url.pathname}`;
  console.log(new Date().toISOString(), route);

  if (route === "GET /state.mjs") {
    onServe(request, response, url);
    return;
  }

  if (route === "POST /events") {
    onEvent(request, response);
    return;
  }

  if (route === "GET /events") {
    onEventListen(request, response, url);
    return;
  }

  if (route === "POST /states") {
    onCreate(request, response);
    return;
  }

  if (route === "GET /states") {
    onRead(request, response, url);
    return;
  }

  response.writeHead(404).end("Cannot resolve " + route);
}

function onServe(_request, response: ServerResponse, url: URL) {
  response.end(esm.replace("__HOSTNAME__", url.hostname));
}

function onRead(_request, response: ServerResponse, url: URL) {
  const id = url.searchParams.get("id") || "";

  if (!id) {
    response.writeHead(400).end("Missing query param: id");
    return;
  }

  if (!hub.has(id)) {
    response.writeHead(404).end();
    return;
  }

  const json = JSON.stringify(hub.get(id));
  response.end(json);
}

function onCreate(_request: IncomingMessage, response: ServerResponse) {
  const id = randomUUID();
  const node: State = { id, version: 1, state: {} };
  hub.set(id, node);
  const text = JSON.stringify(node);

  response
    .writeHead(201, {
      "Content-Type": "application/json",
      "Content-Length": text.length,
    })
    .end(text);
}

async function onEvent(request: IncomingMessage, response: ServerResponse) {
  try {
    const body = await readStream(request);
    const json = tryParse(body) as Action;

    if (!assertValidJson(json)) {
      response.writeHead(400).end();
      return;
    }


    if (!hub.has(json?.id)) {
      response.writeHead(404).end();
      return;
    }

    if (!verifyVersion(json)) {
      response.writeHead(409).end('Invalid version: ' + json.version);
      return;
    }

    const { type } = json;
    if (type === "add") {
      const node = hub.get(json.id);
      node.state[json.key] = json.value;
      node.version++;
      const text = String(node.version);
      hub.set(json.id, node);
      response.writeHead(202, { "Content-Length": text.length }).end(text);
      return;
    }

    if (type === "remove") {
      const node = hub.get(json.id);
      delete node.state[json.key];
      node.version++;
      const text = String(node.version);
      hub.set(json.id, node);
      response.writeHead(202, { "Content-Length": text.length }).end(text);
      return;
    }

    throw new Error("Invalid action type: " + type);
  } catch (error) {
    console.log(error);
    response.writeHead(500).end();
  }
}

function verifyVersion(json: Action) {
  const node = hub.get(json.id);
  const version = Number(json.version);
  const localVersion = Number(node.version);

  return localVersion === version;
}

function assertValidJson(json) {
  return json && typeof json === "object" && json.type && json.version;
}

function onEventListen(
  _request: IncomingMessage,
  response: ServerResponse,
  url: URL
) {
  response.writeHead(422).end(url.pathname);
}

function readStream(stream): Promise<string> {
  return new Promise((resolve, reject) => {
    const all = [];
    stream.on("data", (c) => all.push(c));
    stream.on("end", () => resolve(Buffer.concat(all).toString("utf-8")));
    stream.on("error", (e) => reject(String(e)));
  });
}

createServer(onRequest).listen(Number(process.env.PORT), () => {
  console.log("Started on " + process.env.PORT);
});
