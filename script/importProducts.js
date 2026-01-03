import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import csv from "csv-parser";
import mongoose from "mongoose";
import Product from "../models/products.js";

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("ERREUR : MONGO_URI manquant dans .env");
  process.exit(1);
}

await mongoose.connect(mongoUri);

const parseNumber = (value) => {
  if (!value) return null;

  const cleaned = value
    .replace(/"/g, "")
    .replace(",", ".");

  const number = Number(cleaned);
  return Number.isNaN(number) ? null : number;
};

const products = [];

fs.createReadStream("MafraProducts.csv")
  .pipe(csv())
  .on("data", (row) => {
    products.push({
      CATEGORY: row.CATEGORY,
      SUBCATEGORY: row.SUBCATEGORY || null,
      NOM: row.NOM,
      REF: row.REF,
      URL_IMAGE: row.URL_IMAGE || null,
      DESCRIPTION: row.DESCRIPTION || null,
      FORMAT: row.FORMAT?.replace(/"/g, "").trim(),
      NET_SOCOFRA: parseNumber(row["NET SOCOFRA"]),
      PUBLIC_HT: parseNumber(row["PUBLIC HT"]),
      GARAGE: parseNumber(row["GARAGE"]),
    });
  })
  .on("end", async () => {
    try {
      await Product.insertMany(products);
      console.log(`Import terminé (${products.length} produits)`);
    } catch (err) {
      console.error("Erreur import :", err);
    } finally {
      await mongoose.disconnect();
    }
  });
