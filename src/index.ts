import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';

type Stateful = { id: string; version: number };
type AddAction = Stateful & { type: 'add'; key: string; payload: object };
type RemoveAction = Stateful & { type: 'remove'; key: string };
type Action = AddAction | RemoveAction;
type State = Stateful & { state: object };

const hub = new Map<string, State>();
const esm = readFileSync('./state.mjs', 'utf-8');

function onRequest(request: IncomingMessage, response: ServerResponse) {
  const method = String(request.method).toUpperCase();
  const url = new URL(request.url, 'http://' + String(request.headers['x-forwarded-for'] || 'localhost/'));
  const route = `${method} ${url.pathname}`;
  console.log(new Date().toISOString(), route);

  if (route === 'GET /state.mjs') {
    onServe(request, response, url);
    return;
  }

  if (route === 'POST /events') {
    onEvent(request, response);
    return;
  }

  if (route === 'GET /events') {
    onEventListen(request, response, url);
    return;
  }

  if (route === 'POST /state') {
    onCreate(request, response);
    return;
  }

  if (route === 'GET /state') {
    onRead(request, response, url);
    return;
  }

  response.writeHead(404).end('Cannot resolve ' + route);
}

function onServe(_request, response: ServerResponse, url: URL) {
  response.end(esm.replace('__HOSTNAME__', url.hostname));
}

function onRead(_request, response: ServerResponse, url: URL) {
  const id = url.searchParams.get('id') || '';

  if (!id) {
    response.writeHead(400).end('Missing query param: id');
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
      'Content-Type': 'application/json',
      'Content-Length': text.length,
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
      return;
    }

    if (type === 'add') {
      const node = hub.get(json.id);
      node.state[json.key] = json.payload;
      node.version++;
      const text = String(node.version);
      response.writeHead(202, { 'Content-Length': text.length }).end(text);
      return;
    }

    if (type === 'remove') {
      const node = hub.get(json.id);
      delete node.state[json.key];
      node.version++;
      const text = String(node.version);
      response.writeHead(202, { 'Content-Length': text.length }).end(text);
      return;
    }

    throw new Error('Invalid action type: ' + type);
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
  return json && typeof json === 'object' && json.type && json.version;
}

function onEventListen(_request: IncomingMessage, response: ServerResponse, url: URL) {
  response.writeHead(422).end(url.pathname);
}

function readStream(stream): Promise<string> {
  return new Promise((resolve, reject) => {
    const all = [];
    stream.on('data', (c) => all.push(c));
    stream.on('end', () => resolve(Buffer.concat(all).toString('utf-8')));
    stream.on('error', (e) => reject(String(e)));
  });
}

createServer(onRequest).listen(Number(process.env.PORT), () => {
  console.log('Started on ' + process.env.PORT);
});
