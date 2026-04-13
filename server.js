const express = require("express");
const axios = require("axios");

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

app.get("/api/classify", async (req, res) => {
  const { name } = req.query;

  if (Array.isArray(name) || (name !== undefined && typeof name !== "string")) {
    return res.status(422).json({
      status: "error",
      message: "name must be a string"
    });
  }

  if (name === undefined || name.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "Missing or empty name parameter"
    });
  }

  const normalizedName = name.trim().toLowerCase();

  try {
    const response = await axios.get("https://api.genderize.io", {
      params: { name: normalizedName }
    });

    const { gender, probability, count } = response.data;

    if (gender === null || count === 0) {
      return res.status(200).json({
        status: "error",
        message: "No prediction available for the provided name"
      });
    }

    const sampleSize = count;
    const isConfident =
      Number(probability) >= 0.7 && Number(sampleSize) >= 100;

    return res.status(200).json({
      status: "success",
      data: {
        name: normalizedName,
        gender,
        probability: Number(probability),
        sample_size: Number(sampleSize),
        is_confident: isConfident,
        processed_at: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(502).json({
      status: "error",
      message: "Upstream service failure"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});