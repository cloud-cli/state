const hostname = 'https://__HOSTNAME__';

export class State {
  constructor(uid) {
    this.uid = uid;
    this.state = {};
  }

  async fetch() {
    this.state = (await fetch(`${hostname}/state?id=${this.uid}`)).json();
  }

  async dispatch(action) {
    const headers = { 'content-type': 'application/json' };
    const action = await fetch(`${hostname}/events`, {
      headers,
      method: 'POST',
      body: JSON.stringify(action),
    });

    this.state.version = await action.text();
  }
}
