# State service

## API

**POST /states**

Create a state.

Response:

```json
{
  "id": "<state uid>",
  "version": 1,
  "state": {}
}
```

**GET /states?id=<state_uid>**

Get the current state

```json
{
  "id": "<state uid>",
  "version": 123,
  "state": {...}
}
```

**POST /events**

Modify state with an event:

Request to add values:

```json
{
  "id": "<state uid>",
  "type": "add",
  "key": "foo",
  "value": 123
}
```

Request to remove values:

```json
{
  "id": "<state uid>",
  "type": "remove",
  "key": "foo"
}
```

**GET /events**

Event source channel for state updates
