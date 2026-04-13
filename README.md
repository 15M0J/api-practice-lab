# backend-wizards-stage-0

A small Express API that classifies a first name using the Genderize API.

## Run locally

```bash
npm install
node server.js
```

The server runs on `http://localhost:3000`.

## API

Endpoint:

```txt
http://localhost:3000/api/classify?name=john
```

Missing parameter:

```txt
http://localhost:3000/api/classify
```

Empty parameter:

```txt
http://localhost:3000/api/classify?name=
```

Repeated parameter:

```txt
http://localhost:3000/api/classify?name=john&name=doe
```

## Tech stack

- Node.js
- Express
- Axios
- Genderize API
