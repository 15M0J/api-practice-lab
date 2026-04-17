const { Pool } = require("pg");

class ConfigurationError extends Error {}

const connectionString =
  process.env.backend_practice_DATABASE_URL ||
  process.env.backend_practice_POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
const shouldUseSsl =
  connectionString &&
  !connectionString.includes("localhost") &&
  !connectionString.includes("127.0.0.1");

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
    })
  : null;

let databaseReadyPromise;

const PROFILE_COLUMNS = `
  id,
  name,
  gender,
  gender_probability,
  sample_size,
  age,
  age_group,
  country_id,
  country_probability,
  created_at
`;

function formatProfile(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: Number(row.gender_probability),
    sample_size: Number(row.sample_size),
    age: Number(row.age),
    age_group: row.age_group,
    country_id: row.country_id,
    country_probability: Number(row.country_probability),
    created_at: new Date(row.created_at).toISOString()
  };
}

async function query(text, values = []) {
  if (!pool) {
    throw new ConfigurationError(
      "Database is not configured. Set DATABASE_URL or POSTGRES_URL."
    );
  }

  return pool.query(text, values);
}

async function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        gender TEXT NOT NULL,
        gender_probability DOUBLE PRECISION NOT NULL,
        sample_size INTEGER NOT NULL,
        age INTEGER NOT NULL,
        age_group TEXT NOT NULL,
        country_id TEXT NOT NULL,
        country_probability DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `).catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}

async function getProfileByName(name) {
  const result = await query(
    `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE name = $1 LIMIT 1`,
    [name]
  );

  return formatProfile(result.rows[0]);
}

async function getProfileById(id) {
  const result = await query(
    `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id = $1 LIMIT 1`,
    [id]
  );

  return formatProfile(result.rows[0]);
}

async function listProfiles(filters) {
  const clauses = [];
  const values = [];

  if (filters.gender) {
    values.push(filters.gender);
    clauses.push(`LOWER(gender) = $${values.length}`);
  }

  if (filters.country_id) {
    values.push(filters.country_id);
    clauses.push(`LOWER(country_id) = $${values.length}`);
  }

  if (filters.age_group) {
    values.push(filters.age_group);
    clauses.push(`LOWER(age_group) = $${values.length}`);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await query(
    `SELECT ${PROFILE_COLUMNS} FROM profiles ${whereClause} ORDER BY created_at ASC`,
    values
  );

  return result.rows.map(formatProfile);
}

async function createProfile(profile) {
  const result = await query(
    `
      INSERT INTO profiles (
        id,
        name,
        gender,
        gender_probability,
        sample_size,
        age,
        age_group,
        country_id,
        country_probability,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (name) DO NOTHING
      RETURNING ${PROFILE_COLUMNS}
    `,
    [
      profile.id,
      profile.name,
      profile.gender,
      profile.gender_probability,
      profile.sample_size,
      profile.age,
      profile.age_group,
      profile.country_id,
      profile.country_probability,
      profile.created_at
    ]
  );

  if (result.rows[0]) {
    return {
      created: true,
      profile: formatProfile(result.rows[0])
    };
  }

  return {
    created: false,
    profile: await getProfileByName(profile.name)
  };
}

async function deleteProfileById(id) {
  const result = await query(
    "DELETE FROM profiles WHERE id = $1 RETURNING id",
    [id]
  );

  return Boolean(result.rows[0]);
}

module.exports = {
  ConfigurationError,
  createProfile,
  deleteProfileById,
  ensureDatabaseReady,
  getProfileById,
  getProfileByName,
  listProfiles
};
