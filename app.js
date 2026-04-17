const express = require("express");
const axios = require("axios");
const { randomBytes } = require("crypto");
const {
  ConfigurationError,
  ensureDatabaseReady,
  createProfile,
  deleteProfileById,
  getProfileById,
  getProfileByName,
  listProfiles
} = require("./db");

const GENDERIZE_API = "https://api.genderize.io";
const AGIFY_API = "https://api.agify.io";
const NATIONALIZE_API = "https://api.nationalize.io";

class UpstreamValidationError extends Error {
  constructor(apiName) {
    super(`${apiName} returned an invalid response`);
    this.apiName = apiName;
  }
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function normalizeFilter(value) {
  return value.trim().toLowerCase();
}

function isInvalidStringValue(value) {
  return Array.isArray(value) || (value !== undefined && typeof value !== "string");
}

function getAgeGroup(age) {
  if (age <= 12) {
    return "child";
  }

  if (age <= 19) {
    return "teenager";
  }

  if (age <= 59) {
    return "adult";
  }

  return "senior";
}

function generateUuidV7() {
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

async function fetchGender(name) {
  let response;

  try {
    response = await axios.get(GENDERIZE_API, {
      params: { name },
      timeout: 8000
    });
  } catch (error) {
    throw new UpstreamValidationError("Genderize");
  }

  const { gender, probability, count } = response.data ?? {};
  const genderProbability = Number(probability);
  const sampleSize = Number(count);

  if (
    gender === null ||
    sampleSize === 0 ||
    Number.isNaN(genderProbability) ||
    Number.isNaN(sampleSize)
  ) {
    throw new UpstreamValidationError("Genderize");
  }

  return {
    gender,
    gender_probability: genderProbability,
    sample_size: sampleSize
  };
}

async function fetchAge(name) {
  let response;

  try {
    response = await axios.get(AGIFY_API, {
      params: { name },
      timeout: 8000
    });
  } catch (error) {
    throw new UpstreamValidationError("Agify");
  }

  const ageValue = response.data?.age;
  const age = Number(ageValue);

  if (ageValue === null || Number.isNaN(age)) {
    throw new UpstreamValidationError("Agify");
  }

  return {
    age,
    age_group: getAgeGroup(age)
  };
}

async function fetchNationality(name) {
  let response;

  try {
    response = await axios.get(NATIONALIZE_API, {
      params: { name },
      timeout: 8000
    });
  } catch (error) {
    throw new UpstreamValidationError("Nationalize");
  }

  const countries = response.data?.country;

  if (!Array.isArray(countries) || countries.length === 0) {
    throw new UpstreamValidationError("Nationalize");
  }

  const bestMatch = countries.reduce((highest, current) => {
    if (
      !highest ||
      Number(current?.probability) > Number(highest?.probability)
    ) {
      return current;
    }

    return highest;
  }, null);

  const countryId = bestMatch?.country_id;
  const countryProbability = Number(bestMatch?.probability);

  if (!countryId || Number.isNaN(countryProbability)) {
    throw new UpstreamValidationError("Nationalize");
  }

  return {
    country_id: countryId,
    country_probability: countryProbability
  };
}

async function buildProfile(name) {
  const [genderData, ageData, nationalityData] = await Promise.all([
    fetchGender(name),
    fetchAge(name),
    fetchNationality(name)
  ]);

  return {
    id: generateUuidV7(),
    name,
    gender: genderData.gender,
    gender_probability: genderData.gender_probability,
    sample_size: genderData.sample_size,
    age: ageData.age,
    age_group: ageData.age_group,
    country_id: nationalityData.country_id,
    country_probability: nationalityData.country_probability,
    created_at: new Date().toISOString()
  };
}

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      status: "error",
      message: "Invalid JSON body"
    });
  }

  return next(error);
});

app.use("/api/profiles", async (req, res, next) => {
  try {
    await ensureDatabaseReady();
    return next();
  } catch (error) {
    return next(error);
  }
});

app.get("/", (req, res) => {
  return res.json({ message: "Server is running" });
});

app.post("/api/profiles", async (req, res, next) => {
  try {
    const { name } = req.body ?? {};

    if (isInvalidStringValue(name)) {
      return res.status(422).json({
        status: "error",
        message: "Invalid type"
      });
    }

    if (name === undefined || name.trim() === "") {
      return res.status(400).json({
        status: "error",
        message: "Missing or empty name"
      });
    }

    const normalizedName = normalizeName(name);
    const existingProfile = await getProfileByName(normalizedName);

    if (existingProfile) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existingProfile
      });
    }

    const profile = await buildProfile(normalizedName);
    const result = await createProfile(profile);

    if (!result.created) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: result.profile
      });
    }

    return res.status(201).json({
      status: "success",
      data: result.profile
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/profiles/:id", async (req, res, next) => {
  try {
    const profile = await getProfileById(req.params.id);

    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found"
      });
    }

    return res.status(200).json({
      status: "success",
      data: profile
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/profiles", async (req, res, next) => {
  try {
    const { gender, country_id: countryId, age_group: ageGroup } = req.query;

    if (
      isInvalidStringValue(gender) ||
      isInvalidStringValue(countryId) ||
      isInvalidStringValue(ageGroup)
    ) {
      return res.status(422).json({
        status: "error",
        message: "Invalid type"
      });
    }

    const profiles = await listProfiles({
      gender: gender ? normalizeFilter(gender) : undefined,
      country_id: countryId ? normalizeFilter(countryId) : undefined,
      age_group: ageGroup ? normalizeFilter(ageGroup) : undefined
    });

    return res.status(200).json({
      status: "success",
      count: profiles.length,
      data: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        age_group: profile.age_group,
        country_id: profile.country_id
      }))
    });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/profiles/:id", async (req, res, next) => {
  try {
    const deleted = await deleteProfileById(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found"
      });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  if (error instanceof UpstreamValidationError) {
    return res.status(502).json({
      status: "error",
      message: error.message
    });
  }

  if (error instanceof ConfigurationError) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }

  console.error(error);

  return res.status(500).json({
    status: "error",
    message: "Internal server error"
  });
});

module.exports = app;
