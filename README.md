# State service

## API

**POST /state**

Create a state.

Response:

```json
{
  "id": "<state uid>",
  "version": 1,
  "state": {}
}
```

**POST /events**

Modify state with an event:

Request to add values:

```json
{
  "id": "<state uid>",
  "type": "add",
  "payload": {
    "foo": "value"
  }
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

