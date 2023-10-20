const hostname = 'https://__HOSTNAME__';

export class State {
  constructor(id) {
    this.id = id;
    this.state = null;
  }

  async init() {
    if (this.id) {
      await this.fetch();
    }

    if (!this.state) {
      await this.create();
    }
  }

  async create() {
    const state = await fetch(`${hostname}/state`, { method: 'POST' });

    if (state.ok) {
      this.state = await state.json();
      this.id = this.state.id;
    }
  }

  async fetch() {
    const state = await fetch(`${hostname}/state?id=${this.id}`);
    this.state = state.ok ? await state.json() : null;
  }

  async add(key, payload) {
    const action = { type: 'add', key, payload };
    await this.dispatch(action);
    this.state[key] = payload;
  }

  async remove(key) {
    const action = { type: 'remove', key };
    await this.dispatch(action);
    delete this.state[key];
  }

  async dispatch(payload) {
    const json = JSON.stringify({
      ...payload,
      id: this.id,
      version: this.state.version,
    });

    const headers = { 'content-type': 'application/json' };
    const action = await fetch(`${hostname}/events`, {
      headers,
      method: 'POST',
      body: json,
    });

    if (action.ok) {
      this.state.version = Number(await action.text());
      return;
    }

    if (action.status === 409) {
      await this.fetch();
      return await this.dispatch(payload);
    }
  }
}

export default State;
