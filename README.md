# api-practice-lab

Stage 1 backend assessment solution for Backend Wizards. The API accepts a name, calls Genderize, Agify, and Nationalize, stores the classified result in PostgreSQL, and exposes the required profile endpoints.

## Stack

- Node.js 22
- Express
- Axios
- PostgreSQL via `pg`
- Vercel-compatible serverless entrypoint

## Project structure

- `app.js`: shared Express app and route logic
- `db.js`: PostgreSQL connection, schema bootstrap, and queries
- `server.js`: local development launcher
- `api/index.js`: Vercel entrypoint
- `vercel.json`: routes all requests to the API handler

## Environment

Required:

- `DATABASE_URL`

Optional:

- `PORT` for local runs

If your provider gives `POSTGRES_URL` instead of `DATABASE_URL`, the app accepts that too.

## Run locally

1. Create a PostgreSQL database.
2. Add a `.env` file or set `DATABASE_URL`.
3. Install dependencies and start the server:

```bash
npm install
npm start
```

The server runs on `http://localhost:3000` by default.

## Database model

The app creates a `profiles` table automatically on first request with these fields:

- `id` (UUID v7)
- `name` (normalized lowercase and unique)
- `gender`
- `gender_probability`
- `sample_size`
- `age`
- `age_group`
- `country_id`
- `country_probability`
- `created_at` (UTC ISO 8601 when returned)

## API

### `POST /api/profiles`

Request body:

```json
{
  "name": "ella"
}
```

- Returns `201 Created` with the full stored profile on first creation.
- Returns `200 OK` with `message: "Profile already exists"` if the normalized name already exists.

### `GET /api/profiles/:id`

Returns the full stored profile for a single UUID.

### `GET /api/profiles`

Returns a summary list of stored profiles.

Optional case-insensitive query parameters:

- `gender`
- `country_id`
- `age_group`

Example:

```txt
/api/profiles?gender=male&country_id=ng
```

### `DELETE /api/profiles/:id`

Deletes a stored profile and returns `204 No Content`.

## Error responses

All API errors use:

```json
{
  "status": "error",
  "message": "..."
}
```

Implemented cases:

- `400 Bad Request`: missing or empty `name`
- `422 Unprocessable Entity`: invalid input type
- `404 Not Found`: profile not found
- `502 Bad Gateway`: invalid upstream API response
- `500 Internal Server Error`: unexpected server or database failure

Upstream validation messages are:

- `Genderize returned an invalid response`
- `Agify returned an invalid response`
- `Nationalize returned an invalid response`

## Vercel deployment

1. Create a hosted Postgres database.
2. Add `DATABASE_URL` in your Vercel project environment variables.
3. Import or link the repo to Vercel.
4. Deploy.

Use the deployed domain as your API base URL, for example:

```txt
https://your-project-name.vercel.app
```

The grading endpoints will then be:

```txt
https://your-project-name.vercel.app/api/profiles
```

## Notes

- CORS is enabled with `Access-Control-Allow-Origin: *`.
- Nationality is chosen from the highest-probability country in the Nationalize response.
- Age groups follow the assessment rules: `child`, `teenager`, `adult`, `senior`.
