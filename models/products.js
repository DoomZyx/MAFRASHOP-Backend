import mongoose from "mongoose";

const productsSchema = new mongoose.Schema({
  CATEGORY: String,
  SUBCATEGORY: String,
  NOM: String,
  REF: String,
  URL_IMAGE: String,
  DESCRIPTION: String,
  FORMAT: String,
  NET_SOCOFRA: Number,
  PUBLIC_HT: Number,
  GARAGE: Number,
});

export default mongoose.model("Products", productsSchema);
