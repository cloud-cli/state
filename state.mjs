const hostname = "https://__HOSTNAME__";

/**
 * @example
 *    const state = new State(localStorage.stateId);
 *    await state.init();
 *    localStorage.stateId = state.id;
 *    state.add('key', value);
 *    state.remove('key')
 */

export class State {
  constructor(id) {
    this.id = id;
    this.state = null;
  }

  async init() {
    if (this.id) {
      await this.refresh();
    }

    if (!this.state) {
      await this.create();
    }

    this.connect();
  }

  connect() {
    const source = new EventSource(`${hostname}/events`);
    source.onerror = () => setTimeout(() => this.connect(), 1000);
    source.onmessage = (message) => (this.state = message.data);
  }

  async create() {
    const state = await fetch(`${hostname}/states`, { method: "POST", mode: 'cors' });

    if (state.ok) {
      this.state = await state.json();
      this.id = this.state.id;
    }
  }

  async refresh() {
    const state = await fetch(`${hostname}/states?id=${this.id}`, { mode: 'cors' });
    this.state = state.ok ? await state.json() : null;
  }

  async add(key, value) {
    const action = { type: "add", key, value };
    await this.dispatch(action);
  }

  async remove(key) {
    const action = { type: "remove", key };
    await this.dispatch(action);
  }

  async dispatch(payload) {
    const action = {
      ...payload,
      id: this.id,
      version: this.state.version,
    };

    const body = JSON.stringify(action);
    const headers = { "content-type": "application/json" };
    const request = await fetch(`${hostname}/events`, {
      mode: 'cors',
      headers,
      method: "POST",
      body,
    });

    if (request.ok) {
      this.apply(action);
      this.state.version = Number(await request.text());
      return;
    }

    if (request.status === 409) {
      await this.refresh();
      return await this.dispatch(payload);
    }
  }

  apply(action) {
    if (action.version <= this.state.version) {
      return;
    }

    switch (action.type) {
      case "add":
        this.state[action.key] = action.value;
        break;
      case "add":
        delete this.state[action.key];
        break;
    }
  }
}

export default State;
