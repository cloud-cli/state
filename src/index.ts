import type { IncomingMessage, ServerResponse } from "http";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { Resource, StoreDriver } from "@cloud-cli/store";
// import { EventEmitter } from "node:events";

type Stateful = { id: string; version: number };
type AddAction = Stateful & { type: "add"; payload: object };
type RemoveAction = Stateful & { type: "remove"; key: string };
type Action = AddAction | RemoveAction;
type State = Stateful & { state: object };

const hub = new Map<string, State>();

function onRequest(request: IncomingMessage, response: ServerResponse) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url, "http://localhost/");

  if (url.pathname === "/events" && method === "POST") {
    onEvent(request, response);
    return;
  }

  if (url.pathname === "/events" && method === "GET") {
    onEventListen(request, response, url);
    return;
  }

  if (url.pathname === "/state" && method === "POST") {
    onCreate(request, response);
    return;
  }
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
    const json = JSON.parse(body) as Action;

    if (assertValidJson(json)) {
      response.writeHead(400).end();
      return;
    }

    const { type } = json;

    if (!verifyVersion(json)) {
      response.writeHead(409).end();
      return;
    }

    if (!hub.has(json?.id)) {
      response.writeHead(404).end();
      return false;
    }

    if (type === "add") {
      const node = hub.get(json.id);
      Object.assign(node.state, json.payload);
      node.version++;
      const text = String(node.version);
      response.writeHead(202, { "Content-Length": text.length }).end(text);
    }

    if (type === "remove") {
      const node = hub.get(json.id);
      delete node.state[json.key];
      node.version++;
      const text = String(node.version);
      response.writeHead(202, { "Content-Length": text.length }).end(text);
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
  const localVersion = node.version;

  if (localVersion < version) {
    return false;
  }

  return true;
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

createServer(onRequest).listen(Number(process.env.PORT));
Resource.use(new StoreDriver());
